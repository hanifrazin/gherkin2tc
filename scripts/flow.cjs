#!/usr/bin/env node
/**
 * flow.cjs (robust, cross-platform)
 * Orchestrates:
 *   1) download-sheet.cjs --cred ./credentials.json --sheet <NAME>
 *   2) pile -i outputs/flow-data/<NAME>.xlsx   (fallback: node src/cli/command-pile.js)
 *
 * Accepts sheet name with spaces via:
 *   npm run flow -- "Product Bank"
 *   node scripts/flow.cjs -- "Product Bank"
 *   node scripts/flow.cjs --sheet "Product Bank"
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { printSuccess, printError, printWarn, printInfo } = require('../src/cli/colorize.cjs');

const argv = process.argv.slice(2);

function parseSheetArg(args) {
  // 1) All args after a bare "--" are considered part of the sheet name → join with spaces
  const dd = args.indexOf('--');
  if (dd !== -1) {
    const parts = args.slice(dd + 1).filter(Boolean);
    const joined = parts.join(' ').trim();
    if (joined) return joined;
  }
  // 2) Look for --sheet and join successive tokens that are not options (don't start with -)
  const i = args.indexOf('--sheet');
  if (i !== -1) {
    const rest = args.slice(i + 1);
    const buf = [];
    for (const tok of rest) {
      if (tok.startsWith('-')) break;
      buf.push(tok);
    }
    const joined = buf.join(' ').trim();
    if (joined) return joined;
  }
  // 3) Fallback null
  return null;
}

let sheet = parseSheetArg(argv);

// Fallback to credentials.json
if (!sheet) {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'credentials.json'), 'utf8');
    const cfg = JSON.parse(raw);
    sheet = cfg.defaultSheetName || 'Sheet1';
  } catch (err) {
    sheet = 'Sheet1';
  }
}

const outDir = path.join(process.cwd(), 'outputs', 'flow-data');
const outXlsx = path.join(outDir, `${sheet}.xlsx`);

fs.mkdirSync(outDir, { recursive: true });

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

printInfo('[1/2] Download sheet "' + sheet + '" → ' + outXlsx);
{
  const r = run(process.execPath, [
    path.join(process.cwd(), 'scripts', 'download-sheet.cjs'),
    '--cred', path.join(process.cwd(), 'credentials.json'),
    '--sheet', sheet,
    '--out', outXlsx
  ]);
  if (r.status !== 0) {
    printError('Download gagal.');
    process.exit(r.status || 1);
  }
}

printInfo('[2/2] Jalankan PILE: pile -i ' + outXlsx);
{
  // Try global "pile"
  let r = run('pile', ['-i', outXlsx]);
  if (r.error || r.status !== 0) {
    printWarn('"pile" global tidak ditemukan/bermasalah. Fallback: node src/cli/command-pile.js');
    r = run(process.execPath, [path.join(process.cwd(), 'src', 'cli', 'command-pile.js'), '-i', outXlsx]);
    if (r.status !== 0) {
      printError('PILE gagal.');
      process.exit(r.status || 1);
    }
  }
}

printSuccess('Flow selesai.');
