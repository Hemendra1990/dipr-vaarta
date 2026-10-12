// Dumps the prototype's synthetic data and reference lists into backend seed JSON files.
// Usage: node tools/dump-seed.js <out-dir>
//
// On top of the prototype's rows it applies the round-3 drill-down data contract (see docs/notes/seed.md):
//  1. every district-tagged row gets `taluk`, one of its district's taluks, picked by a stable hash of the row id
//     (rows that already have a taluk keep it; small hand-written lists use a taluk their text names, if any);
//  2. every (dataset, district) pair with no rows, and every (register or spend, taluk) pair with no rows, gets
//     supplementary rows cloned from the dataset's own rows (same field distributions), with ids continuing the
//     series and `"supplementary": true`. Original rows are untouched apart from the added taluk.
const fs=require('fs'),path=require('path');
const d=require('./proto-data.js');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
const w=(n,o)=>fs.writeFileSync(path.join(out,n),JSON.stringify(o));
// A register's own taluk column (field and folk) is typed `taluk`, so uploads check it against the row's district.
const field=f=>{const o={k:f.k,h:f.h,t:f.k==='taluk'?'taluk':f.t,req:!!f.req};if(f.e)o.e=f.e;if(f.sw)o.sw=true;if(f.ex)o.ex=f.ex;return o};

/* ---------- helpers (same hash and RNG as the prototype) ---------- */
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967295}
function RNG(seed){let s=seed>>>0;return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rngFor=name=>RNG(Math.floor(hash('supp:'+name)*4294967295));
const rp=(r,a)=>a[Math.floor(r()*a.length)];
const ri=(r,a,b)=>a+Math.floor(r()*(b-a+1));
const rw=(r,a,wt)=>{let s=0;for(const x of wt)s+=x;let t=r()*s;for(let i=0;i<a.length;i++){t-=wt[i];if(t<=0)return a[i]}return a[a.length-1]};
const TALUKS=d.TALUKS,ALL_D=Object.values(d.DIVS).flat();
const isState=x=>!x||x==='Statewide'||x==='State';
/** FNV-1a with a murmur3 finaliser, so ids that differ only in their last digits still spread evenly. */
function hashMix(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296}
const hashTaluk=(dist,id)=>{const ts=TALUKS[dist];return ts[Math.floor(hashMix(String(id))*ts.length)]};
/** Taluk named in a free-text field (longest name first), else null. */
const talukInText=(dist,text)=>{if(!text)return null;const ts=[...TALUKS[dist]].sort((a,b)=>b.length-a.length);for(const t of ts)if(new RegExp('\\b'+t.replace(/[.]/g,'\\.')+'\\b').test(text))return t;return null};
/** Copy of row with `taluk` placed right after the district key (keeps every other key and value as is). */
const withTaluk=(row,dk,t)=>{if('taluk' in row)return {...row,taluk:t};const o={};for(const [k,v] of Object.entries(row)){o[k]=v;if(k===dk)o.taluk=t}return o};
/** Next id in a "<prefix><digits>" series, keeping the digit width. */
function idSeries(ids){let prefix=null,max=-1,width=0;for(const id of ids){const m=String(id).match(/^(.*?)(\d+)$/);if(!m)continue;prefix=m[1];width=Math.max(width,m[2].length);max=Math.max(max,+m[2])}
  return ()=>prefix+String(++max).padStart(width,'0')}

/* ---------- reference, registers, schemas ---------- */
w('reference.json',{divisions:d.DIVS,population:d.POP,codes:d.CODE,hex:d.HEX,taluks:d.TALUKS,lowRead:[...d.LOWREAD],
  schemes:d.SCH,languages:d.LANGS,channels:d.CHANNELS,departments:d.DEPTS,campaignTypes:d.CTYPES.map(c=>c.k),fys:d.FYS,schemesList:d.SCH_L});
w('registers.json',d.REGS.map(c=>({id:c.id,group:c.group,title:c.title,sub:c.sub,schema:c.schema.map(field),status:c.status,order:c.order,dim:c.dim,dimLabel:c.dimLabel,sum:c.sum||null,cols:c.cols,geoAll:!!c.geoAll,wa:c.wa||null,banner:c.banner||null})));
w('datasets.json',{spend:[...d.SPEND_SCHEMA.map(field),{k:'taluk',h:'Taluk',t:'taluk',req:false}],budget:d.BUDGET_SCHEMA.map(field)});

const VEND=Object.fromEntries(d.VENDORS.map(v=>[v.id,v]));
const LANDSLIDE=['Kodagu','Chikkamagaluru','Uttara Kannada','Dakshina Kannada','Hassan'],HEAT=['Kalaburagi','Raichur','Ballari','Yadgir','Vijayapura','Bidar','Koppal'];
/** Registers tied to vendors, release orders or one office per district: no per-taluk filling (see notes). */
const NO_TALUK_FILL=new Set(['empanel','bills','admin']);
/** Per-register rules: which existing rows may serve as a template for a district, and fix-ups after cloning. */
const RULES={
  social:{fix:(o)=>{o.handle='District handle, '+o.district}},
  crisis:{ok:(t,dist)=>t.hazard==='Landslide'?LANDSLIDE.includes(dist):t.hazard==='Heatwave'?HEAT.includes(dist):true},
  field:{fix:(o,r)=>{o.village=o.taluk+' GP '+ri(r,1,18)}},
  outdoor:{ok:(t,dist)=>{const v=VEND[t.vendorId];return !v||v.district==='Statewide'||v.district===dist}},
};

const report={};
const recs={};
for(const c of d.REGS){
  let rows=d.DATA[c.id].map(r=>{const o={...r};delete o._days;delete o._left;return o});
  if(c.geoAll){recs[c.id]=rows;continue}
  const idKey=(c.schema.find(f=>f.t==='id')||{}).k;
  const rowId=o=>c.id==='bills'?o.roNo:idKey?o[idKey]:o.office;
  // 1. taluk for every district-tagged row (admin: the district headquarters taluk, the office's seat)
  rows=rows.map(o=>{if(isState(o.district)||o.taluk)return o;
    return withTaluk(o,'district',c.id==='admin'?TALUKS[o.district][0]:hashTaluk(o.district,rowId(o)))});
  // 2. supplementary rows
  const r=rngFor('reg:'+c.id),rule=RULES[c.id]||{};
  const nextId=c.id==='archive'?(()=>{let i=rows.length-1;return o=>'AR-'+o.year+String(++i).padStart(4,'0')})():idKey?(()=>{const n=idSeries(rows.map(o=>o[idKey]));return ()=>n()})():null;
  const local=rows.filter(o=>!isState(o.district));
  const added=[];
  const clone=(dist,taluk)=>{const pool=local.filter(t=>!rule.ok||rule.ok(t,dist));const t=rp(r,pool.length?pool:local);
    const o={...t,district:dist};delete o.taluk;if(idKey)o[idKey]=nextId(o);
    const fixed=withTaluk(o,'district',taluk||hashTaluk(dist,idKey?o[idKey]:dist));
    if(rule.fix)rule.fix(fixed,r);fixed.supplementary=true;added.push(fixed);return fixed};
  const hasD=new Set(local.map(o=>o.district));
  for(const dist of ALL_D)if(!hasD.has(dist))clone(dist);
  if(!NO_TALUK_FILL.has(c.id)){const all=[...local,...added];const hasT=new Set(all.map(o=>o.district+'|'+o.taluk));
    for(const dist of ALL_D)for(const t of TALUKS[dist])if(!hasT.has(dist+'|'+t))clone(dist,t)}
  recs[c.id]=[...rows,...added];report['register:'+c.id]=added.length;
}
w('records.json',recs);

/* ---------- spend: taluk by hash of the RO number; supplementary orders for taluks with none ---------- */
let spend=d.SPEND.map(s=>isState(s.district)?s:withTaluk(s,'district',hashTaluk(s.district,s.roNo)));
{const r=rngFor('spend');let ro=Math.max(...spend.map(s=>+s.roNo.split('/')[2]));const add=[];
  const hasT=new Set(spend.filter(s=>s.taluk).map(s=>s.district+'|'+s.taluk));
  for(const dist of ALL_D){const pool=spend.filter(s=>s.district===dist);
    if(!pool.length)throw new Error('No spend rows to copy for '+dist);
    for(const t of TALUKS[dist])if(!hasT.has(dist+'|'+t)){const tp=rp(r,pool);
      add.push({...tp,roNo:'RO/'+tp.fy.slice(2,4)+'/'+String(++ro).padStart(5,'0'),taluk:t,supplementary:true})}}
  spend=[...spend,...add];report.spend=add.length;report.spendAmount=+add.reduce((a,s)=>a+s.amount,0).toFixed(2)}
w('spend.json',spend);w('budget.json',d.BUDGET);w('vendors.json',d.VENDORS);
w('outreach-base.json',Object.entries(d.TB).map(([k,v])=>{const [dist,taluk]=k.split('|');return {district:dist,taluk,...v}}));

/* ---------- small live lists: taluk, plus one older, settled row for every district that has none ---------- */
const ageH=a=>a.endsWith('m')?parseFloat(a)/60:parseFloat(a);
const tagSmall=(rows,idOf,textOf)=>rows.map(o=>isState(o.dist)?o:withTaluk(o,'dist',talukInText(o.dist,textOf(o))||hashTaluk(o.dist,idOf(o))));
const missingD=rows=>{const h=new Set(rows.map(o=>o.dist));return ALL_D.filter(x=>!h.has(x))};

let claims=tagSmall(d.claims.map(c=>({...c,ageHours:ageH(c.age),age:undefined})),o=>o.id,o=>o.text);
{const r=rngFor('claims'),n=idSeries(claims.map(c=>c.id)),urdu=['Bidar','Kalaburagi','Vijayapura'];
  const T={'Scheme rumour':[t=>`Message says Gruha Lakshmi payments in ${t} will stop unless women re-register at a private centre`,(t,x)=>`Forward claims Anna Bhagya rice in ${x} will be cut to 5 kg from next month`],
    'Fake recruitment':[(t,x)=>`${x} district court recruitment: pay ₹300 on a link to book an interview slot`],
    'Doctored circular':[t=>`Circular says all schools in ${t} taluk are closed tomorrow for a fever outbreak`],
    'Public safety':[t=>`Audio message says the tank near ${t} has breached and people must leave tonight`],
    'Price rumour':[(t,x)=>`Post says bus fares in ${x} go up by ₹10 from Monday`]};
  const cats=Object.keys(T);
  missingD(claims).forEach((x,i)=>{const id=n(),t=hashTaluk(x,id),cat=cats[i%cats.length];
    claims.push({id,text:rp(r,T[cat])(t,x),lang:urdu.includes(x)&&r()<.3?'Urdu':'Kannada',dist:x,taluk:t,cat,status:'Published',verdict:rw(r,['False','Misleading'],[.7,.3]),
      fw:ri(r,80,900),src:rw(r,['Tipline','District office','Analytics team'],[.6,.3,.1]),ageHours:ri(r,60,400),supplementary:true})});}
w('claims.json',claims);

let releases=tagSmall(d.releases,o=>o.id,o=>o.title);
{const r=rngFor('releases');let low=Math.min(...releases.map(x=>+x.id.slice(4)));
  const TOP=[[t=>`Yuva Nidhi registration help desk at the ${t} taluk office`,'Skill Development'],[t=>`Gruha Jyothi enrolment camp in ${t} this week`,'Energy'],
    [t=>`Crop insurance enrolment closes on 31 October in ${t}`,'Agriculture'],[t=>`Dengue prevention drive in ${t} town wards`,'Health & Family Welfare'],
    [t=>`Ration card e-KYC camps at ${t} fair price shops`,'Food & Civil Supplies'],[t=>`Road safety week programme in ${t}`,'Transport']];
  missingD(releases).forEach((x,i)=>{const id='REL-'+(--low),t=hashTaluk(x,id),[f,dept]=TOP[i%TOP.length];
    releases.push({id,title:`${x}: ${f(t)}`,dept,dist:x,taluk:t,h:+(1.2+4.5*r()).toFixed(1),reach:ri(r,48,150),kits:ri(r,12,90),pick:ri(r,5,32),ageHours:48+12*i,supplementary:true})});}
w('releases.json',releases);

const whenH=s=>{const m=s.match(/(\d+)h/);return m?+m[1]:1};
let feed=tagSmall(d.feed.map(f=>({...f,ageHours:whenH(f.when),when:undefined})),o=>o.dist+'|'+o.note,o=>o.note);
{const r=rngFor('feed');
  const P={'Gruha Lakshmi':t=>`Women in ${t} say the instalment came on time this month; a few ask about the re-KYC message.`,
    'Shakti':t=>`Buses from ${t} are crowded on market days; people ask for one more morning trip.`,
    'Anna Bhagya':t=>`Ration shop queues in ${t} are shorter after the new e-KYC counters.`,
    'Gruha Jyothi':t=>`Households in ${t} ask why the zero bill did not show this month.`,
    'Yuva Nidhi':t=>`Graduates in ${t} want the self-declaration date sent on WhatsApp.`};
  missingD(feed).forEach((x,i)=>{const t=hashTaluk(x,x+'|feed'),age=ri(r,20,240);
    if(i%2===0)feed.push({t:'report',dist:x,taluk:t,note:`Daily report: ${ri(r,1,5)} events covered, ${ri(r,0,2)} releases issued. No issues.`,ageHours:age,supplementary:true});
    else{const s=rp(r,Object.keys(P));feed.push({t:'pulse',dist:x,taluk:t,scheme:s,sent:rw(r,['Positive','Mixed','Negative'],[.4,.4,.2]),note:P[s](t),ageHours:age,supplementary:true})}});}
w('feed.json',feed);

let flags=tagSmall(d.adFlags,o=>o.ro,o=>o.pub);
{const r=rngFor('flags'),n=idSeries(flags.map(f=>f.ro)),issues=d.adFlags.map(f=>f.issue);
  missingD(flags).forEach((x,i)=>{const ro=n(),t=hashTaluk(x,ro);
    flags.push({ro,pub:`Publication ${String.fromCharCode(70+i%20)} · district daily · ${x}`,issue:rp(r,issues),amt:+(.3+2.7*r()).toFixed(1),dist:x,taluk:t,sev:rw(r,['crit','warn'],[.35,.65]),supplementary:true})});}
w('ad-flags.json',flags);

report.claims=claims.length-d.claims.length;report.releases=releases.length-d.releases.length;report.feed=feed.length-d.feed.length;report.adFlags=flags.length-d.adFlags.length;
console.log('seed written to',out);console.log('supplementary rows:',JSON.stringify(report));
