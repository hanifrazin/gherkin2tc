#!/usr/bin/env node
/**
 * gherkin-ui.cjs
 * Convert Gherkin (.feature) → 1 file Excel (.xlsx) dengan 1 sheet per file .feature
 * Kolom: TC_ID, Feature, Type, Priority, Rule, Title, Precondition (Given),
 *        Test Steps (When/And), Test Data, Expected Result (Then/And), Tag1..TagN (dinamis)
 *
 * Dukungan:
 * - Rule: nama + tag + background di level Rule ikut dipakai (opsional; bila tak ada Rule → kolom kosong)
 * - Scenario Outline: expand Examples jadi beberapa test case (substitusi <param>)
 * - Background: gabungan Feature + Rule
 * - Tag Priority: @P0/@P1/@P2/@P3 (atau @critical/@high/@medium/@low)
 * - Tag Type    : @positive / @negative  (label otomatis jadi "Positive"/"Negative")
 * - Tag lain    : dipecah ke kolom Tag1..TagN (tidak termasuk tag Priority & Type)
 * - Test Steps & Test Data bernomor (1., 2., 3., …)
 */

const fs = require('fs');
const path = require('path');

/* ---------- CLI ---------- */
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

/* ---------- Helpers (fs) ---------- */
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

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);

  let feature = '', featureTags = [];
  let featureBackground = [];

  // Konteks Rule (opsional)
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
      if (/^\s*(Scenario(?: Outline)?:|Feature:|Background:|Examples:|Rule:)/i.test(cur)) break;

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

    if (ln.startsWith('@')) { tags = ln.split(/\s+/).filter(Boolean); i++; continue; }

    if (/^\s*Feature:/i.test(ln)) {
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      if (tags.length) { featureTags = tags.slice(); tags = []; }
      // reset konteks Rule
      currentRule = '';
      ruleTags = [];
      ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Rule:/i.test(ln)) {
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = tags.slice(); // tag menggantung sebelum Rule
      tags = [];
      ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Background:/i.test(ln)) {
      i++;
      if (currentRule) parseBackgroundBlock(ruleBackground);
      else parseBackgroundBlock(featureBackground);
      continue;
    }

    const mSc = ln.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/i);
    if (mSc) {
      const type = ln.includes('Outline') ? 'Scenario Outline' : 'Scenario';
      const name = mSc[1].trim();
      const scTags = tags.slice(); tags = [];
      i++;

      const steps = [];
      const examples = [];
      let last = null;

      while (i < lines.length) {
        const cur = clean(lines[i]);
        if (/^\s*@/.test(cur) || /^\s*Scenario(?: Outline)?:/i.test(cur) ||
            /^\s*Feature:/i.test(cur) || /^\s*Background:/i.test(cur) || /^\s*Rule:/i.test(cur)) break;
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

      const effectiveTags = [...(featureTags || []), ...(ruleTags || []), ...(scTags || [])];
      const effectiveBackground = [...(featureBackground || []), ...(ruleBackground || [])];

      scenarios.push({
        file: filename,
        feature,
        featureTags,
        ruleName: currentRule || '',
        ruleTags: ruleTags.slice(),
        tags: scTags,
        type,
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

const TYPE_LABELS = {
  positive: 'Positive',
  negative: 'Negative',
};

const PRIORITY_LABELS = { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3' };

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
function normalizeTag(tag) {
  const name = String(tag).replace(/^@/, '');
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function scenariosToRows(scn) {
  const baseGivens = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'given')
    .map(s => s.text);

  // Tag gabungan Feature + Rule + Scenario
  const allTagsArr = [...(scn.featureTags || []), ...(scn.ruleTags || []), ...(scn.tags || [])];
  const Priority = tagsToPriority(allTagsArr);
  const Type     = tagsToType(allTagsArr);

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

    // SATU string tags dengan pemisah SPASI (bukan koma)
    const toStrTag = (t) => (t && t.name) ? t.name : String(t || '');
    const allTagsStr = allTagsArr.map(toStrTag).filter(Boolean).join(' ');

    return {
      Feature: scn.feature || '',
      Rule: scn.ruleName || '',
      Type,
      Priority,
      Title: substitute(scn.name, ex),
      'Precondition (Given)': numbered(giv),
      'Test Steps (When/And)': numbered(wh),
      'Test Data': ex ? Object.entries(ex).map(([k, v], i) => `${i+1}. ${k} = ${v}`).join('\n') : '',
      'Expected Result (Then/And)': numbered(th),
      Tags: allTagsStr,
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
  // Helpers
  const toStr = (v) => (v == null ? "" : String(v));

  const splitAnnotations = (tagStr) => {
    return toStr(tagStr)
      .trim()
      .split(/\s+/)
      .filter(t => /^@/.test(t));
  };
  const norm = (s) => s.toLowerCase();

  function classifyAnnotations(tagStr, seed = {}) {
    const out = {
      priority: seed.priority || seed.Priority || "",
      type: seed.type || seed.Type || "",
      extras: []
    };

    const tokens = splitAnnotations(tagStr).map(norm);
    for (const tok of tokens) {
      if (/^@p[0-3]$/.test(tok)) {
        out.priority = tok.slice(1).toUpperCase();
        continue;
      }
      if (tok === "@positive" || tok === "@negative") {
        out.type = TYPE_LABELS[tok.slice(1)];
        continue;
      }
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
        const extraCols = Array.from({ length: maxExtras }, (_, i) => extras[i] ? normalizeTag(extras[i]) : '');

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
          const extraCols = Array.from({ length: maxExtras }, (_, i) => extras[i] ? normalizeTag(extras[i]) : '');

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