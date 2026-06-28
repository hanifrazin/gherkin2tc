#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  info, highlight, header,
  printSuccess, printError, dim, path: colorPath
} = require("./colorize.cjs");

// ========== HELP ==========
function printHelp() {
  console.log(`
${header('GRISE — Gherkin UI to Test Case')}

${dim('Usage:')}
  grise ${dim('-i')} ${dim('<input>')} [${dim('-o <output.xlsx>')}] [${dim('--mode sheet|files')}] [${dim('-v')}]

${dim('Options:')}
  ${highlight('-i, --input')}   File .feature atau folder berisi .feature
  ${highlight('-o, --output')}  Nama file .xlsx (opsional, auto di folder outputs/testcase)
  ${highlight('--mode')}        "${dim('sheet')}" (gabung) | "${dim('files')}" (1 file per .feature)
  ${highlight('-v')}            Tampilkan log detail proses
  ${highlight('-h, --help')}    Tampilkan bantuan ini

${dim('Examples:')}
  grise ${dim('-i login.feature')}
  grise ${dim('-i features/ -o hasil.xlsx')}
  grise ${dim('-i features/ --mode files -v')}
`);
}

// ========== ARG PARSER ==========
const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const nextOf = (k) => {
  const i = args.indexOf(k);
  return i !== -1 ? args[i + 1] : null;
};
const getArg = (...keys) => {
  for (const k of keys) {
    const v = nextOf(k);
    if (v && !v.startsWith("-")) return v;
  }
  return null;
};

// Default ke help jika tidak ada argumen
if (args.length === 0 || has("-h") || has("--help")) {
  printHelp();
  process.exit(0);
}

const input = getArg("-i", "--input");
let output = getArg("-o", "--output");
const outdirOpt = getArg("--outdir");
const verbose = has("-v");

let mode = getArg("--mode") || "sheet";
if (!["sheet", "files"].includes(mode)) {
  printError(`--mode harus "sheet" atau "files"`);
  process.exit(1);
}

if (!input) {
  printHelp();
  process.exit(1);
}
if (!fs.existsSync(input)) {
  printError(`Input tidak ditemukan: ${input}`);
  process.exit(1);
}
const isDir = fs.statSync(input).isDirectory();

// ========== HELPERS ==========
function tsDay() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function ensureXlsx(p) {
  return path.extname(p).toLowerCase() === ".xlsx" ? p : `${p}.xlsx`;
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function listFeatures(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".feature"))
    .map((f) => path.join(dir, f));
}

// ========== PATH CONVERTER ==========
const converterPath = path.resolve(__dirname, "..", "converter", "gherkin-ui.cjs");
if (!fs.existsSync(converterPath)) {
  printError(`Converter tidak ditemukan: ${converterPath}`);
  process.exit(1);
}

// ========== EXECUTE ==========
function run(input, output) {
  ensureDir(path.dirname(output));
  const args = [converterPath, input, '-o', output, '--xlsx'];
  if (verbose) console.log(dim(`> node ${args.join(' ')}`));
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  return res.status === 0;
}

// ========== FILE MODE ==========
if (!isDir) {
  const base = path.basename(input, ".feature");
  if (!output) {
    output = path.join("outputs", "testcase", `${base}-${tsDay()}.xlsx`);
  }
  output = ensureXlsx(output);

  if (verbose) console.log(info(`Konversi: ${colorPath(input)}`));
  const ok = run(input, output);
  if (ok) {
    printSuccess(`Selesai → ${colorPath(output)}`);
    process.exit(0);
  } else {
    printError(`Gagal: ${input}`);
    process.exit(1);
  }
}

// ========== FOLDER MODE ==========
if (mode === "sheet") {
  const base = path.basename(path.resolve(input));
  if (!output) {
    output = path.join("outputs", "testcase", `${base}-${tsDay()}.xlsx`);
  }
  output = ensureXlsx(output);

  if (verbose) console.log(info(`Konversi folder → ${colorPath(output)}`));
  const ok = run(input, output);
  if (ok) {
    printSuccess(`Selesai → ${colorPath(output)}`);
    process.exit(0);
  } else {
    printError(`Gagal: ${input}`);
    process.exit(1);
  }
}

// mode=files
const featurePaths = listFeatures(input);
if (featurePaths.length === 0) {
  printError(`Tidak ditemukan file .feature di folder: ${input}`);
  process.exit(1);
}
const outdir = outdirOpt || "outputs/testcase";
ensureDir(outdir);

let fails = 0;
for (const f of featurePaths) {
  const base = path.basename(f, ".feature");
  let outFile = path.join(outdir, `${base}-${tsDay()}.xlsx`);
  outFile = ensureXlsx(outFile);

  if (verbose) console.log(info(`Konversi: ${colorPath(f)}`));
  const ok = run(f, outFile);
  if (!ok) {
    fails++;
    if (verbose) printError(`Gagal: ${f}`);
  }
}

if (fails > 0) {
  printError(`${fails} file gagal dikonversi`);
  process.exit(1);
}
printSuccess(`Selesai → ${colorPath(outdir)}`);
