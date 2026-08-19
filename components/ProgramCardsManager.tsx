import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { Download, Palette, Plus, Printer, QrCode, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { LOGO_URL } from '../constants';
import {
  createProgramCards,
  listProgramCards,
  revokeProgramCard,
  updateProgramCard,
} from '../services/supabaseApi';
import type { ProgramCardInput, ProgramCardRecord, ProgramCardType } from '../services/supabaseApi';

interface ProgramCardsManagerProps {
  cardType: ProgramCardType;
  year: number;
  logoUrl?: string;
  issuerLabel?: string;
  scopeLabel?: string;
}

interface ColorPreset {
  key: string;
  label: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  trim: string;
}

interface FormState {
  title: string;
  displayName: string;
  tag: string;
  programName: string;
  siri: string;
  colorKey: string;
  detailMain: string;
  detail1: string;
  detail2: string;
  note: string;
  prefix: string;
  quantity: string;
  startNumber: string;
}

interface BulkUrusetiaEntry {
  name: string;
  fullName: string;
  tag?: string;
  detailMain?: string;
  detail1?: string;
  detail2?: string;
  note?: string;
  programName?: string;
  siri?: number;
  payload?: Record<string, string>;
}

const PROGRAM_CARDS_PER_PAGE = 10;
const DEV_PROGRAM_CARDS_KEY = 'PROGRAM_CARDS_DEV_RECORDS';
const DEV_CARD_SCAN_CACHE_KEY = 'PARTICIPANT_CARD_DEV_CACHE';
const CARD_SCOUT_CAMP_BG_URL = '/card-scout-camp-bg.png?v=20260819-bg2';
const MAX_BULK_URUSETIA_CARDS = 300;

const COLOR_PRESETS: ColorPreset[] = [
  { key: 'maroon-gold', label: 'Maroon Emas', accent: '#991b1b', accentDark: '#450a0a', accentSoft: '#fef2f2', trim: '#d8ad3f' },
  { key: 'emerald-blue', label: 'Hijau Biru', accent: '#0f766e', accentDark: '#134e4a', accentSoft: '#ecfdf5', trim: '#2563eb' },
  { key: 'royal-blue', label: 'Biru Rasmi', accent: '#2563eb', accentDark: '#172554', accentSoft: '#eff6ff', trim: '#f2b84b' },
  { key: 'slate-gold', label: 'Hitam Emas', accent: '#1f2937', accentDark: '#020617', accentSoft: '#f8fafc', trim: '#d8ad3f' },
  { key: 'violet-cyan', label: 'Ungu Cyan', accent: '#7c3aed', accentDark: '#3f236f', accentSoft: '#f5f3ff', trim: '#06b6d4' },
  { key: 'orange-red', label: 'Oren Merah', accent: '#ea580c', accentDark: '#7c2d12', accentSoft: '#fff7ed', trim: '#dc2626' },
  { key: 'forest-gold', label: 'Hijau Pengakap', accent: '#15803d', accentDark: '#14532d', accentSoft: '#f0fdf4', trim: '#facc15' },
  { key: 'teal-amber', label: 'Teal Amber', accent: '#0d9488', accentDark: '#134e4a', accentSoft: '#ecfeff', trim: '#f59e0b' },
  { key: 'cyan-red', label: 'Cyan Merah', accent: '#0891b2', accentDark: '#164e63', accentSoft: '#ecfeff', trim: '#ef4444' },
  { key: 'rose-green', label: 'Rose Hijau', accent: '#db2777', accentDark: '#831843', accentSoft: '#fdf2f8', trim: '#22c55e' },
  { key: 'indigo-amber', label: 'Indigo Amber', accent: '#4f46e5', accentDark: '#312e81', accentSoft: '#eef2ff', trim: '#f59e0b' },
  { key: 'olive-yellow', label: 'Olive Kuning', accent: '#4d7c0f', accentDark: '#365314', accentSoft: '#f7fee7', trim: '#eab308' },
  { key: 'steel-red', label: 'Steel Merah', accent: '#475569', accentDark: '#0f172a', accentSoft: '#f8fafc', trim: '#ef4444' },
  { key: 'mint-navy', label: 'Mint Navy', accent: '#059669', accentDark: '#064e3b', accentSoft: '#ecfdf5', trim: '#1d4ed8' },
  { key: 'copper-cyan', label: 'Copper Cyan', accent: '#c2410c', accentDark: '#7c2d12', accentSoft: '#fff7ed', trim: '#06b6d4' },
  { key: 'plum-gold', label: 'Plum Emas', accent: '#9333ea', accentDark: '#581c87', accentSoft: '#faf5ff', trim: '#facc15' },
];

const DEFAULT_COLOR_BY_TYPE: Record<ProgramCardType, string> = {
  urusetia: 'maroon-gold',
  general: 'royal-blue',
};

const defaultForm = (cardType: ProgramCardType, year: number): FormState => ({
  title: cardType === 'urusetia' ? 'URUSETIA' : 'KAD KELUAR MASUK',
  displayName: '',
  tag: cardType === 'urusetia' ? 'PENDAFTARAN' : '',
  programName: '',
  siri: '1',
  colorKey: DEFAULT_COLOR_BY_TYPE[cardType],
  detailMain: '',
  detail1: '',
  detail2: '',
  note: '',
  prefix: cardType === 'general' ? 'KM' : '',
  quantity: cardType === 'general' ? '50' : '1',
  startNumber: '1',
});

const escapeHtml = (value: unknown): string => {
  const text = String(value ?? '');
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => entities[char] || char);
};

const normalizePrintableUrl = (url?: string): string => {
  if (!url) return LOGO_URL;
  if (/^(data:|https?:)/i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
};

const getColorPreset = (key?: string): ColorPreset =>
  COLOR_PRESETS.find(item => item.key === key) || COLOR_PRESETS[0];

const getRecordPalette = (record: ProgramCardRecord): ColorPreset => {
  const preset = getColorPreset(record.colorKey);
  return {
    ...preset,
    accent: record.accent || preset.accent,
    accentDark: record.accentDark || preset.accentDark,
    accentSoft: record.accentSoft || preset.accentSoft,
    trim: record.trim || preset.trim,
  };
};

const chunkCards = (items: string[], size: number): string[][] => {
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

const splitDelimitedLine = (line: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const detectBulkDelimiter = (line: string): string => {
  const candidates = ['\t', ',', ';'];
  return candidates
    .map(delimiter => ({ delimiter, count: splitDelimitedLine(line, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ',';
};

const normalizeHeader = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9/ ]+/g, '')
    .replace(/\s+/g, ' ');

const findHeaderIndex = (headers: string[], aliases: string[]): number => {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex(header => normalizedAliases.includes(normalizeHeader(header)));
};

const looksLikeIndexCell = (value: string): boolean =>
  /^\s*(?:bil|no\.?|#)?\s*\d+\s*[\).:-]?\s*$/i.test(value);

const cleanBulkName = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/^\s*(?:\d+\s*[\).:-]\s*|[-*]\s+)/, '')
    .replace(/\s+/g, ' ');

const getShortCardName = (value: string): string => {
  const fullName = cleanBulkName(value)
    .toUpperCase()
    .replace(/\bA\s*\/\s*L\b/g, 'A/L')
    .replace(/\bA\s*\/\s*P\b/g, 'A/P');
  const connectorWords = new Set(['BIN', 'BINTI', 'BT', 'BTE', 'A/L', 'A/P', 'AL', 'AP', 'ANAK', 'IBN', 'IBNI']);
  const words = fullName.split(' ').map(word => word.trim()).filter(Boolean);
  const connectorIndex = words.findIndex(word => connectorWords.has(word.replace(/[.,]/g, '')));
  const displayWords = connectorIndex > 0 ? words.slice(0, connectorIndex) : words;
  const displayName = displayWords.join(' ') || fullName;
  if (displayName.length <= 34) return displayName;
  const threeWords = displayWords.slice(0, 3).join(' ');
  if (threeWords && threeWords.length <= 34) return threeWords;
  const twoWords = displayWords.slice(0, 2).join(' ');
  if (twoWords) return twoWords;
  return displayName.slice(0, 34).trim();
};

const formatBulkPayloadLabel = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 48);

const isBulkIndexHeader = (value: string): boolean =>
  /^(bil|bilangan|no|nombor|#|index)$/i.test(normalizeHeader(value));

const parseBulkUrusetiaEntries = (text: string): BulkUrusetiaEntry[] => {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = detectBulkDelimiter(lines.find(line => /[\t,;]/.test(line)) || lines[0]);
  const rows = lines.map(line => splitDelimitedLine(line, delimiter).map(cell => cell.trim()));
  const firstRow = rows[0] || [];
  const nameHeader = findHeaderIndex(firstRow, ['nama', 'name', 'full name', 'fullname', 'nama urusetia', 'nama urus setia', 'nama penuh', 'nama guru', 'nama petugas', 'nama pegawai', 'nama staf', 'nama staff', 'nama ahli']);
  const tagHeader = findHeaderIndex(firstRow, ['tag', 'tugas', 'jawatan', 'jawatan tugas', 'jawatan peranan', 'peranan', 'role', 'designation', 'unit', 'bahagian', 'sektor']);
  const detailMainHeader = findHeaderIndex(firstRow, ['maklumat', 'maklumat utama', 'qr untuk', 'untuk']);
  const detail1Header = findHeaderIndex(firstRow, ['maklumat 1', 'maklumat1', 'detail 1', 'detail1']);
  const detail2Header = findHeaderIndex(firstRow, ['maklumat 2', 'maklumat2', 'detail 2', 'detail2']);
  const noteHeader = findHeaderIndex(firstRow, ['catatan', 'nota', 'note']);
  const programHeader = findHeaderIndex(firstRow, ['program', 'nama program']);
  const siriHeader = findHeaderIndex(firstRow, ['siri', 'series']);
  const hasHeader = [nameHeader, tagHeader, detailMainHeader, detail1Header, detail2Header, noteHeader, programHeader, siriHeader].some(index => index >= 0);

  const getCell = (row: string[], index: number): string => (index >= 0 ? String(row[index] || '').trim() : '');
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map(row => {
      const firstCell = getCell(row, 0);
      const indexOffset = !hasHeader && looksLikeIndexCell(firstCell) ? 1 : 0;
      const fullName = cleanBulkName(hasHeader ? getCell(row, nameHeader) : getCell(row, indexOffset));
      const tag = hasHeader ? getCell(row, tagHeader) : getCell(row, indexOffset + 1);
      const siriValue = hasHeader ? Number(getCell(row, siriHeader)) : Number.NaN;
      const programName = hasHeader ? getCell(row, programHeader) : '';
      const payload: Record<string, string> = {};

      if (hasHeader) {
        firstRow.forEach((header, index) => {
          const value = getCell(row, index);
          const label = formatBulkPayloadLabel(header);
          if (!value || !label || isBulkIndexHeader(label)) return;
          if (index === nameHeader) payload['Nama Penuh'] = cleanBulkName(value);
          else if (index === tagHeader) payload.Jawatan = value;
          else if (index === programHeader) payload.Program = value;
          else if (index === siriHeader) payload.Siri = value;
          else payload[label] = value;
        });
      } else {
        if (fullName) payload['Nama Penuh'] = fullName;
        if (tag) payload.Jawatan = tag;
      }

      return {
        name: getShortCardName(fullName),
        fullName,
        tag,
        detailMain: hasHeader ? getCell(row, detailMainHeader) : getCell(row, indexOffset + 2),
        detail1: hasHeader ? getCell(row, detail1Header) : getCell(row, indexOffset + 3),
        detail2: hasHeader ? getCell(row, detail2Header) : getCell(row, indexOffset + 4),
        note: hasHeader ? getCell(row, noteHeader) : getCell(row, indexOffset + 5),
        programName,
        siri: Number.isFinite(siriValue) && siriValue > 0 ? siriValue : undefined,
        payload: cleanPayload(payload),
      };
    })
    .filter(entry => entry.fullName)
    .slice(0, MAX_BULK_URUSETIA_CARDS);
};

const buildProgramCardScanUrl = (token: string): string => {
  if (typeof window === 'undefined') return `#/kad-peserta/${encodeURIComponent(token)}`;
  return `${window.location.origin}${window.location.pathname}#/kad-peserta/${encodeURIComponent(token)}`;
};

const createProgramCardQrDataUrl = (token: string) => QRCode.toDataURL(buildProgramCardScanUrl(token), {
  width: 360,
  margin: 1,
  errorCorrectionLevel: 'M',
  color: { dark: '#111827', light: '#ffffff' },
});

const randomPreviewToken = (): string => {
  const bytes = new Uint8Array(11);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(22, '0').slice(0, 22);
};

const isDevPreview = () => Boolean((import.meta as any).env?.DEV) && typeof window !== 'undefined';

const readLocalProgramCards = (): ProgramCardRecord[] => {
  if (!isDevPreview()) return [];
  try {
    return JSON.parse(localStorage.getItem(DEV_PROGRAM_CARDS_KEY) || '[]') || [];
  } catch {
    return [];
  }
};

const saveLocalProgramCards = (records: ProgramCardRecord[]) => {
  if (!isDevPreview()) return;
  localStorage.setItem(DEV_PROGRAM_CARDS_KEY, JSON.stringify(records.slice(0, 800)));
};

const writeDevScanCache = (record: ProgramCardRecord) => {
  if (!isDevPreview()) return;
  try {
    const cache = JSON.parse(localStorage.getItem(DEV_CARD_SCAN_CACHE_KEY) || '{}') || {};
    const palette = getRecordPalette(record);
    cache[record.token] = {
      ok: true,
      cardKind: 'program',
      cardType: record.cardType,
      cardTitle: record.title,
      displayName: record.displayName,
      cardNumber: record.cardNumber,
      tag: record.tag,
      programName: record.programName,
      programYear: record.programYear,
      siri: record.siri,
      issuerLabel: record.issuerLabel,
      scopeLabel: record.scopeLabel,
      colorKey: record.colorKey,
      accent: palette.accent,
      accentDark: palette.accentDark,
      accentSoft: palette.accentSoft,
      trim: palette.trim,
      details: record.payload || {},
      name: record.displayName || record.title,
      role: record.cardType === 'urusetia' ? 'URUSETIA' : 'KAD UMUM',
      preview: true,
    };
    localStorage.setItem(DEV_CARD_SCAN_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Local preview cache is best effort.
  }
};

const removeDevScanCache = (tokens: string[]) => {
  if (!isDevPreview() || tokens.length === 0) return;
  try {
    const cache = JSON.parse(localStorage.getItem(DEV_CARD_SCAN_CACHE_KEY) || '{}') || {};
    tokens.forEach(token => {
      delete cache[token];
    });
    localStorage.setItem(DEV_CARD_SCAN_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Local preview cache is best effort.
  }
};

const createLocalProgramCards = (inputs: ProgramCardInput[]): ProgramCardRecord[] => {
  const now = new Date().toISOString();
  const records = inputs.map(input => ({
    ...input,
    id: `dev-${randomPreviewToken()}`,
    token: `dev-${randomPreviewToken()}`,
    createdAt: now,
    updatedAt: now,
  }));
  const next = [...records, ...readLocalProgramCards()];
  saveLocalProgramCards(next);
  records.forEach(writeDevScanCache);
  return records;
};

const updateLocalProgramCard = (cardId: string, patch: Partial<ProgramCardInput>): ProgramCardRecord | null => {
  const records = readLocalProgramCards();
  const index = records.findIndex(card => card.id === cardId);
  if (index === -1) return null;
  const updated = { ...records[index], ...patch, updatedAt: new Date().toISOString() };
  records[index] = updated;
  saveLocalProgramCards(records);
  writeDevScanCache(updated);
  return updated;
};

const revokeLocalProgramCard = (cardId: string): boolean => {
  const records = readLocalProgramCards();
  const removed = records.find(card => card.id === cardId);
  const next = records.filter(card => card.id !== cardId);
  saveLocalProgramCards(next);
  if (removed?.token) removeDevScanCache([removed.token]);
  return next.length !== records.length;
};

const cleanPayload = (payload: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => String(value || '').trim()));

const EDITABLE_PAYLOAD_KEYS = new Set(['Untuk', 'Maklumat Utama', 'Maklumat 1', 'Maklumat 2', 'Catatan']);

const preserveExtraPayload = (payload?: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(payload || {}).filter(([key]) => !EDITABLE_PAYLOAD_KEYS.has(key)));

const payloadFromForm = (
  form: FormState,
  cardType: ProgramCardType,
  extraPayload: Record<string, string> = {}
): Record<string, string> => {
  const payload: Record<string, string> = {};
  if (cardType === 'urusetia') {
    if (form.displayName.trim()) payload['Nama Penuh'] = form.displayName.trim();
    if (form.tag.trim()) payload.Jawatan = form.tag.trim();
  }
  if (form.detailMain.trim()) payload[cardType === 'urusetia' ? 'Maklumat Utama' : 'Untuk'] = form.detailMain.trim();
  if (form.detail1.trim()) payload['Maklumat 1'] = form.detail1.trim();
  if (form.detail2.trim()) payload['Maklumat 2'] = form.detail2.trim();
  if (form.note.trim()) payload.Catatan = form.note.trim();
  return cleanPayload({ ...payload, ...extraPayload });
};

const imageUrlToDataUrl = async (url: string): Promise<string> => {
  if (!url || /^data:/i.test(url)) return url;
  const response = await fetch(normalizePrintableUrl(url));
  if (!response.ok) throw new Error('Logo tidak dapat dimuatkan.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca logo.'));
    reader.readAsDataURL(blob);
  });
};

const waitForRenderableAssets = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));

  const fonts = (document as any).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // Browser font readiness is best-effort.
    }
  }
};

const getVisualTitle = (record: ProgramCardRecord): string =>
  record.cardType === 'urusetia' ? (record.displayName || record.title) : (record.title || 'KAD UMUM');

const getAccessTitleFontSize = (title: string): number => {
  const clean = String(title || '').trim();
  const longestWord = Math.max(0, ...clean.split(/\s+/).map(word => word.length));
  if (longestWord > 16) return 9.4;
  if (longestWord > 13) return 10.2;
  if (clean.length > 34) return 10.2;
  if (clean.length > 27) return 10.8;
  return 11.6;
};

const getVisualSubtitle = (record: ProgramCardRecord): string => {
  if (record.cardType === 'urusetia') return record.tag || record.programName || 'URUSETIA';
  return '';
};

const getSpineLabel = (record: ProgramCardRecord): string =>
  record.cardType === 'urusetia' ? 'URUSETIA' : 'UMUM';

const buildProgramAccessCardHtml = (record: ProgramCardRecord, qrDataUrl: string, logoUrl: string): string => {
  const palette = getRecordPalette(record);
  const visualTitle = getVisualTitle(record).toUpperCase();
  const visualSubtitle = getVisualSubtitle(record).toUpperCase();
  const cardBackgroundUrl = normalizePrintableUrl(CARD_SCOUT_CAMP_BG_URL);

  return `
    <article class="program-access-card" style="--accent:${palette.accent}; --accent-dark:${palette.accentDark}; --accent-soft:${palette.accentSoft}; --trim:${palette.trim}; --card-bg:url(${escapeHtml(cardBackgroundUrl)});">
      <div class="card-spine"><div class="spine-role">${escapeHtml(getSpineLabel(record))}</div></div>
      <div class="card-top-shape"></div>
      <div class="card-watermark"></div>
      <div class="card-inner">
        <header class="card-header">
          <img class="district-logo" src="${escapeHtml(logoUrl)}" alt="" onerror="this.style.display='none'" />
          <div class="issuer">
            <div class="issuer-main">PERSEKUTUAN PENGAKAP MALAYSIA</div>
            <div class="issuer-sub">${escapeHtml(record.issuerLabel || record.scopeLabel || 'PENGAKAP MALAYSIA')}</div>
          </div>
        </header>
        <section class="identity">
          <div class="access-title" style="font-size:${getAccessTitleFontSize(visualTitle)}pt">${escapeHtml(visualTitle)}</div>
          ${record.cardNumber ? `<div class="access-number">${escapeHtml(record.cardNumber)}</div>` : ''}
          ${visualSubtitle ? `<div class="access-subtitle">${escapeHtml(visualSubtitle)}</div>` : ''}
        </section>
        <section class="qr-box"><img class="access-qr" src="${qrDataUrl}" alt="" /></section>
        <div class="bottom-trim"><span></span><span></span><span></span></div>
      </div>
    </article>
  `;
};

const buildProgramCardsDocument = (cards: string[], mode: 'single' | 'grid'): string => {
  const body = mode === 'single'
    ? `<main class="single-sheet">${cards[0] || ''}</main>`
    : chunkCards(cards, PROGRAM_CARDS_PER_PAGE).map(page => `<section class="sheet">${page.join('')}</section>`).join('');

  return `<!DOCTYPE html><html><head><title>Kad Program</title>
<style>
  @page { size: A4 ${mode === 'single' ? 'portrait' : 'landscape'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #111827; }
  .sheet {
    width: 297mm;
    height: 210mm;
    padding: 13.31mm 4.7mm 7.8mm;
    display: grid;
    grid-template-columns: repeat(5, 56mm);
    grid-template-rows: repeat(2, 88mm);
    gap: 12.89mm 1.86mm;
    justify-content: center;
    align-content: start;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .single-sheet {
    width: 210mm;
    min-height: 297mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .program-access-card {
    width: 56mm;
    height: 88mm;
    position: relative;
    overflow: hidden;
    background-image:
      linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.34) 38%, rgba(255,255,255,0.70)),
      linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.18) 57%, rgba(216,173,63,0.08)),
      var(--card-bg);
    background-size: cover, cover, cover;
    background-position: center, center, center;
    background-repeat: no-repeat;
    border: 0.28mm solid #d6dee3;
    border-radius: 2.8mm;
  }
  .program-access-card::after {
    content: "";
    position: absolute;
    inset: 1.7mm;
    border: 0.22mm solid rgba(23,55,68,0.12);
    border-radius: 2mm;
    pointer-events: none;
  }
  .card-spine {
    position: absolute;
    inset: 0 auto 0 0;
    width: 8.4mm;
    background: linear-gradient(180deg, var(--accent-dark), var(--accent));
  }
  .card-spine::after {
    content: "";
    position: absolute;
    inset: 0 -1mm 0 auto;
    width: 1mm;
    background: var(--trim);
  }
  .spine-role {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 68mm;
    transform: translate(-50%, -50%) rotate(-90deg);
    color: #ffffff;
    font-size: 9.6pt;
    line-height: 1;
    font-weight: 900;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0;
    text-shadow: 0 0.35mm 1mm rgba(15,23,42,0.22);
  }
  .card-top-shape {
    position: absolute;
    top: 0;
    left: 8.4mm;
    right: 0;
    height: 18.5mm;
    background: linear-gradient(135deg, var(--accent-dark), var(--accent));
    clip-path: polygon(0 0, 100% 0, 100% 72%, 45% 100%, 0 78%);
  }
  .card-watermark {
    position: absolute;
    right: -11mm;
    top: 31mm;
    width: 42mm;
    height: 42mm;
    border: 2.4mm solid rgba(15,23,42,0.06);
    border-radius: 50%;
  }
  .card-inner {
    position: relative;
    height: 100%;
    padding: 3.8mm 4.2mm 2.8mm 11.6mm;
    display: flex;
    flex-direction: column;
  }
  .card-header {
    height: 12mm;
    display: flex;
    align-items: center;
    gap: 2mm;
    color: #ffffff;
  }
  .district-logo {
    width: 10.8mm;
    height: 10.8mm;
    object-fit: contain;
    padding: 0.9mm;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0.5mm 2mm rgba(15,23,42,0.18);
  }
  .issuer { min-width: 0; line-height: 1.1; }
  .issuer-main { font-size: 5.2pt; font-weight: 900; letter-spacing: 0; }
  .issuer-sub { margin-top: 0.7mm; font-size: 4.8pt; font-weight: 700; opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 32mm; letter-spacing: 0; }
  .identity {
    min-height: 25mm;
    margin-top: 4.7mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }
  .access-title {
    display: inline-block;
    align-self: center;
    max-width: 100%;
    padding: 0.8mm 1.5mm;
    color: #020617;
    background: rgba(255,255,255,0.62);
    border-radius: 1.6mm;
    font-size: 11.6pt;
    line-height: 1.04;
    font-weight: 900;
    text-wrap: balance;
    overflow-wrap: normal;
    word-break: keep-all;
    hyphens: none;
    letter-spacing: 0;
    text-shadow: 0 0.25mm 0.7mm rgba(255,255,255,0.78);
  }
  .access-number {
    display: inline-block;
    align-self: center;
    max-width: 100%;
    margin-top: 1.8mm;
    padding: 0.6mm 1.4mm;
    color: var(--accent-dark);
    background: rgba(255,255,255,0.72);
    border-radius: 1.5mm;
    font-size: 15.5pt;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0;
    text-shadow: 0 0.25mm 0.7mm rgba(255,255,255,0.78);
  }
  .access-subtitle {
    display: inline-block;
    align-self: center;
    max-width: 100%;
    margin-top: 1.4mm;
    padding: 0.45mm 1mm;
    color: #334155;
    background: rgba(255,255,255,0.58);
    border-radius: 1.3mm;
    font-size: 6.1pt;
    line-height: 1.12;
    font-weight: 800;
    max-height: 7.2mm;
    overflow: hidden;
    letter-spacing: 0;
  }
  .info-box {
    min-height: 12mm;
    margin-top: 1.4mm;
    padding: 1.6mm 2mm;
    background: rgba(255,255,255,0.88);
    border: 0.25mm solid rgba(23,55,68,0.14);
    border-left: 1mm solid var(--trim);
    border-radius: 2mm;
  }
  .info-line {
    color: #111827;
    font-size: 5.9pt;
    line-height: 1.12;
    font-weight: 900;
    max-height: 6.8mm;
    overflow: hidden;
  }
  .info-small {
    margin-top: 0.5mm;
    color: #475569;
    font-size: 4.6pt;
    line-height: 1.1;
    font-weight: 700;
    max-height: 3.8mm;
    overflow: hidden;
  }
  .qr-box {
    width: 28.2mm;
    min-height: 28.2mm;
    margin: 1.8mm auto 0;
    padding: 1.2mm;
    border: 0.32mm solid rgba(23,55,68,0.18);
    border-radius: 2.4mm;
    background: #ffffff;
    box-shadow: 0 1mm 3mm rgba(15,23,42,0.08);
  }
  .access-qr {
    width: 25.8mm;
    height: 25.8mm;
    display: block;
  }
  .bottom-trim {
    margin-top: auto;
    height: 2mm;
    display: flex;
    gap: 1mm;
    align-items: end;
  }
  .bottom-trim span {
    height: 0.9mm;
    border-radius: 99px;
    background: var(--trim);
  }
  .bottom-trim span:nth-child(1) { width: 8mm; background: var(--accent-dark); }
  .bottom-trim span:nth-child(2) { width: 15mm; background: var(--trim); }
  .bottom-trim span:nth-child(3) { flex: 1; background: var(--accent); }
  @media screen {
    body { background: #e5e7eb; }
    .sheet, .single-sheet { background: #ffffff; margin: 12px auto; box-shadow: 0 12px 35px rgba(15,23,42,0.16); }
  }
  @media print {
    body { background: #ffffff; }
    .sheet, .single-sheet { margin: 0; box-shadow: none; }
  }
</style></head><body>${body}
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`;
};

const generateProgramCardsPdf = async (records: ProgramCardRecord[], logoUrl: string, filename: string) => {
  if (typeof document === 'undefined') throw new Error('PDF hanya boleh dijana dalam browser.');

  const { default: html2canvas } = await import('html2canvas');
  const printableLogo = await imageUrlToDataUrl(logoUrl).catch(() => '');
  const cardHtml = await Promise.all(records.map(async record => {
    const qrDataUrl = await createProgramCardQrDataUrl(record.token);
    return buildProgramAccessCardHtml(record, qrDataUrl, printableLogo || normalizePrintableUrl(logoUrl));
  }));

  const parsed = new DOMParser().parseFromString(buildProgramCardsDocument(cardHtml, 'grid'), 'text/html');
  const styleText = Array.from(parsed.head.querySelectorAll('style')).map(style => style.textContent || '').join('\n');
  const sourceSheets = Array.from(parsed.body.querySelectorAll('.sheet'));
  if (sourceSheets.length === 0) throw new Error('Tiada helaian kad untuk dijana.');

  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = [
    'position: fixed',
    'left: -10000px',
    'top: 0',
    'width: 297mm',
    'height: auto',
    'background: #fff',
    'z-index: -1',
    'pointer-events: none',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = `${styleText}
    .sheet { margin: 0 !important; box-shadow: none !important; }
    .program-access-card { box-shadow: none !important; }
  `;
  container.appendChild(style);
  sourceSheets.forEach(sheet => container.appendChild(document.importNode(sheet, true)));
  document.body.appendChild(container);

  try {
    await waitForRenderableAssets(container);
    await new Promise(resolve => window.requestAnimationFrame(() => resolve(null)));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const sheets = Array.from(container.querySelectorAll('.sheet')) as HTMLElement[];
    for (let index = 0; index < sheets.length; index += 1) {
      if (index > 0) doc.addPage('a4', 'landscape');
      const canvas = await html2canvas(sheets[index], {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        windowWidth: sheets[index].scrollWidth,
        windowHeight: sheets[index].scrollHeight,
      });
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
    }
    doc.save(filename);
  } finally {
    container.remove();
  }
};

export const ProgramCardsManager: React.FC<ProgramCardsManagerProps> = ({
  cardType,
  year,
  logoUrl = LOGO_URL,
  issuerLabel = 'PENGAKAP MALAYSIA',
  scopeLabel = 'Admin',
}) => {
  const [cards, setCards] = useState<ProgramCardRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => defaultForm(cardType, year));
  const [selectedCardId, setSelectedCardId] = useState('');
  const [editForm, setEditForm] = useState<FormState>(() => defaultForm(cardType, year));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkRevokeLoading, setBulkRevokeLoading] = useState(false);
  const qrCacheRef = useRef<Record<string, string>>({});

  const titleLabel = cardType === 'urusetia' ? 'Kad Urusetia' : 'Kad Umum Bernombor';
  const selectedCard = cards.find(card => card.id === selectedCardId) || cards[0] || null;
  const bulkUrusetiaEntries = useMemo(
    () => cardType === 'urusetia' ? parseBulkUrusetiaEntries(bulkText) : [],
    [bulkText, cardType]
  );

  const loadCards = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listProgramCards(cardType);
      rows.forEach(writeDevScanCache);
      setCards(rows);
      setDbUnavailable(false);
      setNotice('');
    } catch (err: any) {
      if (isDevPreview()) {
        const localRows = readLocalProgramCards().filter(card => card.cardType === cardType && !card.revokedAt);
        localRows.forEach(writeDevScanCache);
        setCards(localRows);
        setDbUnavailable(true);
        setNotice('Mod ujian local: migrasi 060 belum dipasang, jadi kad urusetia/umum disimpan sementara dalam browser.');
      } else {
        setError(String(err?.message || 'Gagal memuatkan kad program.'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setForm(defaultForm(cardType, year));
    setEditForm(defaultForm(cardType, year));
    setSelectedCardId('');
    setBulkText('');
    setBulkFileName('');
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType, year]);

  useEffect(() => {
    if (!selectedCard) return;
    const payload = selectedCard.payload || {};
    setEditForm({
      title: selectedCard.title || defaultForm(cardType, year).title,
      displayName: selectedCard.displayName || '',
      tag: selectedCard.tag || '',
      programName: selectedCard.programName || '',
      siri: String(selectedCard.siri || 1),
      colorKey: selectedCard.colorKey || DEFAULT_COLOR_BY_TYPE[cardType],
      detailMain: String(payload.Untuk || payload['Maklumat Utama'] || ''),
      detail1: String(payload['Maklumat 1'] || ''),
      detail2: String(payload['Maklumat 2'] || ''),
      note: String(payload.Catatan || ''),
      prefix: form.prefix,
      quantity: '1',
      startNumber: '1',
    });
  }, [selectedCard?.id]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateEditForm = (key: keyof FormState, value: string) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  const handleBulkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBulkFileName(file.name);

    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
        setBulkText(rows.map(row => row.map(cell => String(cell || '').trim()).join('\t')).join('\n'));
      } else {
        setBulkText(await file.text());
      }
    } catch (err: any) {
      setError(String(err?.message || 'Gagal membaca fail senarai urusetia.'));
    } finally {
      event.target.value = '';
    }
  };

  const buildInputs = (): ProgramCardInput[] => {
    const preset = getColorPreset(form.colorKey);
    const base = {
      cardType,
      title: form.title.trim() || (cardType === 'urusetia' ? 'URUSETIA' : 'KAD UMUM'),
      tag: form.tag.trim(),
      programName: form.programName.trim(),
      programYear: year,
      siri: Number(form.siri || 1),
      issuerLabel,
      scopeLabel,
      colorKey: preset.key,
      accent: preset.accent,
      accentDark: preset.accentDark,
      accentSoft: preset.accentSoft,
      trim: preset.trim,
      payload: payloadFromForm(form, cardType),
    };

    if (cardType === 'urusetia') {
      if (bulkUrusetiaEntries.length > 0) {
        return bulkUrusetiaEntries.map(entry => {
          const rowForm: FormState = {
            ...form,
            displayName: entry.fullName,
            tag: entry.tag || form.tag,
            programName: entry.programName || form.programName,
            siri: String(entry.siri || Number(form.siri || 1)),
            detailMain: entry.detailMain || form.detailMain,
            detail1: entry.detail1 || form.detail1,
            detail2: entry.detail2 || form.detail2,
            note: entry.note || form.note,
          };
          return {
            ...base,
            tag: rowForm.tag.trim(),
            programName: rowForm.programName.trim(),
            siri: Number(rowForm.siri || 1),
            payload: payloadFromForm(rowForm, cardType, entry.payload || {}),
            displayName: entry.name,
            cardNumber: '',
          };
        });
      }

      return [{
        ...base,
        displayName: form.displayName.trim() || 'NAMA URUSETIA',
        cardNumber: '',
      }];
    }

    const quantity = Math.min(300, Math.max(1, Number(form.quantity || 1)));
    const start = Math.max(1, Number(form.startNumber || 1));
    const prefix = form.prefix.trim().toUpperCase();
    const pad = Math.max(3, String(start + quantity - 1).length);
    return Array.from({ length: quantity }, (_, index) => {
      const number = start + index;
      return {
        ...base,
        displayName: form.detailMain.trim() || form.title.trim() || 'KAD UMUM',
        cardNumber: `${prefix ? `${prefix}-` : ''}${String(number).padStart(pad, '0')}`,
      };
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      if (cardType === 'urusetia' && bulkText.trim() && bulkUrusetiaEntries.length === 0) {
        throw new Error('Tiada nama urusetia yang sah dalam senarai pukal.');
      }
      const inputs = buildInputs();
      const created = dbUnavailable && isDevPreview()
        ? createLocalProgramCards(inputs)
        : await createProgramCards(inputs);
      created.forEach(writeDevScanCache);
      setCards(prev => [...created, ...prev]);
      setSelectedCardId(created[0]?.id || '');
      setNotice(`${created.length} ${cardType === 'urusetia' ? 'kad urusetia' : 'kad umum'} berjaya dijana.`);
      if (cardType === 'urusetia' && bulkUrusetiaEntries.length > 0) {
        setBulkText('');
        setBulkFileName('');
      }
    } catch (err: any) {
      const message = String(err?.message || '');
      if (isDevPreview() && message.includes('create_program_cards')) {
        const created = createLocalProgramCards(buildInputs());
        setCards(prev => [...created, ...prev]);
        setSelectedCardId(created[0]?.id || '');
        setDbUnavailable(true);
        setNotice('Mod ujian local: kad dijana dalam cache browser kerana migrasi 060 belum dipasang.');
        if (cardType === 'urusetia' && bulkUrusetiaEntries.length > 0) {
          setBulkText('');
          setBulkFileName('');
        }
      } else {
        setError(message || 'Gagal menjana kad program.');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(card =>
      card.title.toLowerCase().includes(q)
      || card.displayName.toLowerCase().includes(q)
      || String(card.cardNumber || '').toLowerCase().includes(q)
      || String(card.tag || '').toLowerCase().includes(q)
      || String(card.programName || '').toLowerCase().includes(q)
    );
  }, [cards, search]);

  const getQrForCard = async (card: ProgramCardRecord): Promise<string> => {
    if (!qrCacheRef.current[card.token]) {
      qrCacheRef.current[card.token] = await createProgramCardQrDataUrl(card.token);
    }
    return qrCacheRef.current[card.token];
  };

  const openPrintWindow = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) alert('Popup disekat. Benarkan popup untuk cetak kad.');
    return printWindow;
  };

  const writeLoadingPrintWindow = (w: Window) => {
    w.document.write('<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Menjana kad program...</body></html>');
    w.document.close();
  };

  const printableCardsHtml = async (records: ProgramCardRecord[]) => {
    const printableLogo = await imageUrlToDataUrl(logoUrl).catch(() => normalizePrintableUrl(logoUrl));
    const cardHtml: string[] = [];
    for (const card of records) {
      writeDevScanCache(card);
      const qr = await getQrForCard(card);
      cardHtml.push(buildProgramAccessCardHtml(card, qr, printableLogo));
    }
    return cardHtml;
  };

  const handlePrint = async (records: ProgramCardRecord[], mode: 'single' | 'grid' = 'grid') => {
    const w = openPrintWindow();
    if (!w) return;
    writeLoadingPrintWindow(w);
    setPrinting(true);
    try {
      const cardHtml = await printableCardsHtml(records);
      if (cardHtml.length === 0) throw new Error('Tiada kad untuk dicetak.');
      w.document.open();
      w.document.write(buildProgramCardsDocument(cardHtml, mode));
      w.document.close();
    } catch (err: any) {
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Gagal menjana kad. ${escapeHtml(err?.message || '')}</body></html>`);
      w.document.close();
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    setError('');
    try {
      const filename = `${cardType === 'urusetia' ? 'kad-urusetia' : 'kad-umum'}-${year}-${sanitizeFilenamePart(scopeLabel)}.pdf`;
      await generateProgramCardsPdf(filteredCards, logoUrl, filename);
    } catch (err: any) {
      setError(String(err?.message || 'Gagal menjana PDF.'));
    } finally {
      setPdfLoading(false);
    }
  };

  const selectedPreviewQr = selectedCard ? qrCacheRef.current[selectedCard.token] || '' : '';

  useEffect(() => {
    if (!selectedCard) return;
    let cancelled = false;
    getQrForCard(selectedCard).then(() => {
      if (!cancelled) setCards(prev => [...prev]);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard?.token]);

  const handleSaveSelected = async () => {
    if (!selectedCard) return;
    setSaving(true);
    setError('');
    try {
      const preset = getColorPreset(editForm.colorKey);
      const preservedPayload = preserveExtraPayload(selectedCard.payload);
      if (cardType === 'urusetia') {
        if (editForm.tag.trim()) preservedPayload.Jawatan = editForm.tag.trim();
        else delete preservedPayload.Jawatan;
      }
      const patch: Partial<ProgramCardInput> = {
        title: editForm.title.trim() || selectedCard.title,
        displayName: editForm.displayName.trim() || selectedCard.displayName,
        cardNumber: selectedCard.cardNumber || '',
        tag: editForm.tag.trim(),
        programName: editForm.programName.trim(),
        programYear: year,
        siri: Number(editForm.siri || 1),
        issuerLabel,
        scopeLabel,
        colorKey: preset.key,
        accent: preset.accent,
        accentDark: preset.accentDark,
        accentSoft: preset.accentSoft,
        trim: preset.trim,
        payload: payloadFromForm(editForm, cardType, preservedPayload),
      };

      const updated = dbUnavailable && isDevPreview()
        ? updateLocalProgramCard(selectedCard.id, patch)
        : await updateProgramCard(selectedCard.id, patch);
      if (!updated) throw new Error('Kad tidak dijumpai.');
      writeDevScanCache(updated);
      setCards(prev => prev.map(card => card.id === updated.id ? updated : card));
      setNotice('Maklumat QR kad berjaya dikemaskini.');
    } catch (err: any) {
      setError(String(err?.message || 'Gagal mengemaskini kad.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSelected = async () => {
    if (!selectedCard) return;
    const confirmed = window.confirm(`Batalkan ${selectedCard.cardNumber || selectedCard.displayName}?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const ok = dbUnavailable && isDevPreview()
        ? revokeLocalProgramCard(selectedCard.id)
        : await revokeProgramCard(selectedCard.id, 'Dibatalkan oleh admin');
      if (!ok) throw new Error('Kad tidak berjaya dibatalkan.');
      setCards(prev => prev.filter(card => card.id !== selectedCard.id));
      setSelectedCardId('');
      setNotice('Kad berjaya dibatalkan.');
    } catch (err: any) {
      setError(String(err?.message || 'Gagal membatalkan kad.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeFiltered = async () => {
    if (filteredCards.length === 0) return;
    const label = cardType === 'urusetia' ? 'kad urusetia' : 'kad umum';
    const confirmed = window.confirm(
      `Padam ${filteredCards.length} ${label} yang sedang dipaparkan?\n\n` +
      'Tindakan ini ikut carian/filter semasa dan QR kad tersebut akan dibatalkan.'
    );
    if (!confirmed) return;

    setBulkRevokeLoading(true);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const cardsToRemove = [...filteredCards];
      let successCount = 0;

      if (dbUnavailable && isDevPreview()) {
        successCount = cardsToRemove.filter(card => revokeLocalProgramCard(card.id)).length;
      } else {
        for (let index = 0; index < cardsToRemove.length; index += 10) {
          const batch = cardsToRemove.slice(index, index + 10);
          const results = await Promise.all(
            batch.map(card => revokeProgramCard(card.id, 'Dibatalkan pukal oleh admin').catch(() => false))
          );
          successCount += results.filter(Boolean).length;
        }
      }

      if (successCount === 0) throw new Error('Tiada kad berjaya dipadam.');

      const removedIds = new Set(cardsToRemove.map(card => card.id));
      removeDevScanCache(cardsToRemove.map(card => card.token));
      setCards(prev => prev.filter(card => !removedIds.has(card.id)));
      if (selectedCard && removedIds.has(selectedCard.id)) setSelectedCardId('');
      setNotice(`${successCount} daripada ${cardsToRemove.length} ${label} berjaya dipadam.`);
      if (successCount < cardsToRemove.length) {
        setError(`${cardsToRemove.length - successCount} ${label} gagal dipadam. Cuba refresh dan ulang untuk baki kad.`);
      }
    } catch (err: any) {
      setError(String(err?.message || 'Gagal memadam kad pukal.'));
    } finally {
      setBulkRevokeLoading(false);
      setSaving(false);
    }
  };

  const previewCard = selectedCard;
  const previewPalette = previewCard ? getRecordPalette(previewCard) : getColorPreset(DEFAULT_COLOR_BY_TYPE[cardType]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
            <QrCode size={18} className={cardType === 'urusetia' ? 'text-red-700' : 'text-blue-700'} /> {titleLabel}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">
            QR kad menyimpan token sahaja. Maklumat scan boleh diubah selepas kad dicetak.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCards}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {(notice || error) && (
        <div className="space-y-2 border-b border-slate-200 p-4">
          {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}
        </div>
      )}

      <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-800">Jana Kad Baru</div>
          <label className="block text-xs font-bold text-slate-600">
            {cardType === 'urusetia' ? 'Nama pada kad' : 'Nama pas'}
            <input
              value={cardType === 'urusetia' ? form.displayName : form.title}
              onChange={e => cardType === 'urusetia' ? updateForm('displayName', e.target.value) : updateForm('title', e.target.value)}
              placeholder={cardType === 'urusetia' ? 'Contoh: MOHD AKMAL NASIR' : 'Contoh: KAD KELUAR MASUK'}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          {cardType === 'urusetia' ? (
            <>
              <label className="block text-xs font-bold text-slate-600">
                Tag urusetia
                <input
                  value={form.tag}
                  onChange={e => updateForm('tag', e.target.value)}
                  placeholder="Pendaftaran / Teknikal / Makanan"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>

              <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-slate-800">Import Pukal Urusetia</div>
                    <div className="text-[10px] font-semibold text-slate-500">TXT/CSV/XLSX. Kolum Nama Penuh/Jawatan dan kolum lain masuk QR.</div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                    <Upload size={12} /> Upload
                    <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleBulkFileChange} className="hidden" />
                  </label>
                </div>
                {bulkFileName && <div className="truncate text-[10px] font-bold text-slate-500">Fail: {bulkFileName}</div>}
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={'Contoh berheader:\nNama Penuh,Jawatan,Telefon,Catatan\nMOHD AKMAL BIN NASIR,Ketua Pendaftaran,0123456789,Meja utama\n\nAtau tanpa header:\nNUR MUSLIMAH BINTI AHMAD,Pendaftaran'}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
                  <span>{bulkText.trim() ? `${bulkUrusetiaEntries.length} nama valid akan dijana` : 'Isi senarai untuk jana banyak kad sekali gus'}</span>
                  {bulkText.trim() && (
                    <button type="button" onClick={() => { setBulkText(''); setBulkFileName(''); }} className="text-slate-700 hover:text-slate-950">
                      Kosongkan
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs font-bold text-slate-600">
                Prefix
                <input value={form.prefix} onChange={e => updateForm('prefix', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-bold uppercase" />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Jumlah
                <input type="number" min={1} max={300} value={form.quantity} onChange={e => updateForm('quantity', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-bold" />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Mula
                <input type="number" min={1} value={form.startNumber} onChange={e => updateForm('startNumber', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-bold" />
              </label>
            </div>
          )}

          <label className="block text-xs font-bold text-slate-600">
            {cardType === 'urusetia' ? 'Maklumat utama dalam QR' : 'QR untuk'}
            <input
              value={form.detailMain}
              onChange={e => updateForm('detailMain', e.target.value)}
              placeholder={cardType === 'urusetia' ? 'Contoh: Ketua Pendaftaran' : 'Contoh: SK Pengkalan / Nama seseorang'}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-slate-600">
              Program
              <input value={form.programName} onChange={e => updateForm('programName', e.target.value)} placeholder="Keris Perak" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold" />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Siri
              <input type="number" min={1} max={99} value={form.siri} onChange={e => updateForm('siri', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={form.detail1} onChange={e => updateForm('detail1', e.target.value)} placeholder="Maklumat 1" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
            <input value={form.detail2} onChange={e => updateForm('detail2', e.target.value)} placeholder="Maklumat 2" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
          </div>

          <textarea
            value={form.note}
            onChange={e => updateForm('note', e.target.value)}
            placeholder="Catatan scan QR..."
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          />

          <label className="block text-xs font-bold text-slate-600">
            Warna kad
            <select value={form.colorKey} onChange={e => updateForm('colorKey', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
              {COLOR_PRESETS.map(preset => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map(preset => (
              <button
                key={preset.key}
                type="button"
                onClick={() => updateForm('colorKey', preset.key)}
                title={preset.label}
                className={`h-8 w-8 rounded-full border-2 ${form.colorKey === preset.key ? 'border-slate-900' : 'border-white'} shadow`}
                style={{ background: `linear-gradient(135deg, ${preset.accentDark}, ${preset.accent} 62%, ${preset.trim})` }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || bulkRevokeLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus size={16} /> {saving ? 'Menjana...' : cardType === 'general' ? `Jana ${form.quantity || 1} Kad` : bulkUrusetiaEntries.length > 0 ? `Jana ${bulkUrusetiaEntries.length} Kad Urusetia` : 'Jana Kad Urusetia'}
          </button>
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, nombor, tag atau program..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold md:max-w-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={filteredCards.length === 0 || pdfLoading || printing || bulkRevokeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Download size={14} /> {pdfLoading ? 'PDF...' : `PDF (${filteredCards.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => handlePrint(filteredCards)}
                  disabled={filteredCards.length === 0 || pdfLoading || printing || bulkRevokeLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Printer size={14} /> {printing ? 'Menjana...' : `Cetak (${filteredCards.length})`}
                </button>
                <button
                  type="button"
                  onClick={handleRevokeFiltered}
                  disabled={filteredCards.length === 0 || saving || pdfLoading || printing || bulkRevokeLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={14} /> {bulkRevokeLoading ? 'Memadam...' : `Padam (${filteredCards.length})`}
                </button>
              </div>
            </div>

            <div className="max-h-[560px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm font-bold text-slate-500">
                  <RefreshCw size={16} className="animate-spin" /> Memuatkan kad...
                </div>
              ) : filteredCards.length === 0 ? (
                <div className="p-8 text-center text-xs font-bold text-slate-400">Tiada kad dijumpai.</div>
              ) : (
                filteredCards.map(card => {
                  const palette = getRecordPalette(card);
                  const active = selectedCard?.id === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className={`flex w-full items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 text-left last:border-b-0 hover:bg-white ${active ? 'bg-white' : ''}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="h-9 w-1.5 rounded-full" style={{ background: palette.accent }} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black uppercase text-slate-900">
                            {card.cardNumber ? `${card.cardNumber} | ` : ''}{card.cardType === 'general' ? card.title : card.displayName}
                          </div>
                          <div className="truncate text-[10px] font-semibold text-slate-500">
                            {card.cardType === 'general' ? (card.displayName || 'Tiada maklumat QR') : (card.tag || 'Tiada tag')} {card.programName ? `| ${card.programName}` : ''}
                          </div>
                        </div>
                      </div>
                      <QrCode size={14} className="flex-shrink-0 text-slate-500" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <aside className="space-y-3">
            {previewCard ? (
              <>
                <div
                  className="relative mx-auto overflow-hidden border border-slate-200 bg-white text-center shadow-xl"
                  style={{
                    width: 224,
                    height: 352,
                    borderRadius: 11,
                    backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.34) 38%, rgba(255,255,255,0.70)), linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.18) 58%, rgba(216,173,63,0.08)), url(${CARD_SCOUT_CAMP_BG_URL})`,
                    backgroundSize: 'cover, cover, cover',
                    backgroundPosition: 'center, center, center',
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                  <div className="absolute inset-y-0 left-0 w-[34px] overflow-hidden" style={{ background: `linear-gradient(180deg, ${previewPalette.accentDark}, ${previewPalette.accent})` }}>
                    <div className="absolute left-1/2 top-1/2 w-[272px] -translate-x-1/2 -translate-y-1/2 -rotate-90 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[15px] font-black leading-none text-white">
                      {getSpineLabel(previewCard)}
                    </div>
                  </div>
                  <div className="absolute inset-y-0 left-[34px] w-1" style={{ background: previewPalette.trim }} />
                  <div className="absolute left-[38px] right-0 top-0 h-[74px]" style={{ background: `linear-gradient(135deg, ${previewPalette.accentDark}, ${previewPalette.accent})`, clipPath: 'polygon(0 0, 100% 0, 100% 72%, 45% 100%, 0 78%)' }} />
                  <div className="absolute -right-10 top-32 h-40 w-40 rounded-full border-[10px] border-slate-700/5" />
                  <div className="relative flex h-full flex-col py-3.5 pl-[46px] pr-4">
                    <div className="flex h-12 items-center gap-2 text-left text-white">
                      <img src={logoUrl} alt="Logo" className="h-11 w-11 rounded-full bg-white object-contain p-1 shadow" />
                      <div className="min-w-0 leading-tight">
                        <div className="text-[7px] font-black">PERSEKUTUAN PENGAKAP MALAYSIA</div>
                        <div className="truncate text-[7px] font-bold opacity-90">{previewCard.issuerLabel || issuerLabel}</div>
                      </div>
                    </div>
                    <div className="mt-5 flex min-h-[100px] flex-col justify-center">
                      <div className="inline-block max-w-full self-center rounded-md bg-white/65 px-2 py-1 font-black uppercase leading-tight text-slate-950 shadow-sm" style={{ fontSize: Math.round(getAccessTitleFontSize(getVisualTitle(previewCard)) * 1.45), textShadow: '0 1px 3px rgba(255,255,255,0.78)', overflowWrap: 'normal', wordBreak: 'keep-all', hyphens: 'none' }}>
                        {getVisualTitle(previewCard)}
                      </div>
                      {previewCard.cardNumber && <div className="mt-2 inline-block max-w-full self-center rounded-md bg-white/70 px-2 py-1 text-[24px] font-black leading-none shadow-sm" style={{ color: previewPalette.accentDark, textShadow: '0 1px 3px rgba(255,255,255,0.78)' }}>{previewCard.cardNumber}</div>}
                      {getVisualSubtitle(previewCard) && <div className="mt-2 inline-block max-w-full self-center rounded bg-white/60 px-2 py-0.5 line-clamp-2 text-[10px] font-extrabold uppercase leading-tight text-slate-600">{getVisualSubtitle(previewCard)}</div>}
                    </div>
                    <div className="mx-auto mt-2 flex min-h-[112px] w-[112px] items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                      {selectedPreviewQr ? <img src={selectedPreviewQr} alt="" className="h-[100px] w-[100px]" /> : <div className="text-[9px] font-bold text-slate-400">Menjana QR...</div>}
                    </div>
                    <div className="mt-auto flex h-3 items-end gap-1.5">
                      <span className="h-1 w-8 rounded-full" style={{ background: previewPalette.accentDark }} />
                      <span className="h-1 w-14 rounded-full" style={{ background: previewPalette.trim }} />
                      <span className="h-1 flex-1 rounded-full" style={{ background: previewPalette.accent }} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-800">
                    <Palette size={14} className="text-slate-500" /> Edit Maklumat QR
                  </div>
                  <div className="space-y-2">
                    <input value={editForm.title} onChange={e => updateEditForm('title', e.target.value)} placeholder="Nama kad" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <input value={editForm.displayName} onChange={e => updateEditForm('displayName', e.target.value)} placeholder={cardType === 'urusetia' ? 'Nama urusetia' : 'QR untuk / nama paparan'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <input value={editForm.tag} onChange={e => updateEditForm('tag', e.target.value)} placeholder="Tag / tugas" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editForm.programName} onChange={e => updateEditForm('programName', e.target.value)} placeholder="Program" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                      <input type="number" min={1} value={editForm.siri} onChange={e => updateEditForm('siri', e.target.value)} placeholder="Siri" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    </div>
                    <input value={editForm.detailMain} onChange={e => updateEditForm('detailMain', e.target.value)} placeholder={cardType === 'urusetia' ? 'Maklumat utama' : 'Untuk'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <input value={editForm.detail1} onChange={e => updateEditForm('detail1', e.target.value)} placeholder="Maklumat 1" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <input value={editForm.detail2} onChange={e => updateEditForm('detail2', e.target.value)} placeholder="Maklumat 2" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <textarea value={editForm.note} onChange={e => updateEditForm('note', e.target.value)} placeholder="Catatan" rows={2} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold" />
                    <select value={editForm.colorKey} onChange={e => updateEditForm('colorKey', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                      {COLOR_PRESETS.map(preset => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
                    </select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={handleSaveSelected} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50">
                      <Save size={14} /> Simpan
                    </button>
                    <button type="button" onClick={() => handlePrint([previewCard], 'single')} disabled={printing || bulkRevokeLoading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50">
                      <Printer size={14} /> Cetak
                    </button>
                    <button type="button" onClick={handleRevokeSelected} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
                Pilih kad untuk preview dan edit maklumat QR.
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
};
