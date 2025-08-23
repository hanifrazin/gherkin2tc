#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { program } = require("commander");

program
  .name("pile")
  .description("Wrapper: Excel/CSV → Gherkin (pipe tables) via converter/pipe-table.js")
  .option("-i, --input <file...>", "satu atau lebih file .xlsx/.csv (variadic)")
  .option("-d, --dir <folder>", "proses semua file .xlsx/.csv dalam folder (non-recursive)")
  .option("-r, --recursive", "jika dipakai dengan --dir, scan folder secara rekursif", false)
  .option("--ext <list>", "ekstensi yang diproses, koma-separated (default: xlsx,csv)", "xlsx,csv")
  // opsi di bawah ini diteruskan ke converter/pipe-table.js
  .option("--out-dir <dir>", "folder output default (default: output-pipe-tables)")
  .option("--indent <n>", "spasi indent sebelum '|'", "4")
  .option("--columns <cols>", "whitelist kolom (nama atau #index), koma-separated")
  .option("--mask <cols>", "mask kolom sensitif (berdasarkan header yang terseleksi), koma-separated")
  .option("--no-header", "anggap baris pertama tiap tabel bukan header")
  .option("--table-gap <n>", "jumlah baris kosong sebagai pemisah tabel", "1")
  .allowUnknownOption(true) // jaga-jaga jika converter nanti nambah flag
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

// 1) dari -i (variadic)
if (Array.isArray(opts.input)) {
  for (const f of opts.input) {
    const abs = path.resolve(process.cwd(), f);
    files.push(abs);
  }
}

// 2) dari -d/--dir
if (opts.dir) {
  const baseDir = path.resolve(process.cwd(), opts.dir);
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    console.error("❌ Folder tidak valid:", baseDir);
    process.exit(1);
  }
  if (opts.recursive) {
    // scan rekursif
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
    // non-recursive
    for (const name of fs.readdirSync(baseDir)) {
      files.push(path.join(baseDir, name));
    }
  }
}

// filter hanya file dengan ekstensi yang diizinkan
files = files
  .filter(p => {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return false;
    const bn = path.basename(p);
    // skip file temp Excel seperti "~$filename.xlsx"
    if (bn.startsWith("~$")) return false;
    const ext = path.extname(p).slice(1).toLowerCase();
    return exts.has(ext);
  });

// validasi
if (files.length === 0) {
  console.error("❌ Tidak ada file .xlsx/.csv yang ditemukan. Pakai -i <file...> atau -d <folder>.");
  process.exit(1);
}

// path ke converter
const converterPath = path.resolve(__dirname, "../converter/pipe-table.js");

// siapkan opsi yang diteruskan ke converter
const passThrough = [];
if (opts.outDir)   passThrough.push("--out-dir", opts.outDir);
if (opts.indent)   passThrough.push("--indent", String(opts.indent));
if (opts.columns)  passThrough.push("--columns", opts.columns);
if (opts.mask)     passThrough.push("--mask", opts.mask);
if (opts.noHeader) passThrough.push("--no-header");
if (opts.tableGap) passThrough.push("--table-gap", String(opts.tableGap));

// jalankan converter untuk tiap file (sinkron biar rapi outputnya)
let okCount = 0;
let failCount = 0;

for (const file of files) {
  console.log(`\n➡️  Convert: ${file}`);
  const args = [converterPath, file, ...passThrough];
  const res = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (res.status === 0) okCount++;
  else { failCount++; }
}

console.log(`\n✅ Selesai. Berhasil: ${okCount}  |  Gagal: ${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
