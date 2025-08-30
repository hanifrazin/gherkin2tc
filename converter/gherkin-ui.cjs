#!/usr/bin/env node
/**
 * gherkin-ui.cjs
 * Convert Gherkin (.feature) → 1 file Excel (.xlsx) dengan 1 sheet per file .feature
 * Kolom: TC_ID, Feature, Type, Priority, Rule, Title, Precondition (Given),
 *        Test Steps (When/And), Test Data, Expected Result (Then/And), Tag1..TagN (dinamis)
 *
 * Dukungan:
 * - Feature / Background (feature-level)
 * - Rule (opsional): nama + tag + background (rule-level)
 * - Scenario / Scenario Outline / Example (Example = alias Scenario tanpa Examples table)
 * - Scenario Outline: expand Examples → beberapa baris test case (substitusi <param>)
 * - Tag Priority: @P0/@P1/@P2/@P3 (atau @critical/@high/@medium/@low)
 * - Tag Type    : @positive/@negative (kolom Type → 'Positive'/'Negative')
 * - Tag lain    : ke kolom Tag1..TagN (TANPA '@' dan casing dipertahankan)
 *
 * PERUBAHAN UTAMA:
 * - Background kini tidak hanya Given: When & Then pada Background juga ikut dimasukkan:
 *     • Background Given → Precondition (Given)
 *     • Background When  → Test Steps (When/And)
 *     • Background Then  → Expected Result (Then/And)
 */

const fs = require('fs');
const path = require('path');

/* ---------- CLI (internal) ---------- */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin-ui.cjs <file.feature|dir> -o <out.xlsx> [--xlsx]');
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

/* ---------- FS Helpers ---------- */
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

/* ---------- Text helpers ---------- */
const STEP_KW = ['Given','When','Then','And','But'];
const kwRe = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;
const clean = s => (s.includes(' #') ? s.slice(0, s.indexOf(' #')) : s).trim();
const isStep = l => STEP_KW.some(k => new RegExp(`^\\s*${k}\\b`).test(l));
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/* ---------- Parsing ---------- */
function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw = capitalize(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

// "Example:" (singular) dianggap Scenario
const RE_SCENARIO_HEAD = /^\s*(Scenario(?: Outline)?:|Example:)\s*(.+)$/i;

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);

  let feature = '', featureTags = [];
  let featureBackground = [];

  // konteks Rule
  let currentRule = '';
  let ruleTags = [];
  let ruleBackground = [];

  const scenarios = [];
  let tags = [];
  let i = 0;

  function parseBackgroundBlock(targetArr) {
    let last = null;
    while (i < lines.length) {
      const cur = clean(lines[i]);
      if (!cur || cur.startsWith('#')) { i++; continue; }
      if (/^\s*(Scenario(?: Outline)?:|Example:|Feature:|Background:|Examples:|Rule:)/i.test(cur)) break;

      if (isStep(cur)) {
        const st = extractStep(cur, last);
        last = st.keywordBase;
        targetArr.push(st);
        i++; continue;
      }

      if (/^\s*\|.*\|\s*$/.test(cur) && targetArr.length) {
        targetArr[targetArr.length - 1].text += '\n' + cur.trim();
        i++; continue;
      }
      if (/^\s*"""/.test(cur) && targetArr.length) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*"""/.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        targetArr[targetArr.length - 1].text += '\n' + buf.join('\n');
        continue;
      }
      i++;
    }
  }

  while (i < lines.length) {
    const ln = clean(lines[i]);
    if (!ln || ln.startsWith('#')) { i++; continue; }

    // Tag menggantung (menempel ke entity deklaratif berikutnya)
    if (ln.startsWith('@')) { tags = ln.split(/\s+/).filter(Boolean); i++; continue; }

    // Feature
    if (/^\s*Feature:/i.test(ln)) {
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      if (tags.length) { featureTags = tags.slice(); tags = []; }
      currentRule = '';
      ruleTags = [];
      ruleBackground = [];
      i++; continue;
    }

    // Rule
    if (/^\s*Rule:/i.test(ln)) {
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = tags.slice(); // tag menggantung sebelum Rule
      tags = [];
      ruleBackground = [];
      i++; continue;
    }

    // Background (feature-level atau rule-level)
    if (/^\s*Background:/i.test(ln)) {
      i++;
      if (currentRule) parseBackgroundBlock(ruleBackground);
      else parseBackgroundBlock(featureBackground);
      continue;
    }

    // Scenario / Scenario Outline / Example
    const mSc = ln.match(RE_SCENARIO_HEAD);
    if (mSc) {
      const head = mSc[1]; // "Scenario:" | "Scenario Outline:" | "Example:"
      const name = mSc[2].trim();
      const isOutline = /Outline/i.test(head);
      const type = isOutline ? 'Scenario Outline' : 'Scenario'; // Example → Scenario
      const scTags = tags.slice(); tags = [];
      i++;

      const steps = [];
      const examples = []; // hanya terisi kalau Scenario Outline + Examples:
      let last = null;

      while (i < lines.length) {
        const cur = clean(lines[i]);

        if (/^\s*@/.test(cur) ||
            /^\s*Feature:/i.test(cur) ||
            /^\s*Background:/i.test(cur) ||
            /^\s*Rule:/i.test(cur) ||
            RE_SCENARIO_HEAD.test(cur)) break;

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

        // table/docstring pada step
        if (/^\s*\|.*\|\s*$/.test(cur) && steps.length) {
          steps[steps.length - 1].text += '\n' + cur.trim();
          i++; continue;
        }
        if (/^\s*"""/.test(cur) && steps.length) {
          const buf = [];
          i++;
          while (i < lines.length && !/^\s*"""/.test(lines[i])) { buf.push(lines[i]); i++; }
          if (i < lines.length) i++;
          steps[steps.length - 1].text += '\n' + buf.join('\n');
          continue;
        }

        i++;
      }

      // gabung tags & background (feature + rule)
      const effectiveTags = [...(featureTags || []), ...(ruleTags || []), ...(scTags || [])];
      const effectiveBackground = [...(featureBackground || []), ...(ruleBackground || [])];

      scenarios.push({
        file: filename,
        feature,
        featureTags,
        ruleName: currentRule || '',
        ruleTags: ruleTags.slice(),
        tags: scTags,
        type, // 'Scenario' atau 'Scenario Outline' (Example → 'Scenario')
        name,
        background: effectiveBackground,
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

const TYPE_LABELS = { positive: 'Positive', negative: 'Negative' };

const tagsToPriority = (tags) => {
  const v = (tags || []).map(x => String(x).toLowerCase());
  if (v.includes('@p0') || v.includes('@critical') || v.includes('@blocker')) return 'P0';
  if (v.includes('@p1') || v.includes('@high')) return 'P1';
  if (v.includes('@p2') || v.includes('@medium')) return 'P2';
  if (v.includes('@p3') || v.includes('@low')) return 'P3';
  return '';
};
const tagsToType = (tags) => {
  const raw = (tags || []).map((t) => String(t).toLowerCase());
  if (raw.some((v) => v.includes('@negative') || v === 'negative')) return TYPE_LABELS.negative;
  if (raw.some((v) => v.includes('@positive') || v === 'positive')) return TYPE_LABELS.positive;
  return '';
};

function scenariosToRows(scn) {
  // ====== PERBAIKAN UTAMA: seed kolom dari Background Given/When/Then ======
  const bgGiven = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'given')
    .map(s => s.text);
  const bgWhen = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'when')
    .map(s => s.text);
  const bgThen = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'then')
    .map(s => s.text);

  // Tag gabungan Feature + Rule + Scenario
  const allTagsArr = [...(scn.featureTags || []), ...(scn.ruleTags || []), ...(scn.tags || [])];
  const Priority = tagsToPriority(allTagsArr);
  const Type     = tagsToType(allTagsArr);

  const build = (ex) => {
    // seed dari Background dulu
    const giv = [...bgGiven];
    const wh  = [...bgWhen];
    const th  = [...bgThen];

    // lalu langkah-langkah scenario ditambahkan di belakangnya (menjaga urutan)
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

    // Tags → string spasi (bukan koma). Simpan persis (apa adanya).
    const toStrTag = (t) => (t && t.name) ? t.name : String(t || '');
    const allTagsStr = allTagsArr.map(toStrTag).filter(Boolean).join(' ');

    // Test Data
    const testData = ex
      ? Object.entries(ex).map(([k, v], i) => `${i+1}. ${k} = ${v || '(empty)'}`).join('\n')
      : '';

    return {
      Feature: scn.feature || '',
      Rule: scn.ruleName || '',
      Type,
      Priority,
      Title: substitute(scn.name, ex),
      'Precondition (Given)': numbered(giv),
      'Test Steps (When/And)': numbered(wh),
      'Test Data': testData,
      'Expected Result (Then/And)': numbered(th),
      Tags: allTagsStr,
      Notes: ''
    };
  };

  const rows = [];
  if (scn.type === 'Scenario Outline' && (scn.examples || []).length) {
    for (const ex of scn.examples) rows.push(build(ex));
  } else {
    rows.push(build(null)); // Scenario atau Example (alias Scenario)
  }
  return rows;
}

/* ---------- XLSX Writer (multi-sheet) ---------- */
async function writeMultiSheetXlsx(fileRowsMap, outFile) {
  const toStr = (v) => (v == null ? "" : String(v));

  // Split token tag (apa adanya)
  function splitAnnotations(tagStr) {
    return toStr(tagStr)
      .trim()
      .split(/\s+/)
      .filter(t => /^@/.test(t)); // hanya token yang diawali '@'
  }

  // Klasifikasi → priority, type, extras (untuk Tag1..N)
  function classifyAnnotations(tagStr, seed = {}) {
    const out = {
      priority: seed.priority || seed.Priority || "",
      type: seed.type || seed.Type || "",
      extras: []
    };

    const tokens = splitAnnotations(tagStr); // AS-IS
    for (const tok of tokens) {
      const low = tok.toLowerCase();

      // Priority
      if (/^@p[0-3]$/.test(low) || low === '@critical' || low === '@high' || low === '@medium' || low === '@low') {
        if (/^@p[0-3]$/.test(low)) out.priority = low.slice(1).toUpperCase(); // P0..P3
        else if (low === '@critical') out.priority = 'P0';
        else if (low === '@high') out.priority = 'P1';
        else if (low === '@medium') out.priority = 'P2';
        else if (low === '@low') out.priority = 'P3';
        continue;
      }

      // Type
      if (low === '@positive' || low === '@negative') {
        out.type = (low === '@positive') ? 'Positive' : 'Negative';
        continue;
      }

      // Sisanya → extras (AS-IS, preserve casing); “@” dihapus saat ditulis ke TagN
      out.extras.push(tok);
    }
    return out;
  }

  function computeMaxExtraTags(rows) {
    let maxN = 0;
    for (const r of rows) {
      const { extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
      if (extras.length > maxN) maxN = extras.length;
    }
    return maxN;
  }

  function applyStylingAndFit(ws, headers) {
    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.alignment = { wrapText: true, vertical: 'top' };
      });
    });
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
      const maxExtras = computeMaxExtraTags(rows);

      const BASE_HEADERS = [
        'TC_ID',
        'Feature',
        'Type',
        'Priority',
        'Rule',
        'Title',
        'Precondition (Given)',
        'Test Steps (When/And)',
        'Test Data',
        'Expected Result (Then/And)'
      ];
      const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag ${i + 1}`);
      const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

      const ws = wb.addWorksheet(sheetName, {
        properties: { defaultRowHeight: 18 },
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
      });

      ws.addRow(HEADERS);
      HEADERS.forEach((_, idx) => {
        const c = ws.getRow(1).getCell(idx + 1);
        c.font = { bold: true };
        c.alignment = { vertical: 'top', wrapText: true };
      });

      const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
      let counter = 1;

      for (const r of rows) {
        const { priority, type, extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;

        // TagN: tulis tanpa '@' + preserve case
        const extraCols = Array.from(
          { length: maxExtras },
          (_, i) => extras[i] ? String(extras[i]).replace(/^@/, '') : ''
        );

        ws.addRow([
          tcid,
          toStr(r.Feature),
          toStr(type || r.Type),
          toStr(priority || r.Priority),
          toStr(r.Rule),
          toStr(r.Title),
          toStr(r['Precondition (Given)']),
          toStr(r['Test Steps (When/And)']),
          toStr(r['Test Data']),
          toStr(r['Expected Result (Then/And)']),
          ...extraCols
        ]);
      }

      applyStylingAndFit(ws, HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
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
          'Type',
          'Priority',
          'Rule',
          'Title',
          'Precondition (Given)',
          'Test Steps (When/And)',
          'Test Data',
          'Expected Result (Then/And)'
        ];
        const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag ${i + 1}`);
        const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

        const aoa = [HEADERS];

        const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of rows) {
          const { priority, type, extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;

          const extraCols = Array.from(
            { length: maxExtras },
            (_, i) => extras[i] ? String(extras[i]).replace(/^@/, '') : ''
          );

          aoa.push([
            tcid,
            toStr(r.Feature),
            toStr(type || r.Type),
            toStr(priority || r.Priority),
            toStr(r.Rule),
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
      console.warn('Note: fallback ke "xlsx"; landscape & autofit terbatas.');
      return true;

    } catch (err) {
      console.error('Gagal menulis .xlsx. Install "exceljs" (disarankan) atau "xlsx".');
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

  const fileRowsMap = [];
  const usedNames = new Set();

  for (const { file, content } of inputs) {
    const { feature, scenarios } = parseFeatureFile(content, file);

    let rows = [];
    for (const scn of scenarios) rows = rows.concat(scenariosToRows(scn));

    // Nama sheet dari nama file (<=31 char, unik)
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