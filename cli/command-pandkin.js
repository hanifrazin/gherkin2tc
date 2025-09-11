#!/usr/bin/env node
/**
 * pandkin (expand gherkin)
 * CLI untuk mengonversi Scenario Outline → Scenario.
 * Opsi:
 *   -i <file[,…]>   : input .feature (bisa diulang / dipisah koma). Jika tidak ada → baca stdin.
 *   -o <file|dir>   : output spesifik. Jika dir → <dir>/<nama>-expand.feature. Jika file & >1 input → ditolak.
 *
 * Overwrite: selalu overwrite jika file tujuan sudah ada.
 */

const fs = require("fs");
const path = require("path");
const { transform } = require("../converter/gherkin-outline-expander.cjs");

function printHelp(exitCode = 0) {
  const help = `
pandkin - expand Gherkin Scenario Outline into Scenarios

Usage:
  pandkin -i input.feature [-o output-dir]
  pandkin -i a.feature -i b.feature [-o output-dir]
  pandkin -i a.feature,b.feature [-o output-dir]
  cat input.feature | pandkin [-o output-file]

Options:
  -i    Input file .feature (bisa diulang, atau pisah koma). Jika tidak ada -i, baca stdin.
  -o    Output path:
          - Jika path berakhiran .feature dan hanya 1 input → tulis ke file itu.
          - Jika path adalah direktori (eksis/atau path tanpa .feature) → tulis <dir>/<nama>-expand.feature.
          - Jika tidak disediakan → output-gherkin-expand/<nama>-expand.feature
Examples:
  pandkin -i tests/callback.feature
  pandkin -i a.feature,b.feature -o dist/
  pandkin -i a.feature -o out.feature
  cat a.feature | pandkin -o out.feature
`;
  process.stderr.write(help);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const inputs = [];
  let out = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") printHelp(0);

    if (arg === "-i") {
      const val = argv[++i];
      if (!val) {
        console.error("Error: -i but no value");
        printHelp(1);
      }
      // FIX: split → trim → filter → push (jangan chain .filter pada hasil push)
      val
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => inputs.push(p));
      continue;
    }

    if (arg === "-o") {
      out = argv[++i];
      if (!out) {
        console.error("Error: -o but no value");
        printHelp(1);
      }
      continue;
    }

    console.error(`Unknown arg: ${arg}`);
    printHelp(1);
  }

  return { inputs, out };
}

function isDirLike(p) {
  // dianggap dir jika:
  // - path ada & memang direktori
  // - path belum ada & tidak berakhiran .feature
  if (fs.existsSync(p)) return fs.statSync(p).isDirectory();
  return !/\.feature$/i.test(p);
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function defaultOutDir() {
  return path.resolve(process.cwd(), "output-gherkin-expand");
}

function outPathFor(inputPathOrNull, outArgOrNull) {
  // 1) Jika -o diberikan:
  if (outArgOrNull) {
    // jika directory-like → produce <dir>/<name>-expand.feature
    if (isDirLike(outArgOrNull)) {
      const dir = path.resolve(process.cwd(), outArgOrNull);
      ensureDir(dir);
      const base = inputPathOrNull
        ? path.basename(inputPathOrNull).replace(/\.feature$/i, "")
        : "stdin";
      return path.join(dir, `${base}-expand.feature`);
    }
    // jika file path → pakai langsung (valid hanya untuk single input)
    return path.resolve(process.cwd(), outArgOrNull);
  }

  // 2) Jika -o tidak diberikan:
  const dir = defaultOutDir();
  ensureDir(dir);
  const base = inputPathOrNull
    ? path.basename(inputPathOrNull).replace(/\.feature$/i, "")
    : "stdin";
  return path.join(dir, `${base}-expand.feature`);
}

function processFile(inPath, outArg) {
  const src = fs.readFileSync(inPath, "utf8");
  const out = transform(src);
  const outPath = outPathFor(inPath, outArg);
  fs.writeFileSync(outPath, out, "utf8"); // overwrite by default
  console.error(`✔ ${path.basename(inPath)} → ${outPath}`);
}

async function processStdin(outArg) {
  let d = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) d += chunk;
  const out = transform(d);
  const outPath = outPathFor(null, outArg);
  fs.writeFileSync(outPath, out, "utf8");
  console.error(`✔ stdin → ${outPath}`);
}

(async function main() {
  const { inputs, out } = parseArgs(process.argv);

  if (inputs.length === 0) {
    // stdin mode
    await processStdin(out);
    return;
  }

  // Jika -o berupa file path dan inputs > 1 → tolak
  if (out && !isDirLike(out) && inputs.length > 1) {
    console.error("Error: -o menunjuk ke file, tetapi -i berisi >1 input. Gunakan -o direktori.");
    process.exit(1);
  }

  // Validasi input file
  const files = [];
  for (const p of inputs) {
    if (!p) continue;
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      console.error(`✖ Skip (not a file): ${p}`);
      continue;
    }
    files.push(p);
  }
  if (files.length === 0) {
    console.error("Tidak ada input valid.");
    process.exit(1);
  }

  files.forEach((f) => processFile(f, out));
})();