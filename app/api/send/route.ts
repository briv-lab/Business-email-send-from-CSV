import { NextResponse } from 'next/server';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import tls from 'tls';

import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

type Recipient = Record<string, string>;
type AttachmentPayload = {
  name: string;
  content: string;
  type: string;
  size: number;
};
type SmtpConfigPayload = Partial<{
  host: string;
  port: number;
  user: string;
  pass: string;
}>;
type SendRequestPayload = {
  subject?: string;
  body?: string;
  recipients?: Recipient[];
  senderName?: string;
  attachments?: AttachmentPayload[];
  smtpConfig?: SmtpConfigPayload;
  activeFilename?: string;
};
type SendResult = {
  email: string;
  status: 'success' | 'error';
  error?: string;
};

type MailAttachment = NonNullable<SendMailOptions['attachments']>[number];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function extensionFromMimeType(contentType: string) {
  switch (contentType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'img';
  }
}

function contentTypeFromFilename(filename: string) {
  switch (path.extname(filename).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function resolveImagePath(src: string) {
  const normalizedSrc = src.split('#')[0]?.split('?')[0]?.trim();
  if (!normalizedSrc) {
    return null;
  }

  const candidates = new Set<string>();
  const currentDir = process.cwd();
  const logoFilename = 'logo-edichoix-slogan.png';

  if (normalizedSrc.startsWith('file://')) {
    try {
      candidates.add(decodeURIComponent(new URL(normalizedSrc).pathname));
    } catch {
      return null;
    }
  } else if (path.isAbsolute(normalizedSrc)) {
    candidates.add(normalizedSrc);
    candidates.add(path.join(currentDir, normalizedSrc.replace(/^\/+/, '')));
    candidates.add(path.join(currentDir, 'public', normalizedSrc.replace(/^\/+/, '')));
  } else {
    candidates.add(path.resolve(currentDir, normalizedSrc));
    candidates.add(path.resolve(currentDir, 'public', normalizedSrc));
  }

  if (
    normalizedSrc === logoFilename
    || normalizedSrc.endsWith(`/${logoFilename}`)
    || normalizedSrc === '/logo-edichoix-slogan.png'
  ) {
    candidates.add(path.join(currentDir, logoFilename));
    candidates.add(path.join(currentDir, 'public', logoFilename));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function inlineHtmlImages(html: string) {
  const inlineAttachments: MailAttachment[] = [];
  const inlineSourceToCid = new Map<string, string>();
  let imageCounter = 0;

  const nextCid = () => `inline-image-${imageCounter += 1}@edichoix.local`;

  const nextHtml = html.replace(
    /(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi,
    (fullMatch, prefix: string, quote: string, rawSrc: string) => {
      const src = rawSrc.trim();
      if (!src || /^cid:/i.test(src) || /^https?:\/\//i.test(src)) {
        return fullMatch;
      }

      const existingCid = inlineSourceToCid.get(src);
      if (existingCid) {
        return `${prefix}${quote}cid:${existingCid}${quote}`;
      }

      if (/^data:image\//i.test(src)) {
        const dataMatch = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
        if (!dataMatch) {
          return fullMatch;
        }

        const [, contentType, base64Content] = dataMatch;
        const cid = nextCid();
        inlineAttachments.push({
          filename: `inline-${imageCounter}.${extensionFromMimeType(contentType)}`,
          content: Buffer.from(base64Content.replace(/\s+/g, ''), 'base64'),
          contentType,
          cid,
          contentDisposition: 'inline',
        });
        inlineSourceToCid.set(src, cid);
        return `${prefix}${quote}cid:${cid}${quote}`;
      }

      const resolvedPath = resolveImagePath(src);
      if (!resolvedPath) {
        return fullMatch;
      }

      const cid = nextCid();
      inlineAttachments.push({
        filename: path.basename(resolvedPath),
        path: resolvedPath,
        contentType: contentTypeFromFilename(resolvedPath),
        cid,
        contentDisposition: 'inline',
      });
      inlineSourceToCid.set(src, cid);
      return `${prefix}${quote}cid:${cid}${quote}`;
    },
  );

  return {
    html: nextHtml,
    attachments: inlineAttachments,
  };
}

function appendToSentFolder(
  imapHost: string,
  imapUser: string,
  imapPass: string,
  rawEmail: string,
): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('IMAP append timed out');
      try { socket.destroy(); } catch { /* ignore */ }
      resolve();
    }, 15000);

    const socket = tls.connect(993, imapHost, { rejectUnauthorized: false }, () => {
      let buffer = '';
      let step = 0;
      let tagCounter = 1;
      const sentFolders = ['Sent', 'INBOX.Sent', 'Sent Messages'];
      let folderIndex = 0;

      const sendCommand = (command: string) => {
        const tag = `A${tagCounter++}`;
        socket.write(`${tag} ${command}\r\n`);
        return tag;
      };

      const tryAppendNextFolder = () => {
        if (folderIndex >= sentFolders.length) {
          console.warn('Could not find Sent folder, skipping IMAP append');
          step = 99;
          sendCommand('LOGOUT');
          return;
        }

        const folder = sentFolders[folderIndex];
        const emailBytes = Buffer.byteLength(rawEmail, 'utf-8');
        step = 3;
        const tag = `A${tagCounter++}`;
        socket.write(`${tag} APPEND "${folder}" (\\Seen) {${emailBytes}}\r\n`);
      };

      socket.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (step === 0 && line.startsWith('* OK')) {
            step = 1;
            sendCommand(`LOGIN "${imapUser.replace(/"/g, '\\"')}" "${imapPass.replace(/"/g, '\\"')}"`);
          } else if (step === 1 && /^A\d+ OK/i.test(line)) {
            step = 2;
            folderIndex = 0;
            tryAppendNextFolder();
          } else if (step === 1 && /^A\d+ (NO|BAD)/i.test(line)) {
            console.error('IMAP login failed:', line);
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          } else if (step === 3 && line.startsWith('+')) {
            socket.write(`${rawEmail}\r\n`);
            step = 4;
          } else if (step === 4 && /^A\d+ OK/i.test(line)) {
            step = 99;
            sendCommand('LOGOUT');
          } else if (step === 4 && /^A\d+ (NO|BAD)/i.test(line)) {
            folderIndex++;
            tryAppendNextFolder();
          } else if (step === 99 && (/^A\d+ OK/.test(line) || /^\* BYE/i.test(line))) {
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          }
        }
      });

      socket.on('error', (error: Error) => {
        console.error('IMAP socket error:', error.message);
        clearTimeout(timeout);
        resolve();
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    socket.on('error', (error: Error) => {
      console.error('IMAP TLS connection error:', error.message);
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function buildRawEmail(mailOptions: SendMailOptions) {
  const MailComposer = (await import('nodemailer/lib/mail-composer')).default;
  const mail = new MailComposer(mailOptions);
  const message = await mail.compile().build();
  return message.toString();
}

export async function POST(request: Request) {
  try {
    const {
      subject,
      body,
      recipients = [],
      senderName,
      attachments = [],
      smtpConfig,
      activeFilename,
    } = await request.json() as SendRequestPayload;

    if (!subject || !body || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const host = smtpConfig?.host || process.env.SMTP_HOST || 'mail.infomaniak.com';
    const port = smtpConfig?.port
      ? Number(smtpConfig.port)
      : (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;

    if (!user || !pass) {
      return NextResponse.json({ error: 'Missing SMTP credentials' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const parsedAttachments = attachments.map((attachment) => {
      const base64Content = attachment.content.split(';base64,').pop() ?? '';
      return {
        filename: attachment.name,
        content: Buffer.from(base64Content, 'base64'),
        contentType: attachment.type,
      };
    });

    const results: SendResult[] = [];
    const name = senderName || 'Briac de Edichoix';

    for (const recipient of recipients) {
      if (!recipient.email) {
        continue;
      }

      let personalizedSubject = subject;
      let personalizedBody = body;

      for (const [key, value] of Object.entries(recipient)) {
        if (value) {
          const regex = new RegExp(`{${key}}`, 'gi');
          personalizedSubject = personalizedSubject.replace(regex, value);
          personalizedBody = personalizedBody.replace(regex, value);
        }
      }

      const { html: htmlWithInlineImages, attachments: inlineAttachments } = inlineHtmlImages(
        personalizedBody,
      );

      const mailOptions: SendMailOptions = {
        from: `"${name}" <${user}>`,
        to: recipient.email,
        subject: personalizedSubject,
        html: htmlWithInlineImages,
        attachments: [...parsedAttachments, ...inlineAttachments],
      };

      try {
        await transporter.sendMail(mailOptions);
        results.push({ email: recipient.email, status: 'success' });

        try {
          const rawEmail = await buildRawEmail(mailOptions);
          await appendToSentFolder(host, user, pass, rawEmail);
        } catch (imapError) {
          console.error(
            `Failed to copy email to Sent folder for ${recipient.email}:`,
            getErrorMessage(imapError),
          );
        }
      } catch (error) {
        results.push({
          email: recipient.email,
          status: 'error',
          error: getErrorMessage(error),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    try {
      if (activeFilename && results.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const baseName = activeFilename.replace('.csv', '');
        const historyFilename = `${baseName}_history_${timestamp}.csv`;
        const basePath = process.env.APPDATA_DIR || process.cwd();
        const historyPath = path.join(basePath, 'data', historyFilename);

        const updatedRecipients = recipients.map((recipient) => {
          const result = results.find((sendResult) => sendResult.email === recipient.email);
          return {
            ...recipient,
            Status: result ? result.status : 'skipped',
            Error: result?.error || '',
          };
        });

        const allKeys = new Set<string>();
        updatedRecipients.forEach((recipient) => {
          Object.keys(recipient).forEach((key) => allKeys.add(key));
        });

        const csvContent = Papa.unparse({
          fields: Array.from(allKeys),
          data: updatedRecipients,
        });

        fs.writeFileSync(historyPath, csvContent, 'utf-8');
        console.log(`Saved history to ${historyPath}`);
      }
    } catch (saveError) {
      console.error('Failed to save history CSV:', saveError);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Send error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
