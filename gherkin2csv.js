#!/usr/bin/env node
/**
 * gherkin2tc.js
 * Convert Gherkin (.feature) to Test Case table (CSV/XLSX) dengan mapping kolom sbb:
 * TC_ID, Title, Feature, Precondition (Given), Test Steps (When/And),
 * Expected Result (Then/And), Priority, Type, Tags, Test Data, Notes
 *
 * Fitur:
 * - Expand Scenario Outline per baris Examples (decision table) + substitusi <param>
 * - Background + Given -> Precondition
 * - And/But mewarisi keyword sebelumnya
 * - Heuristik Priority/Type
 * - XLSX: exceljs (landscape, wrap, auto-width) -> fallback xlsx
 *
 * Usage:
 *   node gherkin2tc.js <file.feature|dir> [-o out.csv|out.xlsx] [--xlsx]
 *
 * Dependencies (opsional, untuk XLSX lebih rapi):
 *   npm i exceljs
 *   (fallback) npm i xlsx
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin2tc.js <file.feature|dir> -o <out.csv|out.xlsx> [--xlsx]');
  process.exit(1);
}

let inputPath = null;
let outPath = 'testcases.xlsx'; // default ke xlsx biar enak print landscape
let forceXlsx = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('-') && !inputPath) inputPath = a;
  if (a === '-o' || a === '--out') outPath = args[i + 1];
  if (a === '--xlsx') forceXlsx = true;
}

if (!inputPath) {
  console.error('Error: input path is required.');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    return s.isDirectory() ? walk(p) : [p];
  });
}

function readAllFeatures(input) {
  const st = fs.statSync(input);
  let files = [];
  if (st.isDirectory()) {
    files = walk(input).filter((f) => f.toLowerCase().endsWith('.feature'));
  } else {
    files = [input];
  }
  return files.map((f) => ({ file: f, content: fs.readFileSync(f, 'utf8') }));
}

const STEP_KW = ['Given', 'When', 'Then', 'And', 'But'];
function isStepLine(line) {
  const t = line.trim();
  return STEP_KW.some((k) => t.startsWith(k + ' ')) || STEP_KW.some((k) => new RegExp(`^\\s*${k}\\b`).test(line));
}

function cleanLine(line) {
  // potong trailing comments (#...) KECUALI di dalam string berquote (sederhana: abaikan)
  const idx = line.indexOf(' #');
  const base = idx !== -1 ? line.slice(0, idx) : line;
  return base.trim();
}

function extractStep(line, lastBase) {
  const m = line.match(/^\s*(Given|When|Then|And|But)\b\s*(.*)$/i);
  if (!m) return { raw: line.trim(), keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw = capitalize(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { raw: line.trim(), keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);
  let featureName = '';
  let featureTags = [];
  let background = [];     // steps
  const scenarios = [];    // parsed scenarios

  let pendingTags = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    let line = cleanLine(raw);

    if (line === '' || line.startsWith('#')) { i++; continue; }

    // tags
    if (line.startsWith('@')) {
      pendingTags = line.split(/\s+/).filter(Boolean);
      i++; continue;
    }

    // Feature
    if (/^\s*Feature:/.test(line)) {
      featureName = line.replace(/^\s*Feature:\s*/, '').trim();
      if (pendingTags.length) {
        featureTags = pendingTags.slice();
        pendingTags = [];
      }
      i++; continue;
    }

    // Background
    if (/^\s*Background:/.test(line)) {
      i++;
      let lastKw = null;
      while (i < lines.length) {
        const lraw = lines[i];
        const l = cleanLine(lraw);
        if (l === '' || l.startsWith('#')) { i++; continue; }
        if (/^\s*(Scenario(?: Outline)?:|Feature:|Background:|Examples:)/i.test(l)) break;
        if (isStepLine(l)) {
          const st = extractStep(l, lastKw);
          lastKw = st.keywordBase;
          background.push(st);
          i++; continue;
        }
        // data table / docstring pada background -> treat sebagai tambahan teks step sebelumnya
        if (/^\s*\|.*\|\s*$/.test(l) && background.length) {
          background[background.length - 1].text += '\n' + l.trim();
          i++; continue;
        }
        if (/^\s*"""/.test(l) && background.length) {
          // docstring triple quotes
          const buf = [];
          i++;
          while (i < lines.length && !/^\s*"""/.test(lines[i])) { buf.push(lines[i]); i++; }
          if (i < lines.length) i++; // consume closing """
          background[background.length - 1].text += '\n' + buf.join('\n');
          continue;
        }
        i++;
      }
      continue;
    }

    // Scenario / Scenario Outline
    const mSc = line.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
    if (mSc) {
      const scType = line.includes('Outline') ? 'Scenario Outline' : 'Scenario';
      const scName = mSc[1].trim();
      const scTags = pendingTags.length ? pendingTags.slice() : [];
      pendingTags = [];
      i++;

      const steps = [];
      const examplesBlocks = []; // support multiple Examples blocks
      let lastKw = null;

      while (i < lines.length) {
        const r = lines[i];
        const cur = cleanLine(r);

        // stop on next block
        if (/^\s*@/.test(cur) || /^\s*Scenario(?: Outline)?:/i.test(cur) || /^\s*Feature:/i.test(cur) || /^\s*Background:/i.test(cur)) break;

        if (cur === '' || cur.startsWith('#')) { i++; continue; }

        // Examples:
        if (/^\s*Examples:/i.test(cur)) {
          i++;
          // read following tables (can be separated by comments/empty lines)
          const rows = [];
          while (i < lines.length) {
            const tline = cleanLine(lines[i]);
            if (tline === '' || tline.startsWith('#')) { i++; continue; }
            if (/^\s*\|/.test(tline)) {
              const cells = tline.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
              rows.push(cells);
              i++; continue;
            }
            break; // next block
          }
          if (rows.length >= 2) {
            const headers = rows[0];
            for (let r = 1; r < rows.length; r++) {
              const obj = {};
              headers.forEach((h, idx) => (obj[h] = rows[r][idx] ?? ''));
              examplesBlocks.push(obj);
            }
          }
          continue;
        }

        // step
        if (isStepLine(cur)) {
          const st = extractStep(cur, lastKw);
          lastKw = st.keywordBase;
          steps.push(st);
          i++; continue;
        }

        // step data table
        if (/^\s*\|.*\|\s*$/.test(cur) && steps.length) {
          steps[steps.length - 1].text += '\n' + cur.trim();
          i++; continue;
        }

        // docstring """..."""
        if (/^\s*"""/.test(cur) && steps.length) {
          const buf = [];
          i++;
          while (i < lines.length && !/^\s*"""/.test(lines[i])) { buf.push(lines[i]); i++; }
          if (i < lines.length) i++; // closing """
          steps[steps.length - 1].text += '\n' + buf.join('\n');
          continue;
        }

        i++;
      }

      // push scenario
      scenarios.push({
        file: filename,
        feature: featureName,
        featureTags,
        tags: scTags,
        type: scType,
        name: scName,
        background: background.slice(),
        steps,
        examples: examplesBlocks // flat array of example rows
      });
      continue;
    }

    i++;
  }

  return { featureName, scenarios };
}

function substituteParams(text, exampleRow) {
  if (!exampleRow) return text;
  return String(text).replace(/<\s*([^>]+)\s*>/g, (_, key) => {
    const v = exampleRow[key];
    return (v !== undefined && v !== null) ? v : `<${key}>`;
  });
}

function formatNumbered(arr) {
  if (!arr || arr.length === 0) return '';
  return arr.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

function inferTypeAndPriority(expectedArr, stepsArr) {
  const full = (expectedArr.join(' ') + ' ' + stepsArr.join(' ')).toLowerCase();
  const isNeg = /(error|gagal|ditolak|invalid|tidak ditemukan|wajib|format|maksimal|max|batas|limit)/.test(full);
  let Type = isNeg ? 'Negative' : 'Positive';
  let Priority = 'P1';
  if (isNeg) {
    Priority = /(ditolak|gagal|error)/.test(full) ? 'P0' : 'P2';
  }
  return { Type, Priority };
}

function tagsToPriority(tagsArr) {
  const t = (tagsArr || []).map((x) => x.toLowerCase());
  if (t.includes('@p0') || t.includes('@critical') || t.includes('@blocker')) return 'P0';
  if (t.includes('@p1') || t.includes('@high')) return 'P1';
  if (t.includes('@p2') || t.includes('@medium')) return 'P2';
  if (t.includes('@p3') || t.includes('@low')) return 'P3';
  return '';
}

function scenarioToRows(scn, tcPrefix) {
  // Background Given -> precondition base
  const baseGivens = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'given').map(s => s.text);

  const rows = [];
  if (scn.type === 'Scenario Outline' && (scn.examples || []).length > 0) {
    for (const ex of scn.examples) {
      const givens = [...baseGivens];
      const whens = [];
      const thens = [];
      let mode = null;

      (scn.steps || []).forEach((st) => {
        const txt = substituteParams(st.text, ex);
        const base = (st.keywordBase || '').toLowerCase();
        if (base === 'given') { mode = 'given'; givens.push(txt); }
        else if (base === 'when') { mode = 'when'; whens.push(txt); }
        else if (base === 'then') { mode = 'then'; thens.push(txt); }
        else { // And/But fallback
          if (mode === 'given') givens.push(txt);
          else if (mode === 'then') thens.push(txt);
          else whens.push(txt);
        }
      });

      const { Type, Priority } = (tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) || '')
        ? { Type: undefined, Priority: tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) }
        : inferTypeAndPriority(thens, whens);

      rows.push({
        Title: substituteParams(scn.name, ex),
        Feature: scn.feature || '',
        'Precondition (Given)': formatNumbered(givens),
        'Test Steps (When/And)': formatNumbered(whens),
        'Expected Result (Then/And)': formatNumbered(thens),
        Priority: tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) || Priority,
        Type: Type || (/(error|gagal|ditolak|invalid)/i.test(thens.join(' ')) ? 'Negative' : 'Positive'),
        Tags: [...(scn.featureTags || []), ...(scn.tags || [])].join(' '),
        'Test Data': Object.entries(ex).map(([k, v]) => `${k}=${v}`).join('; '),
        Notes: '',
        _prefix: tcPrefix
      });
    }
  } else {
    // Scenario biasa
    const givens = [...baseGivens];
    const whens = [];
    const thens = [];
    let mode = null;
    (scn.steps || []).forEach((st) => {
      const base = (st.keywordBase || '').toLowerCase();
      const txt = st.text;
      if (base === 'given') { mode = 'given'; givens.push(txt); }
      else if (base === 'when') { mode = 'when'; whens.push(txt); }
      else if (base === 'then') { mode = 'then'; thens.push(txt); }
      else { if (mode === 'given') givens.push(txt); else if (mode === 'then') thens.push(txt); else whens.push(txt); }
    });

    const { Type, Priority } = (tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) || '')
      ? { Type: undefined, Priority: tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) }
      : inferTypeAndPriority(thens, whens);

    rows.push({
      Title: scn.name || '',
      Feature: scn.feature || '',
      'Precondition (Given)': formatNumbered(givens),
      'Test Steps (When/And)': formatNumbered(whens),
      'Expected Result (Then/And)': formatNumbered(thens),
      Priority: tagsToPriority([...(scn.featureTags||[]), ...(scn.tags||[])]) || Priority,
      Type: Type || (/(error|gagal|ditolak|invalid)/i.test(thens.join(' ')) ? 'Negative' : 'Positive'),
      Tags: [...(scn.featureTags || []), ...(scn.tags || [])].join(' '),
      'Test Data': '',
      Notes: '',
      _prefix: tcPrefix
    });
  }
  return rows;
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(rows) {
  const headers = ['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const arr = headers.map((h) => csvEscape(r[h] ?? ''));
    lines.push(arr.join(','));
  }
  return lines.join('\n');
}

async function writeXlsx(rows, outFile) {
  // Try exceljs first (better formatting)
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('TestCases', {
      properties: { defaultRowHeight: 18 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } // A4
    });

    const headers = ['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
    ws.addRow(headers);
    // Bold header
    headers.forEach((_, idx) => {
      const cell = ws.getRow(1).getCell(idx + 1);
      cell.font = { bold: true };
      cell.alignment = { vertical: 'top', wrapText: true };
    });

    // auto TC_ID generation per _prefix
    let counters = {};
    for (const r of rows) {
      const prefix = r._prefix || 'TC';
      if (!counters[prefix]) counters[prefix] = 1;
      const id = `${prefix}-${String(counters[prefix]).padStart(3, '0')}`;
      counters[prefix]++;

      const rowArr = [id, r.Title, r.Feature, r['Precondition (Given)'], r['Test Steps (When/And)'], r['Expected Result (Then/And)'], r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes];
      ws.addRow(rowArr);
    }

    // column widths & wrap
    const widths = [12, 30, 22, 36, 40, 40, 10, 12, 24, 24, 20];
    widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });

    await wb.xlsx.writeFile(outFile);
    return true;
  } catch (e) {
    // Fallback: xlsx
    try {
      const XLSX = require('xlsx');
      const headers = ['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
      // generate TC_ID di sini juga
      let counters = {};
      const aoa = [headers];
      for (const r of rows) {
        const prefix = r._prefix || 'TC';
        if (!counters[prefix]) counters[prefix] = 1;
        const id = `${prefix}-${String(counters[prefix]).padStart(3, '0')}`;
        counters[prefix]++;
        aoa.push([id, r.Title, r.Feature, r['Precondition (Given)'], r['Test Steps (When/And)'], r['Expected Result (Then/And)'], r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
      XLSX.writeFile(wb, outFile);
      console.warn('Note: fallback to xlsx library; pengaturan landscape mungkin tidak ikut.');
      return true;
    } catch (err) {
      console.error('Failed to write XLSX. Install one of: "npm i exceljs" (disarankan) atau "npm i xlsx".');
      console.error(err.message);
      return false;
    }
  }
}

// ---- MAIN ----
const inputs = readAllFeatures(inputPath);
if (inputs.length === 0) {
  console.error('No .feature files found.');
  process.exit(1);
}

let allRows = [];
for (const { file, content } of inputs) {
  const { featureName, scenarios } = parseFeatureFile(content, file);
  const tcPrefix = (path.basename(file, '.feature').replace(/[^A-Za-z0-9]+/g, '_') || 'TC').toUpperCase();
  for (const scn of scenarios) {
    const rows = scenarioToRows(scn, tcPrefix);
    allRows = allRows.concat(rows);
  }
}

// Numbering & build final rows (with TC_ID added for CSV)
let idCounters = {};
const finalRows = allRows.map((r) => {
  const prefix = r._prefix || 'TC';
  if (!idCounters[prefix]) idCounters[prefix] = 1;
  const tcid = `${prefix}-${String(idCounters[prefix]).padStart(3, '0')}`;
  idCounters[prefix]++;
  const out = {
    TC_ID: tcid,
    Title: r.Title,
    Feature: r.Feature,
    'Precondition (Given)': r['Precondition (Given)'],
    'Test Steps (When/And)': r['Test Steps (When/And)'],
    'Expected Result (Then/And)': r['Expected Result (Then/And)'],
    Priority: r.Priority,
    Type: r.Type,
    Tags: r.Tags,
    'Test Data': r['Test Data'],
    Notes: r.Notes
  };
  return out;
});

if (finalRows.length === 0) {
  console.error('No scenarios found.');
  process.exit(1);
}

const wantXlsx = forceXlsx || outPath.toLowerCase().endsWith('.xlsx');
(async () => {
  if (wantXlsx) {
    const ok = await writeXlsx(finalRows, outPath);
    if (!ok) {
      // fallback CSV
      const csvOut = outPath.replace(/\.xlsx$/i, '.csv');
      fs.writeFileSync(csvOut, toCSV(finalRows), 'utf8');
      console.log(`Fallback to CSV: ${csvOut}`);
    } else {
      console.log(`Wrote Excel: ${outPath}`);
    }
  } else {
    fs.writeFileSync(outPath, toCSV(finalRows), 'utf8');
    console.log(`Wrote CSV: ${outPath}`);
  }
})();