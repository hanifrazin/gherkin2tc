#!/usr/bin/env node
/**
 * download-sheet.cjs — Ambil data (AoA JSON) dari Google Apps Script Web App → simpan Excel (.xlsx)
 *
 * Fitur:
 * - Argumen CLI --sheet selalu meng-override defaultSheetName dari credentials
 * - Kirim 'sheet' dan 'sheetName' ke Web App (GET: query, POST: body)
 * - Auto follow redirect (301/302/303/307/308)
 * - Log singkat URL (tanpa token) agar mudah debug
 * - Tulis Excel via exceljs (auto wrap & auto width sederhana)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ExcelJS = require('exceljs');

/* -------------------- CLI PARSER -------------------- */
const argv = process.argv.slice(2);
function arg(name, alias) {
  const i1 = argv.indexOf(`--${name}`), i2 = alias ? argv.indexOf(`-${alias}`) : -1;
  const i = i1 !== -1 ? i1 : i2;
  return i !== -1 ? argv[i + 1] : null;
}
function flag(name){ return argv.includes(`--${name}`); }

const CRED_PATH    = arg('cred');                 // path credentials JSON
let   WEBAPP_URL   = arg('url')   || process.env.GS_APPS_URL   || null;
let   TOKEN        = arg('token') || process.env.GS_APPS_TOKEN || null;
let   METHOD       = (arg('method') || 'GET').toUpperCase();

// ⬇ CLI_SHEET ditangkap DULU; nanti di akhir credential load kita pastikan CLI menang
const CLI_SHEET    = arg('sheet');
let   SHEET_NAME   = CLI_SHEET || null;

let   RENAME_SHEET = arg('rename-sheet') || null;
let   OUT_PATH     = arg('out') || null;
let   OUT_DIR      = arg('out-dir') || null;
let   FILE_PREFIX  = arg('prefix') || '';
let   FILE_SUFFIX  = arg('suffix') || '';
let   FORCE_AUTONAME = flag('auto-name');
const TIMEOUT      = parseInt(arg('timeout') || '30000', 10);

/* -------------------- LOAD CREDENTIALS -------------------- */
if (CRED_PATH) {
  const full = path.resolve(process.cwd(), CRED_PATH);
  if (!fs.existsSync(full)) {
    console.error(`❌ Credential not found: ${full}`);
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    console.error('❌ Failed to parse credential JSON:', e.message);
    process.exit(1);
  }

  WEBAPP_URL   = WEBAPP_URL || cfg.webAppUrl || cfg.url || cfg.WEBAPP_URL;
  TOKEN        = TOKEN      || cfg.token || cfg.SHARED_TOKEN || cfg.sharedToken;
  METHOD       = (cfg.method || METHOD || 'GET').toUpperCase();

  // 👉 JANGAN menimpa SHEET_NAME kalau CLI_SHEET ada.
  if (!SHEET_NAME) {
    SHEET_NAME = cfg.defaultSheetName || cfg.sheetName || cfg.SHEET_NAME || 'Sheet1';
  }

  OUT_DIR      = OUT_DIR    || cfg.outDir || null;
  if (typeof cfg.autoName === 'boolean' && !FORCE_AUTONAME) FORCE_AUTONAME = cfg.autoName;
  FILE_PREFIX  = FILE_PREFIX || (cfg.filenamePrefix || '');
  FILE_SUFFIX  = FILE_SUFFIX || (cfg.filenameSuffix || '');
  RENAME_SHEET = RENAME_SHEET || cfg.renameSheetTo || null;
  if (!OUT_PATH && cfg.defaultOut) OUT_PATH = cfg.defaultOut;
}

// ✅ Override terakhir: CLI selalu menang
if (CLI_SHEET && CLI_SHEET.trim()) SHEET_NAME = CLI_SHEET.trim();

// fallback final
SHEET_NAME = SHEET_NAME || 'Sheet1';

/* -------------------- OUTPUT NAMING -------------------- */
function sanitizeFilename(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0,120) || 'Sheet';
}

let finalOut = OUT_PATH;
if (!finalOut) {
  const base = sanitizeFilename(SHEET_NAME);
  const dir  = OUT_DIR || path.join(process.cwd(), 'output');
  finalOut   = path.join(dir, `${FILE_PREFIX}${base}${FILE_SUFFIX}.xlsx`);
}

/* -------------------- HTTP REQUEST (FOLLOW REDIRECT) -------------------- */
function requestJson(url, { method='GET', timeout=30000, token, sheetName } = {}, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
    const u = new URL(url);

    // GET → tambahkan query token + sheet + sheetName
    if (method === 'GET') {
      if (sheetName) {
        u.searchParams.set('sheet', sheetName);
        u.searchParams.set('sheetName', sheetName);
      }
      if (token) u.searchParams.set('token', token);
      u.searchParams.set('_t', Date.now().toString()); // cache buster
    }

    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout
    };

    // Authorization header (optional, biar fleksibel)
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    // POST body → kirim token + sheet + sheetName
    let body = null;
    if (method === 'POST') {
      const payload = {};
      if (token) payload.token = token;
      if (sheetName) { payload.sheet = sheetName; payload.sheetName = sheetName; }
      body = JSON.stringify(payload);
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    // Log aman (hapus token dari URL)
    const safeUrl = new URL(u.toString());
    safeUrl.searchParams.delete('token');
    console.log('➡️  URL     :', safeUrl.toString());
    console.log('➡️  Method  :', method);
    console.log('➡️  Source  :', sheetName);

    const req = lib.request(opts, (res) => {
      // Redirect?
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect ${res.statusCode} tanpa Location header`));
        const nextMethod = [301, 302, 303].includes(res.statusCode) ? 'GET' : method; // Apps Script sering 302/303 → GET
        const nextUrl = new URL(loc, `${u.protocol}//${u.host}`).toString();
        return resolve(
          requestJson(nextUrl, { method: nextMethod, timeout, token, sheetName }, redirectsLeft - 1)
        );
      }

      let buf = '';
      res.setEncoding('utf8');
      res.on('data', ch => { buf += ch; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        }
        try {
          const data = JSON.parse(buf);
          resolve(data);
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${e.message}\nBody: ${buf.slice(0, 500)}...`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));

    if (body) req.write(body);
    req.end();
  });
}

/* -------------------- EXCEL WRITER -------------------- */
async function writeXlsx(aoa, outPath, sheetTitle) {
  if (!Array.isArray(aoa) || (aoa.length && !Array.isArray(aoa[0]))) {
    throw new Error('Payload must be Array-of-Arrays (AoA)');
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle || 'Sheet1');

  aoa.forEach(row => ws.addRow(row));

  // styling ringan
  ws.eachRow(r => r.eachCell(c => c.alignment = { wrapText: true, vertical: 'top' }));
  ws.columns.forEach((col, i) => {
    let max = 10;
    ws.getColumn(i + 1).eachCell({ includeEmpty: true }, cell => {
      const v = cell.value == null ? '' : String(cell.value);
      const longest = v.split('\n').reduce((m, s) => Math.max(m, s.length), 0);
      if (longest > max) max = longest;
    });
    col.width = Math.min(Math.max(max + 2, 10), 80);
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
}

/* -------------------- MAIN -------------------- */
(async () => {
  try {
    if (!WEBAPP_URL) {
      console.error('❌ webAppUrl is required (via --url or credentials).');
      process.exit(1);
    }

    // log asal sheet (untuk verifikasi CLI override)
    console.log('➡️  Sheet in use :', SHEET_NAME, CLI_SHEET ? '(from CLI)' : '(from credentials)');

    const tabTitle = sanitizeFilename(RENAME_SHEET || SHEET_NAME).slice(0, 31);
    const aoa = await requestJson(
      WEBAPP_URL,
      { method: METHOD, timeout: TIMEOUT, token: TOKEN, sheetName: SHEET_NAME }
    );

    // Jika Apps Script mengembalikan { error: "..." }
    if (aoa && !Array.isArray(aoa) && aoa.error) {
      throw new Error(String(aoa.error));
    }

    console.log('➡️  OutFile :', finalOut);
    await writeXlsx(aoa, finalOut, tabTitle);
    console.log(`✅ Saved Excel: ${finalOut}`);

  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
})();