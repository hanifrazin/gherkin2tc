#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { program } = require("commander");
const {
  highlight, dim, header,
  printSuccess, printError, path: colorPath
} = require("./colorize.cjs");

// ========== CUSTOM COLORFUL HELP ==========
function printHelp() {
  console.log(`
${header('PILE — Excel/CSV to Gherkin (Pipe Tables)')}

${dim('Usage:')}
  pile ${dim('-i <file.xlsx> [<file2.csv> ...]')} [${dim('options')}]
  pile ${dim('-d <folder>')} [${dim('options')}]
  pile ${dim('-d <folder> -r')} [${dim('options')}]

${dim('Options:')}
  ${highlight('-i, --input <file...>')}  File .xlsx/.csv (variadic, bisa banyak)
  ${highlight('-d, --dir <folder>')}     Proses semua file dalam folder
  ${highlight('-r, --recursive')}        Scan folder rekursif (dengan --dir)
  ${highlight('--ext <list>')}           Ekstensi file (default: ${dim('xlsx,csv')})
  ${highlight('--out-dir <dir>')}        Folder output (default: ${dim('outputs/piles')})
  ${highlight('--columns <cols>')}       Whitelist kolom (nama atau ${dim('#index')})
  ${highlight('--mask <cols>')}          Mask kolom sensitif
  ${highlight('--indent <n>')}           Indentasi spasi sebelum ${dim('|')} (default: ${dim('4')})
  ${highlight('--no-header')}            Baris pertama bukan header
  ${highlight('--table-gap <n>')}        Baris kosong pemisah tabel (default: ${dim('1')})

${dim('Examples:')}
  pile ${dim('-i samples/data/login.xlsx')}
  pile ${dim('-d samples/data -r --ext xlsx,csv')}
  pile ${dim('-i users.xlsx --columns \"user,pass\" --mask \"pass\"')}
`);
}

// Cek args sebelum Commander parsing (mencegah Commander tampilkan help flat)
const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes("-h") || rawArgs.includes("--help")) {
  printHelp();
  process.exit(0);
}

program
  .name("pile")
  .description("Excel/CSV → Gherkin (pipe tables)")
  .option("-i, --input <file...>", "satu atau lebih file .xlsx/.csv (variadic)")
  .option("-d, --dir <folder>", "proses semua file .xlsx/.csv dalam folder")
  .option("-r, --recursive", "scan folder secara rekursif", false)
  .option("--ext <list>", "ekstensi yang diproses (default: xlsx,csv)", "xlsx,csv")
  .option("--out-dir <dir>", "folder output (default: outputs/piles)")
  .option("--indent <n>", "spasi indent sebelum '|'", "4")
  .option("--columns <cols>", "whitelist kolom, koma-separated")
  .option("--mask <cols>", "mask kolom sensitif, koma-separated")
  .option("--no-header", "anggap baris pertama bukan header")
  .option("--table-gap <n>", "baris kosong pemisah tabel", "1")
  .allowUnknownOption(true)
  .parse();

const opts = program.opts();

const exts = new Set(
  (opts.ext || "xlsx,csv")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

// Kumpulkan daftar file target
let files = [];

if (Array.isArray(opts.input)) {
  for (const f of opts.input) {
    files.push(path.resolve(process.cwd(), f));
  }
}

if (opts.dir) {
  const baseDir = path.resolve(process.cwd(), opts.dir);
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    printError(`Folder tidak valid: ${baseDir}`);
    process.exit(1);
  }
  if (opts.recursive) {
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(baseDir);
  } else {
    for (const name of fs.readdirSync(baseDir)) {
      files.push(path.join(baseDir, name));
    }
  }
}

files = files.filter(p => {
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return false;
  const bn = path.basename(p);
  if (bn.startsWith("~$")) return false;
  const ext = path.extname(p).slice(1).toLowerCase();
  return exts.has(ext);
});

if (files.length === 0) {
  printError("Tidak ada file .xlsx/.csv ditemukan. Gunakan -i <file...> atau -d <folder>.");
  process.exit(1);
}

const converterPath = path.resolve(__dirname, "../converter/pipe-table.js");
const effectiveOutDir = (opts.outDir && String(opts.outDir).trim()) || "outputs/piles";

try {
  const absOut = path.resolve(process.cwd(), effectiveOutDir);
  if (!fs.existsSync(absOut)) fs.mkdirSync(absOut, { recursive: true });
} catch (e) {
  printError(`Folder output tidak dapat dibuat: ${e.message}`);
  process.exit(1);
}

const passThrough = [];
passThrough.push("--out-dir", effectiveOutDir);
if (opts.indent)   passThrough.push("--indent", String(opts.indent));
if (opts.columns)  passThrough.push("--columns", opts.columns);
if (opts.mask)     passThrough.push("--mask", opts.mask);
if (opts.noHeader) passThrough.push("--no-header");
if (opts.tableGap) passThrough.push("--table-gap", String(opts.tableGap));

let okCount = 0;
let failCount = 0;

for (const file of files) {
  const args = [converterPath, file, ...passThrough];
  const res = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (res.status === 0) okCount++;
  else { failCount++; }
}

if (failCount > 0) {
  printError(`${okCount} berhasil, ${failCount} gagal`);
  process.exit(1);
}
printSuccess(`${okCount} file → ${colorPath(effectiveOutDir)}`);
