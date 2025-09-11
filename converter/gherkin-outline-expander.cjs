/**
 * Gherkin Scenario Outline → Scenario expander (CommonJS, preserve-indentation)
 * Prinsip:
 * - Pertahankan semua indentasi & spasi apa adanya.
 * - Tag lines disalin ulang PERSIS (outline-level + examples-level).
 * - Tidak menambah/menghapus baris kosong.
 * - Hanya ganti <var> → nilai dari Examples, dan ubah "Scenario Outline:" → "Scenario:".
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

function replacePlaceholdersInLines(lines, rowMap) {
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
    headers.forEach((h, i) => (m[h] = (cells[i] ?? "")));
    return m;
  });
  return { headers, dataRows };
}

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

function expandScenarioOutline(blockLines, outlineTagLinesRaw = []) {
  const titleIdx = blockLines.findIndex((l) => isScenarioOutlineLine(l));
  const titleLine = blockLines[titleIdx];
  const outlineIndent = (titleLine.match(/^\s*/) || [""])[0];
  const after = blockLines.slice(titleIdx + 1);

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
      outlineTagLinesRaw.forEach((tagLine) => out.push(tagLine));
      exTagLinesRaw.forEach((tagLine) => out.push(tagLine));

      const replacedTitle = scenarioTitleText.replace(/<([^>]+)>/g, (_, n) =>
        Object.prototype.hasOwnProperty.call(rowMap, n) ? rowMap[n] : `<${n}>`
      );
      out.push(`${outlineIndent}Scenario: ${replacedTitle}`);

      const concreteSteps = replacePlaceholdersInLines(stepLines, rowMap);
      out.push(...concreteSteps);
    });
  });

  return out;
}

function transform(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let idx = 0;
  let pendingTagLinesRaw = [];

  const flushPlain = (start, end) => {
    for (let k = start; k < end; k++) output.push(lines[k]);
  };
  const takePendingTagsRaw = () => { const t = pendingTagLinesRaw; pendingTagLinesRaw = []; return t; };

  while (idx < lines.length) {
    const line = lines[idx];

    if (isTagLine(line)) { pendingTagLinesRaw.push(line); idx++; continue; }

    if (isFeatureLine(line) || isBackgroundLine(line) || isRuleLine(line) || isCommentLine(line) || isEmpty(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      output.push(line); idx++; continue;
    }

    if (isScenarioLine(line)) {
      if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
      const { start, end } = collectScenarioBlock(lines, idx);
      flushPlain(start, end); idx = end; continue;
    }

    if (isScenarioOutlineLine(line)) {
      const outlineTagLinesRaw = takePendingTagsRaw();
      const { end, blockLines } = collectScenarioBlock(lines, idx);
      const expanded = expandScenarioOutline(blockLines, outlineTagLinesRaw);
      output.push(...expanded); idx = end; continue;
    }

    if (pendingTagLinesRaw.length) { takePendingTagsRaw().forEach((t) => output.push(t)); }
    output.push(line); idx++;
  }

  return output.join("\n").replace(/\n?$/, "\n");
}

module.exports = { transform };