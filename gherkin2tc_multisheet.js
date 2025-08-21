#!/usr/bin/env node
/**
 * gherkin2tc_multisheet.js
 * Convert Gherkin (.feature) → 1 file Excel (.xlsx) dengan 1 sheet per file .feature
 * Kolom sesuai mapping:
 *   TC_ID, Title, Feature, Precondition (Given), Test Steps (When/And),
 *   Expected Result (Then/And), Priority, Type, Tags, Test Data, Notes
 *
 * Aturan:
 * - Scenario Outline: expand setiap baris Examples → 1 baris test case (substitusi <param>)
 * - Background + Given → Precondition (Given)
 * - And/But mengikuti keyword sebelumnya (Given/When/Then)
 * - Priority / Type HANYA dari TAG:
 *     Priority: @P0/@P1/@P2/@P3 (atau @critical/@high/@medium/@low)
 *     Type: @positive / @negative
 *   Jika tidak ada tag di Feature/Scenario → Priority & Type dikosongkan
 * - XLSX: exceljs (landscape, wrap, width). Jika exceljs tidak ada, fallback ke xlsx (tanpa landscape).
 *
 * Usage:
 *   node gherkin2tc_multisheet.js <file.feature|dir> -o out.xlsx --xlsx
 */

const fs = require('fs');
const path = require('path');

const HEADERS = [
  'TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)',
  'Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'
];

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin2tc_multisheet.js <file.feature|dir> -o <out.xlsx> [--xlsx]');
  process.exit(1);
}

let inputPath = null;
let outPath = 'testcases.xlsx';
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

/* ---------- Utilities ---------- */
function walk(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    return s.isDirectory() ? walk(p) : [p];
  });
}
function readAllFeatures(input) {
  const st = fs.statSync(input);
  let files = [];
  if (st.isDirectory()) {
    files = walk(input).filter(f => f.toLowerCase().endsWith('.feature'));
  } else {
    files = [input];
  }
  return files.map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));
}
const STEP_KW = ['Given','When','Then','And','But'];
const kwRe = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;
const clean = s => (s.includes(' #') ? s.slice(0, s.indexOf(' #')) : s).trim();
const isStep = l => STEP_KW.some(k => new RegExp(`^\\s*${k}\\b`).test(l));
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw = capitalize(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

/* ---------- Parser ---------- */
function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);
  let feature = '', featureTags = [], background = [];
  const scenarios = [];
  let tags = [];
  let i = 0;

  while (i < lines.length) {
    const ln = clean(lines[i]);
    if (!ln || ln.startsWith('#')) { i++; continue; }

    if (ln.startsWith('@')) { tags = ln.split(/\s+/).filter(Boolean); i++; continue; }

    if (/^\s*Feature:/i.test(ln)) {
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      if (tags.length) { featureTags = tags.slice(); tags = []; }
      i++; continue;
    }

    if (/^\s*Background:/i.test(ln)) {
      i++;
      let last = null;
      while (i < lines.length) {
        const cur = clean(lines[i]);
        if (!cur || cur.startsWith('#')) { i++; continue; }
        if (/^\s*(Scenario(?: Outline)?:|Feature:|Background:|Examples:)/i.test(cur)) break;

        if (isStep(cur)) {
          const st = extractStep(cur, last);
          last = st.keywordBase;
          background.push(st);
          i++; continue;
        }

        // Data table / docstring (tambahkan ke step sebelumnya)
        if (/^\s*\|.*\|\s*$/.test(cur) && background.length) {
          background[background.length - 1].text += '\n' + cur.trim();
          i++; continue;
        }
        if (/^\s*"""/.test(cur) && background.length) {
          const buf = [];
          i++;
          while (i < lines.length && !/^\s*"""/.test(lines[i])) { buf.push(lines[i]); i++; }
          if (i < lines.length) i++; // closing """
          background[background.length - 1].text += '\n' + buf.join('\n');
          continue;
        }
        i++;
      }
      continue;
    }

    const mSc = ln.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
    if (mSc) {
      const type = ln.includes('Outline') ? 'Scenario Outline' : 'Scenario';
      const name = mSc[1].trim();
      const scTags = tags.slice(); tags = [];
      i++;

      const steps = [];
      const examples = []; // flat: gabungkan semua Examples block
      let last = null;

      while (i < lines.length) {
        const cur = clean(lines[i]);

        if (/^\s*@/.test(cur) || /^\s*Scenario(?: Outline)?:/i.test(cur) || /^\s*Feature:/i.test(cur) || /^\s*Background:/i.test(cur)) break;
        if (!cur || cur.startsWith('#')) { i++; continue; }

        if (/^\s*Examples:/i.test(cur)) {
          i++;
          const rows = [];
          while (i < lines.length) {
            const t = clean(lines[i]);
            if (!t || t.startsWith('#')) { i++; continue; }
            if (/^\s*\|/.test(t)) {
              const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
              rows.push(cells);
              i++; continue;
            }
            break;
          }
          if (rows.length >= 2) {
            const hdr = rows[0];
            for (let r = 1; r < rows.length; r++) {
              const obj = {};
              hdr.forEach((h, idx) => obj[h] = rows[r][idx] ?? '');
              examples.push(obj);
            }
          }
          continue;
        }

        if (isStep(cur)) {
          const st = extractStep(cur, last);
          last = st.keywordBase;
          steps.push(st);
          i++; continue;
        }

        // step table / docstring
        if (/^\s*\|.*\|\s*$/.test(cur) && steps.length) {
          steps[steps.length - 1].text += '\n' + cur.trim();
          i++; continue;
        }
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

      scenarios.push({
        file: filename,
        feature,
        featureTags,
        tags: scTags,
        type,
        name,
        background: background.slice(),
        steps,
        examples
      });
      continue;
    }

    i++;
  }

  return { feature, scenarios };
}

/* ---------- Mapping ---------- */
const substitute = (t, ex) =>
  ex ? String(t).replace(/<\s*([^>]+)\s*>/g, (_, k) => (k in ex ? ex[k] : `<${k}>`)) : String(t);

const numbered = arr => !arr || arr.length === 0 ? '' : arr.map((s, i) => `${i + 1}. ${s}`).join('\n');

const tagsToPriority = (tags) => {
  const v = (tags || []).map(x => x.toLowerCase());
  if (v.includes('@p0') || v.includes('@critical') || v.includes('@blocker')) return 'P0';
  if (v.includes('@p1') || v.includes('@high')) return 'P1';
  if (v.includes('@p2') || v.includes('@medium')) return 'P2';
  if (v.includes('@p3') || v.includes('@low')) return 'P3';
  return ''; // kosong jika tidak ada tag priority
};
const tagsToType = (tags) => {
  const v = (tags || []).map(x => x.toLowerCase());
  if (v.includes('@negative')) return 'Negative';
  if (v.includes('@positive')) return 'Positive';
  return ''; // kosong jika tidak ada tag type
};

function scenariosToRows(scn) {
  const baseGivens = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'given')
    .map(s => s.text);

  const allTags = [...(scn.featureTags || []), ...(scn.tags || [])];
  const Priority = tagsToPriority(allTags);  // HANYA dari tag
  const Type     = tagsToType(allTags);      // HANYA dari tag

  const build = (ex) => {
    const giv = [...baseGivens], wh = [], th = [];
    let mode = null;
    (scn.steps || []).forEach(st => {
      const txt = substitute(st.text, ex);
      const base = (st.keywordBase || '').toLowerCase();
      if (base === 'given') { mode = 'given'; giv.push(txt); }
      else if (base === 'when') { mode = 'when'; wh.push(txt); }
      else if (base === 'then') { mode = 'then'; th.push(txt); }
      else {
        if (mode === 'given') giv.push(txt);
        else if (mode === 'then') th.push(txt);
        else wh.push(txt);
      }
    });

    return {
      // TC_ID diisi saat tulis ke sheet (agar reset per-sheet)
      Title: substitute(scn.name, ex),
      Feature: scn.feature || '',
      'Precondition (Given)': numbered(giv),
      'Test Steps (When/And)': numbered(wh),
      'Expected Result (Then/And)': numbered(th),
      Priority,          // kosong jika tidak ada tag priority
      Type,              // kosong jika tidak ada tag type
      Tags: allTags.join(' '),
      'Test Data': ex ? Object.entries(ex).map(([k, v]) => `${k}=${v}`).join('; ') : '',
      Notes: ''
    };
  };

  const rows = [];
  if (scn.type === 'Scenario Outline' && (scn.examples || []).length) {
    for (const ex of scn.examples) rows.push(build(ex));
  } else {
    rows.push(build(null));
  }
  return rows;
}

/* ---------- XLSX Writer (multi-sheet) ---------- */
async function writeMultiSheetXlsx(fileRowsMap, outFile) {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    for (const { sheetName, rows } of fileRowsMap) {
      const ws = wb.addWorksheet(sheetName, {
        properties: { defaultRowHeight: 18 },
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } // A4 landscape
      });

      ws.addRow(HEADERS);
      HEADERS.forEach((_, idx) => {
        const c = ws.getRow(1).getCell(idx + 1);
        c.font = { bold: true };
        c.alignment = { vertical: 'top', wrapText: true };
      });

      // TC_ID reset per sheet, prefix = nama sheet disederhanakan
      let counter = 1;
      for (const r of rows) {
        const tcid = `${sheetName.toUpperCase()}-${String(counter).padStart(3, '0')}`;
        counter++;
        ws.addRow([
          tcid, r.Title, r.Feature, r['Precondition (Given)'],
          r['Test Steps (When/And)'], r['Expected Result (Then/And)'],
          r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes
        ]);
      }

      const widths = [14, 34, 22, 38, 40, 40, 10, 12, 24, 24, 18];
      widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
      ws.eachRow({ includeEmpty: false }, row => {
        row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true }; });
      });
    }

    await wb.xlsx.writeFile(outFile);
    return true;
  } catch (e) {
    // Fallback ke xlsx (tanpa landscape)
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      for (const { sheetName, rows } of fileRowsMap) {
        const aoa = [HEADERS];
        let counter = 1;
        for (const r of rows) {
          const tcid = `${sheetName.toUpperCase()}-${String(counter).padStart(3, '0')}`;
          counter++;
          aoa.push([
            tcid, r.Title, r.Feature, r['Precondition (Given)'],
            r['Test Steps (When/And)'], r['Expected Result (Then/And)'],
            r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes
          ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      XLSX.writeFile(wb, outFile);
      console.warn('Note: fallback ke "xlsx"; pengaturan landscape mungkin tidak ikut.');
      return true;
    } catch (err) {
      console.error('Gagal menulis .xlsx. Install salah satu: "npm i exceljs" (disarankan) atau "npm i xlsx".');
      console.error(err.message);
      return false;
    }
  }
}

/* ---------- Main ---------- */
(async () => {
  const inputs = readAllFeatures(inputPath);
  if (inputs.length === 0) {
    console.error('No .feature files found.');
    process.exit(1);
  }

  // Kumpulkan rows per file → sheetName
  const fileRowsMap = [];
  const usedNames = new Set();

  for (const { file, content } of inputs) {
    const { feature, scenarios } = parseFeatureFile(content, file);

    let rows = [];
    for (const scn of scenarios) rows = rows.concat(scenariosToRows(scn));

    // Nama sheet dari nama file (tanpa .feature), aman untuk Excel (<=31 char, unik)
    let base = path.basename(file, '.feature').replace(/[^A-Za-z0-9_\-]+/g, '_');
    if (!base) base = 'Sheet';
    if (base.length > 31) base = base.slice(0, 31);
    let name = base;
    let k = 2;
    while (usedNames.has(name)) {
      name = (base.slice(0, Math.min(28, base.length)) + '_' + k);
      if (name.length > 31) name = name.slice(0, 31);
      k++;
    }
    usedNames.add(name);

    fileRowsMap.push({ sheetName: name, rows });
  }

  const ok = await writeMultiSheetXlsx(fileRowsMap, outPath);
  if (!ok) process.exit(1);

  console.log(`Wrote Excel (${fileRowsMap.length} sheet): ${outPath}`);
})();