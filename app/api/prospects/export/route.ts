import fs from 'fs';
import path from 'path';

import { NextResponse } from 'next/server';

import { getProspectFilePath, sanitizeCsvFilename } from '@/lib/server/prospect-storage';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = sanitizeCsvFilename(searchParams.get('filename') || 'prospects.csv');
  const filePath = getProspectFilePath(filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${path.basename(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
