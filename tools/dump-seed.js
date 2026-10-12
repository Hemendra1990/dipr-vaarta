// Dumps the prototype's synthetic data and reference lists into backend seed JSON files.
// Usage: node tools/dump-seed.js <out-dir>
const fs=require('fs'),path=require('path');
const d=require('./proto-data.js');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
const w=(n,o)=>fs.writeFileSync(path.join(out,n),JSON.stringify(o));
const field=f=>{const o={k:f.k,h:f.h,t:f.t,req:!!f.req};if(f.e)o.e=f.e;if(f.sw)o.sw=true;if(f.ex)o.ex=f.ex;return o};
w('reference.json',{divisions:d.DIVS,population:d.POP,codes:d.CODE,hex:d.HEX,taluks:d.TALUKS,lowRead:[...d.LOWREAD],
  schemes:d.SCH,languages:d.LANGS,channels:d.CHANNELS,departments:d.DEPTS,campaignTypes:d.CTYPES.map(c=>c.k),fys:d.FYS,schemesList:d.SCH_L});
w('registers.json',d.REGS.map(c=>({id:c.id,group:c.group,title:c.title,sub:c.sub,schema:c.schema.map(field),status:c.status,order:c.order,dim:c.dim,dimLabel:c.dimLabel,sum:c.sum||null,cols:c.cols,geoAll:!!c.geoAll,wa:c.wa||null,banner:c.banner||null})));
w('datasets.json',{spend:d.SPEND_SCHEMA.map(field),budget:d.BUDGET_SCHEMA.map(field)});
const recs={};for(const c of d.REGS)recs[c.id]=d.DATA[c.id].map(r=>{const o={...r};delete o._days;delete o._left;return o});
w('records.json',recs);
w('spend.json',d.SPEND);w('budget.json',d.BUDGET);w('vendors.json',d.VENDORS);
w('outreach-base.json',Object.entries(d.TB).map(([k,v])=>{const [dist,taluk]=k.split('|');return {district:dist,taluk,...v}}));
const ageH=a=>a.endsWith('m')?parseFloat(a)/60:parseFloat(a);
w('claims.json',d.claims.map(c=>({...c,ageHours:ageH(c.age),age:undefined})));
w('releases.json',d.releases);
const whenH=s=>{const m=s.match(/(\d+)h/);return m?+m[1]:1};
w('feed.json',d.feed.map(f=>({...f,ageHours:whenH(f.when),when:undefined})));
w('ad-flags.json',d.adFlags);
console.log('seed written to',out);
