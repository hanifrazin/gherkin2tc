#!/usr/bin/env node
/**
 * command-grapite.js
 * CLI wrapper untuk converter API → Excel
 *
 * Usage:
 *   grapite -i <path/to/file_or_dir> -o <out.xlsx> [--xlsx]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { highlight, dim, header, printSuccess, printError, path: colorPath } = require('./colorize.cjs');

function printHelp() {
  console.log(`
${header('grapite — Gherkin API to Excel')}

${dim('Usage:')}
  grapite ${dim('-i <file.feature|dir>')} ${dim('-o <out.xlsx>')} [${dim('--xlsx')}]

${dim('Options:')}
  ${highlight('-i, --input')}    Path file .feature atau direktori berisi .feature
  ${highlight('-o, --out')}      Output .xlsx (default: ${dim('api-testcases.xlsx')})
  ${highlight('--xlsx')}         Paksa fallback lib "${dim('xlsx')}" jika "${dim('exceljs')}" tidak tersedia

${dim('Examples:')}
  grapite ${dim('-i samples/features/api -o outputs/testcase-api/api.xlsx')}
  grapite ${dim('-i samples/features/api-sample.feature')}
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
    process.exit(0);
  }

  const converterPath = path.join(__dirname, '..', 'converter', 'gherkin-api.cjs');

  if (!fs.existsSync(converterPath)) {
    printError(`Converter tidak ditemukan: ${converterPath}`);
    process.exit(1);
  }

  const childArgs = [converterPath, args.input, '-o', args.out];
  if (args.forceXlsx) childArgs.push('--xlsx');

  const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });

  child.on('close', (code) => {
    if (code === 0) {
      printSuccess(`Selesai → ${colorPath(args.out)}`);
    } else {
      process.exit(code);
    }
  });
})();
