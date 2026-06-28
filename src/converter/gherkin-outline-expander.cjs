/**
 * Gherkin Scenario Outline → Scenario expander (CommonJS, preserve-indentation)
 * Fitur:
 * - Pertahankan indentasi & spasi (no reflow).
 * - Tag lines (outline-level & examples-level) dicetak RAW (apa adanya).
 * - Pastikan antar Scenario ada tepat 1 baris kosong.
 * - Expand Scenario Outline + Examples → Scenario biasa (substitusi <var> di judul/steps/docstring/table).
 * - Background:
 *   - Background di level Feature berlaku ke semua Scenario (termasuk di dalam Rule).
 *   - Background di level Rule berlaku hanya untuk Scenario di Rule itu.
 *   - Keduanya di-inject ke setiap Scenario dalam scope terkait (Feature + Rule).
 *   - Block "Background:" tidak dicetak; hanya langkah-langkahnya yang di-inject.
 *   - Baris kosong di TEPI background (leading/trailing) DIPANGKAS agar tidak muncul newline ekstra di Scenario.
 */

const isTagLine = (line) => /^\s*@\S/.test(line);
const isFeatureLine = (line) => /^\s*Feature:/i.test(line);
const isBackgroundLine = (line) => /^\s*Background:/i.test(line);
const isRuleLine = (line) => /^\s*Rule:/i.test(line);
const isScenarioLine = (line) => /^\s*Scenario:/i.test(line);
const isScenarioOutlineLine = (line) => /^\s*(Scenario Outline:|Scenario Template:)/i.test(line);
const isExamplesLine = (line) => /^\s*Examples:/i.test(line);
const isCommentLine = (line) => /^\s*#/.test(line);
const isEmpty = (line) => /^\s*$/.test(line);
const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isDocStringFence = (line) => /^\s*"""/.test(line) || /^\s*'''/.test(line);

// ---------- Helpers ----------
function replacePlaceholdersInLines(lines, rowMap) {
  if (!rowMap) return lines.slice();
  const re = /<([^>]+)>/g;
  return lines.map((line) =>
    line.replace(re, (_, name) =>
      Object.prototype.hasOwnProperty.call(rowMap, name) ? rowMap[name] : `<${name}>`
    )
  );
}

function parseExamplesTable(lines) {
  const rows = lines
    .filter((l) => isTableRow(l))
    .map((l) =>
      l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim())
    );
  if (rows.length === 0) return null;
  const headers = rows[0];
  const dataRows = rows.slice(1).map((cells) => {
    const m = {};
    headers.forEach((h, i) => (m[h] = cells[i] ?? ""));
    return m;
  });
  return { headers, dataRows };
}

// Ambil 1 blok Scenario/Scenario Outline (dari title sampai sebelum block berikutnya)
function collectScenarioBlock(lines, startIdx) {
  let end = startIdx + 1;
  let inDoc = false;
  let docFence = null;

  while (end < lines.length) {
    const L = lines[end];
    const fence = isDocStringFence(L) ? (L.match(/^\s*("""|''')/) || [])[1] : null;

    if (fence) {
      if (!inDoc) { inDoc = true; docFence = fence; }
      else if (inDoc && docFence && L.trim().startsWith(docFence)) { inDoc = false; docFence = null; }
      end++; continue;
    }
    if (inDoc) { end++; continue; }

    if (
      isTagLine(L) ||
      isScenarioLine(L) ||
      isScenarioOutlineLine(L) ||
      isRuleLine(L) ||
      isBackgroundLine(L) ||
      isFeatureLine(L)
    ) break;

    end++;
  }
  return { start: startIdx, end, blockLines: lines.slice(startIdx, end) };
}

// Pangkas hanya blank di TEPI (leading & trailing), tidak mengubah blank di tengah
function trimBlankEdges(arr) {
  let a = 0, b = arr.length;
  while (a < b && isEmpty(arr[a])) a++;
  while (b > a && isEmpty(arr[b - 1])) b--;
  return arr.slice(a, b);
}

// Ambil isi Background (hanya step & kontennya; tanpa header "Background:")
function collectBackgroundBlock(lines, startIdx) {
  let end = startIdx + 1;
  let inDoc = false;
  let docFence = null;
  const stepLines = [];

  while (end < lines.length) {
    const L = lines[end];
    const fence = isDocStringFence(L) ? (L.match(/^\s*("""|''')/) || [])[1] : null;

    if (fence) {
      if (!inDoc) { inDoc = true; docFence = fence; }
      else if (inDoc && docFence && L.trim().startsWith(docFence)) { inDoc = false; docFence = null; }
      stepLines.push(L); end++; continue;
    }
    if (inDoc) { stepLines.push(L); end++; continue; }

    if (
      isTagLine(L) ||
      isScenarioLine(L) ||
      isScenarioOutlineLine(L) ||
      isRuleLine(L) ||
      isBackgroundLine(L) ||
      isFeatureLine(L)
    ) break;

    // Simpan semua baris body Background (steps/tables/comments/blank)
    stepLines.push(L);
    end++;
  }
  // FIX: buang blank di awal/akhir agar tidak menambah newline di Scenario
  return { end, stepLines: trimBlankEdges(stepLines) };
}

// Pastikan trailing kosong di array 'out' tepat satu baris
function ensureSingleTrailingBlank(out) {
  while (out.length && isEmpty(out[out.length - 1])) out.pop();
  out.push("");
}

// ---------- Outline Expander (with Background injection) ----------
function expandScenarioOutline(
  blockLines,
  outlineTagLinesRaw = [],
  featureBackgroundStepsRaw = null,
  ruleBackgroundStepsRaw = null
) {
  const titleIdx = blockLines.findIndex((l) => isScenarioOutlineLine(l));
  const titleLine = blockLines[titleIdx];
  const outlineIndent = (titleLine.match(/^\s*/) || [""])[0];
  const after = blockLines.slice(titleIdx + 1);

  // Kumpulkan step-lines sampai Examples/tag berikut
  const stepLines = [];
  let i = 0, inDoc = false, docFence = null;
  while (i < after.length) {
    const L = after[i];
    const fence = isDocStringFence(L) ? (L.match(/^\s*("""|''')/) || [])[1] : null;
    if (fence) {
      if (!inDoc) { inDoc = true; docFence = fence; }
      else if (inDoc && docFence && L.trim().startsWith(docFence)) { inDoc = false; docFence = null; }
      stepLines.push(L); i++; continue;
    }
    if (inDoc) { stepLines.push(L); i++; continue; }
    if (isExamplesLine(L) || isTagLine(L)) break;
    stepLines.push(L); i++;
  }

  // Kumpulkan Examples blocks
  const exampleBlocks = [];
  while (i < after.length) {
    const exTagLinesRaw = [];
    while (i < after.length && isTagLine(after[i])) {
      exTagLinesRaw.push(after[i]);
      i++;
    }
    if (i >= after.length) break;
    if (!isExamplesLine(after[i])) { i++; continue; }

    i++; // skip "Examples:"
    const tableLines = [];
    while (i < after.length) {
      const L = after[i];
      if (isTagLine(L) || isExamplesLine(L)) break;
      if (isTableRow(L) || isCommentLine(L) || isEmpty(L)) {
        tableLines.push(L); i++;
      } else {
        break;
      }
    }
    exampleBlocks.push({ exTagLinesRaw, tableLines });
  }

  if (exampleBlocks.length === 0) {
    return blockLines.slice();
  }

  const out = [];
  const scenarioTitleText = titleLine.replace(/^\s*(Scenario Outline:|Scenario Template:)\s*/i, "");

  exampleBlocks.forEach(({ exTagLinesRaw, tableLines }) => {
    const parsed = parseExamplesTable(tableLines);
    if (!parsed || parsed.dataRows.length === 0) {
      out.push(...blockLines);
      return;
    }

    parsed.dataRows.forEach((rowMap) => {
      // Tag RAW
      outlineTagLinesRaw.forEach((tagLine) => out.push(tagLine));
      exTagLinesRaw.forEach((tagLine) => out.push(tagLine));

      // Title
      const replacedTitle = scenarioTitleText.replace(/<([^>]+)>/g, (_, n) =>
        Object.prototype.hasOwnProperty.call(rowMap, n) ? rowMap[n] : `<${n}>`
      );
      out.push(`${outlineIndent}Scenario: ${replacedTitle}`);

      // Inject Background: Feature + Rule (substitusi <var> jika ada)
      const bgCombined = []
        .concat(featureBackgroundStepsRaw || [])
        .concat(ruleBackgroundStepsRaw || []);
      if (bgCombined.length) {
        out.push(...replacePlaceholdersInLines(bgCombined, rowMap));
      }

      // Steps Outline (substitusi <var>)
      const concrete = replacePlaceholdersInLines(stepLines, rowMap);
      out.push(...concrete);

      // Satu baris kosong antar scenario
      ensureSingleTrailingBlank(out);
    });
  });

  return out;
}

// ---------- Main Transform ----------
function transform(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let idx = 0;

  // Tag pending (RAW lines) sebelum block
  let pendingTagLinesRaw = [];

  // Scope tracking
  let inRuleScope = false; // apakah sedang di dalam Rule
  let featureBackgroundStepsRaw = null; // berlaku global untuk Feature berjalan
  let ruleBackgroundStepsRaw = null;    // override dalam Rule berjalan

  const takePendingTagsRaw = () => { const t = pendingTagLinesRaw; pendingTagLinesRaw = []; return t; };

  while (idx < lines.length) {
    const line = lines[idx];

    // Tag lines menempel sebelum block
    if (isTagLine(line)) { pendingTagLinesRaw.push(line); idx++; continue; }

    // Feature: cetak & reset scope Feature
    if (isFeatureLine(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      output.push(line);
      inRuleScope = false;
      featureBackgroundStepsRaw = null; // reset feature background saat feature baru
      ruleBackgroundStepsRaw = null;    // reset rule background
      idx++;
      continue;
    }

    // Rule: cetak & reset Rule-scope background
    if (isRuleLine(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      output.push(line);
      inRuleScope = true;
      ruleBackgroundStepsRaw = null; // background pada rule baru di-reset
      idx++;
      continue;
    }

    // Background: simpan langkahnya ke scope yang sesuai (Feature vs Rule), jangan cetak block
    if (isBackgroundLine(line)) {
      // Flush tag yang nempel di atas Background (kalau ada)
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }

      const { end, stepLines } = collectBackgroundBlock(lines, idx);
      // FIX: trim blank edges of background so it won't introduce a blank line in scenarios
      const trimmed = trimBlankEdges(stepLines);
      if (inRuleScope) {
        ruleBackgroundStepsRaw = trimmed;
      } else {
        featureBackgroundStepsRaw = trimmed;
      }
      idx = end;
      continue;
    }

    // Komentar / baris kosong → cetak apa adanya (juga flush pending tags bila ada)
    if (isCommentLine(line) || isEmpty(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      output.push(line);
      idx++;
      continue;
    }

    // Scenario biasa → title + (background feature + rule) + body + 1 blank
    if (isScenarioLine(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      const { start, end, blockLines } = collectScenarioBlock(lines, idx);

      const titleLine = blockLines[0];
      output.push(titleLine);

      // Inject background (sudah di-trim leading/trailing blank)
      const bgCombined = []
        .concat(featureBackgroundStepsRaw || [])
        .concat(ruleBackgroundStepsRaw || []);
      if (bgCombined.length) {
        output.push(...bgCombined);
      }

      // Body scenario (tanpa title yang sudah dicetak)
      for (let k = 1; k < blockLines.length; k++) output.push(blockLines[k]);

      ensureSingleTrailingBlank(output);
      idx = end;
      continue;
    }

    // Scenario Outline → expand + inject Background per scenario
    if (isScenarioOutlineLine(line)) {
      const outlineTagLinesRaw = takePendingTagsRaw();
      const { end, blockLines } = collectScenarioBlock(lines, idx);
      const expanded = expandScenarioOutline(
        blockLines,
        outlineTagLinesRaw,
        featureBackgroundStepsRaw,
        ruleBackgroundStepsRaw
      );
      output.push(...expanded);
      idx = end;
      continue;
    }

    // Lain-lain → passthrough
    if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
    output.push(line);
    idx++;
  }

  // Pastikan EOF punya newline tunggal
  return output.join("\n").replace(/\n?$/, "\n");
}

module.exports = { transform };