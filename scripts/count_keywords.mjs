import fs from 'node:fs';
import path from 'node:path';

const csvPath = process.argv[2] || path.join('rank-lens','app','data','SEO Work Allocation - HSHK 總表(更新中）.csv');
const text = fs.readFileSync(csvPath,'utf8');

function parseCSV(t){
  const rows=[]; let cur=""; let row=[]; let q=false;
  for(let i=0;i<t.length;i++){
    const ch=t[i];
    if(q){
      if(ch==='"'){
        if(t[i+1]==='"'){ cur+='"'; i++; } else { q=false; }
      } else { cur+=ch; }
    } else {
      if(ch==='"') q=true; else if(ch===','){ row.push(cur); cur=""; }
      else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
      else if(ch==='\r'){ /* ignore */ } else { cur+=ch; }
    }
  }
  row.push(cur); rows.push(row); return rows;
}

const rows = parseCSV(text);
if(rows.length < 2){
  console.log('rows:', rows.length);
  process.exit(0);
}
const header = rows[1]; // first line is a guide row for this CSV
let targetIdx = header.findIndex((c)=>/(TargetKeyword|Target|目標\s*關鍵字)/i.test(c));
if(targetIdx < 0) targetIdx = 9; // fallback to 10th column (0-based 9)

let count = 0;
for(let i=2;i<rows.length;i++){
  const r = rows[i];
  if(!r || r.length <= targetIdx) continue;
  const cell = r[targetIdx] || '';
  const parts = String(cell)
    .split(/\r?\n|,|，|、|;|；|\/|／/)
    .map((s)=>s.trim())
    .filter(Boolean);
  count += parts.length;
}
console.log('Total TargetKeywords:', count);
