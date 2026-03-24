import { NextResponse } from 'next/server';
import fs from 'fs';
import {
  buildCsvContent,
  ensureDataDirectory,
  getProspectFilePath,
  parseProspectsCsv,
  type ProspectRow,
} from '@/lib/server/prospect-storage';

function getFilePath(request: Request) {
  const { searchParams } = new URL(request.url);
  return getProspectFilePath(searchParams.get('filename'));
}

export async function GET(request: Request) {
  try {
    const filePath = getFilePath(request);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ data: [], meta: { fields: [] } });
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseProspectsCsv(fileContent);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Failed to read prospects CSV' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      headers?: string[];
      rows?: ProspectRow[];
    };
    const headers = body.headers;
    const rows = body.rows;

    if (!headers || !rows) {
        return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    const filePath = getFilePath(request);
    const csvContent = buildCsvContent(headers, rows);

    ensureDataDirectory();
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update prospects CSV' }, { status: 500 });
  }
}
