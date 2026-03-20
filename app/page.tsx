"use client";

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import type QuillType from 'quill';
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Paperclip,
  Plus,
  Save,
  Send,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import RichTextEditor from '@/components/rich-text-editor';

type Theme = 'light' | 'dark' | 'system';
type ActiveEditor = 'subject' | 'body' | 'signature';
type ProspectRow = Record<string, string>;
type Attachment = {
  name: string;
  content: string;
  type: string;
  size: number;
};
type SendResult = {
  email: string;
  status: 'success' | 'error';
  error?: string;
};
type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
};
type SettingsPayload = Partial<{
  theme: Theme;
  emailSignature: string;
  smtpConfig: SmtpConfig;
  senderName: string;
}>;
type PromptState = {
  isOpen: boolean;
  title: string;
  placeholder: string;
  onConfirm: (value: string) => void | Promise<void>;
};

function detectPlatform() {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes('windows')) {
    return 'windows';
  }

  if (platform.includes('mac')) {
    return 'mac';
  }

  return 'other';
}

function insertTextIntoEditor(editor: QuillType | null, text: string) {
  if (!editor) {
    return false;
  }

  editor.focus({ preventScroll: true });
  const selection = editor.getSelection() ?? {
    index: Math.max(editor.getLength() - 1, 0),
    length: 0,
  };

  if (selection.length > 0) {
    editor.deleteText(selection.index, selection.length, 'user');
  }

  editor.insertText(selection.index, text, 'user');
  editor.setSelection(selection.index + text.length, 0, 'silent');
  return true;
}

export default function App() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFilename, setActiveFilename] = useState('prospects.csv');
  const [activeTab, setActiveTab] = useState<'audience' | 'composition'>('audience');

  const [subject, setSubject] = useState("Objet de l'email");
  const [body, setBody] = useState(
    "<p>Bonjour {prénom},</p>\n<p>Je me permets de vous contacter...</p>\n<p>Cordialement,<br>Briac de Edichoix</p>",
  );
  const [senderName, setSenderName] = useState('Briac de Edichoix');
  const [signature, setSignature] = useState('');
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [theme, setTheme] = useState<Theme>('system');
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    host: '',
    port: 465,
    user: '',
    pass: '',
  });
  const [showSmtpModal, setShowSmtpModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);
  const [customPrompt, setCustomPrompt] = useState<PromptState>({
    isOpen: false,
    title: '',
    placeholder: '',
    onConfirm: async () => undefined,
  });
  const [promptValue, setPromptValue] = useState('');

  const activeEditorRef = useRef<ActiveEditor>('body');
  const settingsReadyRef = useRef(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<QuillType | null>(null);
  const signatureEditorRef = useRef<QuillType | null>(null);

  useEffect(() => {
    const platform = detectPlatform();
    document.documentElement.setAttribute('data-platform', platform);

    return () => {
      document.documentElement.removeAttribute('data-platform');
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [filesResponse, settingsResponse] = await Promise.all([
          fetch('/api/files'),
          fetch('/api/settings'),
        ]);

        if (!isMounted) {
          return;
        }

        const filesData: { files?: string[] } = await filesResponse.json();
        if (filesData.files) {
          setFiles(filesData.files);
        }

        const settingsData: SettingsPayload = await settingsResponse.json();
        if (settingsData.emailSignature) {
          setSignature(settingsData.emailSignature);
        }
        if (settingsData.theme) {
          setTheme(settingsData.theme);
        }
        if (settingsData.smtpConfig) {
          setSmtpConfig(settingsData.smtpConfig);
        }
        if (settingsData.senderName) {
          setSenderName(settingsData.senderName);
        }
      } catch (error) {
        console.error('Failed to load application data', error);
      } finally {
        if (isMounted) {
          settingsReadyRef.current = true;
        }
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProspects() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/prospects?filename=${encodeURIComponent(activeFilename)}`);
        const data: {
          data?: ProspectRow[];
          meta?: { fields?: string[] };
        } = await response.json();

        if (!isMounted) {
          return;
        }

        if (data.meta?.fields) {
          setHeaders(data.meta.fields);
          setRows(data.data ?? []);
          return;
        }

        setHeaders([]);
        setRows([]);
      } catch (error) {
        console.error('Failed to load prospects', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProspects();

    return () => {
      isMounted = false;
    };
  }, [activeFilename]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    if (!settingsReadyRef.current) {
      return;
    }

    const controller = new AbortController();
    void fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
      signal: controller.signal,
    }).catch((error) => {
      if (error.name !== 'AbortError') {
        console.error('Failed to save theme', error);
      }
    });

    return () => controller.abort();
  }, [theme]);

  useEffect(() => {
    if (!settingsReadyRef.current) {
      return;
    }

    const controller = new AbortController();
    const debounceId = window.setTimeout(() => {
      void fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig,
          emailSignature: signature,
          senderName,
        }),
        signal: controller.signal,
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Failed to save settings', error);
        }
      });
    }, 800);

    return () => {
      controller.abort();
      window.clearTimeout(debounceId);
    };
  }, [senderName, signature, smtpConfig]);

  const refreshFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data: { files?: string[] } = await response.json();
      if (data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to refresh file list', error);
    }
  };

  const openPrompt = (
    title: string,
    placeholder: string,
    onConfirm: (value: string) => void | Promise<void>,
  ) => {
    setPromptValue('');
    setCustomPrompt({ isOpen: true, title, placeholder, onConfirm });
  };

  const closePrompt = () => {
    setCustomPrompt((currentPrompt) => ({
      ...currentPrompt,
      isOpen: false,
    }));
  };

  const handlePromptSubmit = async () => {
    if (promptValue.trim()) {
      await customPrompt.onConfirm(promptValue.trim());
    }
    closePrompt();
  };

  const addColumn = () => {
    openPrompt(
      'Ajouter une colonne',
      'Nom de la nouvelle variable (ex: entreprise)',
      (name) => {
        if (!name || headers.includes(name)) {
          return;
        }

        setHeaders((currentHeaders) => [...currentHeaders, name]);
        setRows((currentRows) => currentRows.map((row) => ({ ...row, [name]: '' })));
      },
    );
  };

  const removeColumn = (columnName: string) => {
    if (columnName === 'email') {
      alert('La colonne email est obligatoire.');
      return;
    }

    if (!confirm(`Supprimer la colonne "${columnName}" ?`)) {
      return;
    }

    setHeaders((currentHeaders) => currentHeaders.filter((header) => header !== columnName));
    setRows((currentRows) =>
      currentRows.map((row) => {
        const nextRow = { ...row };
        delete nextRow[columnName];
        return nextRow;
      }),
    );
  };

  const addRow = () => {
    const nextRow: ProspectRow = {};
    for (const header of headers) {
      nextRow[header] = '';
    }

    setRows((currentRows) => [...currentRows, nextRow]);
  };

  const removeRow = (index: number) => {
    setRows((currentRows) => currentRows.filter((_, rowIndex) => rowIndex !== index));
  };

  const updateCell = (rowIndex: number, header: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row, index) => (
        index === rowIndex ? { ...row, [header]: value } : row
      )),
    );
  };

  const saveProspects = async () => {
    setIsSaving(true);

    try {
      await fetch(`/api/prospects?filename=${encodeURIComponent(activeFilename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, rows }),
      });

      alert('Liste sauvegardée avec succès !');
      await refreshFiles();
    } catch (error) {
      console.error('Failed to save prospects', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;

    if (nextValue === 'CREATE_NEW') {
      openPrompt(
        'Nouveau fichier',
        "Nom du nouveau fichier (sans l'extension)",
        async (newName) => {
          try {
            const response = await fetch('/api/files', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'create', newFilename: newName }),
            });
            const data: { success?: boolean; filename?: string; error?: string } = await response.json();

            if (!data.success || !data.filename) {
              alert(data.error || 'Erreur lors de la création');
              return;
            }

            await refreshFiles();
            setActiveFilename(data.filename);
          } catch (error) {
            console.error('Failed to create file', error);
            alert('Erreur serveur');
          }
        },
      );

      event.target.value = activeFilename;
      return;
    }

    setActiveFilename(nextValue);
  };

  const insertVariable = (variable: string) => {
    const textToInsert = `{${variable}}`;
    const activeEditor = activeEditorRef.current;

    if (activeEditor === 'subject' && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart ?? subject.length;
      const end = input.selectionEnd ?? start;
      const nextSubject = `${subject.slice(0, start)}${textToInsert}${subject.slice(end)}`;
      const nextCursor = start + textToInsert.length;

      setSubject(nextSubject);
      window.requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(nextCursor, nextCursor);
      });
      return;
    }

    if (activeEditor === 'signature' && insertTextIntoEditor(signatureEditorRef.current, textToInsert)) {
      return;
    }

    if (insertTextIntoEditor(bodyEditorRef.current, textToInsert)) {
      return;
    }

    setBody((currentBody) => `${currentBody}${textToInsert}`);
  };

  const handleVariableBadgeMouseDown = (event: MouseEvent<HTMLButtonElement>, variable: string) => {
    event.preventDefault();
    insertVariable(variable);
  };

  const handleVariableBadgeClick = (event: MouseEvent<HTMLButtonElement>, variable: string) => {
    if (event.detail === 0) {
      insertVariable(variable);
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) {
      return;
    }

    for (const file of Array.from(fileList)) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`Le fichier ${file.name} est trop volumineux (Max 10MB)`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const result = loadEvent.target?.result;
        if (typeof result !== 'string') {
          return;
        }

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            content: result,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    event.target.value = '';
  };

  const removeAttachment = (attachmentIndex: number) => {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((_, index) => index !== attachmentIndex),
    );
  };

  const sendCampaign = async () => {
    if (!confirm(`Envoyer ${rows.length} emails ?`)) {
      return;
    }

    setIsSending(true);
    setSendResults([]);

    try {
      const finalBody = signature ? `${body}<br><br>${signature}` : body;
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body: finalBody,
          recipients: rows,
          senderName,
          attachments,
          smtpConfig,
          activeFilename,
        }),
      });

      const data: { results?: SendResult[] } = await response.json();
      if (data.results) {
        setSendResults(data.results);
      }
    } catch (error) {
      console.error('Failed to send campaign', error);
      alert("Erreur lors de l'envoi");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container">
      <header className="header-left" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '8px' }}>
            <Mail className="w-6 h-6" style={{ color: 'white' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>EdiProspect</h1>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Gestionnaire de Campagnes d&apos;Emails Personnalisées
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            className="btn-secondary"
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
          >
            <option value="system">Auto</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
          <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowSmtpModal(true)}>
            <Settings className="w-4 h-4" /> SMTP
          </button>
        </div>
      </header>

      {showSmtpModal && (
        <div className="modal-backdrop">
          <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1.1rem' }}>Paramètres SMTP</h2>
              <button className="btn-icon-only btn-secondary" onClick={() => setShowSmtpModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Serveur (Host)</label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={(event) => setSmtpConfig({ ...smtpConfig, host: event.target.value })}
                  placeholder="ex: mail.infomaniak.com"
                />
              </div>
              <div>
                <label className="form-label">Port</label>
                <input
                  type="number"
                  value={smtpConfig.port}
                  onChange={(event) => setSmtpConfig({ ...smtpConfig, port: Number(event.target.value) })}
                />
              </div>
              <div>
                <label className="form-label">Utilisateur (Email)</label>
                <input
                  type="text"
                  value={smtpConfig.user}
                  onChange={(event) => setSmtpConfig({ ...smtpConfig, user: event.target.value })}
                  placeholder="email@domaine.com"
                />
              </div>
              <div>
                <label className="form-label">Mot de passe</label>
                <input
                  type="password"
                  value={smtpConfig.pass}
                  onChange={(event) => setSmtpConfig({ ...smtpConfig, pass: event.target.value })}
                  placeholder="********"
                />
              </div>
              <button className="btn-primary" onClick={() => setShowSmtpModal(false)} style={{ marginTop: '0.5rem' }}>
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {customPrompt.isOpen && (
        <div className="modal-backdrop" style={{ zIndex: 110 }}>
          <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1.1rem' }}>{customPrompt.title}</h2>
              <button className="btn-icon-only btn-secondary" onClick={closePrompt}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                autoFocus
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder={customPrompt.placeholder}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handlePromptSubmit();
                  } else if (event.key === 'Escape') {
                    closePrompt();
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn-secondary" onClick={closePrompt}>Annuler</button>
                <button className="btn-primary" onClick={() => void handlePromptSubmit()}>Confirmer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'audience' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('audience')}
        >
          <Users className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Audience et Contacts
        </button>
        <button
          className={`tab-btn ${activeTab === 'composition' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('composition')}
        >
          <Mail className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
          Composition et Envoi
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {activeTab === 'audience' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="card" style={{ width: '100%' }}>
              <div className="card-header">
                <h2><Users className="w-5 h-5 text-primary" /> Audience (CSV)</h2>
                <select
                  className="btn-secondary"
                  value={activeFilename}
                  onChange={handleFileChange}
                  style={{ maxWidth: '200px', padding: '0.4rem 0.8rem', borderRadius: '6px' }}
                >
                  {files.map((file) => (
                    <option key={file} value={file}>{file}</option>
                  ))}
                  <option value="CREATE_NEW" style={{ fontWeight: 'bold' }}>+ Créer un nouveau...</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
                <button className="btn-secondary" onClick={addColumn}>
                  <Plus className="w-4 h-4" /> Colonne
                </button>
                <button className="btn-secondary" onClick={saveProspects} disabled={isSaving}>
                  <Save className="w-4 h-4" /> {isSaving ? '...' : 'Save'}
                </button>
              </div>

              {isLoading ? (
                <p>Chargement...</p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        {headers.map((header) => (
                          <th key={header}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                              {header}
                              {header !== 'email' && (
                                <button className="btn-icon-only btn-danger" style={{ padding: '0.2rem' }} onClick={() => removeColumn(header)}>
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={`${activeFilename}-${rowIndex}`}>
                          {headers.map((header) => (
                            <td key={`${rowIndex}-${header}`}>
                              <input
                                type="text"
                                value={row[header] || ''}
                                onChange={(event) => updateCell(rowIndex, header, event.target.value)}
                                placeholder={header}
                              />
                            </td>
                          ))}
                          <td>
                            <button className="btn-icon-only btn-danger" onClick={() => removeRow(rowIndex)}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button className="btn-secondary" onClick={addRow} style={{ alignSelf: 'flex-start' }}>
                <Plus className="w-4 h-4" /> Ajouter un prospect
              </button>
            </div>

            <div className="card" style={{ width: '100%' }}>
              <div className="card-header">
                <h2><Settings className="w-5 h-5 text-primary" /> Configuration Email</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>
                    Nom de l&apos;expéditeur
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(event) => setSenderName(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'composition' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
            <div className="card">
              <div className="card-header">
                <h2><Mail className="w-5 h-5 text-primary" /> Composition</h2>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>
                  Variables disponibles:
                </span>
                {headers.map((header) => (
                  <button
                    key={header}
                    type="button"
                    className="badge"
                    onMouseDown={(event) => handleVariableBadgeMouseDown(event, header)}
                    onClick={(event) => handleVariableBadgeClick(event, header)}
                  >
                    +{header}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>Sujet</label>
                  <input
                    ref={subjectRef}
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    onFocus={() => {
                      activeEditorRef.current = 'subject';
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Message HTML</label>
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    editorRef={bodyEditorRef}
                    minHeight={350}
                    onFocus={() => {
                      activeEditorRef.current = 'body';
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ color: 'var(--text-muted)' }}>Signature</label>
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => setShowSignatureEditor((current) => !current)}
                    >
                      {showSignatureEditor ? 'Masquer' : 'Modifier la signature'}
                    </button>
                  </div>

                  {showSignatureEditor ? (
                    <RichTextEditor
                      value={signature}
                      onChange={setSignature}
                      editorRef={signatureEditorRef}
                      minHeight={150}
                      onFocus={() => {
                        activeEditorRef.current = 'signature';
                      }}
                    />
                  ) : (
                    <div
                      className="signature-preview"
                      onClick={() => setShowSignatureEditor(true)}
                      style={{
                        background: 'var(--table-bg)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px dashed var(--card-border)',
                        cursor: 'pointer',
                        minHeight: '60px',
                        opacity: signature ? 1 : 0.5,
                      }}
                      dangerouslySetInnerHTML={{
                        __html: signature || '<em>Aucune signature configurée. Cliquez pour ajouter.</em>',
                      }}
                    />
                  )}
                  <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.5rem' }}>
                    La signature sera ajoutée automatiquement à la fin de chaque email. Sauvegarde auto !
                  </p>
                </div>

                <div style={{ background: 'var(--table-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', margin: 0 }}>
                      <Paperclip className="w-4 h-4" /> Pièces jointes ({attachments.length})
                    </label>
                    <div>
                      <input
                        type="file"
                        id="file-upload"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                      <label htmlFor="file-upload" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px' }}>
                        <Plus className="w-4 h-4" /> Sélectionner
                      </label>
                    </div>
                  </div>

                  {attachments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {attachments.map((attachment, index) => (
                        <div key={`${attachment.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--table-header)', padding: '0.5rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.85rem', width: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {attachment.name} <span style={{ color: 'var(--text-muted)' }}>({(attachment.size / 1024).toFixed(0)} KB)</span>
                          </span>
                          <button className="btn-icon-only btn-danger" onClick={() => removeAttachment(index)} title="Supprimer">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ border: '1px solid var(--primary)', background: 'rgba(192, 132, 252, 0.05)' }}>
              <div className="card-header">
                <h2><Send className="w-5 h-5 text-primary" /> Lancement</h2>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Prêt à envoyer les emails à {rows.length > 0 ? rows.filter((row) => row.email).length : 0} contacts valides. Assurez-vous d&apos;avoir sauvegardé vos modifications.
              </p>
              <button
                className="btn-primary"
                onClick={sendCampaign}
                disabled={isSending || rows.length === 0}
                style={{ padding: '1rem', fontSize: '1.1rem' }}
              >
                <Send className="w-5 h-5" />
                {isSending ? 'Envoi en cours...' : 'Démarrer la campagne !'}
              </button>

              {sendResults.length > 0 && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                    Résultats ({sendResults.filter((result) => result.status === 'success').length}/{sendResults.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {sendResults.map((result) => (
                      <div key={`${result.email}-${result.status}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--table-bg)', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.85rem' }}>{result.email}</span>
                        {result.status === 'success' ? (
                          <span className="status-badge status-success" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <CheckCircle2 className="w-3 h-3" /> Envoyé
                          </span>
                        ) : (
                          <span className="status-badge status-error" title={result.error} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <AlertCircle className="w-3 h-3" /> Erreur
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
