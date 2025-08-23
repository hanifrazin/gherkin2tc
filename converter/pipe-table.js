#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { program } = require("commander");

function ts() {
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const isEmpty = v => v==null || String(v).trim()==="" || String(v).toLowerCase()==="nan";
const esc = s => String(s ?? "").replace(/\|/g,"\\|").trim();
const norm = s => {
  const v = esc(s);
  return /^(true|false)$/i.test(v) ? v.toUpperCase() : v;
};

function splitByBlankRows(rows, gap=1){
  const blocks=[]; let acc=[], blanks=0;
  for (const r of rows){
    const empty = !r || r.every(isEmpty);
    if (empty){
      blanks++;
      if (blanks>=gap){
        if (acc.length){ blocks.push(acc); acc=[]; }
      }
    } else {
      blanks=0; acc.push(r);
    }
  }
  if (acc.length) blocks.push(acc);
  return blocks;
}

function takeLeadingComments(block) {
  const comments = [];
  while (block.length) {
    const row = block[0] || [];
    const vals = row.filter(v => !isEmpty(v)).map(v => String(v).trim());
    if (vals.length !== 1) break;

    const v = vals[0];
    const isHash = v.startsWith('#');
    const isTicket = /^[A-Z][A-Z0-9]+-\d+$/i.test(v);

    if (isHash || isTicket) {
      comments.push(isHash ? v : (`# ${v}`));
      block.shift(); // buang baris ini dari blok agar tidak ikut ke table
      continue;
    }
    break;
  }
  return comments;
}

function toExamples(block, indent=4, columns=null, maskSet=new Set(), noHeader=false){
  if (!block || block.length<2) return null;

  let header, data;
  if (noHeader){
    const maxLen = Math.max(...block.map(r => r.length));
    header = Array.from({length:maxLen},(_,i)=>`c${i}`);
    data = block;
  } else {
    header = block[0]; data = block.slice(1);
  }

  // tentukan banyak kolom dari header terakhir yang tidak kosong
  let last = -1;
  header.forEach((h,i)=>{ if(!isEmpty(h)) last=i; });
  const colCount = last>=0 ? last+1 : header.length;

  // whitelist kolom (nama case-insensitive atau #index)
  let idx = Array.from({length:colCount}, (_,i)=>i);
  if (columns && columns.length){
    const hdrLC = header.slice(0,colCount).map(h => esc(h).toLowerCase());
    idx = columns.map(c=>{
      if (/^#\d+$/.test(c)) return parseInt(c.slice(1),10);
      return hdrLC.indexOf(String(c).toLowerCase());
    }).filter(i=> i>=0 && i<colCount);
    if (!idx.length) return null;
  }

  const hdr = idx.map(i => norm(header[i]));
  const rows = [];
  for (const r of data){
    const row = idx.map((i,j)=>{
      let v = norm(r[i] ?? "");
      if (maskSet.has(hdr[j].toLowerCase()) && v) v = "****";
      return v;
    });
    if (!row.every(isEmpty)) rows.push(row);
  }
  if (!rows.length) return null;

  // align
  const widths = hdr.map((_,i)=> Math.max(hdr[i].length, ...rows.map(r=>r[i].length)));
  const pad = cells => {
    const parts = cells.map((c,i)=> c.padEnd(widths[i]," "));
    return " ".repeat(indent) + "| " + parts.join(" | ") + " |";
  };

  const lines = ["Examples:", pad(hdr), ...rows.map(pad)];
  return lines.join("\n");
}

program
  .name("gherkin-table")
  .description("Convert Excel/CSV → one .feature (all sheets), with '# Sheet: <name>' and multiple Examples")
  .argument("<file>", "path ke .xlsx/.csv")
  .option("--out-dir <dir>", "folder output", "output-pipe-tables")
  .option("--indent <n>", "spasi indent sebelum '|'", "4")
  .option("--columns <cols>", "whitelist kolom (nama atau #index), koma-separated")
  .option("--mask <cols>", "mask kolom sensitif (berdasarkan header yang sudah terseleksi), koma-separated")
  .option("--no-header", "anggap baris pertama tiap tabel bukan header")
  .option("--table-gap <n>", "jumlah baris kosong sebagai pemisah tabel", "1")
  .action((file, opts) => {
    if (!fs.existsSync(file)) { console.error("File tidak ditemukan:", file); process.exit(1); }

    const wb = xlsx.readFile(file, {cellDates:false, cellNF:false, cellText:false});
    const sheets = wb.SheetNames;
    const outDir = path.resolve(process.cwd(), opts.outDir);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });

    const base = path.basename(file, path.extname(file));
    const outPath = path.join(outDir, `${base}_${ts()}.feature`);

    const indent = Number(opts.indent)||4;
    const gap = Math.max(1, Number(opts.tableGap)||1);
    const columns = opts.columns ? opts.columns.split(",").map(s=>s.trim()).filter(Boolean) : null;
    const maskSet = new Set((opts.mask||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));
    const noHeader = !!opts.noHeader;

    const outLines = [];
    for (const sheet of sheets){
      const sh = wb.Sheets[sheet];
      const raw = xlsx.utils.sheet_to_json(sh, {header:1, raw:true, blankrows:true});
      if (!raw.length) continue;

      const blocks = splitByBlankRows(raw, gap);

      // header per sheet
      outLines.push(`# Sheet: ${sheet}`);

      let any = false;
      for (let b of blocks){
        // trim leading/trailing blank
        while (b.length && (!b[0] || b[0].every(isEmpty))) b.shift();
        while (b.length && (!b[b.length-1] || b[b.length-1].every(isEmpty))) b.pop();

        // 🔸 Ambil baris komentar di awal blok (tidak dikonversi jadi table)
        const comments = takeLeadingComments(b);

        const ex = toExamples(b, indent, columns, maskSet, noHeader);
        if (ex){
          // 🔸 Tulis komentar dulu (jika ada), baru Examples
          for (const c of comments) outLines.push(c);
          outLines.push(ex);
          outLines.push("");
          any = true;
        }
      }
      if (!any){ outLines.pop(); } // remove "# Sheet: ..." if no examples
      outLines.push("");
    }

    const finalText = (outLines.join("\n").trimEnd() + "\n");
    fs.writeFileSync(outPath, finalText);
    console.log(`✔ Output tersimpan: ${outPath}`);
  });

program.parse();
