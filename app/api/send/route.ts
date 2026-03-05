import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

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

      try {
        await transporter.sendMail({
          from: `"${name}" <${user}>`,
          to: recipient.email,
          subject: personalizedSubject,
          html: personalizedBody,
          attachments: parsedAttachments
        });
        results.push({ email: recipient.email, status: 'success' });
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
