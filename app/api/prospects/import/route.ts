import fs from 'fs';

import { NextResponse } from 'next/server';

import {
  buildCsvContent,
  createUniqueProspectFilename,
  ensureDataDirectory,
  getProspectFilePath,
  parseProspectsCsv,
  sanitizeCsvFilename,
  validateParsedCsv,
} from '@/lib/server/prospect-storage';

export const runtime = 'nodejs';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier CSV fourni.' }, { status: 400 });
    }

    const originalFilename = sanitizeCsvFilename(file.name || 'import.csv');
    const fileContent = await file.text();
    const parsed = parseProspectsCsv(fileContent);
    const headers = validateParsedCsv(parsed);

    const normalizedRows = (parsed.data ?? []).map((row) =>
      headers.reduce<Record<string, string>>((accumulator, header) => {
        const value = row[header];
        accumulator[header] = typeof value === 'string' ? value : value == null ? '' : String(value);
        return accumulator;
      }, {}),
    );

    ensureDataDirectory();
    const storedFilename = createUniqueProspectFilename(originalFilename);
    const storedFilePath = getProspectFilePath(storedFilename);
    const normalizedCsv = buildCsvContent(headers, normalizedRows);

    fs.writeFileSync(storedFilePath, normalizedCsv, 'utf-8');

    return NextResponse.json({
      success: true,
      filename: storedFilename,
      importedRowCount: normalizedRows.length,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = /csv|en-tete|header|delimiter|field/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
