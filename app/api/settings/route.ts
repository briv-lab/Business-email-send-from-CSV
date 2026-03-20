import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type SettingsPayload = Record<string, unknown>;

function getSettingsPath() {
  const basePath = process.env.APPDATA_DIR || process.cwd();
  return path.join(basePath, 'data', 'settings.json');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return NextResponse.json(JSON.parse(data));
    }
    return NextResponse.json({});
  } catch (error) {
    console.error('Failed to read settings:', error);
    return NextResponse.json({}, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as SettingsPayload;
    const settingsPath = getSettingsPath();
    const dir = path.dirname(settingsPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let currentSettings: SettingsPayload = {};
    if (fs.existsSync(settingsPath)) {
      try {
        currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as SettingsPayload;
      } catch {
        // ignore JSON parse errors of old settings
      }
    }

    const newSettings = { ...currentSettings, ...payload };
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf-8');

    return NextResponse.json({ success: true, settings: newSettings });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
