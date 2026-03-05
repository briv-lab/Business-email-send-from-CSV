import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import tls from 'tls';

import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

/**
 * Minimal IMAP APPEND using Node.js built-in tls module.
 * No external imap library needed — avoids Electron/Next.js bundling issues.
 */
function appendToSentFolder(
  imapHost: string,
  imapUser: string,
  imapPass: string,
  rawEmail: string
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

      const sendCommand = (cmd: string) => {
        const tag = `A${tagCounter++}`;
        socket.write(`${tag} ${cmd}\r\n`);
        return tag;
      };

      const tryAppendNextFolder = () => {
        if (folderIndex >= sentFolders.length) {
          // No folder worked, logout anyway
          console.warn('Could not find Sent folder, skipping IMAP append');
          step = 99;
          sendCommand('LOGOUT');
          return;
        }
        const folder = sentFolders[folderIndex];
        const emailBytes = Buffer.byteLength(rawEmail, 'utf-8');
        step = 3; // waiting for append literal ready
        const tag = `A${tagCounter++}`;
        socket.write(`${tag} APPEND "${folder}" (\\Seen) {${emailBytes}}\r\n`);
      };

      socket.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (step === 0 && line.startsWith('* OK')) {
            // Server greeting received, login
            step = 1;
            sendCommand(`LOGIN "${imapUser.replace(/"/g, '\\"')}" "${imapPass.replace(/"/g, '\\"')}"`);
          } else if (step === 1 && /^A\d+ OK/i.test(line)) {
            // Login successful, try first Sent folder
            step = 2;
            folderIndex = 0;
            tryAppendNextFolder();
          } else if (step === 1 && /^A\d+ (NO|BAD)/i.test(line)) {
            // Login failed
            console.error('IMAP login failed:', line);
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          } else if (step === 3 && line.startsWith('+')) {
            // Server ready for literal data
            socket.write(rawEmail + '\r\n');
            step = 4; // waiting for append result
          } else if (step === 4 && /^A\d+ OK/i.test(line)) {
            // Append successful, logout
            step = 99;
            sendCommand('LOGOUT');
          } else if (step === 4 && /^A\d+ (NO|BAD)/i.test(line)) {
            // This folder didn't work, try next
            folderIndex++;
            tryAppendNextFolder();
          } else if (step === 99 && /^A\d+ OK|^\* BYE/i.test(line)) {
            clearTimeout(timeout);
            socket.destroy();
            resolve();
          }
        }
      });

      socket.on('error', (err: Error) => {
        console.error('IMAP socket error:', err.message);
        clearTimeout(timeout);
        resolve();
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    socket.on('error', (err: Error) => {
      console.error('IMAP TLS connection error:', err.message);
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Build a raw RFC 2822 email string from the message options,
 * using nodemailer's internal MailComposer.
 */
async function buildRawEmail(mailOptions: Record<string, any>): Promise<string> {
  const MailComposer = (await import('nodemailer/lib/mail-composer')).default;
  const mail = new MailComposer(mailOptions);
  const message = await mail.compile().build();
  return message.toString();
}

export async function POST(request: Request) {
  try {
    const { subject, body, recipients, senderName, attachments = [], smtpConfig, activeFilename } = await request.json();

    if (!subject || !body || !recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const host = smtpConfig?.host || process.env.SMTP_HOST || "mail.infomaniak.com";
    const port = smtpConfig?.port ? Number(smtpConfig.port) : (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    const results: any[] = [];
    const name = senderName || "Briac de Edichoix";
    
    // Parse attachments from base64
    const parsedAttachments = attachments.map((att: any) => {
      const base64Content = att.content.split(';base64,').pop();
      return {
        filename: att.name,
        content: Buffer.from(base64Content, 'base64'),
        contentType: att.type
      };
    });

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      
      let personalizedSubject = subject;
      let personalizedBody = body;

      for (const [key, value] of Object.entries(recipient)) {
        if (value && typeof value === 'string') {
           const regex = new RegExp(`{${key}}`, 'gi');
           personalizedSubject = personalizedSubject.replace(regex, value);
           personalizedBody = personalizedBody.replace(regex, value);
        }
      }

      const mailOptions = {
        from: `"${name}" <${user}>`,
        to: recipient.email,
        subject: personalizedSubject,
        html: personalizedBody,
        attachments: parsedAttachments
      };

      try {
        await transporter.sendMail(mailOptions);
        results.push({ email: recipient.email, status: 'success' });

        // Copy email to Sent folder via IMAP
        try {
          const rawEmail = await buildRawEmail(mailOptions);
          await appendToSentFolder(host, user!, pass!, rawEmail);
        } catch (imapErr: any) {
          console.error(`Failed to copy email to Sent folder for ${recipient.email}:`, imapErr.message);
          // Don't fail the send result if IMAP copy fails
        }
      } catch (err: any) {
        results.push({ email: recipient.email, status: 'error', error: err.message });
      }
      
      // Small delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // --- Save Campaign History ---
    try {
      if (activeFilename && results.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const baseName = activeFilename.replace('.csv', '');
        const historyFilename = `${baseName}_history_${timestamp}.csv`;
        
        const basePath = process.env.APPDATA_DIR || process.cwd();
        const historyPath = path.join(basePath, 'data', historyFilename);

        // Map results back to recipients to add a Status column
        const updatedRecipients = recipients.map((rec: any) => {
          const res = results.find(r => r.email === rec.email);
          return {
            ...rec,
            Status: res ? res.status : 'skipped',
            Error: res && res.error ? res.error : ''
          };
        });

        // Determine all columns
        const allKeys = new Set<string>();
        updatedRecipients.forEach((r: any) => Object.keys(r).forEach(k => allKeys.add(k)));
        
        const csvContent = Papa.unparse({
          fields: Array.from(allKeys),
          data: updatedRecipients
        });

        fs.writeFileSync(historyPath, csvContent, 'utf-8');
        console.log(`Saved history to ${historyPath}`);
      }
    } catch (saveError) {
      console.error('Failed to save history CSV:', saveError);
      // We don't fail the request if history saving fails, but we log it.
    }

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error('Send error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
