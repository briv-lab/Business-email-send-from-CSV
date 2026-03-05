import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const basePath = process.env.APPDATA_DIR || process.cwd();
const DATA_DIR = path.join(basePath, 'data');

export async function GET() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    
    // If no files exist, pre-create 'prospects.csv'
    if (files.length === 0) {
      const defaultPath = path.join(DATA_DIR, 'prospects.csv');
      fs.writeFileSync(defaultPath, 'email\n');
      files.push('prospects.csv');
    }

    // Sort files by modified date descending
    const sortedFiles = files.map(file => {
      const stats = fs.statSync(path.join(DATA_DIR, file));
      return {
        name: file,
        mtime: stats.mtime.getTime()
      };
    }).sort((a, b) => b.mtime - a.mtime).map(f => f.name);

    return NextResponse.json({ files: sortedFiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, filename, newFilename } = await request.json();
    
    if (action === 'create' && newFilename) {
      const safeName = newFilename.endsWith('.csv') ? newFilename : `${newFilename}.csv`;
      const filePath = path.join(DATA_DIR, safeName);
      
      if (fs.existsSync(filePath)) {
         return NextResponse.json({ error: 'Ce fichier existe déjà' }, { status: 400 });
      }
      
      fs.writeFileSync(filePath, 'email\n');
      return NextResponse.json({ success: true, filename: safeName });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
