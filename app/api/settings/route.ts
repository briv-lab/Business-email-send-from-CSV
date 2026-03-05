import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getSettingsPath() {
  const basePath = process.env.APPDATA_DIR || process.cwd();
  return path.join(basePath, 'data', 'settings.json');
}

export async function GET() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return NextResponse.json(JSON.parse(data));
    }
    return NextResponse.json({});
  } catch (error: any) {
    console.error('Failed to read settings:', error);
    return NextResponse.json({}, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const settingsPath = getSettingsPath();
    const dir = path.dirname(settingsPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let currentSettings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch (e) {
        // ignore JSON parse errors of old settings
      }
    }

    const newSettings = { ...currentSettings, ...payload };
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf-8');

    return NextResponse.json({ success: true, settings: newSettings });
  } catch (error: any) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
