#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ========== HELP ==========
function printHelp() {
  console.log(`
GRISE – Gherkin UI to Test Case

Usage:
  grise -i <input> [-o <output.xlsx>] [--outdir <dir>] [--mode sheet|files] [--overwrite] [--no-timestamp] [-q|--quiet]
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

if (has("-h") || has("--help")) {
  printHelp();
  process.exit(0);
}

const input = getArg("-i", "--input");
let output = getArg("-o", "--output");
const outdirOpt = getArg("--outdir");
const overwrite = has("--overwrite");
const noTs = has("--no-timestamp");
const quiet = has("-q") || has("--quiet");

let mode = getArg("--mode") || "sheet";
if (!["sheet", "files"].includes(mode)) {
  console.error(`Error: --mode harus "sheet" atau "files". Diterima: ${mode}`);
  process.exit(1);
}

if (!input) {
  console.error("Error: -i/--input wajib diisi (file .feature atau folder).");
  printHelp();
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`Error: Input tidak ditemukan: ${input}`);
  process.exit(1);
}
const isDir = fs.statSync(input).isDirectory();

// ========== HELPERS ==========
function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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
  console.error(`Error: Tidak menemukan converter di: ${converterPath}`);
  process.exit(1);
}
if (!quiet) console.log(`ℹ️  Converter: ${converterPath}`); // <<— penting agar kelihatan yang dipakai
/* (ref) */ console.log("NOTE: command-grise.js wrapper loaded."); // keep a tiny marker  [oai_citation:1‡command-grise.js](file-service://file-J29TYnNLVGozp6RXTcqu6r)

// ========== FILE MODE ==========
if (!isDir) {
  const base = path.basename(input, ".feature");
  if (!output) {
    const filename = noTs ? `${base}.xlsx` : `${base}-${ts()}.xlsx`;
    output = path.join("output-testcase", filename);
  }
  output = ensureXlsx(output);

  if (fs.existsSync(output) && !overwrite) {
    if (!noTs) {
      const { dir, name } = path.parse(output);
      output = path.join(dir || ".", `${name}-${ts()}.xlsx`);
    } else {
      console.error(`Error: File sudah ada: ${output} (pakai --overwrite atau hilangkan --no-timestamp)`);
      process.exit(1);
    }
  }

  ensureDir(path.dirname(output));
  const cmd = `node "${converterPath}" "${input}" -o "${output}" --xlsx`;
  if (!quiet) console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    if (!quiet) console.log(`\n✅ Selesai. File tersimpan di: ${output}`);
  } catch (e) {
    console.error("❌ Gagal menjalankan converter:", e.message);
    process.exit(e.status || 1);
  }
  process.exit(0);
}

// ========== FOLDER MODE ==========
if (mode === "sheet") {
  const base = path.basename(path.resolve(input));
  if (!output) {
    const filename = noTs ? `${base}.xlsx` : `${base}-${ts()}.xlsx`;
    output = path.join("output-testcase", filename);
  }
  output = ensureXlsx(output);

  if (fs.existsSync(output) && !overwrite) {
    if (!noTs) {
      const { dir, name } = path.parse(output);
      output = path.join(dir || ".", `${name}-${ts()}.xlsx`);
    } else {
      console.error(`Error: File sudah ada: ${output} (pakai --overwrite atau hilangkan --no-timestamp)`);
      process.exit(1);
    }
  }

  ensureDir(path.dirname(output));
  const cmd = `node "${converterPath}" "${input}" -o "${output}" --xlsx`;
  if (!quiet) console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    if (!quiet) console.log(`\n✅ Selesai. File tersimpan di: ${output}`);
  } catch (e) {
    console.error("❌ Gagal menjalankan converter:", e.message);
    process.exit(e.status || 1);
  }
  process.exit(0);
}

// mode=files
const featurePaths = listFeatures(input);
if (featurePaths.length === 0) {
  console.error(`Error: Tidak ditemukan file .feature di folder: ${input}`);
  process.exit(1);
}
const outdir = outdirOpt || "output";
ensureDir(outdir);

let fails = 0;
for (const f of featurePaths) {
  const base = path.basename(f, ".feature");
  let outFile = path.join(outdir, `${base}.xlsx`);
  if (!noTs) outFile = path.join(outdir, `${base}-${ts()}.xlsx`);
  outFile = ensureXlsx(outFile);

  if (fs.existsSync(outFile) && !overwrite) {
    if (!noTs) {
      const { dir, name } = path.parse(outFile);
      outFile = path.join(dir, `${name}-${ts()}.xlsx`);
    } else {
      console.error(`⚠️  Skip (sudah ada & --no-timestamp): ${outFile}`);
      fails++;
      continue;
    }
  }

  ensureDir(path.dirname(outFile));
  const cmd = `node "${converterPath}" "${f}" -o "${outFile}" --xlsx`;
  if (!quiet) console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
    if (!quiet) console.log(`✅ ${path.basename(outFile)} selesai`);
  } catch (e) {
    fails++;
    console.error(`❌ Gagal: ${f}\n   ${e.message}`);
  }
}

if (fails > 0) {
  console.error(`\nSelesai dengan ${fails} kegagalan.`);
  process.exit(1);
}
if (!quiet) console.log(`\n✅ Semua selesai. Output di folder: ${outdir}`);