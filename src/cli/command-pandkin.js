#!/usr/bin/env node
/**
 * pandkin - expand Gherkin Scenario Outline into Scenarios
 * Opsi:
 *   -i <file[,…]>   : input .feature (bisa diulang / dipisah koma). Jika tidak ada → baca stdin.
 *   -o <file|dir>   : output spesifik.
 */

const fs = require("fs");
const path = require("path");
const { transform } = require("../converter/gherkin-outline-expander.cjs");
const { highlight, dim, header, printSuccess, printError, path: colorPath } = require("./colorize.cjs");

function printHelp(exitCode = 0) {
  console.log(`
${header('pandkin — Expand Gherkin Scenario Outline')}

${dim('Usage:')}
  pandkin ${dim('-i <input.feature>')} [${dim('-o <output-dir>')}]
  pandkin ${dim('-i a.feature,b.feature')} [${dim('-o <output-dir>')}]
  cat ${dim('input.feature')} | pandkin [${dim('-o <output-file>')}]

${dim('Options:')}
  ${highlight('-i')}    Input file .feature (bisa diulang, atau pisah koma)
  ${highlight('-o')}    Output path (file atau direktori)

${dim('Examples:')}
  pandkin ${dim('-i samples/features/login.feature')}
  pandkin ${dim('-i a.feature,b.feature -o outputs/gherkin-expand/')}
`);
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
      if (!val) { printError("-i but no value"); printHelp(1); }
      val
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p) => inputs.push(p));
      continue;
    }

    if (arg === "-o") {
      out = argv[++i];
      if (!out) { printError("-o but no value"); printHelp(1); }
      continue;
    }

    printError(`Argumen tidak dikenal: ${arg}`);
    printHelp(1);
  }

  return { inputs, out };
}

function isDirLike(p) {
  if (fs.existsSync(p)) return fs.statSync(p).isDirectory();
  return !/\.feature$/i.test(p);
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function defaultOutDir() {
  return path.resolve(process.cwd(), "outputs", "gherkin-expand");
}

function outPathFor(inputPathOrNull, outArgOrNull) {
  if (outArgOrNull) {
    if (isDirLike(outArgOrNull)) {
      const dir = path.resolve(process.cwd(), outArgOrNull);
      ensureDir(dir);
      const base = inputPathOrNull
        ? path.basename(inputPathOrNull).replace(/\.feature$/i, "")
        : "stdin";
      return path.join(dir, `${base}-expand.feature`);
    }
    return path.resolve(process.cwd(), outArgOrNull);
  }

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
  fs.writeFileSync(outPath, out, "utf8");
  return { file: path.basename(inPath), path: outPath };
}

async function processStdin(outArg) {
  let d = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) d += chunk;
  const out = transform(d);
  const outPath = outPathFor(null, outArg);
  fs.writeFileSync(outPath, out, "utf8");
  return { file: "stdin", path: outPath };
}

(async function main() {
  const { inputs, out } = parseArgs(process.argv);

  if (inputs.length === 0) {
    // TTY = user di terminal, show help
    // Non-TTY = pipe, baca dari stdin
    if (process.stdin.isTTY) {
      printHelp(0);
      return;
    }
    const result = await processStdin(out);
    printSuccess(`Selesai → ${colorPath(result.path)}`);
    return;
  }

  if (out && !isDirLike(out) && inputs.length > 1) {
    printError("-o menunjuk ke file, tetapi -i berisi >1 input. Gunakan -o direktori.");
    process.exit(1);
  }

  const files = [];
  for (const p of inputs) {
    if (!p) continue;
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      printError(`Bukan file: ${p}`);
      continue;
    }
    files.push(p);
  }
  if (files.length === 0) {
    printError("Tidak ada input valid.");
    process.exit(1);
  }

  const results = files.map(f => processFile(f, out));
  const dir = path.dirname(results[0].path);
  printSuccess(`${results.length} file → ${colorPath(dir)}`);
})();
