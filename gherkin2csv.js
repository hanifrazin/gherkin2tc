#!/usr/bin/env node
// gherkin2csv.js
// Minimal, cepat, tanpa dependency wajib (CSV). Tambahan --xlsx butuh: npm i xlsx

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin2csv.js <file.feature|dir> -o <out.csv|out.xlsx> [--xlsx]');
  process.exit(1);
}

let inputPath = null;
let outPath = 'testcases.csv';
let asXlsx = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('-') && !inputPath) inputPath = a;
  if (a === '-o' || a === '--out') outPath = args[i + 1];
  if (a === '--xlsx') asXlsx = true;
}

if (!inputPath) {
  console.error('Error: input path is required.');
  process.exit(1);
}

function readAllFeatures(input) {
  const stats = fs.statSync(input);
  let files = [];
  if (stats.isDirectory()) {
    files = walk(input).filter(f => f.toLowerCase().endsWith('.feature'));
  } else {
    files = [input];
  }
  return files.map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));
}

function walk(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    return s.isDirectory() ? walk(p) : [p];
  });
}

const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But', 'Background'];
const SCENARIO_KEYS = ['Scenario', 'Scenario Outline', 'Scenario:', 'Scenario Outline:'];

function isStepLine(line) {
  return STEP_KEYWORDS.some(k => line.trim().startsWith(k + ' ')) ||
         STEP_KEYWORDS.some(k => line.trim() === k) ||
         // allow step lines after leading whitespace
         STEP_KEYWORDS.some(k => new RegExp(`^\\s*${k}\\b`).test(line));
}

function cleanLine(line) {
  // remove trailing comments outside quotes
  const idx = line.indexOf(' #');
  let base = line;
  if (idx !== -1) base = line.slice(0, idx);
  return base.trim();
}

function parseFeatureFile(text, filename) {
  const lines = text.split(/\r?\n/);
  let featureName = '';
  let featureTags = [];
  let background = []; // steps
  let scenarios = [];

  let i = 0;
  let pendingTags = [];
  while (i < lines.length) {
    let raw = lines[i];
    let line = cleanLine(raw);

    // skip empty/comment
    if (line === '' || line.startsWith('#')) {
      i++; continue;
    }

    // tags
    if (line.startsWith('@')) {
      pendingTags = line.split(/\s+/).filter(Boolean); // keep all tags
      i++; continue;
    }

    // Feature
    if (/^\s*Feature:/.test(line)) {
      featureName = line.replace(/^\s*Feature:\s*/, '').trim();
      if (pendingTags.length) {
        featureTags = pendingTags.slice();
        pendingTags = [];
      }
      i++; continue;
    }

    // Background
    if (/^\s*Background:/.test(line)) {
      i++;
      let bgSteps = [];
      while (i < lines.length && (isStepLine(lines[i]) || lines[i].trim() === '' || lines[i].trim().startsWith('#'))) {
        const l = cleanLine(lines[i]);
        if (isStepLine(l)) bgSteps.push(extractStep(l));
        i++;
      }
      background = background.concat(bgSteps);
      continue;
    }

    // Scenario / Scenario Outline
    if (/^\s*Scenario(?: Outline)?:/.test(line)) {
      const type = line.includes('Outline') ? 'Scenario Outline' : 'Scenario';
      const name = line.replace(/^\s*Scenario(?: Outline)?:\s*/, '').trim();
      const tags = pendingTags.length ? pendingTags.slice() : [];
      pendingTags = [];

      i++;
      let steps = [];
      let examples = [];
      let lastKeyword = null;

      while (i < lines.length) {
        const curRaw = lines[i];
        const cur = cleanLine(curRaw);
        if (cur === '' || cur.startsWith('#')) { i++; continue; }

        // next block?
        if (/^\s*@/.test(cur) || /^\s*Scenario(?: Outline)?:/.test(cur) || /^\s*Feature:/.test(cur)) break;

        if (/^\s*Examples:/.test(cur)) {
          // parse following Gherkin table
          i++;
          let table = [];
          while (i < lines.length) {
            const tline = cleanLine(lines[i]);
            if (/^\s*\|/.test(tline)) {
              const cells = tline.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
              table.push(cells);
              i++;
              continue;
            }
            if (tline.startsWith('#') || tline === '') { i++; continue; }
            // break on anything else
            break;
          }
          if (table.length >= 2) {
            const headers = table[0];
            for (let r = 1; r < table.length; r++) {
              const row = {};
              headers.forEach((h, idx) => row[h] = (table[r][idx] ?? ''));
              examples.push(row);
            }
          }
          continue;
        }

        if (isStepLine(cur)) {
          const st = extractStep(cur, lastKeyword);
          lastKeyword = st.keywordBase || lastKeyword;
          steps.push(st);
          i++;
          continue;
        }

        // anything else—advance
        i++;
      }

      scenarios.push({
        file: filename,
        feature: featureName,
        featureTags,
        tags,
        type,
        name,
        background: background.slice(),
        steps,
        examples
      });

      continue;
    }

    // advance if nothing matched
    i++;
  }

  return scenarios;
}

function extractStep(line, lastKeyword = null) {
  // capture keyword + text
  const m = line.match(/^\s*(Given|When|Then|And|But)\b\s*(.*)$/i);
  if (!m) return { raw: line, keyword: '', keywordBase: lastKeyword, text: line.trim() };
  const kw = capitalize(m[1]);
  let base = kw;
  if (kw === 'And' || kw === 'But') base = lastKeyword || 'Given';
  return { raw: line, keyword: kw, keywordBase: base, text: m[2].trim() };
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

function formatNumbered(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.map((v, i) => `${i + 1}. ${v}`).join('\n');
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function tagsToPriority(tagsArr) {
  // Example convention: @P1 @P2 @Critical -> map to Priority
  const t = (tagsArr || []).map(t => t.toLowerCase());
  if (t.includes('@p0') || t.includes('@critical') || t.includes('@blocker')) return 'P0';
  if (t.includes('@p1') || t.includes('@high')) return 'P1';
  if (t.includes('@p2') || t.includes('@medium')) return 'P2';
  if (t.includes('@p3') || t.includes('@low')) return 'P3';
  return '';
}

function scenarioToRow(scn) {
  const allTags = [...(scn.featureTags || []), ...(scn.tags || [])];
  const priority = tagsToPriority(allTags);

  const givens = [];
  const whens = [];
  const thens = [];

  // Background treated as Preconditions
  (scn.background || []).forEach(st => {
    if ((st.keywordBase || '').toLowerCase() === 'given') givens.push(st.text);
  });

  (scn.steps || []).forEach(st => {
    const base = (st.keywordBase || '').toLowerCase();
    if (base === 'given') givens.push(st.text);
    else if (base === 'when') whens.push(st.text);
    else if (base === 'then') thens.push(st.text);
  });

  const preconditions = formatNumbered(givens);
  const steps = formatNumbered(whens);
  const expected = formatNumbered(thens);

  // Data from Examples (for Outline), kept as key=value;key=value
  let data = '';
  if ((scn.examples || []).length) {
    data = scn.examples.map(row =>
      Object.entries(row).map(([k, v]) => `${k}=${v}`).join('; ')
    ).join('\n');
  }

  return {
    Feature: scn.feature || '',
    Scenario: scn.name || '',
    Type: scn.type || 'Scenario',
    Tags: allTags.join(' '),
    Priority: priority,
    Preconditions: preconditions,
    Steps: steps,
    ExpectedResult: expected,
    Data: data
  };
}

function toCSV(rows) {
  const headers = ['Feature','Scenario','Type','Tags','Priority','Preconditions','Steps','ExpectedResult','Data'];
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) {
    const line = headers.map(h => csvEscape(r[h] ?? '')).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

function writeXlsxIfNeeded(rows, outFile) {
  try {
    const XLSX = require('xlsx');
    const headers = ['Feature','Scenario','Type','Tags','Priority','Preconditions','Steps','ExpectedResult','Data'];
    const aoa = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
    XLSX.writeFile(wb, outFile);
    return true;
  } catch (e) {
    console.error('Failed to write XLSX. Did you run "npm i xlsx"?', e.message);
    return false;
  }
}

// ---- main ----
const files = readAllFeatures(inputPath);
if (files.length === 0) {
  console.error('No .feature files found.');
  process.exit(1);
}

let allRows = [];
for (const { file, content } of files) {
  const scns = parseFeatureFile(content, file);
  const rows = scns.map(s => scenarioToRow(s));
  allRows = allRows.concat(rows);
}

if (allRows.length === 0) {
  console.error('No scenarios found.');
  process.exit(1);
}

if (asXlsx || outPath.toLowerCase().endsWith('.xlsx')) {
  const ok = writeXlsxIfNeeded(allRows, outPath);
  if (!ok) {
    console.log('Fallback to CSV...');
    fs.writeFileSync(outPath.replace(/\.xlsx$/i, '.csv'), toCSV(allRows), 'utf8');
  } else {
    console.log(`Wrote Excel: ${outPath}`);
  }
} else {
  fs.writeFileSync(outPath, toCSV(allRows), 'utf8');
  console.log(`Wrote CSV: ${outPath}`);
}
