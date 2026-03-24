import { NextResponse } from 'next/server';
import fs from 'fs';
import {
  ensureDataDirectory,
  getProspectFilePath,
  listProspectFiles,
  sanitizeCsvFilename,
} from '@/lib/server/prospect-storage';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    return NextResponse.json({ files: listProspectFiles() });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, newFilename, filename } = await request.json() as {
      action?: string;
      newFilename?: string;
      filename?: string;
    };
    
    if (action === 'create' && newFilename) {
      ensureDataDirectory();
      const safeName = sanitizeCsvFilename(newFilename);
      const filePath = getProspectFilePath(safeName);
      
      if (fs.existsSync(filePath)) {
         return NextResponse.json({ error: 'Ce fichier existe déjà' }, { status: 400 });
      }
      
      fs.writeFileSync(filePath, 'email\n');
      return NextResponse.json({ success: true, filename: safeName });
    }

    if (action === 'delete' && filename) {
      ensureDataDirectory();
      const safeName = sanitizeCsvFilename(filename);
      const filePath = getProspectFilePath(safeName);

      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'Ce fichier est introuvable' }, { status: 404 });
      }

      fs.unlinkSync(filePath);
      const files = listProspectFiles();
      return NextResponse.json({
        success: true,
        deletedFilename: safeName,
        files,
        fallbackFilename: files[0] ?? null,
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
