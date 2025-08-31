#!/usr/bin/env node
/**
 * gherkin-ui.cjs
 * Convert Gherkin (.feature) → Excel (.xlsx), 1 sheet per file .feature
 *
 * Kolom: TC_ID, Feature, Type, Priority, Rule, Title,
 *        Precondition (Given), Test Steps (When/And), Test Data,
 *        Expected Result (Then/And), Tag1..TagN (dinamis)
 *
 * Perilaku existing (dipertahankan):
 * - Feature/Rule (dengan Rule-level Background & tags)
 * - Scenario / Scenario Outline (multi-Examples)
 * - Background Feature & Rule → seed kolom:
 *     Given → Precondition, When → Test Steps, Then → Expected Result
 * - Doc string ("""...""") dan data table (|...|) menempel ke step terakhir
 * - Type dari @positive/@negative → "Positive"/"Negative"
 * - Priority dari @P0..@P3 atau @critical/@high/@medium/@low
 * - Tag lain → Tag1..TagN TANPA '@' dan preserve casing as-is
 *
 * Tambahan (permintaan terbaru):
 * - EKSTRAK pasangan label = "nilai" dari SEMUA langkah When (termasuk And/But yang berbasis When),
 *   baik di Background (Feature/Rule) maupun di dalam Scenario/Example.
 *   Nilai "" → (empty). Ditempatkan setelah data dari Examples (bila ada), penomoran berlanjut.
 */

const fs = require('fs');
const path = require('path');

/* ---------- CLI minimal ---------- */
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

/* ---------- FS helpers ---------- */
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
  if (st.isDirectory()) files = walk(input).filter(f => f.toLowerCase().endsWith('.feature'));
  else files = [input];
  return files.map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));
}

/* ---------- Text helpers ---------- */
const STEP_KW = ['Given','When','Then','And','But'];
const kwRe  = /^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;
const clean = s => (s.includes(' #') ? s.slice(0, s.indexOf(' #')) : s).trim();
const isStep = l => STEP_KW.some(k => new RegExp(`^\\s*${k}\\b`).test(l));
const cap1  = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw   = cap1(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

/* ---------- Parser ---------- */
// "Example:" (singular) diperlakukan seperti "Scenario:"
const RE_SC_HEAD = /^\s*(Scenario(?: Outline)?:|Example:)\s*(.+)$/i;

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);

  let feature = '', featureTags = [];
  let featureBackground = [];
  let currentRule = ''; let ruleTags = []; let ruleBackground = [];

  const scenarios = [];
  let danglingTags = [];
  let i = 0;

  function attachDocStringTo(targetArr) {
    const buf = [];
    i++; // sesudah pembuka """
    while (i < lines.length && !/^\s*"""/.test(lines[i])) {
      buf.push(lines[i].replace(/\r$/, ''));
      i++;
    }
    if (i < lines.length) i++; // konsumsi penutup """
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

  function parseBackgroundBlock(targetArr) {
    let last = null;
    while (i < lines.length) {
      const raw = lines[i];
      const cur = clean(raw);
      if (!cur || cur.startsWith('#')) { i++; continue; }
      if (/^\s*(Scenario(?: Outline)?:|Example:|Feature:|Background:|Examples:|Rule:)/i.test(cur)) break;

      if (/^\s*"""/.test(raw)) { attachDocStringTo(targetArr); continue; }
      if (/^\s*\|/.test(raw))  { attachTableRowTo(targetArr); continue; }

      if (isStep(cur)) {
        const st = extractStep(cur, last);
        last = st.keywordBase;
        targetArr.push(st);
        i++; continue;
      }
      i++; // baris non-step lain di-skip
    }
  }

  while (i < lines.length) {
    const raw = lines[i];
    const ln  = clean(raw);
    if (!ln || ln.startsWith('#')) { i++; continue; }

    if (ln.startsWith('@')) { danglingTags = ln.split(/\s+/).filter(Boolean); i++; continue; }

    if (/^\s*Feature:/i.test(ln)) {
      feature = ln.replace(/^\s*Feature:\s*/i, '').trim();
      if (danglingTags.length) { featureTags = danglingTags.slice(); danglingTags = []; }
      currentRule = ''; ruleTags = []; ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Rule:/i.test(ln)) {
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = danglingTags.slice(); danglingTags = [];
      ruleBackground = [];
      i++; continue;
    }

    if (/^\s*Background:/i.test(ln)) {
      i++;
      if (currentRule) parseBackgroundBlock(ruleBackground);
      else parseBackgroundBlock(featureBackground);
      continue;
    }

    const mSc = ln.match(RE_SC_HEAD);
    if (mSc) {
      const head = mSc[1];
      const name = mSc[2].trim();
      const isOutline = /Outline/i.test(head);
      const type = isOutline ? 'Scenario Outline' : 'Scenario';
      const scTags = danglingTags.slice(); danglingTags = [];
      i++;

      const steps = [];
      const examples = [];
      let last = null;

      while (i < lines.length) {
        const raw2 = lines[i];
        const cur2 = clean(raw2);

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

      const effectiveTags = [...(featureTags || []), ...(ruleTags || []), ...(scTags || [])];
      const effectiveBg   = [...(featureBackground || []), ...(ruleBackground || [])];

      scenarios.push({
        file: filename,
        feature,
        featureTags,
        ruleName: currentRule || '',
        ruleTags: ruleTags.slice(),
        tags: scTags,
        type,
        name,
        background: effectiveBg,              // seed kolom
        backgroundRuleOnly: ruleBackground,   // referensi rule BG asli (kalau perlu)
        steps,
        examples
      });
      continue;
    }

    i++;
  }

  return { feature, scenarios };
}

/* ---------- Mapping & Extraction ---------- */
const substitute = (t, ex) =>
  ex ? String(t).replace(/<\s*([^>]+)\s*>/g, (_, k) => (k in ex ? ex[k] : `<${k}>`)) : String(t);

const numbered = arr => !arr || arr.length === 0 ? '' : arr.map((s, i) => `${i + 1}. ${s}`).join('\n');

const TYPE_LABELS = { positive: 'Positive', negative: 'Negative' };

const tagsToPriority = (tags) => {
  const v = (tags || []).map(t => String(t).toLowerCase());
  if (v.includes('@p0') || v.includes('@critical') || v.includes('@blocker')) return 'P0';
  if (v.includes('@p1') || v.includes('@high')) return 'P1';
  if (v.includes('@p2') || v.includes('@medium')) return 'P2';
  if (v.includes('@p3') || v.includes('@low')) return 'P3';
  return '';
};
const tagsToType = (tags) => {
  const v = (tags || []).map(t => String(t).toLowerCase());
  if (v.includes('@negative') || v.includes('negative')) return TYPE_LABELS.negative;
  if (v.includes('@positive') || v.includes('positive')) return TYPE_LABELS.positive;
  return '';
};

/** Cari pasangan label="value" dari teks When (setelah substitusi Examples).
 * - Untuk setiap "..." di teks, label diambil dari kata terakhir yang muncul tepat sebelum kutip.
 * - Jika tak ada label ditemukan, pakai arg1/arg2/...
 */
function labelValuePairsFromWhenText(text) {
  const pairs = [];
  if (!text) return pairs;
  const rx = /"([^"]*)"/g;
  let m, idx = 0;
  while ((m = rx.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    // cari kata terakhir sebelum kutip → huruf/angka/_/- (abaikan spasi/komma/dll)
    const mLabel = before.match(/([A-Za-z0-9_\-]+)\s*$/);
    const label = mLabel ? mLabel[1] : `arg${++idx}`;
    const val = m[1] === '' ? '(empty)' : `"${m[1]}"`;
    pairs.push({ label, val });
  }
  return pairs;
}

/** Ekstrak pasangan label="value" dari SEMUA langkah When (And/But berbasis When) di:
 * - Background (Feature & Rule) yang sudah digabung → scn.background
 * - Steps di dalam Scenario → scn.steps
 */
function extractWhenPairsAllContexts(scn, ex) {
  const res = [];
  const apply = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const st of arr) {
      const base = String(st.keywordBase || '').toLowerCase();
      if (base !== 'when') continue; // hanya When (And/But berbasis When akan punya base 'when')
      const txt = substitute(st.text || '', ex);
      const pairs = labelValuePairsFromWhenText(txt);
      for (const p of pairs) res.push(`${p.label} = ${p.val}`);
    }
  };
  apply(scn.background);
  apply(scn.steps);
  return res;
}

function scenariosToRows(scn) {
  // Seed dari Background (Given/When/Then)
  const bgGiven = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'given').map(s => s.text);
  const bgWhen  = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'when').map(s => s.text);
  const bgThen  = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'then').map(s => s.text);

  const allTagsArr = [...(scn.featureTags || []), ...(scn.ruleTags || []), ...(scn.tags || [])];
  const Priority = tagsToPriority(allTagsArr);
  const Type     = tagsToType(allTagsArr);

  const build = (ex) => {
    const giv = [...bgGiven];
    const wh  = [...bgWhen];
    const th  = [...bgThen];

    // tambahkan langkah Scenario (doc string/table sudah menempel sejak parsing)
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

    // ===== Test Data =====
    // 1) dari Examples (jika ada di Outline)
    const baseTD = ex
      ? Object.entries(ex).map(([k, v], i) => `${i+1}. ${k} = ${v ? v : '(empty)'}`)
      : [];

    // 2) from ALL When (BG + Scenario)
    const whenPairs = extractWhenPairsAllContexts(scn, ex);
    const addTD = whenPairs.map((s, idx) => `${baseTD.length + idx + 1}. ${s}`);

    const testData = [...baseTD, ...addTD].join('\n');

    // raw tags string (gabung, dipakai untuk klasifikasi Priority/Type + render Tag1..N)
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
    rows.push(build(null));
  }
  return rows;
}

/* ---------- XLSX Writer ---------- */
async function writeMultiSheetXlsx(fileRowsMap, outFile) {
  const toStr = (v) => (v == null ? "" : String(v));

  function splitAnnotations(tagStr) {
    return toStr(tagStr).trim().split(/\s+/).filter(t => /^@/.test(t));
  }
  function classifyAnnotations(tagStr, seed = {}) {
    const out = { priority: seed.Priority || seed.priority || '', type: seed.Type || seed.type || '', extras: [] };
    for (const tok of splitAnnotations(tagStr)) {
      const low = tok.toLowerCase();
      if (/^@p[0-3]$/.test(low) || ['@critical','@high','@medium','@low'].includes(low)) {
        out.priority =
          /^@p[0-3]$/.test(low) ? low.slice(1).toUpperCase() :
          (low === '@critical' ? 'P0' : low === '@high' ? 'P1' : low === '@medium' ? 'P2' : 'P3');
        continue;
      }
      if (low === '@positive' || low === '@negative') {
        out.type = (low === '@positive') ? 'Positive' : 'Negative';
        continue;
      }
      out.extras.push(tok); // AS-IS
    }
    return out;
  }

  function computeMaxExtraTags(rows) {
    let max = 0;
    for (const r of rows) {
      const { extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
      if (extras.length > max) max = extras.length;
    }
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
      const maxExtras = computeMaxExtraTags(rows);

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

      for (const r of rows) {
        const { priority, type, extras } = classifyAnnotations(r.Tags, { priority: r.Priority, type: r.Type });
        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
        const extraCols = Array.from({ length: maxExtras }, (_, i) => extras[i] ? String(extras[i]).replace(/^@/, '') : '');
        ws.addRow([
          tcid,
          r.Feature ?? '',
          (type || r.Type || ''),
          (priority || r.Priority || ''),
          r.Rule ?? '',
          r.Title ?? '',
          r['Precondition (Given)'] ?? '',
          r['Test Steps (When/And)'] ?? '',
          r['Test Data'] ?? '',
          r['Expected Result (Then/And)'] ?? '',
          ...extraCols
        ]);
      }

      applyStylingAndFit(ws, HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
    // Fallback ke "xlsx"
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      for (const { sheetName, rows } of fileRowsMap) {
        const maxExtras = (function () {
          let max = 0;
          for (const r of rows) {
            const toks = String(r.Tags || '').trim().split(/\s+/).filter(t => /^@/.test(t));
            const extras = [];
            for (const tok of toks) {
              const low = tok.toLowerCase();
              if (/^@p[0-3]$/.test(low) || ['@critical','@high','@medium','@low'].includes(low)) continue;
              if (low === '@positive' || low === '@negative') continue;
              extras.push(tok);
            }
            if (extras.length > max) max = extras.length;
          }
          return max;
        })();

        const BASE_HEADERS = [
          'TC_ID','Feature','Type','Priority','Rule','Title',
          'Precondition (Given)','Test Steps (When/And)','Test Data','Expected Result (Then/And)'
        ];
        const TAG_HEADERS = Array.from({ length: maxExtras }, (_, i) => `Tag ${i + 1}`);
        const HEADERS = [...BASE_HEADERS, ...TAG_HEADERS];

        const aoa = [HEADERS];
        const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of rows) {
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
          const extraCols = (function (tagStr) {
            const toks = String(tagStr || '').trim().split(/\s+/).filter(t => /^@/.test(t));
            const extras = [];
            for (const tok of toks) {
              const low = tok.toLowerCase();
              if (/^@p[0-3]$/.test(low) || ['@critical','@high','@medium','@low'].includes(low)) continue;
              if (low === '@positive' || low === '@negative') continue;
              extras.push(String(tok).replace(/^@/, ''));
            }
            return Array.from({ length: maxExtras }, (_, i) => extras[i] || '');
          })(r.Tags);

          aoa.push([
            tcid,
            r.Feature ?? '',
            r.Type ?? '',
            r.Priority ?? '',
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

    // nama sheet dari nama file (<=31 char, unik)
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

  const ok = await writeMultiSheetXlsx(fileRowsMap, outPath);
  if (!ok) process.exit(1);

  console.log(`Wrote Excel (${fileRowsMap.length} sheet): ${outPath}`);
})();
