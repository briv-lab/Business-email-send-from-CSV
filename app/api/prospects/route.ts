import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const basePath = process.env.APPDATA_DIR || process.cwd();
const DATA_DIR = path.join(basePath, 'data');
type ProspectRow = Record<string, string>;

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename') || 'prospects.csv';
  // Ensure we don't traverse directories
  const safeFilename = path.basename(filename);
  return path.join(DATA_DIR, safeFilename);
}

export async function GET(request: Request) {
  try {
    const filePath = getFilePath(request);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ data: [], meta: { fields: [] } });
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
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

    const csvContent = Papa.unparse({
      fields: headers,
      data: rows
    });

    ensureDataDirectory();
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update prospects CSV' }, { status: 500 });
  }
}
