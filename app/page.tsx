"use client";

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Mail, Users, Send, Settings, Plus, Trash2, Save, CheckCircle2, AlertCircle, Paperclip, X } from 'lucide-react';
import 'react-quill-new/dist/quill.snow.css';

const WrappedQuill = dynamic(
  async () => {
    const { default: RQ } = await import('react-quill-new');
    return function ForwardedQuill(props: any) {
      return <RQ ref={props.forwardedRef} {...props} />;
    };
  },
  { ssr: false }
);

export default function App() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFilename, setActiveFilename] = useState('prospects.csv');
  const [activeTab, setActiveTab] = useState<'audience' | 'composition'>('audience');
  
  const [subject, setSubject] = useState("Objet de l'email");
  const [body, setBody] = useState("<p>Bonjour {prénom},</p>\n<p>Je me permets de vous contacter...</p>\n<p>Cordialement,<br>Briac de Edichoix</p>");
  const [senderName, setSenderName] = useState("Briac de Edichoix");
  const [signature, setSignature] = useState("");
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [attachments, setAttachments] = useState<{name: string, content: string, type: string, size: number}[]>([]);

  const [theme, setTheme] = useState<'light'|'dark'|'system'>('system');
  const [smtpConfig, setSmtpConfig] = useState({ host: '', port: 465, user: '', pass: '' });
  const [showSmtpModal, setShowSmtpModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<any[]>([]);

  // Track the last focused input to insert variables
  const [focusedInput, setFocusedInput] = useState<'subject' | 'body' | 'signature' | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const reactQuillRef = useRef<any>(null);
  const signatureQuillRef = useRef<any>(null);

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'image'],
      ['clean'],
    ],
  };

  useEffect(() => {
    fetchFiles();
    const savedSignature = localStorage.getItem('emailSignature');
    if (savedSignature) {
      setSignature(savedSignature);
    }
    const savedTheme = localStorage.getItem('theme') as any;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    const savedSmtp = localStorage.getItem('smtpConfig');
    if (savedSmtp) {
      try { setSmtpConfig(JSON.parse(savedSmtp)); } catch(e) {}
    }
  }, []);

  useEffect(() => {
    if (activeFilename) {
      fetchProspects();
    }
  }, [activeFilename]);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.files) setFiles(data.files);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('smtpConfig', JSON.stringify(smtpConfig));
  }, [smtpConfig]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      localStorage.setItem('emailSignature', signature);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [signature]);

  const fetchProspects = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/prospects?filename=${encodeURIComponent(activeFilename)}`);
      const data = await res.json();
      if (data.meta && data.meta.fields) {
        setHeaders(data.meta.fields);
        setRows(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProspects = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/prospects?filename=${encodeURIComponent(activeFilename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, rows })
      });
      alert('Liste sauvegardée avec succès !');
      fetchFiles(); // Refresh history if needed
    } catch (e) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const addRow = () => {
    const newRow: Record<string, string> = {};
    headers.forEach(h => newRow[h] = "");
    setRows([...rows, newRow]);
  };

  const removeRow = (index: number) => {
    const newRows = [...rows];
    newRows.splice(index, 1);
    setRows(newRows);
  };

  const updateCell = (rowIndex: number, header: string, value: string) => {
    const newRows = [...rows];
    newRows[rowIndex][header] = value;
    setRows(newRows);
  };

  const addColumn = () => {
    const name = prompt("Nom de la nouvelle variable (ex: entreprise) :");
    if (!name || headers.includes(name)) return;
    setHeaders([...headers, name]);
    const newRows = rows.map(r => ({ ...r, [name]: "" }));
    setRows(newRows);
  };

  const removeColumn = (colName: string) => {
    if (colName === "email") {
      alert("La colonne email est obligatoire.");
      return;
    }
    if (!confirm(`Supprimer la colonne "${colName}" ?`)) return;
    
    setHeaders(headers.filter(h => h !== colName));
    const newRows = rows.map(r => {
      const newRow = { ...r };
      delete newRow[colName];
      return newRow;
    });
    setRows(newRows);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CREATE_NEW') {
      const newName = prompt("Nom du nouveau fichier (sans l'extension) :");
      if (newName) {
        try {
          const res = await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', newFilename: newName })
          });
          const data = await res.json();
          if (data.success) {
            await fetchFiles();
            setActiveFilename(data.filename);
          } else {
            alert(data.error || "Erreur lors de la création");
          }
        } catch(e) { alert("Erreur serveur"); }
      }
      return;
    }
    setActiveFilename(val);
  };

  const insertVariable = (variable: string) => {
    const textToInsert = `{${variable}}`;
    if (focusedInput === 'subject' && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = subject.substring(0, start) + textToInsert + subject.substring(end);
      setSubject(newValue);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
      }, 0);
    } else if (focusedInput === 'body' && reactQuillRef.current) {
      const editor = reactQuillRef.current.getEditor();
      const selection = editor.getSelection();
      const cursorPosition = selection ? selection.index : editor.getLength();
      editor.insertText(cursorPosition, textToInsert);
      setTimeout(() => editor.setSelection(cursorPosition + textToInsert.length), 0);
    } else if (focusedInput === 'signature' && signatureQuillRef.current) {
      const editor = signatureQuillRef.current.getEditor();
      const selection = editor.getSelection();
      const cursorPosition = selection ? selection.index : editor.getLength();
      editor.insertText(cursorPosition, textToInsert);
      setTimeout(() => editor.setSelection(cursorPosition + textToInsert.length), 0);
    } else {
      setBody(body + textToInsert);
    }
  };

  const sendCampaign = async () => {
    if (!confirm(`Envoyer ${rows.length} emails ?`)) return;
    setIsSending(true);
    setSendResults([]);
    try {
      const finalBody = signature ? `${body}<br><br>${signature}` : body;
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body: finalBody, recipients: rows, senderName, attachments, smtpConfig, activeFilename })
      });
      const data = await res.json();
      if (data.results) {
        setSendResults(data.results);
      }
    } catch (e) {
      alert("Erreur lors de l'envoi");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Convert all selected files to base64
    Array.from(files).forEach(file => {
      // Basic size limit check (e.g. 10MB to avoid breaking the JSON payload)
      if (file.size > 10 * 1024 * 1024) {
        alert(`Le fichier ${file.name} est trop volumineux (Max 10MB)`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          // The result is a data URL (e.g., data:application/pdf;base64,JVBERi0xLjQK...)
          setAttachments(prev => [...prev, {
            name: file.name,
            type: file.type,
            size: file.size,
            content: result
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset file input so the same file could be selected again if removed
    e.target.value = '';
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments(attachments.filter((_, idx) => idx !== indexToRemove));
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
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Gestionnaire de Campagnes d'Emails Personnalisées</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            className="btn-secondary" 
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }} 
            value={theme} 
            onChange={(e) => setTheme(e.target.value as any)}
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1.1rem' }}>Paramètres SMTP</h2>
              <button className="btn-icon-only btn-secondary" onClick={() => setShowSmtpModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Serveur (Host)</label>
                <input type="text" value={smtpConfig.host} onChange={e => setSmtpConfig({...smtpConfig, host: e.target.value})} placeholder="ex: mail.infomaniak.com" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Port</label>
                <input type="number" value={smtpConfig.port} onChange={e => setSmtpConfig({...smtpConfig, port: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Utilisateur (Email)</label>
                <input type="text" value={smtpConfig.user} onChange={e => setSmtpConfig({...smtpConfig, user: e.target.value})} placeholder="email@domaine.com" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Mot de passe</label>
                <input type="password" value={smtpConfig.pass} onChange={e => setSmtpConfig({...smtpConfig, pass: e.target.value})} placeholder="********" />
              </div>
              <button className="btn-primary" onClick={() => setShowSmtpModal(false)} style={{ marginTop: '0.5rem' }}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* TABS NAVIGATION */}
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
        {/* TAB 1: AUDIENCE */}
        {activeTab === 'audience' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
            <div className="card" style={{ width: '100%' }}>
              <div className="card-header">
                <h2><Users className="w-5 h-5 text-primary" /> Audience (CSV)</h2>
                <select className="btn-secondary" value={activeFilename} onChange={handleFileChange} style={{ maxWidth: '200px', padding: '0.4rem 0.8rem', borderRadius: '6px' }}>
                  {files.map(f => <option key={f} value={f}>{f}</option>)}
                  <option value="CREATE_NEW" style={{ fontWeight: 'bold' }}>+ Créer un nouveau...</option>
                </select>
              </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
              <button className="btn-secondary" onClick={addColumn}><Plus className="w-4 h-4" /> Colonne</button>
              <button className="btn-secondary" onClick={saveProspects} disabled={isSaving}>
                <Save className="w-4 h-4" /> {isSaving ? '...' : 'Save'}
              </button>
            </div>
            
            {isLoading ? <p>Chargement...</p> : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            {h}
                            {h !== 'email' && (
                              <button className="btn-icon-only btn-danger" style={{ padding: '0.2rem' }} onClick={() => removeColumn(h)}>
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
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {headers.map((h, cIdx) => (
                          <td key={cIdx}>
                            <input 
                              type="text" 
                              value={row[h] || ''} 
                              onChange={(e) => updateCell(rIdx, h, e.target.value)}
                              placeholder={h}
                            />
                          </td>
                        ))}
                        <td>
                          <button className="btn-icon-only btn-danger" onClick={() => removeRow(rIdx)}>
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>Nom de l'expéditeur</label>
                  <input 
                    type="text" 
                    value={senderName} 
                    onChange={(e) => setSenderName(e.target.value)} 
                  />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: COMPOSITION & SEND */}
        {activeTab === 'composition' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
            
            <div className="card">
              <div className="card-header">
                <h2><Mail className="w-5 h-5 text-primary" /> Composition</h2>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Variables disponibles:</span>
                {headers.map(h => (
                  <span key={h} className="badge" onClick={() => insertVariable(h)}>
                    +{h}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>Sujet</label>
                  <input 
                    ref={subjectRef}
                    type="text" 
                    value={subject} 
                    onChange={(e) => setSubject(e.target.value)}
                    onFocus={() => setFocusedInput('subject')}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Message HTML</label>
                  <div style={{ background: 'var(--input-bg)', borderRadius: '8px', overflow: 'hidden' }} onClick={() => setFocusedInput('body')}>
                    <WrappedQuill 
                      forwardedRef={reactQuillRef}
                      theme="snow" 
                      value={body} 
                      onChange={setBody} 
                      modules={modules}
                      style={{ minHeight: '350px' }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ color: 'var(--text-muted)' }}>Signature</label>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => setShowSignatureEditor(!showSignatureEditor)}
                    >
                      {showSignatureEditor ? 'Masquer' : 'Modifier la signature'}
                    </button>
                  </div>
                  
                  {showSignatureEditor ? (
                    <div style={{ background: 'var(--input-bg)', borderRadius: '8px', overflow: 'hidden' }} onClick={() => setFocusedInput('signature')}>
                      <WrappedQuill 
                        forwardedRef={signatureQuillRef}
                        theme="snow" 
                        value={signature} 
                        onChange={setSignature} 
                        modules={modules}
                        style={{ minHeight: '150px' }}
                      />
                    </div>
                  ) : (
                    <div 
                      onClick={() => setShowSignatureEditor(true)}
                      style={{ 
                        background: 'var(--table-bg)', 
                        padding: '1rem', 
                        borderRadius: '8px', 
                        border: '1px dashed var(--card-border)',
                        cursor: 'pointer',
                        minHeight: '60px',
                        opacity: signature ? 1 : 0.5
                      }}
                      dangerouslySetInnerHTML={{ __html: signature || '<em>Aucune signature configurée. Cliquez pour ajouter.</em>' }}
                    />
                  )}
                  <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.5rem' }}>
                    La signature sera ajoutée automatiquement à la fin de chaque email. Sauvegarde auto !
                  </p>
                </div>

                {/* Attachments UI */}
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
                      {attachments.map((att, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--table-header)', padding: '0.5rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.85rem', width: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {att.name} <span style={{ color: 'var(--text-muted)' }}>({(att.size / 1024).toFixed(0)} KB)</span>
                          </span>
                          <button className="btn-icon-only btn-danger" onClick={() => removeAttachment(idx)} title="Supprimer">
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
                Prêt à envoyer les emails à {rows.length > 0 ? rows.filter(r => r.email).length : 0} contacts valides. Assurez-vous d'avoir sauvegardé vos modifications.
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
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Résultats ({sendResults.filter(r => r.status === 'success').length}/{sendResults.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {sendResults.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--table-bg)', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.85rem' }}>{r.email}</span>
                        {r.status === 'success' ? (
                          <span className="status-badge status-success" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle2 className="w-3 h-3"/> Envoyé</span>
                        ) : (
                          <span className="status-badge status-error" title={r.error} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><AlertCircle className="w-3 h-3"/> Erreur</span>
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
