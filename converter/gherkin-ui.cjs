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
  'TC_ID','Feature','Priority','Type','Title','Precondition (Given)',
  'Test Steps (When/And)','Test Data','Expected Result (Then/And)','Tags'
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

        // ⛔️ JANGAN konsumsi baris tag di dalam loop Background.
        // Biarkan outer loop yang memproses sebagai 'tags' untuk Scenario berikutnya.
        if (/^\s*@/.test(cur)) break;

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

// Format Test Data:
// - Buang key yang hanya dipakai di judul Scenario/Outline (placeholder <key>)
// - Jika value kosong → "empty (tidak diisi)"
function formatTestData(ex, scenarioName) {
  if (!ex) return '';

  // kumpulkan semua <key> yang muncul di Title
  const titleKeys = new Set();
  String(scenarioName || '').replace(/<\s*([^>]+)\s*>/g, (_, k) => {
    titleKeys.add(k);
    return _;
  });

  let n = 0;
  return Object.entries(ex)
    .filter(([k]) => !titleKeys.has(k)) // skip yg hanya ada di Title
    .map(([k, v]) => {
      const valStr = (v == null || String(v).trim() === '')
        ? 'empty (tidak diisi)'
        : String(v);
      n++;
      return `${n}. ${k} = ${valStr}`;
    })
    .join('\n');
}


const tagsToPriority = (tags) => {
  const v = (tags || []).map(x => x.toLowerCase());
  if (v.includes('@p0') || v.includes('@critical') || v.includes('@blocker')) return 'P0';
  if (v.includes('@p1') || v.includes('@high')) return 'P1';
  if (v.includes('@p2') || v.includes('@medium')) return 'P2';
  if (v.includes('@p3') || v.includes('@low')) return 'P3';
  return ''; // kosong jika tidak ada tag priority
};

const tagsToType = (tags) => {
  const raw = (tags || []).map((t) => String(t).toLowerCase());
  if (raw.some((v) => v.includes('@negative') || v === 'negative')) return TYPE_LABELS.negative;
  if (raw.some((v) => v.includes('@positive') || v === 'positive')) return TYPE_LABELS.positive;
  return ''; // kosong jika tidak ada tag type
};

function normalizeTag(tag) {
  const name = String(tag).replace(/^@/, '');
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Ganti ke "Positif"/"Negatif" kalau ingin Bahasa Indonesia
const TYPE_LABELS = {
  positive: 'Positive', // ubah jadi 'Positif' jika mau
  negative: 'Negative', // ubah jadi 'Negatif' jika mau
};

const PRIORITY_LABELS = { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3' };

function scenariosToRows(scn) {
  const baseGivens = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'given')
    .map(s => s.text);

  // gabungkan semua tag: level feature + level scenario
  const toStrTag = (t) => (t && t.name) ? t.name : String(t || '');
  const allTags = [
    ...(scn.featureTags || []),
    ...(scn.tags || [])
  ].map(toStrTag).filter(Boolean);

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
      'Test Data': formatTestData(ex, scn.name),
      // 'Test Data': ex ? Object.entries(ex).map(([k, v], i) => `${i+1}. ${k} = ${v}`).join('\n') : '',
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
  // ===== Helpers: parsing & formatting =====
  const toStr = (v) => (v == null ? "" : String(v));
  const splitAnnotations = (tagStr) => toStr(tagStr).match(/@\S+/g) || [];

  const norm = (s) => s.toLowerCase();

  // klasifikasi anotasi -> { priority, type, extras[] }
  function classifyAnnotations(tagStr, seed = {}) {
    const out = { priority: seed.priority || seed.Priority || "", type: seed.type || seed.Type || "", extras: [] };
    const tokens = splitAnnotations(tagStr).map(s => s.toLowerCase());

    for (const tok of tokens) {
      if (/^@p[0-3]$/.test(tok)) { out.priority = tok.slice(1).toUpperCase(); continue; }
      if (tok === "@positive" || tok === "@negative") {
        out.type = TYPE_LABELS[tok.slice(1)]; // → "Positive"/"Negative"
        continue;
      }
      out.extras.push(tok); // ← SEMUA tag lain masuk sini
    }
    return out;
  }

  // hitung header dinamis Tag1..TagN untuk satu sheet
  function computeMaxExtraTags(rows) {
    let maxN = 0;
    for (const r of rows) {
      const { extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
      if (extras.length > maxN) maxN = extras.length;
    }
    return maxN;
  }

  // autofit kolom + wrap + auto row height (estimasi)
  function applyStylingAndFit(ws, headers) {
    // wrap + vertical top untuk semua cell
    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.alignment = { wrapText: true, vertical: 'top' };
      });
    });

    // auto width berdasarkan line terpanjang
    ws.columns.forEach((col, idx) => {
      let max = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const val = toStr(cell.value);
        if (!val) return;
        const longest = val.split('\n').reduce((m, line) => Math.max(m, line.length), 0);
        if (longest > max) max = longest;
      });
      col.width = Math.min(Math.max(max + 2, 10), 80);
    });

    // auto height (estimasi) berdasarkan lebar kolom
    ws.eachRow(row => {
      let maxLines = 1;
      row.eachCell(cell => {
        const val = toStr(cell.value);
        if (!val) return;
        const width = ws.getColumn(cell.col).width || 10;
        const lines = val.split('\n').reduce((sum, line) => {
          const approxCharsPerLine = Math.max(Math.floor(width), 1);
          return sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine));
        }, 0);
        if (lines > maxLines) maxLines = lines;
      });
      row.height = Math.min(15 * maxLines, 220);
    });
  }

  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    for (const { sheetName, rows } of fileRowsMap) {
      // hitung jumlah Tag dinamis untuk sheet ini
      const maxExtras = computeMaxExtraTags(rows);

      // base headers sesuai urutan ekspektasi
      const BASE_HEADERS = [
        'TC_ID',
        'Feature',
        'Priority',
        'Type',
        'Title',
        'Precondition (Given)',
        'Test Steps (When/And)',
        'Test Data',
        'Expected Result (Then/And)'
      ];
      // tambah Tag1..TagN kalau ada
      const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag${i + 1}`);
      const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

      const ws = wb.addWorksheet(sheetName, {
        properties: { defaultRowHeight: 18 },
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
      });

      // header
      ws.addRow(HEADERS);
      HEADERS.forEach((_, idx) => {
        const c = ws.getRow(1).getCell(idx + 1);
        c.font = { bold: true };
        c.alignment = { vertical: 'top', wrapText: true };
      });

      // TC_ID reset per sheet, prefix = nama sheet, dinormalisasi
      const prefix = toStr(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
      let counter = 1;

      // tulis row data
      for (const r of rows) {
        // klasifikasi anotasi dari r.Tags
        const { priority, type, extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });

        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`;
        counter++;

        // siapkan kolom Tag1..TagN
        // const extraCols = Array.from({ length: maxExtras }, (_, i) => extras[i] ? extras[i] : '');
        const extraCols = Array.from(
          { length: maxExtras },
          (_, i) => extras[i] ? normalizeTag(extras[i]) : ''
        );

        // >>> taruh debug DI SINI <<<
        if (/Successful login/.test(String(r.Title))) {
          console.log('[DEBUG] Tags =', r.Tags);
          console.log('[DEBUG] classify =', classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type }));
        }

        ws.addRow([
          tcid,
          toStr(r.Feature),
          toStr(priority || r.Priority),
          toStr(type || r.Type),
          toStr(r.Title),
          toStr(r['Precondition (Given)']),
          toStr(r['Test Steps (When/And)']),
          toStr(r['Test Data']),
          toStr(r['Expected Result (Then/And)']),
          ...extraCols
        ]);
      }

      // styling & auto-fit
      applyStylingAndFit(ws, HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
    // ===== Fallback ke xlsx (tanpa pageSetup landscape) =====
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      for (const { sheetName, rows } of fileRowsMap) {
        const maxExtras = (function computeMaxExtraTags(rows) {
          let maxN = 0;
          for (const r of rows) {
            const { extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
            if (extras.length > maxN) maxN = extras.length;
          }
          return maxN;
        })(rows);

        const BASE_HEADERS = [
          'TC_ID',
          'Feature',
          'Priority',
          'Type',
          'Title',
          'Precondition (Given)',
          'Test Steps (When/And)',
          'Test Data',
          'Expected Result (Then/And)'
        ];
        const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag${i + 1}`);
        const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

        const aoa = [HEADERS];

        const prefix = toStr(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of rows) {
          const { priority, type, extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`;
          counter++;
          // const extraCols = Array.from({ length: maxExtras }, (_, i) => extras[i] ? extras[i] : '');
          const extraCols = Array.from(
            { length: maxExtras },
            (_, i) => extras[i] ? normalizeTag(extras[i]) : ''
          );

          // >>> taruh debug DI SINI <<<
          if (/Successful login/.test(String(r.Title))) {
            console.log('[DEBUG] Tags =', r.Tags);
            console.log('[DEBUG] classify =', classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type }));
          }

          aoa.push([
            tcid,
            toStr(r.Feature),
            toStr(priority || r.Priority),
            toStr(type || r.Type),
            toStr(r.Title),
            toStr(r['Precondition (Given)']),
            toStr(r['Test Steps (When/And)']),
            toStr(r['Test Data']),
            toStr(r['Expected Result (Then/And)']),
            ...extraCols
          ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      XLSX.writeFile(wb, outFile);
      console.warn('Note: fallback ke "xlsx"; pengaturan landscape & autofit tidak sepenuhnya didukung.');
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