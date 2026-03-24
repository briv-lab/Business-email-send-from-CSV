import fs from 'fs';
import path from 'path';

import Papa from 'papaparse';

export type ProspectRow = Record<string, string>;
type ParsedCsv = {
  data?: ProspectRow[];
  meta?: {
    fields?: string[];
  };
  errors?: Array<{ message: string }>;
};

const DEFAULT_PROSPECTS_FILENAME = 'prospects.csv';

export function getBaseDataPath() {
  return process.env.APPDATA_DIR || process.cwd();
}

export function getDataDirectory() {
  return path.join(getBaseDataPath(), 'data');
}

export function ensureDataDirectory() {
  const dataDirectory = getDataDirectory();
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function normalizeFilename(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) {
    return DEFAULT_PROSPECTS_FILENAME;
  }

  const baseName = path.basename(trimmed).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  return baseName.toLowerCase().endsWith('.csv') ? baseName : `${baseName}.csv`;
}

export function sanitizeCsvFilename(filename: string) {
  return normalizeFilename(filename);
}

export function getProspectFilePath(filename?: string | null) {
  const safeFilename = sanitizeCsvFilename(filename || DEFAULT_PROSPECTS_FILENAME);
  return path.join(getDataDirectory(), safeFilename);
}

export function listProspectFiles() {
  ensureDataDirectory();

  const csvFiles = fs.readdirSync(getDataDirectory()).filter((file) => file.toLowerCase().endsWith('.csv'));
  if (csvFiles.length === 0) {
    const defaultPath = getProspectFilePath(DEFAULT_PROSPECTS_FILENAME);
    fs.writeFileSync(defaultPath, 'email\n', 'utf-8');
    csvFiles.push(DEFAULT_PROSPECTS_FILENAME);
  }

  return csvFiles
    .map((file) => ({
      name: file,
      mtime: fs.statSync(getProspectFilePath(file)).mtime.getTime(),
    }))
    .sort((left, right) => right.mtime - left.mtime)
    .map((file) => file.name);
}

export function buildCsvContent(headers: string[], rows: ProspectRow[]) {
  return Papa.unparse({
    fields: headers,
    data: rows,
  });
}

export function parseProspectsCsv(csvContent: string) {
  const normalizedContent = csvContent.replace(/^\uFEFF/, '');
  return Papa.parse<ProspectRow>(normalizedContent, {
    header: true,
    skipEmptyLines: true,
  }) as ParsedCsv;
}

export function validateParsedCsv(parsed: ParsedCsv) {
  const fields = parsed.meta?.fields?.filter((field) => field.trim().length > 0) ?? [];
  if (fields.length === 0) {
    throw new Error("Le CSV doit contenir une ligne d'en-tete.");
  }

  const blockingErrors = parsed.errors?.filter((error) => error.message) ?? [];
  if (blockingErrors.length > 0) {
    throw new Error(blockingErrors[0]?.message || 'Le CSV importé est invalide.');
  }

  return fields;
}

export function createUniqueProspectFilename(filename: string) {
  const safeFilename = sanitizeCsvFilename(filename);
  const extension = path.extname(safeFilename);
  const basename = path.basename(safeFilename, extension);

  let candidate = safeFilename;
  let counter = 1;
  while (fs.existsSync(getProspectFilePath(candidate))) {
    candidate = `${basename}-${counter}${extension}`;
    counter += 1;
  }

  return candidate;
}
