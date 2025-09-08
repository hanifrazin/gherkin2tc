#!/usr/bin/env node
/**
 * gherkin-ui.cjs (with inline-tag capture + first-row debug logs)
 * - Multi-feature, Rule/Background scoping (as is)
 * - Docstring & Data Table menempel ke step sebelumnya (as is)
 * - Examples: jika ada → Test Data dari Examples (skip kolom pertama);
 *             jika tidak ada → ekstrak pasangan label="value" dari When
 * - Tags: Priority/Type + Tag1..TagN (extras TANPA '@', casing AS-IS; Positive/Negative kapital awal)
 * - Kebal BOM/zero-width/NBSP; ekstraksi tag pakai regex @token
 * - Tambahan: console log untuk status baris pertama tiap sheet (OK / KOSONG) bila debug aktif
 */

const fs = require('fs');
const path = require('path');

/* ---------- CLI arg minimal ---------- */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin-ui.cjs <file.feature|dir> -o <out.xlsx> [--xlsx] [--debug]');
  process.exit(1);
}
let inputPath = null;
let outPath = 'testcases.xlsx';
let forceXlsx = false;

// --- DEBUG SWITCH ---
const debug = args.includes('--debug') || process.env.GRISE_DEBUG === '1';

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

/* ---------- FS helpers ---------- */
function walk(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    return s.isDirectory() ? walk(p) : [p];
  });
}
function stripBOM(s) { return String(s || '').replace(/^\uFEFF/, ''); }
function stripInvisibles(s) {
  // hapus zero-width (200B..200D), BOM, NBSP
  return String(s || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
}
function readAllFeatures(input) {
  const st = fs.statSync(input);
  let files = [];
  if (st.isDirectory()) files = walk(input).filter(f => f.toLowerCase().endsWith('.feature'));
  else files = [input];
  return files.map(f => ({ file: f, content: stripInvisibles(stripBOM(fs.readFileSync(f, 'utf8'))) }));
}

/* ---------- Text helpers ---------- */
const STEP_KW = ['Given','When','Then','And','But'];
const kwRe  = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;
const clean = s => {
  const t = stripInvisibles(stripBOM(String(s || '')));
  const cut = t.includes(' #') ? t.slice(0, t.indexOf(' #')) : t;
  return cut.trim();
};
const isStep = l => STEP_KW.some(k => new RegExp(`^\\s*${k}\\b`).test(l));
const cap1  = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const TAG_TOKEN_RE = /@[A-Za-z0-9_\-]+/g; // contoh: @P1 @positive @Product-Bank @list
function extractTagTokensFromLine(rawLine) {
  const norm = stripInvisibles(stripBOM(rawLine || '')).trim();
  const m = norm.match(TAG_TOKEN_RE);
  return m ? m : [];
}

/* ---------- Step extraction ---------- */
function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw   = cap1(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

/* ---------- Parser ---------- */
// "Example:" (singular) diperlakukan sebagai "Scenario:"
const RE_SC_HEAD = /^\s*(Scenario(?: Outline)?:|Example:)\s*(.+)$/i;

function parseFeatureFile(text, filename) {
  text = stripInvisibles(stripBOM(text));
  const lines = text.split(/\r?\n/);

  let feature = '', featureTags = [];
  let featureBackground = [];
  let currentRule = ''; let ruleTags = []; let ruleBackground = [];

  const scenarios = [];
  let danglingTags = [];

  let i = 0;

  function attachDocStringTo(targetArr) {
    const buf = [];
    i++;
    while (i < lines.length && !/^\s*"""/.test(lines[i])) {
      buf.push(lines[i].replace(/\r$/, ''));
      i++;
    }
    if (i < lines.length) i++;
    if (targetArr && targetArr.length) {
      targetArr[targetArr.length - 1].text += '\n' + '"""' + '\n' + buf.join('\n') + '\n' + '"""';
    }
  }
  function attachTableRowTo(targetArr) {
    if (targetArr && targetArr.length) {
      targetArr[targetArr.length - 1].text += '\n' + clean(lines[i]);
    }
    i++;
  }
  // GANTI seluruh fungsi ini di converter/gherkin-ui.cjs
function parseBackgroundBlock(targetArr) {
  let last = null;
  while (i < lines.length) {
    const raw = lines[i];
    const cur = clean(raw);

    // skip kosong / komentar
    if (!cur || cur.startsWith('#')) { i++; continue; }

    // === PENTING: jika ketemu TAG, jangan dikonsumsi oleh background ===
    // biarkan loop utama yang memprosesnya agar bisa menempel ke Scenario berikutnya.
    if (/^\s*@/.test(raw)) break;

    // jika ketemu header baru → selesai background
    if (/^\s*(Scenario(?: Outline)?:|Example:|Feature:|Background:|Examples:|Rule:)/i.test(cur)) break;

    // docstring & table menempel ke step terakhir
    if (/^\s*"""/.test(raw)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*"""/.test(lines[i])) {
        buf.push(lines[i].replace(/\r$/, ''));
        i++;
      }
      if (i < lines.length) i++; // tutup """
      if (targetArr && targetArr.length) {
        targetArr[targetArr.length - 1].text += '\n' + '"""' + '\n' + buf.join('\n') + '\n' + '"""';
      }
      continue;
    }
    if (/^\s*\|/.test(raw)) {
      if (targetArr && targetArr.length) {
        targetArr[targetArr.length - 1].text += '\n' + clean(lines[i]);
      }
      i++;
      continue;
    }

    // step Given/When/Then/And/But
    if (isStep(cur)) {
      const st = extractStep(cur, last);
      last = st.keywordBase;
      targetArr.push(st);
      i++;
      continue;
    }

    // baris lain yang tidak dikenal → lewati
    i++;
  }
}

  while (i < lines.length) {
    const raw = lines[i];
    const ln  = clean(raw);
    if (!ln || ln.startsWith('#')) { i++; continue; }

    // ===== Ambil token @tag di baris ini (termasuk jika "inline" di baris header)
    const tagTokens = extractTagTokensFromLine(raw);
    const isHeader = /^\s*(Feature:|Rule:|Background:|Scenario|Example:|Examples:)/i.test(ln);
    if (tagTokens.length > 0) {
      if (isHeader) {
        // Tag ditulis di baris yang sama dengan header → gabungkan & lanjut proses header saat ini
        danglingTags = tagTokens.slice();
      } else {
        // Tag berdiri sendiri di baris terpisah → simpan dan lanjut ke baris berikutnya
        danglingTags = tagTokens.slice();
        i++; continue;
      }
    }

    if (/^\s*Feature:/i.test(ln)) {
      // gabungkan inline tag + dangling
      const inline = extractTagTokensFromLine(raw);
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      if ((danglingTags.length || inline.length)) {
        featureTags = [...new Set([...danglingTags, ...inline])];
        danglingTags = [];
      } else {
        featureTags = [];
      }
      featureBackground = [];
      currentRule = ''; ruleTags = []; ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Rule:/i.test(ln)) {
      const inline = extractTagTokensFromLine(raw);
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = [...new Set([...(danglingTags || []), ...inline])];
      danglingTags = [];
      ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Background:/i.test(ln)) {
      i++;
      if (currentRule) { ruleBackground = []; parseBackgroundBlock(ruleBackground); }
      else { featureBackground = []; parseBackgroundBlock(featureBackground); }
      continue;
    }

    const mSc = ln.match(RE_SC_HEAD);
    if (mSc) {
      const inline = extractTagTokensFromLine(raw);
      const head = mSc[1];
      const name = mSc[2].trim();
      const isOutline = /Outline/i.test(head);
      const type = isOutline ? 'Scenario Outline' : 'Scenario';
      const scTags = [...new Set([...(danglingTags || []), ...inline])];
      danglingTags = [];
      i++;

      const steps = [];
      const examples = [];
      let last = null;

      while (i < lines.length) {
        const raw2 = lines[i];
        const cur2 = clean(raw2);

        // tag di tengah blok (jarang, tapi aman)
        const innerTags = extractTagTokensFromLine(raw2);
        const innerHeader = /^\s*(Feature:|Rule:|Background:|Scenario|Example:|Examples:)/i.test(cur2);
        if (innerTags.length > 0 && !innerHeader) {
          danglingTags = innerTags.slice();
          i++; continue;
        }

        if (/^\s*@/.test(cur2) || /^\s*Feature:/i.test(cur2) || /^\s*Background:/i.test(cur2) || /^\s*Rule:/i.test(cur2) || RE_SC_HEAD.test(cur2)) break;
        if (!cur2 || cur2.startsWith('#')) { i++; continue; }

        if (/^\s*Examples:/i.test(cur2)) {
          i++;
          const rows = [];
          while (i < lines.length) {
            const tRaw = lines[i];
            const t = clean(tRaw);
            if (!t || t.startsWith('#')) { i++; continue; }
            if (/^\s*\|/.test(tRaw)) {
              const cells = tRaw.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
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
              Object.defineProperty(obj, '__hdr', { value: hdr.slice(), enumerable: false });
              examples.push(obj);
            }
          }
          continue;
        }

        if (/^\s*"""/.test(raw2)) { attachDocStringTo(steps); continue; }
        if (/^\s*\|/.test(raw2))  { attachTableRowTo(steps); continue; }

        if (isStep(cur2)) {
          const st = extractStep(cur2, last);
          last = st.keywordBase;
          steps.push(st);
          i++; continue;
        }

        i++;
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

    i++;
  }

  return { feature, scenarios };
}

/* ---------- Mapping ---------- */
const substitute = (t, ex) =>
  ex ? String(t).replace(/<\s*([^>]+)\s*>/g, (_, k) => (k in ex ? ex[k] : `<${k}>`)) : String(t);
const numbered = arr => !arr || arr.length === 0 ? '' : arr.map((s, i) => `${i + 1}. ${s}`).join('\n');

function collectWhenPairsForScenario(scn, ex) {
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
    let m; while ((m = rx.exec(t)) !== null) {
      let rawLabel = (m[1] || '').trim();
      const value = m[2];
      rawLabel = rawLabel.replace(/^(?:with|and|the|a|an|of|as|to|by|for)\s+/i, '').trim();
      rawLabel = rawLabel.replace(/\s+/g, ' ').trim();
      const parts = rawLabel.split(/\s+/).filter(Boolean);
      let label = rawLabel;
      if (parts.length > 2) label = parts.slice(-2).join(' ');
      const valueStr = (value === '') ? '(empty)' : `"${value}"`;
      if (label) pairs.push(`${label} = ${valueStr}`);
    }
  }
  return pairs;
}

function scenariosToRows(scn) {
  const bgGiven = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'given').map(s => s.text);
  const bgWhen  = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'when').map(s => s.text);
  const bgThen  = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'then').map(s => s.text);

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

  const hasExamples = (scn.type === 'Scenario Outline' && (scn.examples || []).length > 0);

  const build = (ex) => {
    const giv = [...bgGiven];
    const wh  = [...bgWhen];
    const th  = [...bgThen];

    let mode = null;
    (scn.steps || []).forEach(st => {
      const txt  = substitute(st.text, ex);
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

    // Test Data
    let baseTD = [];
    if (ex && hasExamples) {
      const hdr = Array.isArray(ex.__hdr) ? ex.__hdr : Object.keys(ex);
      if (hdr.length > 1) {
        for (let i = 1; i < hdr.length; i++) { // skip kolom pertama
          const key = hdr[i];
          const val = ex[key];
          baseTD.push(`${baseTD.length + 1}. ${key} = ${val ? val : '(empty)'}`);
        }
      }
    }
    let addTD = [];
    if (!hasExamples) {
      const whenPairs = collectWhenPairsForScenario(scn, ex);
      addTD = whenPairs.map((pair, idx) => `${baseTD.length + idx + 1}. ${pair}`);
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
  };

  const rows = [];
  if (scn.type === 'Scenario Outline' && (scn.examples || []).length) {
    for (const ex of scn.examples) rows.push(build(ex));
  } else {
    rows.push(build(null));
  }
  return rows;
}

/* ---------- XLSX Writer ---------- */
async function writeMultiSheetXlsx(fileRowsMap, outFile, debug) {
  const toStr = (v) => (v == null ? "" : String(v));

  function classifyFromTokens(tokens, seed = {}) {
    const out = { priority: seed.Priority || seed.priority || '', type: seed.Type || seed.type || '', extras: [] };
    for (const tok of (tokens || [])) {
      const low = String(tok).toLowerCase();
      if (/^@p[0-3]$/.test(low) || ['@critical','@high','@medium','@low','@blocker'].includes(low)) {
        out.priority =
          /^@p[0-3]$/.test(low) ? low.slice(1).toUpperCase() :
          (low === '@critical' ? 'P0' : low === '@high' ? 'P1' : low === '@medium' ? 'P2' : 'P3');
        continue;
      }
      if (low === '@positive' || low === '@negative') {
        out.type = (low === '@positive') ? 'Positive' : 'Negative';
        continue;
      }
      out.extras.push(String(tok).replace(/^@/, '')); // TANPA '@', casing as-is
    }
    return out;
  }

  function normalizeRows(rows) {
    return rows.map(r => {
      const cls = classifyFromTokens(r.__allTagsTokens || [], { priority: r.Priority, type: r.Type });
      return {
        ...r,
        __Priority: cls.priority || r.Priority || '',
        __Type:     cls.type || r.Type || '',
        __Extras:   cls.extras
      };
    });
  }

  function computeMaxExtraTags(normRows) {
    let max = 0;
    for (const r of normRows) if (r.__Extras.length > max) max = r.__Extras.length;
    return max;
  }

  function applyStylingAndFit(ws, headers) {
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
        const val = toStr(cell.value); if (!val) return;
        const width = ws.getColumn(cell.col).width || 10;
        const approx = Math.max(1, Math.floor(width));
        const lines = val.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / approx)), 0);
        if (lines > maxLines) maxLines = lines;
      });
      row.height = Math.min(15 * maxLines, 220);
    });
  }

  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    for (const { sheetName, rows } of fileRowsMap) {
      const normRows = normalizeRows(rows);
      const maxExtras = computeMaxExtraTags(normRows);

      // --- DEBUG state untuk sheet ini ---
      let firstLogged = false;
      function logFirstRowStatus(r, tcid) {
        if (!debug || firstLogged) return;
        firstLogged = true;

        const hasPriority = !!(r.__Priority && String(r.__Priority).trim());
        const hasType     = !!(r.__Type && String(r.__Type).trim());
        const hasRule     = !!(r.Rule && String(r.Rule).trim());
        const hasTags     = Array.isArray(r.__Extras) && r.__Extras.length > 0;

        const ok = hasPriority || hasType || hasRule || hasTags;
        if (ok) {
          console.log(`✅ [GRISE][${sheetName}] Row#1 OK → ${tcid} | Priority=${r.__Priority || '-'} | Type=${r.__Type || '-'} | Rule=${r.Rule || '-'} | Tags(${r.__Extras.length})=${r.__Extras.join(', ')}`);
        } else {
          console.warn(`hasPriority = ${hasPriority}, hasType = ${hasType}, hasRule = ${hasRule}, hasTags = ${hasTags}`)
          console.warn(`⚠️  [GRISE][${sheetName}] Row#1 KOSONG (Priority/Type/Rule/Tags) → ${tcid}`);
          console.warn(`     Hint: cek baris TAG di Feature/Rule/Scenario (karakter tak kasat mata, indent, dsb).`);
        }
      }

      const BASE_HEADERS = [
        'TC_ID','Feature','Type','Priority','Rule','Title',
        'Precondition (Given)','Test Steps (When/And)','Test Data','Expected Result (Then/And)'
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

      for (const r of normRows) {
        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
        const extraCols = Array.from({ length: maxExtras }, (_, i) => r.__Extras[i] || '');
        ws.addRow([
          tcid,
          r.Feature ?? '',
          r.__Type,
          r.__Priority,
          r.Rule ?? '',
          r.Title ?? '',
          r['Precondition (Given)'] ?? '',
          r['Test Steps (When/And)'] ?? '',
          r['Test Data'] ?? '',
          r['Expected Result (Then/And)'] ?? '',
          ...extraCols
        ]);

        // --- DEBUG: log row pertama sheet ---
        logFirstRowStatus(r, tcid);
      }

      applyStylingAndFit(ws, HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
    // ===== Fallback ke xlsx (tanpa styling penuh) =====
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      for (const { sheetName, rows } of fileRowsMap) {
        const normRows = rows.map(r => {
          const cls = (r.__allTagsTokens || []).reduce((acc, tok) => {
            const low = String(tok).toLowerCase();
            if (/^@p[0-3]$/.test(low) || ['@critical','@high','@medium','@low','@blocker'].includes(low)) {
              acc.priority =
                /^@p[0-3]$/.test(low) ? low.slice(1).toUpperCase() :
                (low === '@critical' ? 'P0' : low === '@high' ? 'P1' : low === '@medium' ? 'P2' : 'P3');
            } else if (low === '@positive' || low === '@negative') {
              acc.type = (low === '@positive') ? 'Positive' : 'Negative';
            } else {
              acc.extras.push(String(tok).replace(/^@/, ''));
            }
            return acc;
          }, { priority: r.Priority || '', type: r.Type || '', extras: [] });
          return { ...r, __Priority: cls.priority, __Type: cls.type, __Extras: cls.extras };
        });
        const maxExtras = normRows.reduce((m, r) => Math.max(m, r.__Extras.length), 0);

        // --- DEBUG (fallback): log row pertama normRows ---
        if (debug && normRows.length) {
          const r0 = normRows[0];
          const tcid0 = `${String(sheetName).trim().replace(/\s+/g, '_').toUpperCase()}-001`;
          const ok = (r0.__Priority || r0.__Type || r0.Rule || (r0.__Extras && r0.__Extras.length));
          if (ok) {
            console.log(`✅ [GRISE][${sheetName}] Row#1 OK (xlsx) → ${tcid0} | Priority=${r0.__Priority || '-'} | Type=${r0.__Type || '-'} | Rule=${r0.Rule || '-'} | Tags(${(r0.__Extras||[]).length})=${(r0.__Extras||[]).join(', ')}`);
          } else {
            console.warn(`⚠️  [GRISE][${sheetName}] Row#1 KOSONG (xlsx fallback) → ${tcid0}`);
          }
        }

        const BASE_HEADERS = [
          'TC_ID','Feature','Type','Priority','Rule','Title',
          'Precondition (Given)','Test Steps (When/And)','Test Data','Expected Result (Then/And)'
        ];
        const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag ${i + 1}`);
        const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

        const aoa = [HEADERS];
        const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of normRows) {
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
          const extraCols = Array.from({ length: maxExtras }, (_, i) => r.__Extras[i] || '');
          aoa.push([
            tcid,
            r.Feature ?? '',
            r.__Type,
            r.__Priority,
            r.Rule ?? '',
            r.Title ?? '',
            r['Precondition (Given)'] ?? '',
            r['Test Steps (When/And)'] ?? '',
            r['Test Data'] ?? '',
            r['Expected Result (Then/And)'] ?? '',
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
  const st = fs.statSync(inputPath);
  const inputs = st.isDirectory()
    ? walk(inputPath).filter(f => f.toLowerCase().endsWith('.feature')).map(f => ({ file: f, content: stripInvisibles(stripBOM(fs.readFileSync(f, 'utf8'))) }))
    : [{ file: inputPath, content: stripInvisibles(stripBOM(fs.readFileSync(inputPath, 'utf8'))) }];

  if (inputs.length === 0) {
    console.error('No .feature files found.');
    process.exit(1);
  }

  const fileRowsMap = [];
  const usedNames = new Set();

  for (const { file, content } of inputs) {
    const { scenarios } = parseFeatureFile(content, file);

    let rows = [];
    for (const scn of scenarios) rows = rows.concat(scenariosToRows(scn));

    let base = path.basename(file, '.feature').replace(/[^A-Za-z0-9_\-]+/g, '_');
    if (!base) base = 'Sheet';
    if (base.length > 31) base = base.slice(0, 31);
    let name = base; let k = 2;
    while (usedNames.has(name)) {
      name = (base.slice(0, Math.min(28, base.length)) + '_' + k);
      if (name.length > 31) name = name.slice(0, 31);
      k++;
    }
    usedNames.add(name);

    fileRowsMap.push({ sheetName: name, rows });
  }

  const ok = await writeMultiSheetXlsx(fileRowsMap, outPath, debug);
  if (!ok) process.exit(1);

  console.log(`Wrote Excel (${fileRowsMap.length} sheet): ${outPath}`);
})();