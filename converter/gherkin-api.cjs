#!/usr/bin/env node
/**
 * gherkin-api.cjs
 * Convert Gherkin API (.feature) → Excel (.xlsx) dengan kolom API-friendly:
 * TC_ID | Priority | Type | Rule | Title | Method | Endpoint | Preconditions | Headers | Body Params | Steps | Expected Status | Assertions | Test Data
 *
 * Fitur:
 * - Parsing Feature/Rule/Background/Scenario/Scenario Outline/Examples (juga "Example:" singular).
 * - Background Feature + Background Rule disatukan (Given → Preconditions; When → Steps).
 * - Headers diringkas dari data table key/value (Auth, Content-Type, Accept, Tenant, Idempotency, Signature, Timestamp, Trace).
 * - Body Params diringkas dari doc string JSON (top-level keys) atau pola label "nilai".
 * - Expected Status dari Then: `I get status "<code>"`.
 * - Assertions dari:
 *     * table "response JSON path equals" → path=expected (maks 5 item)
 *     * step "error JSON contains code "<code>" and message "<message>""
 *     * doc string sample response → "sample provided"
 * - Examples → Test Data (skip kolom pertama; jika hanya 1 kolom → kosong).
 */

const fs = require('fs');
const path = require('path');

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin-api.cjs <file.feature|dir> -o <out.xlsx> [--xlsx]');
  process.exit(1);
}

let inputPath = null;
let outPath = 'api-testcases.xlsx'; // nama file default (hanya nama, tanpa folder)
let forceXlsx = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('-') && !inputPath) inputPath = a;
  if ((a === '-o' || a === '--out') && args[i + 1]) outPath = args[i + 1];
  if (a === '--xlsx') forceXlsx = true;
}
if (!inputPath) {
  console.error('Error: input path is required.');
  process.exit(1);
}

/* ---------- Output folder policy ---------- */
/**
 * Semua hasil konversi HARUS ditaruh ke folder ini.
 * Jika belum ada → dibuat otomatis.
 * Jika user kasih -o <path/namafile.xlsx>, kita ambil basename-nya saja,
 * lalu simpan ke dalam folder ini.
 */
const OUT_DIR = path.resolve(process.cwd(), 'output-testcase-api');

function ensureOutDir() {
  try {
    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('Gagal membuat folder output:', OUT_DIR);
    console.error(e.message);
    process.exit(1);
  }
}

/** Normalisasi nama file output: selalu taruh di OUT_DIR */
function resolveOutFileName(requested) {
  const base = path.basename(requested || 'api-testcases.xlsx');
  return path.join(OUT_DIR, base);
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
const toStr = (v) => (v == null ? "" : String(v));

function extractStep(line, lastBase) {
  const m = line.match(kwRe);
  if (!m) return { keyword: '', keywordBase: lastBase || 'Given', text: line.trim() };
  const kw   = cap1(m[1]);
  const base = (kw === 'And' || kw === 'But') ? (lastBase || 'Given') : kw;
  return { keyword: kw, keywordBase: base, text: (m[2] || '').trim() };
}

/* ---------- Parser (Feature/Rule/Background/Scenario/Outline/Examples) ---------- */
const RE_SC_HEAD = /^\s*(Scenario(?: Outline)?:|Example:)\s*(.+)$/i;

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);

  let feature = '', featureTags = [];
  let featureBg = [];
  let currentRule = ''; let ruleTags = []; let ruleBg = [];

  const scenarios = [];
  let danglingTags = [];
  let i = 0;

  function attachDocStringTo(targetArr) {
    const buf = [];
    i++; // skip opening """
    while (i < lines.length && !/^\s*"""/.test(lines[i])) {
      buf.push(lines[i].replace(/\r$/, ''));
      i++;
    }
    if (i < lines.length) i++; // closing """
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
      i++;
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
      currentRule = ''; ruleTags = []; ruleBg = [];
      i++; continue;
    }

    if (/^\s*Rule:/i.test(ln)) {
      currentRule = ln.replace(/^\s*Rule:\s*/i, '').trim();
      ruleTags = danglingTags.slice(); danglingTags = [];
      ruleBg = [];
      i++; continue;
    }

    if (/^\s*Background:/i.test(ln)) {
      i++;
      if (currentRule) parseBackgroundBlock(ruleBg);
      else parseBackgroundBlock(featureBg);
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
              Object.defineProperty(obj, '__hdr', { value: hdr.slice(), enumerable: false, writable: false });
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
      const effectiveBg   = [...(featureBg || []), ...(ruleBg || [])];

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
        examples
      });
      continue;
    }

    i++;
  }

  return { feature, scenarios };
}

/* ---------- Tag helpers ---------- */
const TYPE_LABELS = { positive: 'Positive', negative: 'Negative' };
function tagsToPriority(tags) {
  const v = (tags || []).map(t => String(t).toLowerCase());
  if (v.includes('@p0') || v.includes('@critical') || v.includes('@blocker')) return 'P0';
  if (v.includes('@p1') || v.includes('@high')) return 'P1';
  if (v.includes('@p2') || v.includes('@medium')) return 'P2';
  if (v.includes('@p3') || v.includes('@low')) return 'P3';
  return '';
}
function tagsToType(tags) {
  const v = (tags || []).map(t => String(t).toLowerCase());
  if (v.includes('@negative') || v.includes('negative')) return TYPE_LABELS.negative;
  if (v.includes('@positive') || v.includes('positive')) return TYPE_LABELS.positive;
  return '';
}

/* ---------- API-specific helpers ---------- */
function summarizeHeadersFromText(stepText) {
  // ringkas tabel headers "| key | value |"
  const keys = [];
  const lines = String(stepText || '').split('\n');
  for (const ln of lines) {
    const m = ln.match(/^\s*\|\s*([^|]+)\s*\|\s*([^|]*)\|\s*$/);
    if (m) keys.push(m[1].trim());
  }
  if (keys.length === 0) return '';
  const norm = keys.map(k => k.toLowerCase());
  const flags = [];
  const pushIf = (cond, label) => { if (cond) flags.push(label); };

  pushIf(norm.some(k => k.includes('authorization')), 'Auth');
  pushIf(norm.includes('content-type'), 'Content-Type');
  pushIf(norm.includes('accept'), 'Accept');
  pushIf(norm.includes('x-tenant'), 'Tenant');
  pushIf(norm.includes('x-idempotency-key'), 'Idempotency');
  pushIf(norm.includes('x-signature'), 'Signature');
  pushIf(norm.includes('x-timestamp'), 'Timestamp');
  pushIf(norm.includes('x-request-trace'), 'Trace');

  if (flags.length === 0) return keys.slice(0, 4).join(', ');
  return flags.join(', ');
}

function extractMethodEndpoint(whenText) {
  const m = String(whenText || '').match(/\b(GET|POST|PUT|PATCH|DELETE)\b\s+"([^"]+)"/i);
  if (!m) return { method: '', endpoint: '' };
  return { method: m[1].toUpperCase(), endpoint: m[2] };
}

function summarizeBodyParams(stepText) {
  // ambil doc string JSON → top-level keys; fallback pola label "value"
  const txt = String(stepText || '');
  const m = txt.match(/"""([\s\S]*?)"""/);
  if (!m) {
    const params = [];
    const rx = /([A-Za-z0-9_\-\s]+?)\s*"[^"]*"/g;
    let mm;
    while ((mm = rx.exec(txt)) !== null) {
      const label = (mm[1] || '').trim().replace(/\s+/g, ' ');
      if (label) params.push(label);
    }
    return params.length ? params.slice(0, 8).join(', ') : '';
  }
  const json = m[1];
  try {
    const obj = JSON.parse(json);
    const keys = Object.keys(obj);
    return keys.slice(0, 10).join(', ');
  } catch {
    return 'payload sample';
  }
}

function summarizeAssertions(thenStepsText) {
  const lines = String(thenStepsText || '').split('\n');
  const items = [];
  let tableRows = [];
  let inDoc = false;

  for (const ln of lines) {
    if (/^\s*"""/.test(ln)) {
      inDoc = !inDoc;
      if (!inDoc) items.push('sample provided');
      continue;
    }
    if (inDoc) continue;

    const mRow = ln.match(/^\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*$/);
    if (mRow) {
      tableRows.push({ path: mRow[1].trim(), expected: mRow[2].trim() });
      continue;
    }

    const mErr = ln.match(/error JSON contains code\s+"([^"]+)"\s+and message\s+"([^"]+)"/i);
    if (mErr) items.push(`code=${mErr[1]}, message=${mErr[2]}`);
  }

  if (tableRows.length) {
    for (const r of tableRows.slice(0, 5)) items.push(`${r.path}=${r.expected}`);
  }
  return items.join('; ');
}

function findExpectedStatus(thenStepsText) {
  const m = String(thenStepsText || '').match(/I get status\s+"?(\d{3})"?/i);
  return m ? m[1] : '';
}

/* ---------- Build rows ---------- */
function scenariosToRows(scn) {
  const allTags = [...(scn.featureTags || []), ...(scn.ruleTags || []), ...(scn.tags || [])];
  const Priority = tagsToPriority(allTags);
  const Type     = tagsToType(allTags);
  const Rule     = scn.ruleName || '';
  const Title    = scn.name || '';

  // Background (Given → Preconditions; When → Steps)
  const bgGiven = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'given').map(s => s.text);
  const bgWhen  = (scn.background || []).filter(s => (s.keywordBase || '').toLowerCase() === 'when').map(s => s.text);

  function buildOne(ex) {
    const giv = [...bgGiven];
    const wh  = [...bgWhen];
    const th  = [];

    let last = null;
    (scn.steps || []).forEach(st => {
      const base = (st.keywordBase || '').toLowerCase();
      const text = st.text;
      if (base === 'given') { last = 'given'; giv.push(text); }
      else if (base === 'when') { last = 'when'; wh.push(text); }
      else if (base === 'then') { last = 'then'; th.push(text); }
      else {
        if (last === 'given') giv.push(text);
        else if (last === 'then') th.push(text);
        else wh.push(text);
      }
    });

    // Preconditions ringkas
    const Preconditions = (() => {
      const highlights = [];
      for (const t of giv) {
        if (/default currency/i.test(t)) highlights.push('default currency set');
        if (/idempotency/i.test(t)) highlights.push('idempotency key set');
        if (/base URL/i.test(t)) highlights.push('base URL');
        if (/headers?/i.test(t) && /\|/.test(t)) {
          const sum = summarizeHeadersFromText(t);
          if (sum) highlights.push(`headers: ${sum}`);
        }
      }
      return highlights.length ? Array.from(new Set(highlights)).join('; ') : (giv.length ? `${giv.length} item(s)` : '');
    })();

    // Method/Endpoint dari When pertama
    let Method = '', Endpoint = '';
    for (const t of wh) {
      const p = extractMethodEndpoint(t);
      if (p.method && p.endpoint) { Method = p.method; Endpoint = p.endpoint; break; }
    }

    // Headers ringkas (cari di Given/When)
    let Headers = '';
    for (const t of [...giv, ...wh]) {
      if (/headers?/i.test(t) && /\|/.test(t)) {
        Headers = summarizeHeadersFromText(t);
        if (Headers) break;
      }
    }

    // Body Params ringkas dari When yang punya body
    let BodyParams = '';
    for (const t of wh) {
      if (/with JSON body/i.test(t) || /with body/i.test(t)) {
        BodyParams = summarizeBodyParams(t);
        if (BodyParams) break;
      }
    }

    // Steps ringkas
    const Steps = (() => {
      if (Method && Endpoint) return `1) ${Method} ${Endpoint}`;
      return wh.length ? `1) ${wh[0].split('\n')[0]}` : '';
    })();

    // Expected Status & Assertions
    const thenText = th.join('\n');
    const ExpectedStatus = findExpectedStatus(thenText);
    const Assertions = summarizeAssertions(thenText);

    // Test Data dari Examples (skip kolom pertama)
    const TestData = (() => {
      if (!ex) return '';
      const hdr = Array.isArray(ex.__hdr) ? ex.__hdr : Object.keys(ex);
      if (hdr.length <= 1) return ''; // 1 kolom → kosong
      const out = [];
      for (let i = 1; i < hdr.length; i++) {
        const k = hdr[i], v = ex[k];
        out.push(`${k}=${v ? v : 'empty'}`);
      }
      return out.join('; ');
    })();

    return {
      Priority, Type, Rule, Title,
      Method, Endpoint,
      Preconditions,
      Headers,
      'Body Params': BodyParams,
      Steps,
      'Expected Status': ExpectedStatus,
      Assertions,
      'Test Data': TestData
    };
  }

  const rows = [];
  if (scn.type === 'Scenario Outline' && (scn.examples || []).length) {
    for (const ex of scn.examples) rows.push(buildOne(ex));
  } else {
    rows.push(buildOne(null));
  }
  return rows;
}

/* ---------- XLSX writer ---------- */
async function writeXlsx(fileRowsMap, outFile) {
  const BASE_HEADERS = [
    'TC_ID','Priority','Type','Rule','Title',
    'Method','Endpoint','Preconditions','Headers','Body Params',
    'Steps','Expected Status','Assertions','Test Data'
  ];

  function applyFit(ws, headers) {
    ws.eachRow(row => row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; }));
    ws.columns.forEach((col, idx) => {
      let max = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const val = toStr(cell.value);
        if (!val) return;
        const longest = val.split('\n').reduce((m, line) => Math.max(m, line.length), 0);
        if (longest > max) max = longest;
      });
      col.width = Math.min(Math.max(max + 2, 12), 80);
    });
    ws.eachRow(row => {
      let maxLines = 1;
      row.eachCell(cell => {
        const val = toStr(cell.value); if (!val) return;
        const width = ws.getColumn(cell.col).width || 12;
        const approx = Math.max(1, Math.floor(width));
        const lines = val.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / approx)), 0);
        if (lines > maxLines) maxLines = lines;
      });
      row.height = Math.min(15 * maxLines, 220);
    });
  }

  // Prefer exceljs; fallback ke xlsx
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    for (const { sheetName, rows } of fileRowsMap) {
      const ws = wb.addWorksheet(sheetName, {
        properties: { defaultRowHeight: 18 },
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
      });
      ws.addRow(BASE_HEADERS);
      BASE_HEADERS.forEach((_, idx) => {
        const c = ws.getRow(1).getCell(idx + 1);
        c.font = { bold: true };
        c.alignment = { vertical: 'top', wrapText: true };
      });

      const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
      let counter = 1;

      for (const r of rows) {
        const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
        ws.addRow([
          tcid,
          r.Priority || '',
          r.Type || '',
          r.Rule || '',
          r.Title || '',
          r.Method || '',
          r.Endpoint || '',
          r.Preconditions || '',
          r.Headers || '',
          r['Body Params'] || '',
          r.Steps || '',
          r['Expected Status'] || '',
          r.Assertions || '',
          r['Test Data'] || ''
        ]);
      }

      applyFit(ws, BASE_HEADERS);
    }

    await wb.xlsx.writeFile(outFile);
    return true;

  } catch (e) {
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      for (const { sheetName, rows } of fileRowsMap) {
        const aoa = [BASE_HEADERS];
        const prefix = String(sheetName).trim().replace(/\s+/g, '_').toUpperCase();
        let counter = 1;

        for (const r of rows) {
          const tcid = `${prefix}-${String(counter).padStart(3, '0')}`; counter++;
          aoa.push([
            tcid,
            r.Priority || '',
            r.Type || '',
            r.Rule || '',
            r.Title || '',
            r.Method || '',
            r.Endpoint || '',
            r.Preconditions || '',
            r.Headers || '',
            r['Body Params'] || '',
            r.Steps || '',
            r['Expected Status'] || '',
            r.Assertions || '',
            r['Test Data'] || ''
          ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      XLSX.writeFile(wb, outFile);
      console.warn('Note: fallback ke "xlsx"; autofit terbatas.');
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
  // pastikan folder output ada
  ensureOutDir();

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

  // Selalu taruh hasil di folder output-testcase-api
  const finalOutFile = resolveOutFileName(outPath);

  const ok = await writeXlsx(fileRowsMap, finalOutFile);
  if (!ok) process.exit(1);

  console.log(`Wrote Excel (${fileRowsMap.length} sheet): ${finalOutFile}`);
})();