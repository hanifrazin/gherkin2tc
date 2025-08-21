#!/usr/bin/env node
// gherkin2tc_noheur.js — no-heuristics for Priority/Type; expand Examples
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node gherkin2tc_noheur.js <file.feature|dir> -o <out.csv|out.xlsx> [--xlsx]');
  process.exit(1);
}
let inputPath=null, outPath='testcases.xlsx', forceXlsx=false;
for (let i=0;i<args.length;i++){
  const a=args[i];
  if(!a.startsWith('-') && !inputPath) inputPath=a;
  if(a==='-o'||a==='--out') outPath=args[i+1];
  if(a==='--xlsx') forceXlsx=true;
}
if(!inputPath){ console.error('Error: input path is required.'); process.exit(1); }

function walk(dir){ return fs.readdirSync(dir).flatMap(n=>{const p=path.join(dir,n);const s=fs.statSync(p);return s.isDirectory()?walk(p):[p];});}
function readAllFeatures(p){ const st=fs.statSync(p); const files=st.isDirectory()?walk(p).filter(f=>f.toLowerCase().endsWith('.feature')):[p]; return files.map(f=>({file:f,content:fs.readFileSync(f,'utf8')})); }

const STEP_KW=['Given','When','Then','And','But'];
const kwRe=/^\s*(Given|When|Then|And|But)\b\s*(.*)$/i;
const clean= s => (s.includes(' #')?s.slice(0,s.indexOf(' #')):s).trim();
const isStep = l => STEP_KW.some(k=>new RegExp(`^\\s*${k}\\b`).test(l));

function parse(text, filename){
  const lines=text.split(/\r?\n/);
  let feature='', featureTags=[], background=[], scenarios=[], tags=[], i=0;
  while(i<lines.length){
    let ln=clean(lines[i]);
    if(!ln || ln.startsWith('#')){ i++; continue; }
    if(ln.startsWith('@')){ tags=ln.split(/\s+/).filter(Boolean); i++; continue; }
    if(/^Feature:/i.test(ln)){ feature=ln.replace(/^Feature:\s*/i,'').trim(); if(tags.length){featureTags=tags.slice(); tags=[];} i++; continue; }
    if(/^Background:/i.test(ln)){
      i++; let last=null;
      while(i<lines.length){
        const b=clean(lines[i]);
        if(!b || b.startsWith('#')){ i++; continue; }
        if(/^(Scenario(?: Outline)?:|Feature:|Background:|Examples:)/i.test(b)) break;
        const m=b.match(kwRe);
        if(m){ const kw=m[1][0].toUpperCase()+m[1].slice(1).toLowerCase(); const base=(kw==='And'||kw==='But')?(last||'Given'):kw; background.push({keywordBase:base,text:m[2].trim()}); last=base; }
        i++;
      }
      continue;
    }
    const mSc=ln.match(/^Scenario(?: Outline)?:\s*(.+)$/i);
    if(mSc){
      const type=ln.includes('Outline')?'Scenario Outline':'Scenario';
      const name=mSc[1].trim();
      const scTags=tags.slice(); tags=[];
      i++;
      const steps=[], examples=[];
      let last=null;
      while(i<lines.length){
        const cur=clean(lines[i]);
        if(/^@/.test(cur) || /^Scenario(?: Outline)?:/i.test(cur) || /^Feature:/i.test(cur) || /^Background:/i.test(cur)) break;
        if(!cur || cur.startsWith('#')){ i++; continue; }
        if(/^Examples:/i.test(cur)){
          i++; const rows=[];
          while(i<lines.length){
            const t=clean(lines[i]);
            if(!t || t.startsWith('#')){ i++; continue; }
            if(/^\|/.test(t)){ const cells=t.replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim()); rows.push(cells); i++; continue; }
            break;
          }
          if(rows.length>=2){ const hdr=rows[0]; for(let r=1;r<rows.length;r++){ const obj={}; hdr.forEach((h,idx)=>obj[h]=rows[r][idx]??''); examples.push(obj);} }
          continue;
        }
        const m=cur.match(kwRe);
        if(m){ const kw=m[1][0].toUpperCase()+m[1].slice(1).toLowerCase(); const base=(kw==='And'||kw==='But')?(last||'Given'):kw; steps.push({keywordBase:base,text:m[2].trim()}); last=base; i++; continue; }
        i++;
      }
      scenarios.push({file:filename, feature, featureTags, tags:scTags, type, name, background:[...background], steps, examples});
      continue;
    }
    i++;
  }
  return scenarios;
}
const substitute=(t,ex)=> ex? String(t).replace(/<\s*([^>]+)\s*>/g,(_,k)=> (k in ex?ex[k]:`<${k}>`)) : String(t);
const numbered= arr => !arr.length?'':arr.map((s,i)=>`${i+1}. ${s}`).join('\n');
const tagsToPriority= t => { const v=(t||[]).map(x=>x.toLowerCase()); if(v.includes('@p0')||v.includes('@critical')||v.includes('@blocker')) return 'P0'; if(v.includes('@p1')||v.includes('@high')) return 'P1'; if(v.includes('@p2')||v.includes('@medium')) return 'P2'; if(v.includes('@p3')||v.includes('@low')) return 'P3'; return ''; };
const tagsToType= t => { const v=(t||[]).map(x=>x.toLowerCase()); if(v.includes('@negative')) return 'Negative'; if(v.includes('@positive')) return 'Positive'; return ''; };

function scenariosToRows(sc){
  const baseGivens=(sc.background||[]).filter(s=>(s.keywordBase||'').toLowerCase()==='given').map(s=>s.text);
  const allTags=[...(sc.featureTags||[]), ...(sc.tags||[])];
  const Priority = tagsToPriority(allTags); // ONLY from tags
  const Type = tagsToType(allTags);         // ONLY from tags

  const build = (ex) => {
    const giv=[...baseGivens], wh=[], th=[];
    let mode=null;
    (sc.steps||[]).forEach(st=>{
      const txt=substitute(st.text, ex);
      const base=(st.keywordBase||'').toLowerCase();
      if(base==='given'){ mode='given'; giv.push(txt); }
      else if(base==='when'){ mode='when'; wh.push(txt); }
      else if(base==='then'){ mode='then'; th.push(txt); }
      else { if(mode==='given') giv.push(txt); else if(mode==='then') th.push(txt); else wh.push(txt); }
    });
    return {
      Title: substitute(sc.name, ex),
      Feature: sc.feature||'',
      'Precondition (Given)': numbered(giv),
      'Test Steps (When/And)': numbered(wh),
      'Expected Result (Then/And)': numbered(th),
      Priority,               // blank if no tags
      Type,                   // blank if no tags
      Tags: allTags.join(' '),
      'Test Data': ex? Object.entries(ex).map(([k,v])=>`${k}=${v}`).join('; ') : '',
      Notes: ''
    };
  };

  const rows=[];
  if(sc.type==='Scenario Outline' && (sc.examples||[]).length){
    for(const ex of sc.examples) rows.push(build(ex));
  }else{
    rows.push(build(null));
  }
  return rows;
}

function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function toCSV(rows){
  const headers=['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
  const out=[headers.join(',')];
  let i=1;
  for(const r of rows){
    const tcid = `TC-${String(i).padStart(3,'0')}`;
    out.push([tcid, ...headers.slice(1).map(h=>csvEscape(r[h]??''))].join(','));
    i++;
  }
  return out.join('\n');
}

async function writeXlsx(rows, outFile){
  try{
    const ExcelJS=require('exceljs');
    const wb=new ExcelJS.Workbook();
    const ws=wb.addWorksheet('TestCases',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
    const headers=['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
    ws.addRow(headers); ws.getRow(1).font={bold:true};
    let i=1;
    for(const r of rows){
      const tcid=`TC-${String(i).padStart(3,'0')}`; i++;
      ws.addRow([tcid, r.Title, r.Feature, r['Precondition (Given)'], r['Test Steps (When/And)'], r['Expected Result (Then/And)'], r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes]);
    }
    const widths=[12,30,24,36,40,40,10,12,24,24,20];
    widths.forEach((w,ci)=> ws.getColumn(ci+1).width=w);
    ws.eachRow(row=>row.eachCell(c=> c.alignment={wrapText:true, vertical:'top'}));
    await wb.xlsx.writeFile(outFile);
    return true;
  }catch(e){
    try{
      const XLSX=require('xlsx');
      const headers=['TC_ID','Title','Feature','Precondition (Given)','Test Steps (When/And)','Expected Result (Then/And)','Priority','Type','Tags','Test Data','Notes'];
      const aoa=[headers]; let i=1;
      for(const r of rows){ const tcid=`TC-${String(i).padStart(3,'0')}`; i++; aoa.push([tcid, r.Title, r.Feature, r['Precondition (Given)'], r['Test Steps (When/And)'], r['Expected Result (Then/And)'], r.Priority, r.Type, r.Tags, r['Test Data'], r.Notes]); }
      const ws=XLSX.utils.aoa_to_sheet(aoa); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'TestCases'); XLSX.writeFile(wb, outFile); return true;
    }catch(err){
      console.error('Install exceljs atau xlsx untuk ekspor .xlsx'); console.error(err.message); return false;
    }
  }
}

// ---- main
const inputs=readAllFeatures(inputPath);
let rows=[];
for(const {file,content} of inputs){
  const scs=parse(content, file);
  for(const sc of scs){ rows = rows.concat(scenariosToRows(sc)); }
}
(async()=>{
  if(forceXlsx || outPath.toLowerCase().endsWith('.xlsx')){
    const ok = await writeXlsx(rows, outPath);
    if(!ok){
      const csv = toCSV(rows);
      fs.writeFileSync(outPath.replace(/\.xlsx$/i,'.csv'), csv, 'utf8');
      console.log('Fallback to CSV.');
    }else{
      console.log(`Wrote Excel: ${outPath}`);
    }
  }else{
    fs.writeFileSync(outPath, toCSV(rows), 'utf8');
    console.log(`Wrote CSV: ${outPath}`);
  }
})();