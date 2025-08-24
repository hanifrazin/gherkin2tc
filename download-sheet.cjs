#!/usr/bin/env node
/**
 * download-sheet.cjs
 * Ambil JSON AoA dari Google Apps Script Web App → simpan sebagai Excel (.xlsx)
 *
 * CLI:
 *   --cred <path>          : path credentials JSON (webAppUrl, token, defaultSheetName, method, outDir, autoName, filenamePrefix, filenameSuffix, renameSheetTo)
 *   --url <webapp_url>     : override URL dari credentials
 *   --token <secret>       : override token dari credentials
 *   --method GET|POST      : default GET
 *   --sheet <name>         : nama sheet sumber (dikirim ke Web App dan dipakai untuk nama file)
 *   --rename-sheet <name>  : judul tab di XLSX (opsional)
 *   --out <file.xlsx>      : path output final (override auto naming)
 *   --out-dir <dir>        : folder output (dipakai jika --out tidak diberikan)
 *   --prefix <txt>         : prefix nama file (dipakai jika --out tidak diberikan)
 *   --suffix <txt>         : suffix nama file (dipakai jika --out tidak diberikan)
 *   --auto-name            : paksa penamaan otomatis <prefix><sheet><suffix>.xlsx
 *   --timeout <ms>         : default 30000
 *
 * Contoh:
 *   node download-sheet.cjs --cred ./credentials.local.json
 *   node download-sheet.cjs --cred ./credentials.local.json --sheet "Sheet2"
 *   node download-sheet.cjs --url "https://.../exec" --token "..." --sheet "Billing" --out-dir "/Users/user/Desktop/gherkin2tc/data-test" --prefix "TC-" --suffix "-QA"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ExcelJS = require('exceljs');

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);
function getArg(name, alias) {
  const i1 = argv.indexOf(`--${name}`);
  const i2 = alias ? argv.indexOf(`-${alias}`) : -1;
  const idx = i1 !== -1 ? i1 : i2;
  return idx !== -1 ? argv[idx + 1] : null;
}
function hasFlag(name) { return argv.includes(`--${name}`); }

// CLI args
const CRED_PATH   = getArg('cred');
let WEBAPP_URL    = getArg('url')   || process.env.GS_APPS_URL   || null;
let TOKEN         = getArg('token') || process.env.GS_APPS_TOKEN || null;
let METHOD        = (getArg('method') || 'GET').toUpperCase();
let SHEET_NAME    = getArg('sheet') || null;                // nama sheet sumber
let RENAME_SHEET  = getArg('rename-sheet') || null;         // judul tab di XLSX
let OUT_PATH      = getArg('out') || null;                  // path final (override auto naming)
let OUT_DIR       = getArg('out-dir') || null;              // folder output
let FILE_PREFIX   = getArg('prefix') || null;               // prefix file
let FILE_SUFFIX   = getArg('suffix') || null;               // suffix file
let FORCE_AUTONAME= hasFlag('auto-name');                   // paksa autoName
const TIMEOUT     = parseInt(getArg('timeout') || '30000', 10);

// ---------- Load credentials (opsional) ----------
if (CRED_PATH) {
  const full = path.resolve(process.cwd(), CRED_PATH);
  if (!fs.existsSync(full)) {
    console.error(`❌ Credential file not found: ${full}`);
    process.exit(1);
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(full, 'utf8'));

    WEBAPP_URL   = WEBAPP_URL   || cfg.webAppUrl || cfg.url || cfg.WEBAPP_URL;
    TOKEN        = TOKEN        || cfg.token || cfg.SHARED_TOKEN || cfg.sharedToken;
    METHOD       = (cfg.method || METHOD || 'GET').toUpperCase();
    SHEET_NAME   = SHEET_NAME   || cfg.defaultSheetName || cfg.sheetName || cfg.SHEET_NAME || 'Sheet1';

    // output config
    OUT_DIR      = OUT_DIR      || cfg.outDir || null;
    const auto   = (typeof cfg.autoName === 'boolean') ? cfg.autoName : undefined;
    if (auto !== undefined && !FORCE_AUTONAME) FORCE_AUTONAME = auto;
    FILE_PREFIX  = FILE_PREFIX  ?? (cfg.filenamePrefix ?? '');
    FILE_SUFFIX  = FILE_SUFFIX  ?? (cfg.filenameSuffix ?? '');
    RENAME_SHEET = RENAME_SHEET || cfg.renameSheetTo || null;

    if (!OUT_PATH && cfg.defaultOut) OUT_PATH = cfg.defaultOut;

  } catch (e) {
    console.error('❌ Failed to parse credential JSON:', e.message);
    process.exit(1);
  }
}

// fallback minimum
SHEET_NAME = SHEET_NAME || 'Sheet1';

// ---------- Tentukan path output ----------
function sanitizeFilename(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'Sheet';
}

let finalOut = OUT_PATH;
if (!finalOut) {
  const baseName = sanitizeFilename(SHEET_NAME);
  const prefix   = (FILE_PREFIX ?? '');
  const suffix   = (FILE_SUFFIX ?? '');
  const fileName = `${prefix}${baseName}${suffix}.xlsx`;
  const dir      = OUT_DIR || path.join(process.cwd(), 'output');
  finalOut       = path.join(dir, fileName);
}

// ---------- HTTP JSON fetch (with redirects) ----------
function requestJson(url, { method = 'GET', timeout = 30000, token, sheetName } = {}, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));

    const u = new URL(url);

    // Tambah query param (GET) hanya jika belum ada
    if (method === 'GET') {
      if (token && !u.searchParams.has('token')) u.searchParams.set('token', token);
      if (sheetName && !u.searchParams.has('sheet')) u.searchParams.set('sheet', sheetName);
    }

    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;

    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout
    };

    // Kirim token juga via header (fleksibel)
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    // Siapkan body POST kalau perlu
    let postBody = null;
    if (method === 'POST') {
      const bodyObj = {};
      if (token) bodyObj.token = token;
      if (sheetName) bodyObj.sheet = sheetName; // download via POST mendukung {sheet}
      postBody = JSON.stringify(bodyObj);
      opts.headers['Content-Length'] = Buffer.byteLength(postBody);
    }

    const req = lib.request(opts, (res) => {
      // Handle redirect 3xx
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error(`Redirect ${res.statusCode} tanpa Location header`));

        // Apps Script sering 302/303 → switch ke GET
        let nextMethod = method;
        if ([301, 302, 303].includes(res.statusCode)) nextMethod = 'GET';

        const nextUrl = new URL(loc, `${u.protocol}//${u.host}`).toString();
        return resolve(
          requestJson(
            nextUrl,
            { method: nextMethod, timeout, token, sheetName },
            redirectsLeft - 1
          )
        );
      }

      // Bukan redirect → kumpulkan body
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (ch) => { buf += ch; });
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

    if (postBody) req.write(postBody);
    req.end();
  });
}

// ---------- Excel writer ----------
async function writeXlsx(aoa, outPath, sheetTitle) {
  if (!Array.isArray(aoa) || (aoa.length && !Array.isArray(aoa[0]))) {
    throw new Error('Payload must be an Array of Arrays (AoA)');
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle || 'Sheet1');

  aoa.forEach(row => ws.addRow(row));

  // Wrap + auto-fit sederhana
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

// ---------- Main ----------
(async () => {
  try {
    if (!WEBAPP_URL) {
      console.error('❌ Web App URL is required. Set via --url or credentials JSON (webAppUrl).');
      process.exit(1);
    }

    console.log('➡️  URL     :', WEBAPP_URL);
    console.log('➡️  Method  :', METHOD);
    console.log('➡️  Source  :', SHEET_NAME);
    console.log('➡️  TabName :', RENAME_SHEET ? `${RENAME_SHEET} (renamed)` : SHEET_NAME);
    console.log('➡️  OutFile :', finalOut);

    const aoa = await requestJson(WEBAPP_URL, {
      method: METHOD,
      timeout: TIMEOUT,
      token: TOKEN,
      sheetName: SHEET_NAME,
    });

    const tabTitle = sanitizeFilename(RENAME_SHEET || SHEET_NAME).slice(0, 31); // Excel limit 31 chars
    await writeXlsx(aoa, finalOut, tabTitle);

    console.log(`✅ Saved Excel: ${finalOut}`);
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
})();