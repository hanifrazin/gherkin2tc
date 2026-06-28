#!/usr/bin/env node
/**
 * gherkin-ui.cjs
 * Convert Gherkin (.feature) → Excel (.xlsx) untuk test case UI
 * - Multi-feature, Rule/Background scoping
 * - Docstring & Data Table menempel ke step sebelumnya
 * - Examples → Test Data (skip kolom pertama)
 * - Tags: Priority/Type + Tag1..TagN
 * - Tahan BOM/zero-width/NBSP
 */

const fs = require('fs');
const path = require('path');
const { printError, printWarn } = require('../cli/colorize.cjs');

/* ---------- CLI argument parsing ---------- */
const args = process.argv.slice(2);
if (args.length === 0) {
  printError('Usage: node gherkin-ui.cjs <file.feature|dir> -o <out.xlsx> [--xlsx] [--debug]');
  process.exit(1);
}
let inputPath = null;
let outPath = 'testcases.xlsx';
let forceXlsx = false;

const debug = args.includes('--debug') || process.env.GRISE_DEBUG === '1';

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('-') && !inputPath) inputPath = a;
  if (a === '-o' || a === '--out') outPath = args[i + 1];
  if (a === '--xlsx') forceXlsx = true;
}
if (!inputPath) {
  printError('Error: input path is required.');
  process.exit(1);
}

/* ---------- FS helpers ---------- */
function walk(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    return s.isDirectory() ? walk(p) : [p];
  });
}

function stripBOM(s) {
  return String(s || '').replace(/^\uFEFF/, '');
}

function stripInvisibles(s) {
  return String(s || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
}

function readFeatureFiles(input) {
  const st = fs.statSync(input);
  let files = [];
  if (st.isDirectory()) {
    files = walk(input).filter(f => f.toLowerCase().endsWith('.feature'));
  } else {
    files = [input];
  }
  return files.map(f => ({
    file: f,
    content: stripInvisibles(stripBOM(fs.readFileSync(f, 'utf8')))
  }));
}

/* ---------- Text helpers ---------- */
const STEP_KW = ['Given', 'When', 'Then', 'And', 'But'];
const kwRe = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;

function clean(s) {
  const t = stripInvisibles(stripBOM(String(s || '')));
  const cut = t.includes(' #') ? t.slice(0, t.indexOf(' #')) : t;
  return cut.trim();
}

function isStepLine(l) {
  return STEP_KW.some(k => new RegExp(`^\\s*${k}\\b`).test(l));
}

function cap1(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

const TAG_TOKEN_RE = /@[A-Za-z0-9_\-]+/g;

function extractTagTokens(line) {
  const norm = stripInvisibles(stripBOM(line || '')).trim();
  const m = norm.match(TAG_TOKEN_RE);
  return m || [];
}

function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw = cap1(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

/* ---------- Parser helpers (module-level, menerima lines + state { i }) ---------- */

/** Attach docstring ("""...""") to the last step in targetArr */
function attachDocString(targetArr, lines, idx) {
  const buf = [];
  idx.i++;
  while (idx.i < lines.length && !/^\s*"""/.test(lines[idx.i])) {
    buf.push(lines[idx.i].replace(/\r$/, ''));
    idx.i++;
  }
  if (idx.i < lines.length) idx.i++; // skip closing """
  if (targetArr && targetArr.length) {
    const step = targetArr[targetArr.length - 1];
    step.text += '\n"""\n' + buf.join('\n') + '\n"""';
  }
}

/** Attach a data table row (|...|) to the last step in targetArr */
function attachTableRow(targetArr, lines, idx) {
  if (targetArr && targetArr.length) {
    const step = targetArr[targetArr.length - 1];
    step.text += '\n' + clean(lines[idx.i]);
  }
  idx.i++;
}

/** Parse a Background block (without the Background: header) */
function parseBackgroundBlock(targetArr, lines, idx) {
  let last = null;
  while (idx.i < lines.length) {
    const raw = lines[idx.i];
    const cur = clean(raw);

    if (!cur || cur.startsWith('#')) { idx.i++; continue; }

    // Tag lines should not be consumed by background
    if (/^\s*@/.test(raw)) break;

    // Break on known headers
    if (/^\s*(Scenario(?: Outline)?:|Example:|Feature:|Background:|Examples:|Rule:)/i.test(cur)) break;

    // Docstring
    if (/^\s*"""/.test(raw)) {
      const buf = [];
      idx.i++;
      while (idx.i < lines.length && !/^\s*"""/.test(lines[idx.i])) {
        buf.push(lines[idx.i].replace(/\r$/, ''));
        idx.i++;
      }
      if (idx.i < lines.length) idx.i++;
      if (targetArr && targetArr.length) {
        targetArr[targetArr.length - 1].text += '\n"""\n' + buf.join('\n') + '\n"""';
      }
      continue;
    }

    // Data table
    if (/^\s*\|/.test(raw)) {
      if (targetArr && targetArr.length) {
        targetArr[targetArr.length - 1].text += '\n' + clean(lines[idx.i]);
      }
      idx.i++;
      continue;
    }

    // Step line
    if (isStepLine(cur)) {
      const st = extractStep(cur, last);
      last = st.keywordBase;
      targetArr.push(st);
      idx.i++;
      continue;
    }

    idx.i++;
  }
}

/* ---------- Parser ---------- */
const RE_SC_HEAD = /^\s*(Scenario(?: Outline)?:|Example:)\s*(.+)$/i;

function parseFeatureFile(text, filename) {
  text = stripInvisibles(stripBOM(text));
  const lines = text.split(/\r?\n/);
  const idx = { i: 0 }; // mutable line index

  let feature = '', featureTags = [];
  let featureBackground = [];
  let currentRule = '', ruleTags = [], ruleBackground = [];
  const scenarios = [];
  let danglingTags = [];

  while (idx.i < lines.length) {
    const raw = lines[idx.i];
    const ln = clean(raw);
    if (!ln || ln.startsWith('#')) { idx.i++; continue; }

    // Extract @tag tokens
    const tagTokens = extractTagTokens(raw);
    const isHeader = /^\s*(Feature:|Rule:|Background:|Scenario|Example:|Examples:)/i.test(ln);

    if (tagTokens.length > 0) {
      if (isHeader) {
        danglingTags = tagTokens.slice();
      } else {
        danglingTags = tagTokens.slice();
        idx.i++;
        continue;
      }
    }

    // --- Feature ---
    if (/^\s*Feature:/i.test(ln)) {
      const inline = extractTagTokens(raw);
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      featureTags = (danglingTags.length || inline.length)
        ? [...new Set([...danglingTags, ...inline])]
        : [];
      danglingTags = [];
      featureBackground = [];
      currentRule = '';
      ruleTags = [];
      ruleBackground = [];
      idx.i++;
      continue;
    }

    // --- Rule ---
    if (/^\s*Rule:/i.test(ln)) {
      const inline = extractTagTokens(raw);
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = [...new Set([...(danglingTags || []), ...inline])];
      danglingTags = [];
      ruleBackground = [];
      idx.i++;
      continue;
    }

    // --- Background ---
    if (/^\s*Background:/i.test(ln)) {
      idx.i++;
      if (currentRule) {
        ruleBackground = [];
        parseBackgroundBlock(ruleBackground, lines, idx);
      } else {
        featureBackground = [];
        parseBackgroundBlock(featureBackground, lines, idx);
      }
      continue;
    }

    // --- Scenario / Scenario Outline / Example ---
    const mSc = ln.match(RE_SC_HEAD);
    if (mSc) {
      const inline = extractTagTokens(raw);
      const head = mSc[1];
      const name = mSc[2].trim();
      const isOutline = /Outline/i.test(head);
      const type = isOutline ? 'Scenario Outline' : 'Scenario';
      const scTags = [...new Set([...(danglingTags || []), ...inline])];
      danglingTags = [];
      idx.i++;

      const steps = [];
      const examples = [];
      let last = null;

      while (idx.i < lines.length) {
        const raw2 = lines[idx.i];
        const cur2 = clean(raw2);

        // Tag lines inside scenario
        const innerTags = extractTagTokens(raw2);
        const innerHeader = /^\s*(Feature:|Rule:|Background:|Scenario|Example:|Examples:)/i.test(cur2);
        if (innerTags.length > 0 && !innerHeader) {
          danglingTags = innerTags.slice();
          idx.i++;
          continue;
        }

        // Break on next section header
        if (/^\s*@/.test(cur2) ||
            /^\s*Feature:/i.test(cur2) ||
            /^\s*Background:/i.test(cur2) ||
            /^\s*Rule:/i.test(cur2) ||
            RE_SC_HEAD.test(cur2)) break;
        if (!cur2 || cur2.startsWith('#')) { idx.i++; continue; }

        // --- Examples ---
        if (/^\s*Examples:/i.test(cur2)) {
          idx.i++;
          const rows = [];
          while (idx.i < lines.length) {
            const tRaw = lines[idx.i];
            const t = clean(tRaw);
            if (!t || t.startsWith('#')) { idx.i++; continue; }
            if (/^\s*\|/.test(tRaw)) {
              const cells = tRaw.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
              rows.push(cells);
              idx.i++;
              continue;
            }
            break;
          }
          if (rows.length >= 2) {
            const hdr = rows[0];
            for (let r = 1; r < rows.length; r++) {
              const obj = {};
              hdr.forEach((h, ci) => obj[h] = rows[r][ci] ?? '');
              Object.defineProperty(obj, '__hdr', { value: hdr.slice(), enumerable: false });
              examples.push(obj);
            }
          }
          continue;
        }

        // Docstring & Data table (attach to previous step)
        if (/^\s*"""/.test(raw2)) { attachDocString(steps, lines, idx); continue; }
        if (/^\s*\|/.test(raw2))  { attachTableRow(steps, lines, idx); continue; }

        // Step line
        if (isStepLine(cur2)) {
          const st = extractStep(cur2, last);
          last = st.keywordBase;
          steps.push(st);
          idx.i++;
          continue;
        }

        idx.i++;
      }

      const effectiveBg = currentRule
        ? [...(featureBackground || []), ...(ruleBackground || [])]
        : [...(featureBackground || [])];

      const allTagTokens = [
        ...(featureTags || []),
        ...(ruleTags || []),
        ...(scTags || [])
      ].map(String).filter(Boolean);

      scenarios.push({
        file: filename,
        feature,
        featureTags,
        ruleName: currentRule || '',
        ruleTags: ruleTags.slice(),
        tags: scTags,
        type,
        name,
        background: effectiveBg,
        steps,
        examples,
        __allTagsTokens: allTagTokens
      });
      continue;
    }

    idx.i++;
  }

  return { feature, scenarios };
}

/* ---------- Tag classification ---------- */
function classifyTags(tokens, seed = {}) {
  const out = {
    priority: seed.Priority || seed.priority || '',
    type: seed.Type || seed.type || '',
    extras: []
  };
  for (const tok of (tokens || [])) {
    const low = String(tok).toLowerCase();
    if (/^@p[0-3]$/.test(low) || ['@critical', '@high', '@medium', '@low', '@blocker'].includes(low)) {
      out.priority = /^@p[0-3]$/.test(low)
        ? low.slice(1).toUpperCase()
        : (low === '@critical' ? 'P0' : low === '@high' ? 'P1' : low === '@medium' ? 'P2' : 'P3');
      continue;
    }
    if (low === '@positive' || low === '@negative') {
      out.type = low === '@positive' ? 'Positive' : 'Negative';
      continue;
    }
    out.extras.push(String(tok).replace(/^@/, ''));
  }
  return out;
}

/* ---------- Mapping ---------- */
const substitute = (t, ex) =>
  ex ? String(t).replace(/<\s*([^>]+)\s*>/g, (_, k) => (k in ex ? ex[k] : `<${k}>`)) : String(t);

const numbered = arr =>
  !arr || arr.length === 0 ? '' : arr.map((s, i) => `${i + 1}. ${s}`).join('\n');

function collectWhenPairs(scn, ex) {
  const whBg = (scn.background || [])
    .filter(s => String(s.keywordBase || '').toLowerCase() === 'when')
    .map(s => substitute(s.text || '', ex));
  const whSc = (scn.steps || [])
    .filter(s => String(s.keywordBase || '').toLowerCase() === 'when')
    .map(s => substitute(s.text || '', ex));
  const all = [...whBg, ...whSc];
  const rx = /([A-Za-z0-9_\-\s]+?)\s*"([^"]*)"/g;
  const pairs = [];
  for (const t of all) {
    let m;
    while ((m = rx.exec(t)) !== null) {
      let rawLabel = (m[1] || '').trim();
      const value = m[2];
      rawLabel = rawLabel.replace(/^(?:with|and|the|a|an|of|as|to|by|for)\s+/i, '').trim();
      rawLabel = rawLabel.replace(/\s+/g, ' ').trim();
      const parts = rawLabel.split(/\s+/).filter(Boolean);
      const label = parts.length > 2 ? parts.slice(-2).join(' ') : rawLabel;
      const valueStr = value === '' ? '(empty)' : `"${value}"`;
      if (label) pairs.push(`${label} = ${valueStr}`);
    }
  }
  return pairs;
}

function scenariosToRows(scn) {
  const bgGiven = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'given').map(s => s.text);
  const bgWhen = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'when').map(s => s.text);
  const bgThen = (scn.background || [])
    .filter(s => (s.keywordBase || '').toLowerCase() === 'then').map(s => s.text);

  const tokens = Array.isArray(scn.__allTagsTokens) ? scn.__allTagsTokens.slice() : [];
  const low = tokens.map(t => String(t).toLowerCase());

  const Priority =
    (low.includes('@p0') || low.includes('@critical') || low.includes('@blocker')) ? 'P0' :
    (low.includes('@p1') || low.includes('@high')) ? 'P1' :
    (low.includes('@p2') || low.includes('@medium')) ? 'P2' :
    (low.includes('@p3') || low.includes('@low')) ? 'P3' : '';

  const Type =
    (low.includes('@negative') || low.includes('negative')) ? 'Negative' :
    (low.includes('@positive') || low.includes('positive')) ? 'Positive' : '';

  const hasExamples = scn.type === 'Scenario Outline' && (scn.examples || []).length > 0;

  function buildRow(ex) {
    const giv = [...bgGiven];
    const wh = [...bgWhen];
    const th = [...bgThen];
    let mode = null;

    (scn.steps || []).forEach(st => {
      const txt = substitute(st.text, ex);
      const base = (st.keywordBase || '').toLowerCase();
      if (base === 'given') { mode = 'given'; giv.push(txt); }
      else if (base === 'when') { mode = 'when'; wh.push(txt); }
      else if (base === 'then') { mode = 'then'; th.push(txt); }
      else if (mode === 'given') giv.push(txt);
      else if (mode === 'then') th.push(txt);
      else wh.push(txt);
    });

    // Test Data
    let baseTD = [];
    if (ex && hasExamples) {
      const hdr = Array.isArray(ex.__hdr) ? ex.__hdr : Object.keys(ex);
      if (hdr.length > 1) {
        for (let i = 1; i < hdr.length; i++) {
          const key = hdr[i];
          baseTD.push(`${baseTD.length + 1}. ${key} = ${ex[key] || '(empty)'}`);
        }
      }
    }
    let addTD = [];
    if (!hasExamples) {
      const whenPairs = collectWhenPairs(scn, ex);
      addTD = whenPairs.map((pair, i) => `${baseTD.length + i + 1}. ${pair}`);
    }
    const testData = [...baseTD, ...addTD].join('\n');

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
      Tags: tokens.join(' '),
      __allTagsTokens: tokens.slice(),
      Notes: ''
    };
  }

  if (scn.type === 'Scenario Outline' && (scn.examples || []).length) {
    return scn.examples.map(ex => buildRow(ex));
  }
  return [buildRow(null)];
}

/* ---------- XLSX Writer ---------- */
async function writeXlsx(fileRowsMap, outFile) {
  const toStr = v => (v == null ? '' : String(v));

  function normalizeRows(rows) {
    return rows.map(r => {
      const cls = classifyTags(r.__allTagsTokens || [], { priority: r.Priority, type: r.Type });
      return { ...r, __Priority: cls.priority || r.Priority || '', __Type: cls.type || r.Type || '', __Extras: cls.extras };
    });
  }

  function computeMaxExtras(normRows) {
    return normRows.reduce((m, r) => Math.max(m, r.__Extras.length), 0);
  }

  function styleSheet(ws, headers) {
    ws.eachRow(row => row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; }));
    ws.columns.forEach((col, idx) => {
      let max = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const val = toStr(cell.value);
        const longest = val ? val.split('\n').reduce((m, line) => Math.max(m, line.length), 0) : 0;
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
        const approx = Math.max(1, Math.floor(width));
        const lines = val.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / approx)), 0);
        if (lines > maxLines) maxLines = lines;
      });
      row.height = Math.min(15 * maxLines, 220);
    });
  }

  function makeSheetName(file) {
    let base = path.basename(file, '.feature').replace(/[^A-Za-z0-9_\-]+/g, '_');
    if (!base) base = 'Sheet';
    if (base.length > 31) base = base.slice(0, 31);
    return base;
  }

  // Try exceljs first, fallback to xlsx
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const usedNames = new Set();

    for (const { file, rows } of fileRowsMap) {
      const normRows = normalizeRows(rows);
      const maxExtras = computeMaxExtras(normRows);

      let sheetName = makeSheetName(file);
      let k = 2;
      while (usedNames.has(sheetName)) {
        sheetName = (sheetName.slice(0, 28) + '_' + k).slice(0, 31);
        k++;
      }
      usedNames.add(sheetName);

      const BASE_HEADERS = [
        'TC_ID', 'Feature', 'Type', 'Priority', 'Rule', 'Title',
        'Precondition (Given)', 'Test Steps (When/And)', 'Test Data', 'Expected Result (Then/And)'
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

      const prefix = sheetName.trim().replace(/\s+/g, '_').toUpperCase();
      let counter = 1;
      let firstLogged = false;

      for (const r of normRows) {
        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`;
        counter++;
        const extraCols = Array.from({ length: maxExtras }, (_, i) => r.__Extras[i] || '');
        ws.addRow([
          tcid, r.Feature ?? '', r.__Type, r.__Priority, r.Rule ?? '', r.Title ?? '',
          r['Precondition (Given)'] ?? '', r['Test Steps (When/And)'] ?? '',
          r['Test Data'] ?? '', r['Expected Result (Then/And)'] ?? '',
          ...extraCols
        ]);

        // Debug log for first row
        if (debug && !firstLogged) {
          firstLogged = true;
          const ok = r.__Priority || r.__Type || r.Rule || (r.__Extras && r.__Extras.length);
          if (ok) {
            console.log(`✅ [GRISE][${sheetName}] Row#1 OK → ${tcid} | Priority=${r.__Priority || '-'} | Type=${r.__Type || '-'} | Rule=${r.Rule || '-'} | Tags(${r.__Extras.length})=${r.__Extras.join(', ')}`);
          } else {
            console.warn(`⚠️  [GRISE][${sheetName}] Row#1 KOSONG → ${tcid}`);
          }
        }
      }

      styleSheet(ws, HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
    // Fallback to xlsx
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const usedNames = new Set();

      for (const { file, rows } of fileRowsMap) {
        const normRows = normalizeRows(rows);
        const maxExtras = computeMaxExtras(normRows);

        let sheetName = makeSheetName(file);
        let k = 2;
        while (usedNames.has(sheetName)) {
          sheetName = (sheetName.slice(0, 28) + '_' + k).slice(0, 31);
          k++;
        }
        usedNames.add(sheetName);

        if (debug && normRows.length) {
          const r0 = normRows[0];
          const tcid0 = `${sheetName.trim().replace(/\s+/g, '_').toUpperCase()}-001`;
          const ok = r0.__Priority || r0.__Type || r0.Rule || (r0.__Extras && r0.__Extras.length);
          if (ok) {
            console.log(`✅ [GRISE][${sheetName}] Row#1 OK (xlsx fallback) → ${tcid0}`);
          } else {
            console.warn(`⚠️  [GRISE][${sheetName}] Row#1 KOSONG (xlsx fallback) → ${tcid0}`);
          }
        }

        const BASE_HEADERS = [
          'TC_ID', 'Feature', 'Type', 'Priority', 'Rule', 'Title',
          'Precondition (Given)', 'Test Steps (When/And)', 'Test Data', 'Expected Result (Then/And)'
        ];
        const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag ${i + 1}`);
        const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

        const aoa = [HEADERS];
        const prefix = sheetName.trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of normRows) {
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`;
          counter++;
          const extraCols = Array.from({ length: maxExtras }, (_, i) => r.__Extras[i] || '');
          aoa.push([
            tcid, r.Feature ?? '', r.__Type, r.__Priority, r.Rule ?? '', r.Title ?? '',
            r['Precondition (Given)'] ?? '', r['Test Steps (When/And)'] ?? '',
            r['Test Data'] ?? '', r['Expected Result (Then/And)'] ?? '',
            ...extraCols
          ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      XLSX.writeFile(wb, outFile);
      printWarn('Note: fallback ke "xlsx"; autofit terbatas.');
      return true;

    } catch (err) {
      printError('Gagal menulis .xlsx. Install "exceljs" (disarankan) atau "xlsx".');
      printError(err.message);
      return false;
    }
  }
}

/* ---------- Main ---------- */
(async () => {
  const inputs = readFeatureFiles(inputPath);
  if (inputs.length === 0) {
    printError('No .feature files found.');
    process.exit(1);
  }

  const fileRowsMap = [];

  for (const { file, content } of inputs) {
    const { scenarios } = parseFeatureFile(content, file);
    const rows = scenarios.flatMap(scn => scenariosToRows(scn));
    fileRowsMap.push({ file, rows });
  }

  const ok = await writeXlsx(fileRowsMap, outPath);
  if (!ok) process.exit(1);
})();
