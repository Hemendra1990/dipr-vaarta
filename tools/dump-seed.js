// Dumps the prototype's synthetic data and reference lists into backend seed JSON files.
// Usage: node tools/dump-seed.js <out-dir>
//
// On top of the prototype's rows it applies the round-3 drill-down data contract (see docs/notes/seed.md):
//  1. every district-tagged row gets `taluk`, one of its district's taluks, picked by a stable hash of the row id
//     (rows that already have a taluk keep it; small hand-written lists use a taluk their text names, if any);
//  2. every (dataset, district) and (dataset, taluk) pair with no rows (offices: district only), plus Health and PR-K02 gaps, gets
//     supplementary rows cloned from the dataset's own rows (same field distributions), with ids continuing the
//     series and `"supplementary": true`. Original rows are untouched apart from the added taluk, except that the
//     Health and PR-K02 district orders are paid for out of statewide orders (and their bills), keeping totals as generated.
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
/* ---------- spend: taluk by hash of the RO number; supplementary orders for taluks with none ---------- */
const HEALTH='Health & Family Welfare';
const ymOk=m=>m>='2026-04'&&m<='2026-09';            // current year, April to September (like-for-like months)
const booked=s=>s.status==='Paid'||s.status==='Billed';
let spend=d.SPEND.map(s=>isState(s.district)?s:withTaluk(s,'district',hashTaluk(s.district,s.roNo)));
let ro=Math.max(...spend.map(s=>+s.roNo.split('/')[2]));
const nextRo=fy=>'RO/'+fy.slice(2,4)+'/'+String(++ro).padStart(5,'0');
const suppSpend=[];
{const r=rngFor('spend');
  const hasT=new Set(spend.filter(s=>s.taluk).map(s=>s.district+'|'+s.taluk));
  for(const dist of ALL_D){const pool=spend.filter(s=>s.district===dist);
    if(!pool.length)throw new Error('No spend rows to copy for '+dist);
    for(const t of TALUKS[dist])if(!hasT.has(dist+'|'+t)){const tp=rp(r,pool);
      suppSpend.push({...tp,roNo:nextRo(tp.fy),taluk:t,supplementary:true})}}}
// Health & Family Welfare (the demo nodal officer's department): a booked order in every taluk in April–September of
// the current year, bought from a vendor of that district, so the nodal officer's spend, like-for-like and bills views
// have data at every drill level.
{const r=rngFor('spend:health');
  const tpl=spend.filter(s=>s.department===HEALTH&&booked(s)&&ymOk(s.month)&&!isState(s.district));
  if(!tpl.length)throw new Error('No Health template orders');
  const has=new Set(spend.filter(s=>s.department===HEALTH&&booked(s)&&s.taluk&&ymOk(s.month)).map(s=>s.district+'|'+s.taluk));
  for(const dist of ALL_D){const local=d.VENDORS.filter(v=>v.district===dist);
    if(!local.length)throw new Error('No district vendor in '+dist);
    for(const t of TALUKS[dist]){if(has.has(dist+'|'+t))continue;
      const tp=rp(r,tpl),same=local.filter(v=>v.channel===tp.channel),v=rp(r,same.length?same:local);
      suppSpend.push({...tp,roNo:nextRo(tp.fy),channel:v.channel,vendorId:v.id,vendor:v.name,district:dist,taluk:t,supplementary:true})}}}
// The demo vendor PR-K02 is a statewide Kannada daily: give it district-edition orders in two districts of every
// division. Each is a slice (15%) of one of its own booked statewide orders of this year, so its total stays the same.
{const k02=VEND['PR-K02'],src=spend.filter(s=>s.vendorId==='PR-K02'&&isState(s.district)&&booked(s)&&s.fy==='2026-27'&&ymOk(s.month));
  if(!src.length)throw new Error('No PR-K02 orders to split');let i=0;
  for(const ds of Object.values(d.DIVS)){const pick=[...ds].sort((a,b)=>hash(a+'k02')-hash(b+'k02')).slice(0,2);
    for(const dist of pick){const tp=src[i++%src.length],roNo=nextRo(tp.fy);
      suppSpend.push({...tp,roNo,vendor:k02.name,district:dist,taluk:hashTaluk(dist,roNo),amount:+(tp.amount*.15).toFixed(2),supplementary:true})}}}
// Every district has at least one order awaiting payment (the payer's default "Billed" status).
{const billed=new Set([...spend,...suppSpend].filter(s=>s.status==='Billed').map(s=>s.district));
  for(const dist of ALL_D)if(!billed.has(dist)){const o=suppSpend.find(s=>s.district===dist&&s.department===HEALTH);if(o)o.status='Billed'}}
// Keep state-level spend unchanged: each Health or PR-K02 edition order is paid for out of statewide booked orders of
// the same department in the same months (PR-K02 editions from PR-K02's own orders, Health orders from other vendors'), never taking a statewide order below 30% of its
// original amount. The bills of those statewide orders shrink by the same amounts (see below).
const delta={};let uncovered=0;
{const orig={};
  const k02=s=>s.vendorId==='PR-K02';
  const base=spend.filter(x=>isState(x.district)&&booked(x)&&x.fy==='2026-27'&&ymOk(x.month));
  // nearest first: same campaign, month and status; then same campaign and month; then same department
  const tiers=s=>[x=>x.campaignId===s.campaignId&&x.month===s.month&&x.status===s.status,x=>x.campaignId===s.campaignId&&x.month===s.month,()=>true]
    .map(f=>base.filter(x=>x.department===s.department&&k02(x)===k02(s)&&f(x)).map(x=>x.roNo));
  const byRo=Object.fromEntries(spend.map((x,i)=>[x.roNo,i]));
  for(const s of suppSpend){if(s.department!==HEALTH&&!k02(s))continue;let need=s.amount;
    for(const ros of tiers(s)){
      while(need>0.005){const pool=ros.map(ro=>spend[byRo[ro]]).filter(x=>x.amount-0.3*(orig[x.roNo]??=x.amount)>0.01).sort((a,b)=>b.amount-a.amount);
        if(!pool.length)break;
        const x=pool[0],take=+Math.min(need,x.amount-0.3*orig[x.roNo]).toFixed(2);if(take<=0)break;
        spend[byRo[x.roNo]]={...x,amount:+(x.amount-take).toFixed(2)};delta[x.roNo]=+((delta[x.roNo]||0)+take).toFixed(2);need=+(need-take).toFixed(2)}
      if(need<=0.005)break}
    if(need>0.005)uncovered+=need}}
report.statewideReduced=Object.keys(delta).length;report.uncovered=+uncovered.toFixed(2);
spend=[...spend,...suppSpend];
report.spend=suppSpend.length;report.spendAmount=+suppSpend.reduce((a,s)=>a+s.amount,0).toFixed(2);
// Bills for the supplementary booked orders (as the generator does for orders from March 2026), numbered in the register loop.
const suppBills=[];
{const r=rngFor('bills');
  for(const s of suppSpend){if(!booked(s)||s.month<'2026-03')continue;const [y,m]=s.month.split('-').map(Number);
    let bd=new Date(y,m,ri(r,4,22));const t0=new Date(2026,9,7);if(bd>t0)bd=t0;
    const iso=bd.getFullYear()+'-'+String(bd.getMonth()+1).padStart(2,'0')+'-'+String(bd.getDate()).padStart(2,'0');
    const stage=s.status==='Paid'?'Paid':rw(r,['Received','Proof check','Sanctioned'],[.35,.35,.3]);
    suppBills.push({billNo:null,roNo:s.roNo,vendorId:s.vendorId,vendor:s.vendor,campaignId:s.campaignId,campaign:s.campaign,department:s.department,channel:s.channel,
      district:s.district,taluk:s.taluk,billDate:iso,amount:s.amount,proof:'Attached',stage,supplementary:true})}}
// Empanelment: a local vendor for every taluk that has none (district vendors are hashed to a taluk like other rows).
const LOCAL_KINDS=[['Print','PR-D','District daily'],['Television','TV-C','Regional cable network'],['Radio & FM','RF-C','Community radio'],['Outdoor','OD-H','Hoarding agency'],['Field & folk','FF-T','Folk troupe']];
const suppVendors=[];
{const has=new Set(d.VENDORS.filter(v=>!isState(v.district)).map(v=>v.district+'|'+hashTaluk(v.district,v.id)));
  const next={};LOCAL_KINDS.forEach(([,pre])=>next[pre]=Math.max(...d.VENDORS.filter(v=>v.id.startsWith(pre)).map(v=>+v.id.slice(pre.length))));
  let i=0;for(const dist of ALL_D)for(const t of TALUKS[dist]){if(has.has(dist+'|'+t))continue;
    const [ch,pre,kind]=LOCAL_KINDS[i++%LOCAL_KINDS.length],id=pre+String(++next[pre]).padStart(2,'0');
    suppVendors.push({id,kind,channel:ch,district:dist,language:'Kannada',name:`${id} · ${kind}, ${dist}`,taluk:t,supplementary:true})}}
const vendorsOut=[...d.VENDORS,...suppVendors.map(({taluk,...v})=>v)];
Object.assign(VEND,Object.fromEntries(suppVendors.map(v=>[v.id,v])));

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
  // Bills of the supplementary orders; Health media in every taluk; an empanelment row for every supplementary vendor.
  if(c.id==='bills'){
    // A bill covers a vendor's orders for one campaign in one month (generator rule); shrink it by its orders' reductions.
    const grp={};d.SPEND.filter(x=>x.month>='2026-03'&&x.status!=='RO issued').forEach(x=>{const k=x.vendorId+'|'+x.month+'|'+x.campaignId;(grp[k]||(grp[k]=[])).push(x.roNo)});
    const cut={};Object.values(grp).forEach(ros=>{const dd=ros.reduce((a,ro)=>a+(delta[ro]||0),0);if(dd)cut[ros[0]]=dd});
    rows=rows.map(o=>cut[o.roNo]?{...o,amount:+(o.amount-cut[o.roNo]).toFixed(2)}:o);
    for(const b of suppBills)added.push({...b,billNo:nextId()});}
  if(c.id==='empanel')for(const v of suppVendors){const pool=local.filter(o=>o.channel===v.channel);const t=rp(r,pool.length?pool:local);
    added.push({...withTaluk({...t,vendorId:v.id,vendor:v.name,channel:v.channel,language:v.language,district:v.district},'district',v.taluk),supplementary:true})}
  if(c.id==='media'){const hp=local.filter(o=>o.department===HEALTH),has=new Set(hp.map(o=>o.district+'|'+o.taluk));
    for(const dist of ALL_D)for(const t of TALUKS[dist])if(!has.has(dist+'|'+t)){const tp=rp(r,hp);
      added.push({...withTaluk({...tp,clipId:nextId(),district:dist},'district',t),supplementary:true})}}
  const clone=(dist,taluk)=>{const pool=local.filter(t=>!rule.ok||rule.ok(t,dist));const t=rp(r,pool.length?pool:local);
    const o={...t,district:dist};delete o.taluk;if(idKey)o[idKey]=nextId(o);
    const fixed=withTaluk(o,'district',taluk||hashTaluk(dist,idKey?o[idKey]:dist));
    if(rule.fix)rule.fix(fixed,r);fixed.supplementary=true;added.push(fixed);return fixed};
  const hasD=new Set([...local,...added].map(o=>o.district));
  for(const dist of ALL_D)if(!hasD.has(dist))clone(dist);
  if(!NO_TALUK_FILL.has(c.id)){const all=[...local,...added];const hasT=new Set(all.map(o=>o.district+'|'+o.taluk));
    for(const dist of ALL_D)for(const t of TALUKS[dist])if(!hasT.has(dist+'|'+t))clone(dist,t)}
  recs[c.id]=[...rows,...added];report['register:'+c.id]=added.length;
}
w('records.json',recs);
w('spend.json',spend);w('budget.json',d.BUDGET);w('vendors.json',vendorsOut);
w('outreach-base.json',Object.entries(d.TB).map(([k,v])=>{const [dist,taluk]=k.split('|');return {district:dist,taluk,...v}}));


/* ---------- small live lists: taluk, plus one older, settled row for every taluk that has none ----------
   Supplementary claims are published or closed, feed items are daily reports (no pulse notes or escalations), flags are
   already reviewed (Cleared or Resolved) and releases are days to weeks old, so live queues and their counts stay as in
   the prototype. */
const ageH=a=>a.endsWith('m')?parseFloat(a)/60:parseFloat(a);
const tagSmall=(rows,idOf,textOf)=>rows.map(o=>isState(o.dist)?o:withTaluk(o,'dist',talukInText(o.dist,textOf(o))||hashTaluk(o.dist,idOf(o))));
const missingT=rows=>{const h=new Set(rows.map(o=>o.dist+'|'+o.taluk));const out=[];for(const x of ALL_D)for(const t of TALUKS[x])if(!h.has(x+'|'+t))out.push([x,t]);return out};

let claims=tagSmall(d.claims.map(c=>({...c,ageHours:ageH(c.age),age:undefined})),o=>o.id,o=>o.text);
{const r=rngFor('claims'),n=idSeries(claims.map(c=>c.id)),urdu=['Bidar','Kalaburagi','Vijayapura'];
  const T={'Scheme rumour':[t=>`Message says Gruha Lakshmi payments in ${t} will stop unless women re-register at a private centre`,(t,x)=>`Forward claims Anna Bhagya rice in ${t} (${x}) will be cut to 5 kg from next month`,t=>`Voice note says Shakti free travel ends for ${t} routes from Monday`],
    'Fake recruitment':[(t,x)=>`${t} taluk office recruitment: pay ₹300 on a link to book an interview slot`,t=>`Notice offers 300 anganwadi posts in ${t}; fee to be paid by UPI`],
    'Doctored circular':[t=>`Circular says all schools in ${t} taluk are closed tomorrow for a fever outbreak`,t=>`Fake order says ${t} ration shops will close for two weeks`],
    'Public safety':[t=>`Audio message says the tank near ${t} has breached and people must leave tonight`,t=>`Post claims a leopard was seen near ${t} bus stand; schools shut`],
    'Price rumour':[t=>`Post says bus fares from ${t} go up by ₹10 from Monday`,t=>`Message claims LPG cylinders in ${t} will cost ₹200 more from next week`]};
  const cats=Object.keys(T);
  missingT(claims).forEach(([x,t],i)=>{const id=n(),cat=cats[i%cats.length],st=r()<.8?'Published':'Closed';
    claims.push({id,text:rp(r,T[cat])(t,x),lang:urdu.includes(x)&&r()<.3?'Urdu':'Kannada',dist:x,taluk:t,cat,status:st,
      verdict:st==='Closed'?'Not of public interest':rw(r,['False','Misleading'],[.7,.3]),approvedBy:rw(r,['Commissioner, DIPR','Joint Director (News)'],[.4,.6]),
      fw:ri(r,80,900),src:rw(r,['Tipline','District office','Analytics team'],[.6,.3,.1]),ageHours:ri(r,170,900),supplementary:true})});}
w('claims.json',claims);

let releases=tagSmall(d.releases,o=>o.id,o=>o.title);
{const r=rngFor('releases');let low=Math.min(...releases.map(x=>+x.id.slice(4)));
  const TOP=[[t=>`Yuva Nidhi registration help desk at the ${t} taluk office`,'Skill Development'],[t=>`Gruha Jyothi enrolment camp in ${t} this week`,'Energy'],
    [t=>`Crop insurance enrolment closes on 31 October in ${t}`,'Agriculture'],[t=>`Dengue prevention drive in ${t} town wards`,'Health & Family Welfare'],
    [t=>`Ration card e-KYC camps at ${t} fair price shops`,'Food & Civil Supplies'],[t=>`Road safety week programme in ${t}`,'Transport'],
    [t=>`Gruha Lakshmi help desks open at ${t} gram panchayats`,'Women & Child Development'],[t=>`Survey of rain-damaged houses begins in ${t}`,'Revenue']];
  missingT(releases).forEach(([x,t],i)=>{const id='REL-'+(--low),[f,dept]=TOP[i%TOP.length];
    releases.push({id,title:`${x}: ${f(t)}`,dept,dist:x,taluk:t,h:+(1.2+4.5*r()).toFixed(1),reach:ri(r,48,150),kits:ri(r,12,90),pick:ri(r,5,32),ageHours:48+6*i,supplementary:true})});}
w('releases.json',releases);

const whenH=s=>{const m=s.match(/(\d+)h/);return m?+m[1]:1};
let feed=tagSmall(d.feed.map(f=>({...f,ageHours:whenH(f.when),when:undefined})),o=>o.dist+'|'+o.note,o=>o.note);
{const r=rngFor('feed');
  const R=[(t,e,n)=>`Daily report from ${t}: ${e} events covered, ${n} releases issued. No issues.`,
    (t,e)=>`Daily report: ${e} events covered in ${t}; photos uploaded to the archive.`,
    (t,e,n)=>`Daily report from ${t}: ${e} events, ${n} releases; scheme posters put up at the taluk office.`];
  missingT(feed).forEach(([x,t],i)=>feed.push({t:'report',dist:x,taluk:t,note:R[i%R.length](t,ri(r,1,5),ri(r,0,2)),ageHours:ri(r,26,400),supplementary:true}));}
w('feed.json',feed);

let flags=tagSmall(d.adFlags,o=>o.ro,o=>o.pub);
// Reviewed long ago, so numbered below the prototype's oldest flagged order (RO/2026/3240) and listed after the live ones.
{const r=rngFor('flags');let low=Math.min(...flags.map(f=>+f.ro.split('/')[2]));const n=()=>'RO/2026/'+(--low);const issues=d.adFlags.map(f=>f.issue);
  const NOTE={Cleared:['Proof matched the order on recheck','Certificate received; billed as approved'],Resolved:['Vendor corrected the bill','Excess amount recovered from the next bill']};
  missingT(flags).forEach(([x,t],i)=>{const ro=n(),vs=vendorsOut.filter(v=>v.district===x),v=vs.length?rp(r,vs):null,st=rw(r,['Cleared','Resolved'],[.65,.35]);
    flags.push({ro,pub:v?v.name:`Publication ${String.fromCharCode(70+i%20)} · district daily · ${x}`,issue:rp(r,issues),amt:+(.3+2.7*r()).toFixed(1),dist:x,taluk:t,sev:rw(r,['crit','warn'],[.35,.65]),
      review:st,sentBy:rw(r,['Commissioner, DIPR','Joint Director (News)'],[.5,.5]),decidedBy:'Deputy Director (Accounts)',outcomeNote:rp(r,NOTE[st]),ageHours:ri(r,120,900),supplementary:true})});}
w('ad-flags.json',flags);

report.vendors=suppVendors.length;report.claims=claims.length-d.claims.length;report.releases=releases.length-d.releases.length;report.feed=feed.length-d.feed.length;report.adFlags=flags.length-d.adFlags.length;
console.log('seed written to',out);console.log('supplementary rows:',JSON.stringify(report));
