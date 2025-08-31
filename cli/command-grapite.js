#!/usr/bin/env node
/**
 * command-grapite.js
 * CLI wrapper untuk converter API → Excel (grapite)
 *
 * Usage:
 *   grapite -i <path/to/file_or_dir> -o <out.xlsx> [--xlsx]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function printHelp() {
  console.log(`
grapite -i <file.feature|dir> -o <out.xlsx> [--xlsx]

Options:
  -i, --input    Path file .feature atau direktori yang berisi .feature
  -o, --out      Output .xlsx (default: api-testcases.xlsx)
  --xlsx         Paksa fallback lib "xlsx" jika "exceljs" tidak tersedia

Examples:
  grapite -i sample_features/api -o output/api.xlsx
  grapite -i sample_features/api-sample.feature
`);
}

function parseArgv(argv) {
  const out = { input: null, out: 'api-testcases.xlsx', forceXlsx: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '-i' || a === '--input') && argv[i + 1]) out.input = argv[++i];
    else if ((a === '-o' || a === '--out') && argv[i + 1]) out.out = argv[++i];
    else if (a === '--xlsx') out.forceXlsx = true;
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else if (!a.startsWith('-') && !out.input) out.input = a;
  }
  return out;
}

(async function main() {
  const args = parseArgv(process.argv);
  if (!args.input) {
    printHelp();
    process.exit(1);
  }

  // ⬇️ sesuaikan ke nama file barumu
  const converterPath = path.join(__dirname, '..', 'converter', 'gherkin-api.cjs');

  if (!fs.existsSync(converterPath)) {
    console.error('Converter tidak ditemukan:', converterPath);
    console.error('Pastikan file ada di converter/gherkin-api.cjs');
    process.exit(1);
  }

  const childArgs = [converterPath, args.input, '-o', args.out];
  if (args.forceXlsx) childArgs.push('--xlsx');

  const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code));
})();