/* =====================================================================
   Utilities
   ===================================================================== */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967295}
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
function fmt(n){n=+n||0;if(n>=1e7)return (n/1e7).toFixed(2)+' Cr';if(n>=1e5)return (n/1e5).toFixed(1)+' L';if(n>=1e3)return (n/1e3).toFixed(1)+'K';return n<10&&n%1?n.toFixed(1):Math.round(n).toString()}
const pct=(v,d=1)=>(v*100).toFixed(d)+'%';
const rs=v=>'₹'+(v>=100?(v/100).toFixed(2)+' Cr':v.toFixed(1)+' L');
const nowT=()=>new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}).replace(' ',' ');
const rid=(p)=>p+'-'+Math.floor(1000+Math.random()*8999);

/* =====================================================================
   Geography — 4 revenue divisions, 31 districts, taluks
   ===================================================================== */
const DIVS={
 Bengaluru:['Bengaluru Urban','Bengaluru Rural','Ramanagara','Chikkaballapura','Kolar','Tumakuru','Chitradurga','Davanagere','Shivamogga'],
 Mysuru:['Mysuru','Chamarajanagara','Mandya','Hassan','Kodagu','Chikkamagaluru','Dakshina Kannada','Udupi'],
 Belagavi:['Belagavi','Bagalkote','Vijayapura','Dharwad','Gadag','Haveri','Uttara Kannada'],
 Kalaburagi:['Kalaburagi','Bidar','Raichur','Koppal','Ballari','Vijayanagara','Yadgir']};
const DIV_OF={};for(const [v,ds] of Object.entries(DIVS))ds.forEach(d=>DIV_OF[d]=v);
const ALL_D=Object.values(DIVS).flat();
const POP={'Bengaluru Urban':96.2,'Bengaluru Rural':9.9,'Ramanagara':10.8,'Chikkaballapura':12.6,'Kolar':15.4,'Tumakuru':26.8,'Chitradurga':16.6,'Davanagere':19.5,'Shivamogga':17.5,'Mysuru':30.0,'Chamarajanagara':10.2,'Mandya':18.1,'Hassan':17.8,'Kodagu':5.5,'Chikkamagaluru':11.4,'Dakshina Kannada':20.9,'Udupi':11.8,'Belagavi':47.8,'Bagalkote':18.9,'Vijayapura':21.8,'Dharwad':18.5,'Gadag':10.6,'Haveri':16.0,'Uttara Kannada':14.4,'Kalaburagi':25.7,'Bidar':17.0,'Raichur':19.3,'Koppal':13.9,'Ballari':14.0,'Vijayanagara':13.5,'Yadgir':11.7};
const CODE={'Bengaluru Urban':'BLU','Bengaluru Rural':'BLR','Ramanagara':'RMN','Chikkaballapura':'CKB','Kolar':'KLR','Tumakuru':'TMK','Chitradurga':'CTA','Davanagere':'DVG','Shivamogga':'SMG','Mysuru':'MYS','Chamarajanagara':'CMN','Mandya':'MDY','Hassan':'HSN','Kodagu':'KDG','Chikkamagaluru':'CKM','Dakshina Kannada':'DK','Udupi':'UDP','Belagavi':'BGM','Bagalkote':'BGK','Vijayapura':'VJP','Dharwad':'DWD','Gadag':'GDG','Haveri':'HVR','Uttara Kannada':'UK','Kalaburagi':'KLB','Bidar':'BDR','Raichur':'RCR','Koppal':'KPL','Ballari':'BLY','Vijayanagara':'VJN','Yadgir':'YDG'};
const HEX={'Vijayapura':[3,0],'Kalaburagi':[4,0],'Bidar':[5,0],'Belagavi':[1,1],'Bagalkote':[2,1],'Yadgir':[4,1],'Dharwad':[1,2],'Gadag':[2,2],'Koppal':[3,2],'Raichur':[4,2],'Uttara Kannada':[0,3],'Haveri':[1,3],'Vijayanagara':[2,3],'Ballari':[3,3],'Shivamogga':[1,4],'Davanagere':[2,4],'Chitradurga':[3,4],'Udupi':[0,5],'Chikkamagaluru':[1,5],'Tumakuru':[2,5],'Chikkaballapura':[3,5],'Dakshina Kannada':[0,6],'Hassan':[1,6],'Mandya':[2,6],'Bengaluru Rural':[3,6],'Kolar':[4,6],'Kodagu':[0,7],'Mysuru':[1,7],'Ramanagara':[2,7],'Bengaluru Urban':[3,7],'Chamarajanagara':[1,8]};
const TALUKS={
 'Bengaluru Urban':['Bengaluru North','Bengaluru South','Bengaluru East','Anekal','Yelahanka'],
 'Bengaluru Rural':['Devanahalli','Doddaballapura','Hoskote','Nelamangala'],
 'Ramanagara':['Ramanagara','Channapatna','Kanakapura','Magadi'],
 'Chikkaballapura':['Chikkaballapura','Chintamani','Gauribidanur','Sidlaghatta','Bagepalli'],
 'Kolar':['Kolar','Bangarapet','Malur','Mulbagal','Srinivaspur'],
 'Tumakuru':['Tumakuru','Tiptur','Sira','Madhugiri','Kunigal'],
 'Chitradurga':['Chitradurga','Challakere','Hiriyur','Hosadurga','Holalkere'],
 'Davanagere':['Davanagere','Harihar','Channagiri','Honnali','Jagalur'],
 'Shivamogga':['Shivamogga','Bhadravati','Sagar','Shikaripura','Thirthahalli'],
 'Mysuru':['Mysuru','Nanjangud','Hunsur','T. Narasipura','K.R. Nagar'],
 'Chamarajanagara':['Chamarajanagara','Gundlupet','Kollegal','Yelandur'],
 'Mandya':['Mandya','Maddur','Malavalli','Srirangapatna','Pandavapura'],
 'Hassan':['Hassan','Arsikere','Channarayapatna','Belur','Sakleshpur'],
 'Kodagu':['Madikeri','Virajpet','Somwarpet'],
 'Chikkamagaluru':['Chikkamagaluru','Kadur','Tarikere','Mudigere','Sringeri'],
 'Dakshina Kannada':['Mangaluru','Bantwal','Puttur','Belthangady','Sullia'],
 'Udupi':['Udupi','Kundapura','Karkala','Byndoor'],
 'Belagavi':['Belagavi','Gokak','Chikkodi','Athani','Bailhongal'],
 'Bagalkote':['Bagalkote','Jamkhandi','Mudhol','Badami','Hungund'],
 'Vijayapura':['Vijayapura','Indi','Sindagi','Muddebihal','Basavana Bagewadi'],
 'Dharwad':['Dharwad','Hubballi','Kalghatgi','Navalgund','Kundgol'],
 'Gadag':['Gadag','Ron','Nargund','Mundargi','Shirahatti'],
 'Haveri':['Haveri','Ranebennur','Byadgi','Hangal','Savanur'],
 'Uttara Kannada':['Karwar','Sirsi','Kumta','Bhatkal','Honnavar'],
 'Kalaburagi':['Kalaburagi','Aland','Afzalpur','Chincholi','Sedam'],
 'Bidar':['Bidar','Basavakalyan','Bhalki','Humnabad','Aurad'],
 'Raichur':['Raichur','Sindhanur','Manvi','Lingasugur','Devadurga'],
 'Koppal':['Koppal','Gangavathi','Kushtagi','Yelburga'],
 'Ballari':['Ballari','Siruguppa','Sandur','Kurugodu'],
 'Vijayanagara':['Hosapete','Hagaribommanahalli','Kudligi','Harapanahalli','Hoovina Hadagali'],
 'Yadgir':['Yadgir','Shahapur','Shorapur','Gurmitkal']};

/* =====================================================================
   Synthetic base data
   ===================================================================== */
const LOWREAD=new Set(['Yadgir','Raichur','Koppal','Kalaburagi','Bidar']);
const DB={},TB={};
for(const d of ALL_D){
  const r=k=>hash(d+'#'+k),kk=DIV_OF[d]==='Kalaburagi';
  DB[d]={pop:POP[d],optin:.012+.028*r('o')+(d==='Bengaluru Urban'?.01:0)-(kk?.004:0),
    deliv:.925+.055*r('d'),read:.62+.22*r('r')-(LOWREAD.has(d)?.17:0),reply:.03+.06*r('p')+(kk?.01:0),
    claimK:2+3*r('c')+(kk?1.2:0),tat:3+8*r('t')+(kk?3:0),rel:Math.round(22+30*r('l')+POP[d]*1.1),
    pickup:.4+.4*r('k'),ad:POP[d]*.55*(.8+.5*r('a')),uptake:64+28*r('u')-(kk?13:0),pos:.42+.33*r('s'),
    comp:.66+.33*r('m'),events:Math.round(8+22*r('e')),pulse:Math.round(4+16*r('f')),tasks:Math.round(1+6*r('q')),
    jour:Math.round(10+POP[d]*3.2+15*r('j')),falseR:.38+.3*r('x')};
  const ts=TALUKS[d],ws=ts.map((t,i)=>(i===0?1.9:1)*(.6+.8*hash(t+'w'))),sw=ws.reduce((a,b)=>a+b,0),b=DB[d];
  ts.forEach((t,i)=>{const w=ws[i]/sw,j=k=>hash(d+t+k)-.5;
    TB[d+'|'+t]={pop:b.pop*w,optin:b.optin*(1+j('o')*.4),deliv:Math.min(.99,b.deliv+j('d')*.02),read:b.read+j('r')*.14,reply:Math.max(.01,b.reply+j('p')*.03),claimK:b.claimK*(1+j('c')*.6),tat:Math.max(1.5,b.tat*(1+j('t')*.5)),rel:b.rel*w,pickup:Math.min(.95,b.pickup+j('k')*.15),ad:b.ad*w,uptake:b.uptake+j('u')*14,pos:b.pos+j('s')*.2,comp:Math.min(1,b.comp+j('m')*.2),events:b.events*w,pulse:b.pulse*w,tasks:b.tasks*w,jour:b.jour*w,falseR:b.falseR}});
}
const SCH={'All':1,'Gruha Lakshmi':.26,'Shakti':.2,'Anna Bhagya':.18,'Gruha Jyothi':.16,'Yuva Nidhi':.08,'Other departments':.12};
const LANGS=['Kannada','English','Urdu','Tulu','Konkani'];
function langShare(d,l){let sh={Kannada:.8,English:.1,Urdu:.07,Tulu:.02,Konkani:.01};
  if(d==='Dakshina Kannada'||d==='Udupi')sh={Kannada:.58,English:.12,Urdu:.05,Tulu:.19,Konkani:.06};
  else if(d==='Uttara Kannada')sh={Kannada:.73,English:.08,Urdu:.07,Tulu:.02,Konkani:.1};
  else if(['Bidar','Kalaburagi','Vijayapura'].includes(d))sh={Kannada:.74,English:.07,Urdu:.17,Tulu:.01,Konkani:.01};
  else if(d==='Bengaluru Urban')sh={Kannada:.6,English:.28,Urdu:.08,Tulu:.02,Konkani:.02};
  return sh[l]}

/* =====================================================================
   State + metric engine (drill + slice)
   ===================================================================== */
const S={div:null,dist:null,tlk:null,tab:'overview',period:'30d',scheme:'All',lang:'All',aud:'All',mm:'read',sort:null,sortDir:-1,claimFilter:'All',askQ:'',askA:''};
const sig=()=>[S.period,S.scheme,S.lang,S.aud].join('|');
function mult(d){
  const p={'7d':.24,'30d':1,'90d':3.05}[S.period];let share=1,rd=0,rp=0;
  if(S.scheme!=='All'){share*=SCH[S.scheme]*(.75+.5*hash(d+S.scheme));rd+=(hash(S.scheme+d+'r')-.5)*.12}
  if(S.lang!=='All'){share*=langShare(d,S.lang);rd+={Kannada:.02,English:.04,Urdu:-.05,Tulu:-.02,Konkani:-.03}[S.lang]}
  if(S.aud!=='All'){const a={Citizens:[.975,0,0],Journalists:[.006,.14,.05],Officers:[.004,.18,.08]}[S.aud];share*=a[0];rd+=a[1];rp+=a[2]}
  return {p,share,rd,rp}}
function leaf(b,d){
  const m=mult(d),subs=b.pop*1e5*b.optin*m.share,sent=subs*7.4*m.p,deliv=sent*b.deliv,rr=cl(b.read+m.rd,.12,.97),read=deliv*rr,reply=read*cl(b.reply+m.rp,.004,.5);
  const aud=(S.aud==='All'||S.aud==='Citizens')?1:.25,claims=subs/1000*b.claimK*m.p*aud;
  const sch=S.scheme==='All'?1:SCH[S.scheme]*1.4,lg=S.lang==='All'?1:Math.min(1,langShare(d,S.lang)*1.3);
  const rel=b.rel*m.p*sch*lg,spend=b.ad*m.p*(S.scheme==='All'?1:SCH[S.scheme])*(S.lang==='All'?1:langShare(d,S.lang));
  return {pop:b.pop,subs,sent,deliv,read,reply,claims,tatW:b.tat*claims,rel,pickW:b.pickup*rel,uptW:b.uptake*b.pop,posW:b.pos*read,compW:b.comp,n:1,events:b.events*m.p,pulse:b.pulse*m.p,tasks:b.tasks,jour:b.jour,falseN:claims*b.falseR,spend}}
function agg(arr){const o={};for(const a of arr)for(const k in a)o[k]=(o[k]||0)+a[k];return o}
function fin(a){const o={...a};o.delivR=o.deliv/o.sent;o.readR=o.read/o.deliv;o.replyR=o.reply/o.read;o.tat=o.tatW/(o.claims||1);o.pickup=o.pickW/(o.rel||1);o.uptake=o.uptW/o.pop;o.pos=o.posW/(o.read||1);o.comp=o.compW/o.n;o.per1k=o.subs/(o.pop*1e5)*1000;o.claimsPerL=o.claims/((o.subs||1)/1e5);o.spendPer1k=o.spend*1e5/(o.pop*100);o.falseR=o.falseN/(o.claims||1);return o}
const nodeKey=n=>[n.lvl,n.div||'',n.dist||'',n.name].join('/');
function children(n){
  if(n.lvl==='state')return Object.keys(DIVS).map(v=>({lvl:'div',name:v,div:v}));
  if(n.lvl==='div')return DIVS[n.div].map(d=>({lvl:'dist',name:d,div:n.div,dist:d}));
  if(n.lvl==='dist')return TALUKS[n.dist].map(t=>({lvl:'tlk',name:t,div:n.div,dist:n.dist}));
  return []}
function rawM(n){return n.lvl==='tlk'?leaf(TB[n.dist+'|'+n.name],n.dist):agg(children(n).map(rawM))}
const memo=new Map();
function M(n){const k=nodeKey(n)+'§'+sig();if(!memo.has(k))memo.set(k,fin(rawM(n)));return memo.get(k)}
const distNode=d=>({lvl:'dist',name:d,div:DIV_OF[d],dist:d});
function cur(){if(S.tlk)return {lvl:'tlk',name:S.tlk,div:S.div,dist:S.dist};if(S.dist)return distNode(S.dist);if(S.div)return {lvl:'div',name:S.div,div:S.div};return {lvl:'state',name:'Karnataka'}}
const label=n=>n.lvl==='div'?n.name+' Division':n.name;
const LVL={state:'State',div:'Division',dist:'District',tlk:'Taluk'};
const CHILD_LVL={state:'divisions',div:'districts',dist:'taluks',tlk:''};
function inNode(dist,n){if(!dist||dist==='State')return n.lvl==='state';if(n.lvl==='state')return true;if(n.lvl==='div')return DIV_OF[dist]===n.div;return dist===n.dist}
function inScope(dist,n){return dist==='State'||inNode(dist,n)}
function dlt(n,k){return (hash(nodeKey(n)+k+S.period+S.scheme+S.lang)-.42)*.22}
function withFilter(key,val,fn){const o=S[key];S[key]=val;try{return fn()}finally{S[key]=o}}
function trend(n,total,k){const N={'7d':7,'30d':30,'90d':13}[S.period],h=hash(nodeKey(n)+k)*6,out=[];
  for(let i=0;i<N;i++)out.push(Math.max(.3,1+.18*Math.sin(i/N*12.56+h)+.16*(hash(nodeKey(n)+k+i+S.period)-.5)+(i>N*.62&&i<N*.76?.32:0)));
  const sm=out.reduce((a,b)=>a+b,0);return out.map(v=>v/sm*total)}
const TODAY=new Date(2026,9,7);
function tLabels(){const N={'7d':7,'30d':30,'90d':13}[S.period],out=[];for(let i=0;i<N;i++){const d=new Date(TODAY);d.setDate(d.getDate()-(N-1-i)*(S.period==='90d'?7:1));out.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}))}return out}

/* live records (fed by the bot) */
const claims=[
 {id:'IDTU-26-4471',text:'Gruha Lakshmi will stop from November; re-apply on a link before Friday',lang:'Kannada',dist:'Raichur',cat:'Scheme rumour',status:'Published',verdict:'False',age:'30h',fw:1840,src:'Tipline'},
 {id:'IDTU-26-4478',text:'Shakti free travel extended to AC Airavat buses from 15 October',lang:'Kannada',dist:'Belagavi',cat:'Scheme rumour',status:'Draft ready',verdict:'Misleading',age:'9h',fw:960,src:'Tipline'},
 {id:'IDTU-26-4483',text:'Recruitment notice: 2,400 village accountant posts, pay ₹500 fee via UPI',lang:'Kannada',dist:'Kalaburagi',cat:'Fake recruitment',status:'Triaged',verdict:'—',age:'5h',fw:620,src:'Analytics team'},
 {id:'IDTU-26-4490',text:'Circular says schools closed for 3 days due to fever outbreak',lang:'English',dist:'Mysuru',cat:'Doctored circular',status:'New',verdict:'—',age:'2h',fw:410,src:'Tipline'},
 {id:'IDTU-26-4492',text:'Video of a minister announcing a farm loan waiver (suspected synthetic)',lang:'Kannada',dist:'Bengaluru Urban',cat:'Synthetic media',status:'New',verdict:'—',age:'1.5h',fw:2300,src:'Tipline'},
 {id:'IDTU-26-4495',text:'Message says ration shops will give only 3 kg rice from November',lang:'Kannada',dist:'Yadgir',cat:'Scheme rumour',status:'Triaged',verdict:'—',age:'4h',fw:530,src:'District office'},
 {id:'IDTU-26-4497',text:'Dam gates opened, villages near river must evacuate tonight',lang:'Kannada',dist:'Koppal',cat:'Public safety',status:'Escalated',verdict:'Routed to district administration',age:'48m',fw:1210,src:'Tipline'},
 {id:'IDTU-26-4501',text:'Post claims bus fares doubled on coastal routes',lang:'Tulu',dist:'Dakshina Kannada',cat:'Price rumour',status:'New',verdict:'—',age:'30m',fw:150,src:'Tipline'}];
const releases=[
 {id:'REL-1874',title:'Crop loss survey for monsoon damage to finish by 20 October',dept:'Revenue',dist:'State',h:2.5,reach:1180,kits:214,pick:46},
 {id:'REL-1871',title:'October instalment of Gruha Lakshmi released to eligible beneficiaries',dept:'Women & Child Development',dist:'State',h:1.8,reach:1265,kits:301,pick:63},
 {id:'REL-1869',title:'Free health camps in 1,200 gram panchayats this week',dept:'Health & Family Welfare',dist:'State',h:3.1,reach:1102,kits:166,pick:38},
 {id:'REL-1866',title:'Raichur: Yuva Nidhi registration drive at 14 colleges',dept:'Skill Development',dist:'Raichur',h:4.6,reach:58,kits:21,pick:9},
 {id:'REL-1862',title:'Mysuru Dasara: traffic and parking advisory for the procession',dept:'District Administration',dist:'Mysuru',h:1.2,reach:142,kits:88,pick:31},
 {id:'REL-1859',title:'Belagavi: flood relief credited to 3,420 households',dept:'Revenue',dist:'Belagavi',h:5.4,reach:96,kits:40,pick:17}];
const feed=[
 {t:'pulse',dist:'Raichur',scheme:'Gruha Lakshmi',sent:'Mixed',note:'Women in Sindhanur say the September credit came late; bank agents are asking for re-KYC.',when:'2h ago'},
 {t:'report',dist:'Koppal',note:'Daily report: 3 events covered, 1 release issued. No issues.',when:'3h ago'},
 {t:'pulse',dist:'Kalaburagi',scheme:'Yuva Nidhi',sent:'Negative',note:'Students unclear on the monthly self-declaration; many missed it.',when:'5h ago'},
 {t:'esc',dist:'Raichur',note:'GRV-RCR-2207 · Anna Bhagya cash transfer not credited for 2 months (Manvi).',when:'6h ago'},
 {t:'pulse',dist:'Dakshina Kannada',scheme:'Shakti',sent:'Positive',note:'High usage on the Mangaluru–Puttur route; requests for more frequency.',when:'8h ago'},
 {t:'report',dist:'Belagavi',note:'Daily report: 5 events covered, 2 releases issued. Flood relief camp coverage uploaded.',when:'9h ago'}];
const adFlags=[
 {ro:'RO/2026/3312',pub:'Publication A · Kannada daily · Belagavi',issue:'Billed rate 18% above approved card rate',amt:2.4,dist:'Belagavi',sev:'crit'},
 {ro:'RO/2026/3290',pub:'Channel B · Kannada news TV',issue:'Telecast certificate missing for 6 of 40 spots',amt:5.1,dist:'Bengaluru Urban',sev:'warn'},
 {ro:'RO/2026/3277',pub:'Publication C · weekly · Kalaburagi',issue:'Claimed circulation 3.2× the last audited figure',amt:0.9,dist:'Kalaburagi',sev:'crit'},
 {ro:'RO/2026/3251',pub:'Publication D · Urdu daily · Bidar',issue:'Duplicate bill for the same insertion date',amt:0.6,dist:'Bidar',sev:'warn'},
 {ro:'RO/2026/3240',pub:'Outdoor vendor E · Mysuru',issue:'Geo-tagged photo proof is older than the display period',amt:1.3,dist:'Mysuru',sev:'warn'}];
let unseen={tipline:0,offices:0};
/* ======================= Vaarta 360 v2 · data layer ======================= */
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function RNG(seed){let s=seed>>>0;return function(){s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rp=(r,a)=>a[Math.floor(r()*a.length)];
const rw=(r,a,w)=>{let s=0;for(const x of w)s+=x;let t=r()*s;for(let i=0;i<a.length;i++){t-=w[i];if(t<=0)return a[i]}return a[a.length-1]};
const ri=(r,a,b)=>a+Math.floor(r()*(b-a+1));
const DW=ALL_D.map(d=>POP[d]);const rDist=r=>rw(r,ALL_D,DW);
const T0=new Date(2026,9,7);
const isoL=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const daysAgo=(r,max,min=0)=>{const d=new Date(T0);d.setDate(d.getDate()-ri(r,min,max));return isoL(d)};
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return isoL(d)};
const dShow=s=>{if(!s)return '—';const p=String(s).split('-');if(p.length===2)return MON[+p[1]-1]+' '+p[0];return `${+p[2]} ${MON[+p[1]-1]} ${p[0]}`};
const ageD=s=>Math.round((T0-new Date(s+'T00:00:00'))/864e5);
const inr=v=>'₹'+Math.round(+v||0).toLocaleString('en-IN');
const lakh=v=>{v=+v||0;return v>=100?'₹'+(v/100).toFixed(2)+' Cr':'₹'+v.toFixed(v<10?2:1)+' L'};
const axisL=v=>v>=100?'₹'+(v/100).toFixed(v>=1000?0:1)+' Cr':'₹'+Math.round(v)+' L';
const nIN=v=>Math.round(+v||0).toLocaleString('en-IN');
const sumA=(a,f=r=>r.amount)=>{let s=0;for(const r of a)s+=f(r)||0;return s};

/* ---------- spend model ---------- */
const FYS=['2022-23','2023-24','2024-25','2025-26','2026-27'],CUR_FY='2026-27',LAST_YM='2026-09',ELAPSED=6/12;
const fyMonths=fy=>{const y=+fy.slice(0,4);return Array.from({length:12},(_,i)=>{const m=(3+i)%12+1;return (i<9?y:y+1)+'-'+String(m).padStart(2,'0')})};
const fyOf=ym=>{const [y,m]=ym.split('-').map(Number);const s=m>=4?y:y-1;return s+'-'+String((s+1)%100).padStart(2,'0')};
const qOf=ym=>'Q'+(Math.floor(((+ym.split('-')[1])+8)%12/3)+1);
const monIdx=ym=>((+ym.split('-')[1])+8)%12;
const ymDiff=(a,b)=>{const [y1,m1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number);return (y2-y1)*12+(m2-m1)};
const CHANNELS=['Print','Television','Radio & FM','Digital & social','Outdoor','Field & folk','Cinema'];
const CHV=c=>'var(--ch'+(CHANNELS.indexOf(c)+1)+')';
const DEPTS=['Women & Child Development','Health & Family Welfare','Revenue','Energy','Transport','Food & Civil Supplies','Skill Development','Agriculture','Industries & Commerce','Tourism','Urban Development','Kannada & Culture','DIPR (own campaigns)'];
const CTYPES=[
 {k:'Guarantee schemes awareness',from:1,scale:1350,names:[['Gruha Lakshmi instalment drive',3,'Women & Child Development'],['Shakti free travel awareness',4,'Transport'],['Gruha Jyothi enrolment',2,'Energy'],['Anna Bhagya entitlement',5,'Food & Civil Supplies'],['Yuva Nidhi registration',8,'Skill Development']],mix:{'Print':.3,'Television':.28,'Radio & FM':.08,'Digital & social':.16,'Outdoor':.1,'Field & folk':.06,'Cinema':.02}},
 {k:'Achievements & anniversaries',scale:1500,names:[['Government anniversary week',1,'DIPR (own campaigns)'],['State budget highlights',10,'DIPR (own campaigns)'],['Annual achievements campaign',8,'DIPR (own campaigns)']],mix:{'Print':.38,'Television':.3,'Digital & social':.14,'Outdoor':.12,'Radio & FM':.06}},
 {k:'Health advisories',scale:320,names:[['Heatwave precautions',0,'Health & Family Welfare'],['Dengue prevention',3,'Health & Family Welfare'],['Immunisation week',7,'Health & Family Welfare'],['TB-free Karnataka',9,'Health & Family Welfare']],mix:{'Television':.2,'Radio & FM':.2,'Digital & social':.2,'Field & folk':.2,'Print':.15,'Outdoor':.05}},
 {k:'Disaster & monsoon preparedness',scale:240,names:[['Monsoon preparedness',2,'Revenue'],['Flood relief information',4,'Revenue'],['Drought relief measures',8,'Revenue']],mix:{'Radio & FM':.25,'Digital & social':.25,'Field & folk':.2,'Print':.15,'Television':.15}},
 {k:'Festivals & state events',scale:620,names:[['Mysuru Dasara',5,'Kannada & Culture'],['Karnataka Rajyotsava',7,'Kannada & Culture'],['Hampi Utsav',10,'Tourism']],mix:{'Outdoor':.25,'Print':.2,'Television':.2,'Digital & social':.25,'Cinema':.05,'Radio & FM':.05}},
 {k:'Recruitment & tender notices',scale:520,names:[['Tender notices, Q1',0,'*'],['Recruitment notifications',4,'*'],['Tender notices, Q3',6,'*'],['Tender notices, Q4',9,'*']],mix:{'Print':.9,'Digital & social':.1}},
 {k:'Civic awareness',scale:210,names:[['Road safety month',9,'Transport'],['Clean city drive',3,'Urban Development'],['Water conservation',11,'Urban Development']],mix:{'Radio & FM':.2,'Digital & social':.25,'Outdoor':.2,'Field & folk':.15,'Cinema':.1,'Print':.1}},
 {k:'Investment & tourism promotion',scale:480,names:[['Investor summit outreach',9,'Industries & Commerce'],['Visit Karnataka',6,'Tourism']],mix:{'Digital & social':.35,'Television':.2,'Print':.25,'Outdoor':.15,'Cinema':.05}},
 {k:'Agriculture & farmer outreach',scale:260,names:[['Crop insurance enrolment',2,'Agriculture'],['Krishi mela season',7,'Agriculture']],mix:{'Radio & FM':.25,'Field & folk':.25,'Print':.2,'Television':.15,'Digital & social':.15}}];
const YF={'2022-23':.84,'2023-24':.92,'2024-25':1,'2025-26':1.07,'2026-27':1.13};
const CH_TREND={'Digital & social':[.62,.76,1,1.28,1.62],'Print':[1.12,1.06,1,.95,.9],'Television':[1.05,1.02,1,.98,.95]};
const MCC={'2023-03':.3,'2023-04':.08,'2023-05':.15,'2024-03':.4,'2024-04':.1,'2024-05':.15};

const VENDORS=[];
(function(){let off=0;
 const add=(ch,pre,kind,n,dist,lang)=>{for(let i=1;i<=n;i++){const d=dist?ALL_D[(off++*7+3)%31]:'Statewide';const id=pre+String(i).padStart(2,'0');VENDORS.push({id,kind,channel:ch,district:d,language:lang||'Kannada',name:`${id} · ${kind}${d!=='Statewide'?', '+d:''}`})}};
 add('Print','PR-K','Kannada daily',6);add('Print','PR-E','English daily',3,0,'English');add('Print','PR-U','Urdu daily',2,0,'Urdu');add('Print','PR-W','Kannada weekly',3);add('Print','PR-D','District daily',16,1);
 add('Television','TV-N','Kannada news channel',5);add('Television','TV-G','Kannada entertainment channel',2);add('Television','TV-C','Regional cable network',3,1);
 add('Radio & FM','RF-N','FM network',3);add('Radio & FM','RF-P','Public broadcaster slots',1);add('Radio & FM','RF-C','Community radio',4,1);
 add('Digital & social','DG-S','Social media agency',3,0,'Multiple');add('Digital & social','DG-A','Programmatic ad network',2,0,'Multiple');add('Digital & social','DG-V','Video platform buy',2,0,'Multiple');
 add('Outdoor','OD-H','Hoarding agency',7,1);add('Outdoor','OD-T','Transit media',2);add('Outdoor','OD-L','LED screen operator',3,1);
 add('Field & folk','FF-T','Folk troupe',14,1);add('Field & folk','FF-V','LED van operator',3,1);add('Field & folk','FF-E','Exhibition contractor',2);
 add('Cinema','CN-A','Cinema ad network',2,0,'Multiple');
})();

let SPEND=[],BUDGET=[];const CAMPS=[];
(function(){const r=RNG(2026);let ro=0,cid=0;
 const swShare={'Print':.8,'Television':.92,'Radio & FM':.8,'Digital & social':1,'Outdoor':.25,'Field & folk':.12,'Cinema':1};
 const byCh={};CHANNELS.forEach(c=>{byCh[c]={sw:VENDORS.filter(v=>v.channel===c&&v.district==='Statewide'),dv:VENDORS.filter(v=>v.channel===c&&v.district!=='Statewide')}});
 const pickN=(arr,k,weighted)=>{const pool=arr.slice(),out=[];while(out.length<k&&pool.length){let i;if(weighted){const w=pool.map((_,j)=>1/Math.pow(j+1,.9));i=pool.indexOf(rw(r,pool,w))}else i=Math.floor(r()*pool.length);out.push(pool.splice(i,1)[0])}return out};
 const stat=m=>{const a=ymDiff(m,LAST_YM);if(a>=4)return r()<.97?'Paid':'Billed';if(a>=2)return rw(r,['Paid','Billed','RO issued'],[.6,.3,.1]);return rw(r,['Paid','Billed','RO issued'],[.1,.4,.5])};
 FYS.forEach((fy,fi)=>{const months=fyMonths(fy);
  CTYPES.forEach(ct=>{if(ct.from&&fi<ct.from)return;
   ct.names.forEach(([nm,sm,dep])=>{const tender=ct.k.startsWith('Recruit');if(!tender&&r()<.1)return;
    const start=Math.min(11,Math.max(0,sm+ri(r,-1,1))),dur=tender?3:ri(r,1,3);
    const mons=months.slice(start,start+dur).filter(m=>m<=LAST_YM);
    const department=dep==='*'?rp(r,DEPTS.slice(0,12)):dep;
    const id='CMP-'+fy.slice(2,4)+String(++cid).padStart(3,'0');
    const total=ct.scale*YF[fy]*(.75+.5*r());
    const camp={campaignId:id,campaign:`${nm} ${fy}`,ctype:ct.k,department,fy,startYM:months[start],endYM:months[Math.min(11,start+dur-1)],planned:total};
    CAMPS.push(camp);if(!mons.length)return;
    Object.entries(ct.mix).forEach(([ch,w])=>{if(w<.1&&r()<.35)return;
     const chAmt=total*w*(.8+.4*r())*((CH_TREND[ch]||[])[fi]||1);
     const sw=byCh[ch].sw,dv=byCh[ch].dv,share=!dv.length?1:(!sw.length?0:swShare[ch]);
     const swV=sw.length?pickN(sw,Math.min(sw.length,ri(r,2,3)),true):[],dvV=dv.length?pickN(dv,Math.min(dv.length,ri(r,3,7)),false):[];
     const swW=swV.map((_,i)=>1/Math.pow(i+1,.6)),swS=swW.reduce((a,b)=>a+b,0)||1,dvW=dvV.map(()=>.6+.8*r()),dvS=dvW.reduce((a,b)=>a+b,0)||1;
     mons.forEach(m=>{const mAmt=chAmt/mons.length*(MCC[m]||1)*(.85+.3*r());
      const parts=[...swV.map((v,i)=>[v,share*mAmt*swW[i]/swS]),...dvV.map((v,i)=>[v,(1-share)*mAmt*dvW[i]/dvS])];
      parts.forEach(([v,a])=>{if(a<.05)return;SPEND.push({roNo:'RO/'+fy.slice(2,4)+'/'+String(++ro).padStart(5,'0'),fy,month:m,quarter:qOf(m),campaignId:id,campaign:camp.campaign,ctype:ct.k,department,channel:ch,vendorId:v.id,vendor:v.name,district:v.district,amount:+a.toFixed(2),status:stat(m)})})})})})})});
 const act={};SPEND.forEach(s=>{const k=s.fy+'|'+s.department+'|'+s.channel;act[k]=(act[k]||0)+s.amount});
 const rb=RNG(91);
 FYS.forEach(fy=>DEPTS.forEach(d=>CHANNELS.forEach(c=>{const a=act[fy+'|'+d+'|'+c]||0;let b;
  if(fy===CUR_FY){const p=act['2025-26|'+d+'|'+c]||0;b=p*(1.02+.16*rb());if(!b&&a)b=a*1.7}else b=a*(.9+.28*rb());
  if(b>.5)BUDGET.push({fy,department:d,channel:c,budget:+b.toFixed(1)})})));
})();

/* ---------- derived registers: campaigns, bills ---------- */
let CAMP_ROWS=[],BILL_ROWS=[];
(function(){const r=RNG(55);const ca={};
 SPEND.forEach(s=>{const o=ca[s.campaignId]||(ca[s.campaignId]={spent:0,committed:0});if(s.status==='RO issued')o.committed+=s.amount;else o.spent+=s.amount});
 CAMP_ROWS=CAMPS.map(c=>{const a=ca[c.campaignId]||{spent:0,committed:0},tot=a.spent+a.committed;let stage;
  if(!tot)stage=c.startYM>LAST_YM?rw(r,['Brief received','Creative in design','Department approval'],[.3,.35,.35]):'Brief received';
  else if(c.endYM>=LAST_YM)stage='Released';else if(ymDiff(c.endYM,LAST_YM)<=2)stage=r()<.6?'Released':'Evaluated';else stage='Evaluated';
  const [ey,em]=c.endYM.split('-').map(Number);const end=isoL(new Date(ey,em,0));
  return {campaignId:c.campaignId,campaign:c.campaign,ctype:c.ctype,department:c.department,fy:c.fy,start:c.startYM+'-01',end,stage,budget:+((tot||c.planned)*(.95+.25*r())).toFixed(1),spent:+a.spent.toFixed(1),reach:+(tot*(5+6*r())/10).toFixed(1),district:'Statewide'}});
 CAMP_ROWS.sort((a,b)=>b.start.localeCompare(a.start));
 const g={};SPEND.filter(s=>s.month>='2026-03'&&s.status!=='RO issued').forEach(s=>{const k=s.vendorId+'|'+s.month+'|'+s.campaignId;(g[k]||(g[k]=[])).push(s)});
 let n=0;Object.values(g).forEach(arr=>{const s=arr[0],[y,m]=s.month.split('-').map(Number);let bd=isoL(new Date(y,m,ri(r,4,22)));if(bd>isoL(T0))bd=isoL(T0);
  const paid=arr.every(x=>x.status==='Paid');let stage=paid?'Paid':rw(r,['Received','Proof check','Sanctioned','Returned'],[.3,.3,.3,.1]);
  BILL_ROWS.push({billNo:'BL/26/'+String(++n).padStart(4,'0'),roNo:s.roNo,vendorId:s.vendorId,vendor:s.vendor,campaignId:s.campaignId,campaign:s.campaign,department:s.department,channel:s.channel,district:s.district,billDate:bd,amount:+sumA(arr).toFixed(2),proof:stage==='Returned'?'Missing':'Attached',stage})});
 BILL_ROWS.sort((a,b)=>b.billDate.localeCompare(a.billDate));
})();

/* ---------- register engine ---------- */
const F=(k,h,t,o={})=>({k,h,t,req:true,...o});
const SCH_L=['Gruha Lakshmi','Shakti','Anna Bhagya','Gruha Jyothi','Yuva Nidhi','Health campaigns','Agriculture','General'];
const REGS=[],DATA={},DATA_SRC={};
const REG=c=>REGS.push(c);
const pendingDays=r=>['Paid','Paid / issued','Closed','Replied','Disbursed','Rejected','Issued','Approved','UC received'].includes(r.stage)?0:ageD(r.billDate||r.applied||r.received||r.date||isoL(T0));

REG({id:'campaigns',group:'Spend',title:'Publicity campaigns',sub:'Every campaign a department asks DIPR to run, from brief to evaluation',geoAll:true,
 schema:[F('campaignId','Campaign ID','id',{ex:'CMP-26041'}),F('campaign','Campaign name','text'),F('ctype','Campaign type','enum',{e:CTYPES.map(c=>c.k)}),F('department','Department','enum',{e:DEPTS}),F('fy','Financial year','fy'),F('start','Start date','date'),F('end','End date','date'),F('stage','Stage','enum',{e:['Brief received','Creative in design','Department approval','Released','Evaluated']}),F('budget','Budget (₹ lakh)','money'),F('spent','Spent (₹ lakh)','money',{req:false}),F('reach','Reach (lakh people)','num',{req:false}),F('district','District','district',{sw:true,req:false,ex:'Statewide'})],
 status:'stage',order:['Brief received','Creative in design','Department approval','Released','Evaluated'],dim:'ctype',dimLabel:'Campaign type',sum:'spent',
 cols:['campaignId','campaign','department','start','stage','budget','spent'],gen:()=>CAMP_ROWS,
 kpis:a=>{const c=a.filter(r=>r.fy===CUR_FY),b=sumA(c,r=>r.budget),s=sumA(c,r=>r.spent);const prep=a.filter(r=>['Brief received','Creative in design','Department approval'].includes(r.stage)).length;
  return [['Campaigns',nIN(a.length),'all years'],['Running now',a.filter(r=>r.stage==='Released').length,'released, not yet evaluated'],['In preparation',prep,'brief to approval',prep>4?'warn':''],['Budget '+CUR_FY,lakh(b),'campaign budgets'],['Spent '+CUR_FY,lakh(s),b?pct(s/b,0)+' of budget':'']]},
 ai:a=>`${a.filter(r=>r.stage==='Department approval').length} campaigns are waiting for department approval. The Campaign Brief agent drafts the media plan and cost for each new brief from the rates of past campaigns of the same type.`,
 wa:'Department nodal officers request campaigns and approve creatives on WhatsApp'});

REG({id:'empanel',group:'Spend',title:'Empanelled media and vendors',sub:'Who DIPR can buy from, at what rate, and whether their claims are verified',
 schema:[F('vendorId','Vendor ID','id',{ex:'PR-K02'}),F('vendor','Vendor name','text'),F('channel','Medium','enum',{e:CHANNELS}),F('language','Language','enum',{e:['Kannada','English','Urdu','Tulu','Konkani','Multiple']}),F('district','District','district',{sw:true}),F('claimed','Claimed circulation or reach','num'),F('audited','Audited circulation or reach','num',{req:false}),F('rate','Approved rate (₹)','inr'),F('validTill','Empanelled till','date'),F('stage','Status','enum',{e:['Active','Renewal due','Suspended','Expired']})],
 status:'stage',order:['Active','Renewal due','Suspended','Expired'],dim:'channel',dimLabel:'Medium',
 cols:['vendorId','vendor','channel','language','claimed','audited','validTill','stage'],
 gen:()=>{const r=RNG(12);return VENDORS.map(v=>{const claimed=v.channel==='Print'?ri(r,8,320)*1000:v.channel==='Television'?ri(r,20,180)*10000:ri(r,5,90)*1000;const infl=r()<.12?1.6+r():1+.25*r();const vt=addDays('2027-03-31',-ri(r,0,1)*365+(r()<.15?-200:0));
  return {vendorId:v.id,vendor:v.name,channel:v.channel,language:v.language,district:v.district,claimed,audited:r()<.85?Math.round(claimed/infl):0,rate:v.channel==='Print'?ri(r,60,420):v.channel==='Television'?ri(r,1500,9000):ri(r,800,40000),validTill:vt,stage:vt<isoL(T0)?(r()<.5?'Expired':'Suspended'):ageD(vt)>-120?'Renewal due':'Active'}})},
 kpis:a=>{const over=a.filter(r=>r.audited&&r.claimed/r.audited>1.5).length;return [['Empanelled vendors',a.length,'all media'],['Active',a.filter(r=>r.stage==='Active').length,''],['Renewal due',a.filter(r=>r.stage==='Renewal due').length,'within 120 days','warn'],['Claims > 1.5× audit',over,'circulation or reach',over?'crit':''],['No audit on file',a.filter(r=>!r.audited).length,'','warn']]},
 ai:a=>`${a.filter(r=>r.audited&&r.claimed/r.audited>1.5).length} vendors claim more than 1.5 times their audited circulation or reach. The Empanelment agent checks claims against audit certificates and postal registrations before each renewal.`,
 wa:'Vendors renew empanelment and upload certificates on WhatsApp'});

REG({id:'bills',group:'Spend',title:'Bills and payments',sub:'Vendor bills from receipt to payment, with proof of publication or broadcast',
 schema:[F('billNo','Bill number','id',{ex:'BL/26/0412'}),F('roNo','RO number','code'),F('vendorId','Vendor ID','code'),F('vendor','Vendor name','text'),F('campaignId','Campaign ID','code'),F('department','Department','enum',{e:DEPTS}),F('channel','Medium','enum',{e:CHANNELS}),F('district','District','district',{sw:true}),F('billDate','Bill date','date'),F('amount','Amount (₹ lakh)','money'),F('proof','Proof','enum',{e:['Attached','Missing']}),F('stage','Stage','enum',{e:['Received','Proof check','Sanctioned','Paid','Returned']})],
 status:'stage',order:['Received','Proof check','Sanctioned','Paid','Returned'],dim:'channel',dimLabel:'Medium',sum:'amount',
 cols:['billNo','vendor','department','billDate','amount','proof','stage','_days'],gen:()=>BILL_ROWS,
 derive:r=>{r._days=r.stage==='Paid'?0:ageD(r.billDate)},
 kpis:a=>{const p=a.filter(r=>r.stage!=='Paid');const o=p.filter(r=>r._days>30);return [['Bills',nIN(a.length),'since March 2026'],['Pending',nIN(p.length),lakh(sumA(p,r=>r.amount))],['Pending > 30 days',o.length,lakh(sumA(o,r=>r.amount)),o.length?'crit':''],['Returned for proof',a.filter(r=>r.stage==='Returned').length,'','warn'],['Paid',lakh(sumA(a.filter(r=>r.stage==='Paid'),r=>r.amount)),'']]},
 ai:a=>{const o=a.filter(r=>r.stage!=='Paid'&&r._days>30);return `${o.length} bills worth ${lakh(sumA(o,r=>r.amount))} have waited more than 30 days. Small district papers depend on these payments. The audit agent can clear bills whose proof already matches the release order.`},
 wa:'Vendors submit bills and tear sheets, and check payment status, on WhatsApp'});

REG({id:'media',group:'Outreach',title:'Media monitoring',sub:'Coverage of government work across papers, TV and news sites, with rejoinders',
 schema:[F('clipId','Clip ID','id',{ex:'MC-2207'}),F('date','Date','date'),F('outlet','Outlet','text'),F('medium','Medium','enum',{e:['Print','Television','Digital news']}),F('district','District','district',{sw:true}),F('department','Department','enum',{e:DEPTS}),F('tone','Tone','enum',{e:['Positive','Neutral','Negative']}),F('rejoinder','Rejoinder needed','yn'),F('stage','Rejoinder status','enum',{e:['No action','Drafting','With department','Issued']}),F('hours','Hours to rejoinder','num',{req:false})],
 status:'stage',order:['No action','Drafting','With department','Issued'],dim:'tone',dimLabel:'Tone',
 cols:['date','outlet','medium','department','district','tone','stage','hours'],
 gen:()=>{const r=RNG(31),out=VENDORS.filter(v=>['Print','Television'].includes(v.channel));return Array.from({length:430},(_,i)=>{const tone=rw(r,['Positive','Neutral','Negative'],[.32,.46,.22]),rj=tone==='Negative'&&r()<.5;const stage=rj?rw(r,['Drafting','With department','Issued'],[.2,.25,.55]):'No action';const v=rp(r,out);
  return {clipId:'MC-'+(2600+i),date:daysAgo(r,120),outlet:v.name,medium:r()<.15?'Digital news':v.channel==='Print'?'Print':'Television',district:r()<.45?'Statewide':rDist(r),department:rp(r,DEPTS),tone,rejoinder:rj?'Yes':'No',stage,hours:stage==='Issued'?ri(r,4,60):''}}).sort((a,b)=>b.date.localeCompare(a.date))},
 kpis:a=>{const n=a.length||1,iss=a.filter(r=>r.stage==='Issued'),h=iss.map(r=>r.hours).sort((x,y)=>x-y);return [['Clips tagged',nIN(a.length),'last 120 days'],['Positive',pct(a.filter(r=>r.tone==='Positive').length/n,0),''],['Negative',pct(a.filter(r=>r.tone==='Negative').length/n,0),'','warn'],['Rejoinders pending',a.filter(r=>['Drafting','With department'].includes(r.stage)).length,'','warn'],['Median hours to rejoinder',h.length?h[h.length>>1]:'—','']]},
 ai:a=>{const d={};a.filter(r=>r.tone==='Negative').forEach(r=>d[r.department]=(d[r.department]||0)+1);const top=Object.entries(d).sort((x,y)=>y[1]-x[1])[0];return top?`${top[0]} has the most negative coverage (${top[1]} clips). The Media Monitor agent drafts rejoinders with the department's own figures and sends them for approval.`:'No negative coverage in this area.'}});

REG({id:'social',group:'Outreach',title:'Social media',sub:'Posts and engagement on the department’s official handles',
 schema:[F('postId','Post ID','id',{ex:'SM-5521'}),F('date','Date','date'),F('platform','Platform','enum',{e:['X','Facebook','Instagram','YouTube','WhatsApp Channel']}),F('handle','Handle','text'),F('contentType','Content type','enum',{e:['Video','Image card','Text','Live']}),F('scheme','Scheme','enum',{e:SCH_L}),F('language','Language','enum',{e:['Kannada','English','Urdu']}),F('reach','Reach','num'),F('engagements','Engagements','num'),F('pendingReplies','Replies pending','num',{req:false}),F('district','District','district',{sw:true}),F('stage','Status','enum',{e:['Scheduled','Under review','Published']})],
 status:'stage',order:['Scheduled','Under review','Published'],dim:'platform',dimLabel:'Platform',sum:'reach',
 cols:['date','platform','handle','contentType','scheme','reach','engagements','stage'],
 gen:()=>{const r=RNG(41);return Array.from({length:380},(_,i)=>{const dist=r()<.32?rDist(r):'Statewide',pl=rw(r,['X','Facebook','Instagram','YouTube','WhatsApp Channel'],[.25,.25,.2,.12,.18]);const reach=Math.round((dist==='Statewide'?ri(r,20,400):ri(r,2,40))*1000*(pl==='WhatsApp Channel'?2:1));const st=i<14?rw(r,['Scheduled','Under review'],[.6,.4]):'Published';
  return {postId:'SM-'+(5400+i),date:i<14?addDays(isoL(T0),ri(r,1,6)):daysAgo(r,90),platform:pl,handle:dist==='Statewide'?'State handle':'District handle, '+dist,contentType:rw(r,['Video','Image card','Text','Live'],[.35,.4,.18,.07]),scheme:rp(r,SCH_L),language:rw(r,['Kannada','English','Urdu'],[.7,.25,.05]),reach:st==='Published'?reach:0,engagements:st==='Published'?Math.round(reach*(.01+.05*r())):0,pendingReplies:st==='Published'?ri(r,0,25):0,district:dist,stage:st}}).sort((a,b)=>b.date.localeCompare(a.date))},
 kpis:a=>{const p=a.filter(r=>r.stage==='Published'),re=sumA(p,r=>r.reach),en=sumA(p,r=>r.engagements);return [['Posts',nIN(p.length),'published, last 90 days'],['Reach',fmt(re),''],['Engagement rate',re?pct(en/re,1):'—',''],['Replies pending',nIN(sumA(p,r=>r.pendingReplies)),'citizen comments','warn'],['Scheduled',a.filter(r=>r.stage!=='Published').length,'next 7 days']]},
 ai:a=>'Video posts earn about twice the engagement of image cards here. The content calendar agent drafts Kannada captions and schedules posts. It works on official handles only; it does not track individuals.'});

REG({id:'crisis',group:'Outreach',title:'Crisis advisories',sub:'Public advisories during floods, heatwaves and outbreaks, and how fast they reached people',
 schema:[F('advisoryId','Advisory ID','id',{ex:'ADV-118'}),F('date','Date','date'),F('hazard','Hazard','enum',{e:['Heavy rain','Flood','Heatwave','Landslide','Dengue outbreak','Cyclone alert']}),F('district','District','district'),F('languages','Languages','num'),F('minutes','Minutes to issue','num'),F('reached','People reached','num'),F('readRate','Read rate (%)','num'),F('rumours','Rumours flagged','num',{req:false}),F('stage','Status','enum',{e:['Active','Updated','Closed']})],
 status:'stage',order:['Active','Updated','Closed'],dim:'hazard',dimLabel:'Hazard',
 cols:['date','hazard','district','minutes','reached','readRate','rumours','stage'],
 gen:()=>{const r=RNG(43);return Array.from({length:58},(_,i)=>{const hz=rw(r,['Heavy rain','Flood','Heatwave','Landslide','Dengue outbreak','Cyclone alert'],[.3,.2,.2,.08,.15,.07]);const d=hz==='Landslide'?rp(r,['Kodagu','Chikkamagaluru','Uttara Kannada','Dakshina Kannada','Hassan']):hz==='Heatwave'?rp(r,['Kalaburagi','Raichur','Ballari','Yadgir','Vijayapura','Bidar','Koppal']):rDist(r);
  return {advisoryId:'ADV-'+(100+i),date:daysAgo(r,365),hazard:hz,district:d,languages:ri(r,1,5),minutes:ri(r,12,140),reached:ri(r,20,600)*100,readRate:ri(r,45,88),rumours:ri(r,0,12),stage:i<3?'Active':rw(r,['Updated','Closed'],[.15,.85])}}).sort((a,b)=>b.date.localeCompare(a.date))},
 kpis:a=>{const m=a.map(r=>r.minutes).sort((x,y)=>x-y);return [['Advisories',a.length,'last 12 months'],['Active now',a.filter(r=>r.stage==='Active').length,'','warn'],['Median minutes to issue',m.length?m[m.length>>1]:'—','target 30'],['People reached',fmt(sumA(a,r=>r.reached)),''],['Rumours flagged',nIN(sumA(a,r=>r.rumours)),'during advisories']]},
 ai:a=>'Advisories in one language reach fewer people in Tulu and Urdu-speaking areas. The advisory agent drafts all five language versions from the district administration’s order for approval.',
 wa:'Citizens subscribe to district alerts on WhatsApp'});

REG({id:'welfare',group:'Press & media',title:'Journalist welfare',sub:'Health scheme, bus pass, senior journalist pension, relief fund and awards',
 schema:[F('caseId','Case ID','id',{ex:'JW-3301'}),F('journalistId','Accreditation number','text'),F('district','District','district'),F('scheme','Scheme','enum',{e:['Health scheme claim','Bus pass','Senior journalist pension','Relief fund','Media Academy award nomination']}),F('applied','Applied on','date'),F('amount','Amount (₹)','inr',{req:false}),F('stage','Stage','enum',{e:['Received','Verified','Sanctioned','Paid / issued','Returned']})],
 status:'stage',order:['Received','Verified','Sanctioned','Paid / issued','Returned'],dim:'scheme',dimLabel:'Scheme',
 cols:['caseId','journalistId','district','scheme','applied','amount','stage','_days'],derive:r=>{r._days=['Paid / issued'].includes(r.stage)?0:ageD(r.applied)},
 gen:()=>{const r=RNG(47);return Array.from({length:360},(_,i)=>{const sc=rw(r,['Health scheme claim','Bus pass','Senior journalist pension','Relief fund','Media Academy award nomination'],[.35,.3,.15,.08,.12]);const ap=daysAgo(r,180);const a=ageD(ap);
  return {caseId:'JW-'+(3200+i),journalistId:'KAR/ACC/2026/'+String(ri(r,1,1600)).padStart(4,'0'),district:rDist(r),scheme:sc,applied:ap,amount:sc==='Health scheme claim'?ri(r,4,180)*1000:sc==='Senior journalist pension'?12000:sc==='Relief fund'?ri(r,1,5)*100000:'',stage:a>45?rw(r,['Paid / issued','Returned','Sanctioned'],[.85,.05,.1]):rw(r,['Received','Verified','Sanctioned','Paid / issued','Returned'],[.3,.25,.2,.2,.05])}}).sort((a,b)=>b.applied.localeCompare(a.applied))},
 kpis:a=>{const p=a.filter(r=>!['Paid / issued'].includes(r.stage));return [['Cases',nIN(a.length),'last 6 months'],['Pending',p.length,''],['Pending > 30 days',p.filter(r=>r._days>30).length,'','crit'],['Health claims paid',inr(sumA(a.filter(r=>r.scheme==='Health scheme claim'&&r.stage==='Paid / issued'),r=>r.amount)),''],['Pensioners',a.filter(r=>r.scheme==='Senior journalist pension').length,'']]},
 ai:a=>'Most delays are in health claims waiting for hospital bills. The Welfare agent tells each journalist on WhatsApp exactly which document is missing.',
 wa:'Journalists apply and track welfare cases on WhatsApp'});

REG({id:'events',group:'Press & media',title:'Events and coverage',sub:'Chief Minister, minister and district events covered by DIPR',
 schema:[F('eventId','Event ID','id',{ex:'EV-7712'}),F('date','Date','date'),F('vip','Led by','enum',{e:['Chief Minister','Minister','Deputy Commissioner','Department head']}),F('district','District','district'),F('eventType','Event type','enum',{e:['Inauguration','Review meeting','Public programme','Press conference','Benefit distribution']}),F('photos','Photos uploaded','num'),F('video','Video','yn'),F('stage','Press release','enum',{e:['Pending','Issued','Not needed']}),F('hours','Hours to release','num',{req:false}),F('live','Live streamed','yn')],
 status:'stage',order:['Pending','Issued','Not needed'],dim:'vip',dimLabel:'Led by',
 cols:['date','vip','district','eventType','photos','video','stage','hours'],
 gen:()=>{const r=RNG(53);return Array.from({length:280},(_,i)=>{const st=i<8?'Pending':rw(r,['Issued','Not needed'],[.85,.15]);return {eventId:'EV-'+(7600+i),date:daysAgo(r,120),vip:rw(r,['Chief Minister','Minister','Deputy Commissioner','Department head'],[.12,.38,.3,.2]),district:rDist(r),eventType:rp(r,['Inauguration','Review meeting','Public programme','Press conference','Benefit distribution']),photos:ri(r,4,60),video:r()<.55?'Yes':'No',stage:st,hours:st==='Issued'?+(1+5*r()).toFixed(1):'',live:r()<.2?'Yes':'No'}}).sort((a,b)=>b.date.localeCompare(a.date))},
 kpis:a=>{const is=a.filter(r=>r.stage==='Issued'),h=is.map(r=>r.hours).sort((x,y)=>x-y);return [['Events covered',a.length,'last 120 days'],['CM and minister events',a.filter(r=>['Chief Minister','Minister'].includes(r.vip)).length,''],['Releases pending',a.filter(r=>r.stage==='Pending').length,'','warn'],['Median hours to release',h.length?h[h.length>>1]:'—',''],['Photos uploaded',nIN(sumA(a,r=>r.photos)),'']]},
 ai:a=>'The Press Release Composer turns an officer’s photos and voice notes into a bilingual release within an hour of the event.',
 wa:'District officers upload event photos on WhatsApp'});

REG({id:'election',group:'Press & media',title:'Election period',sub:'Model Code of Conduct clearances, political ad pre-certification and paid-news cases',
 schema:[F('reqId','Request ID','id',{ex:'MCC-0411'}),F('received','Received on','date'),F('district','District','district'),F('reqType','Request type','enum',{e:['Government ad clearance','Political ad pre-certification','Paid news case']}),F('outlet','Outlet or party','text'),F('stage','Stage','enum',{e:['Received','Under review','Approved','Rejected','Referred to Returning Officer']}),F('hours','Hours to decide','num',{req:false})],
 status:'stage',order:['Received','Under review','Approved','Rejected','Referred to Returning Officer'],dim:'reqType',dimLabel:'Request type',
 cols:['reqId','received','district','reqType','outlet','stage','hours'],banner:'Sample from the Lok Sabha 2024 Model Code period. This module switches on only while a Model Code is in force.',
 gen:()=>{const r=RNG(59);return Array.from({length:150},(_,i)=>{const d=new Date(2024,2,16);d.setDate(d.getDate()+ri(r,0,78));const st=rw(r,['Approved','Rejected','Referred to Returning Officer'],[.72,.18,.1]);return {reqId:'MCC-'+String(400+i).padStart(4,'0'),received:isoL(d),district:rDist(r),reqType:rw(r,['Government ad clearance','Political ad pre-certification','Paid news case'],[.35,.5,.15]),outlet:'Party or outlet '+String.fromCharCode(65+ri(r,0,11)),stage:st,hours:ri(r,2,48)}}).sort((a,b)=>b.received.localeCompare(a.received))},
 kpis:a=>[['Requests',a.length,'Mar–Jun 2024'],['Approved',a.filter(r=>r.stage==='Approved').length,''],['Rejected',a.filter(r=>r.stage==='Rejected').length,'','warn'],['Paid-news cases',a.filter(r=>r.reqType==='Paid news case').length,'','crit'],['Median hours to decide',(a.map(r=>r.hours).sort((x,y)=>x-y)[a.length>>1]||'—'),'target 48']],
 ai:a=>'Before any government message goes out during a Model Code period, the compliance agent checks it for names, photos and new announcements that the Code does not allow.'});

REG({id:'field',group:'Field',title:'Field and folk publicity',sub:'Folk troupes, street plays and LED vans in villages, with geo-tagged proof',
 schema:[F('showId','Show ID','id',{ex:'FS-9120'}),F('date','Date','date'),F('district','District','district'),F('taluk','Taluk','text'),F('village','Gram panchayat or village','text'),F('troupe','Troupe or vendor','text'),F('scheme','Scheme','enum',{e:SCH_L}),F('audience','Audience (estimate)','num'),F('geo','Geo-tag check','enum',{e:['Verified','Mismatch','Missing photo']}),F('cost','Cost (₹)','inr'),F('stage','Payment stage','enum',{e:['Logged','Geo-verified','Approved','Paid','On hold']})],
 status:'stage',order:['Logged','Geo-verified','Approved','Paid','On hold'],dim:'scheme',dimLabel:'Scheme',sum:'audience',
 cols:['date','district','taluk','village','troupe','scheme','audience','geo','stage'],
 gen:()=>{const r=RNG(61),tr=VENDORS.filter(v=>v.channel==='Field & folk'&&v.district!=='Statewide');return Array.from({length:540},(_,i)=>{const d=rDist(r),t=rp(r,TALUKS[d]),geo=rw(r,['Verified','Mismatch','Missing photo'],[.83,.08,.09]),dt=daysAgo(r,180),a=ageD(dt);
  return {showId:'FS-'+(9000+i),date:dt,district:d,taluk:t,village:t+' GP '+ri(r,1,18),troupe:rp(r,tr).name,scheme:rp(r,SCH_L),audience:ri(r,60,900),geo,cost:ri(r,8,26)*1000,stage:geo!=='Verified'?'On hold':a>40?'Paid':a>20?'Approved':a>5?'Geo-verified':'Logged'}}).sort((a,b)=>b.date.localeCompare(a.date))},
 kpis:a=>{const au=sumA(a,r=>r.audience),c=sumA(a,r=>r.cost);return [['Shows',nIN(a.length),'last 6 months'],['People reached',nIN(au),''],['Geo-verified',pct(a.filter(r=>r.geo==='Verified').length/(a.length||1),0),'photo + location + time'],['Cost per person',au?inr(c/au):'—',''],['On hold',a.filter(r=>r.stage==='On hold').length,'proof problems','crit']]},
 ai:a=>`${a.filter(r=>r.stage==='On hold').length} shows are on hold because the photo location or time does not match the plan. The verification agent checks each geo-tagged photo before payment is released.`,
 wa:'District officers and troupes log each show with a geo-tagged photo on WhatsApp'});

REG({id:'outdoor',group:'Field',title:'Outdoor displays',sub:'Hoardings, LED screens and transit media, with photo proof of display',
 schema:[F('siteId','Site ID','id',{ex:'OD-4410'}),F('district','District','district'),F('siteType','Site type','enum',{e:['Hoarding','LED screen','Bus shelter','Bus wrap']}),F('vendorId','Vendor ID','code'),F('campaign','Campaign','text'),F('from','Display from','date'),F('to','Display to','date'),F('proof','Photo proof','enum',{e:['Verified','Pending','Mismatch']}),F('cost','Cost (₹ lakh)','money'),F('stage','Status','enum',{e:['Displaying','Ended','Idle']})],
 status:'stage',order:['Displaying','Ended','Idle'],dim:'siteType',dimLabel:'Site type',sum:'cost',
 cols:['siteId','district','siteType','vendorId','campaign','from','to','proof','stage'],
 gen:()=>{const r=RNG(67),vs=VENDORS.filter(v=>v.channel==='Outdoor'),cs=CAMP_ROWS.filter(c=>c.fy===CUR_FY);return Array.from({length:230},(_,i)=>{const v=rp(r,vs),f=daysAgo(r,150),to=addDays(f,ri(r,15,60)),st=to>=isoL(T0)?'Displaying':r()<.2?'Idle':'Ended';
  return {siteId:'OD-'+(4400+i),district:v.district==='Statewide'?rDist(r):v.district,siteType:v.kind.startsWith('LED')?'LED screen':v.kind.startsWith('Transit')?rp(r,['Bus shelter','Bus wrap']):'Hoarding',vendorId:v.id,campaign:st==='Idle'?'—':rp(r,cs).campaign,from:f,to,proof:rw(r,['Verified','Pending','Mismatch'],[.78,.14,.08]),cost:+(.3+2.5*r()).toFixed(2),stage:st}})},
 kpis:a=>[['Sites',a.length,''],['Displaying now',a.filter(r=>r.stage==='Displaying').length,''],['Idle sites',a.filter(r=>r.stage==='Idle').length,'paid but no campaign','warn'],['Proof mismatch',a.filter(r=>r.proof==='Mismatch').length,'','crit'],['Cost',lakh(sumA(a,r=>r.cost)),'']],
 ai:a=>`${a.filter(r=>r.stage==='Idle').length} sites are idle between campaigns. The planner can fill them with health or safety messages at no extra rent.`,
 wa:'Officers send hoarding photos as proof on WhatsApp'});

REG({id:'film',group:'Culture & records',title:'Film sector',sub:'Film subsidies, state film award entries and festival support',geoAll:true,
 schema:[F('appId','Application ID','id',{ex:'FLM-2604'}),F('film','Film title','text'),F('language','Language','enum',{e:['Kannada','Tulu','Konkani','Kodava','Beary']}),F('category','Category','enum',{e:['Quality film subsidy','State film award entry','Festival participation support',"Children's film subsidy"]}),F('year','Year','num'),F('received','Received on','date'),F('amount','Amount sought (₹ lakh)','money',{req:false}),F('stage','Stage','enum',{e:['Received','Screening','Committee decision','Sanctioned','Disbursed','Rejected']}),F('district','District','district',{sw:true,req:false})],
 status:'stage',order:['Received','Screening','Committee decision','Sanctioned','Disbursed','Rejected'],dim:'category',dimLabel:'Category',
 cols:['appId','film','language','category','received','amount','stage','_days'],derive:r=>{r._days=['Disbursed','Rejected'].includes(r.stage)?0:ageD(r.received)},
 gen:()=>{const r=RNG(71),A=['Hasiru','Belaku','Kadalu','Male','Nela','Sanje','Dhwani','Gaali','Banna','Daari','Neralu','Kanasu'],B=['Haadu','Mane','Kathe','Jaatre','Payana','Doni','Kere','Hejje','Gudi','Theru'];return Array.from({length:170},(_,i)=>{const rc=daysAgo(r,600),a=ageD(rc),cat=rw(r,['Quality film subsidy','State film award entry','Festival participation support',"Children's film subsidy"],[.45,.3,.15,.1]);
  return {appId:'FLM-'+(2400+i),film:rp(r,A)+' '+rp(r,B),language:rw(r,['Kannada','Tulu','Konkani','Kodava','Beary'],[.8,.08,.06,.03,.03]),category:cat,year:+rc.slice(0,4),received:rc,amount:cat==='State film award entry'?'':+(5+20*r()).toFixed(1),stage:a>300?rw(r,['Disbursed','Rejected'],[.7,.3]):a>150?rw(r,['Sanctioned','Committee decision','Disbursed'],[.4,.3,.3]):rw(r,['Received','Screening','Committee decision'],[.35,.4,.25]),district:'Statewide'}}).sort((a,b)=>b.received.localeCompare(a.received))},
 kpis:a=>{const p=a.filter(r=>!['Disbursed','Rejected'].includes(r.stage));return [['Applications',a.length,'last 20 months'],['Pending',p.length,''],['Pending > 180 days',p.filter(r=>r._days>180).length,'','crit'],['Sanctioned, not paid',lakh(sumA(a.filter(r=>r.stage==='Sanctioned'),r=>r.amount)),'','warn'],['Disbursed',lakh(sumA(a.filter(r=>r.stage==='Disbursed'),r=>r.amount)),'']]},
 ai:a=>'The screening committee meets only when enough films are ready. The agent checks each application for missing documents and drafts the committee agenda once a batch is complete.'});

REG({id:'publications',group:'Culture & records',title:'Publications',sub:'Monthly magazines, scheme booklets and annual achievement books',geoAll:true,
 schema:[F('issueId','Issue ID','id',{ex:'PUB-2610K'}),F('title','Publication','enum',{e:['Monthly magazine (Kannada)','Monthly magazine (English)','Scheme booklet','Annual achievements book']}),F('month','Month','month'),F('printRun','Print run','num'),F('distributed','Copies distributed','num'),F('reads','Digital reads','num',{req:false}),F('cost','Cost (₹ lakh)','money'),F('stage','Stage','enum',{e:['In editing','At press','Distributed']}),F('district','District','district',{sw:true,req:false})],
 status:'stage',order:['In editing','At press','Distributed'],dim:'title',dimLabel:'Publication',sum:'printRun',
 cols:['issueId','title','month','printRun','distributed','reads','cost','stage'],
 gen:()=>{const r=RNG(73),rows=[];for(let k=0;k<18;k++){const d=new Date(2026,9-k,1),m=isoL(d).slice(0,7);[['Monthly magazine (Kannada)','K',60000],['Monthly magazine (English)','E',15000]].forEach(([t,c,pr])=>{const p=Math.round(pr*(.9+.2*r()));const st=k===0?'In editing':k===1?'At press':'Distributed';rows.push({issueId:'PUB-'+m.replace('-','').slice(2)+c,title:t,month:m,printRun:p,distributed:st==='Distributed'?Math.round(p*(.82+.15*r())):0,reads:st==='Distributed'?ri(r,8,60)*1000:0,cost:+(p*(c==='K'?1.4:1.8)/100000*(.9+.2*r())*10).toFixed(2),stage:st,district:'Statewide'})})}
  ['Guarantee schemes handbook','Farmer schemes guide','Health schemes guide'].forEach((t,i)=>rows.push({issueId:'PUB-BK'+(i+1),title:'Scheme booklet',month:'2026-0'+(4+i*2),printRun:200000,distributed:ri(r,140,195)*1000,reads:ri(r,20,90)*1000,cost:+(18+10*r()).toFixed(1),stage:'Distributed',district:'Statewide'}));
  rows.push({issueId:'PUB-AR26',title:'Annual achievements book',month:'2026-05',printRun:50000,distributed:46000,reads:72000,cost:24.5,stage:'Distributed',district:'Statewide'});return rows},
 kpis:a=>{const p=sumA(a,r=>r.printRun),d=sumA(a,r=>r.distributed);return [['Issues',a.length,'last 18 months'],['Copies printed',nIN(p),''],['Distributed',p?pct(d/p,0):'—','of copies printed'],['Digital reads',nIN(sumA(a,r=>r.reads)),''],['Cost per copy',p?inr(sumA(a,r=>r.cost)*1e5/p):'—','']]},
 ai:a=>'Digital reads are growing faster than print distribution. The agent turns each magazine issue into short WhatsApp stories and voice notes in Kannada.',
 wa:'Citizens read and listen to the monthly magazine on WhatsApp'});

REG({id:'archive',group:'Culture & records',title:'Photo and film archive',sub:'Digitising and tagging the department’s historic photos, negatives and film reels',
 schema:[F('assetId','Asset ID','id',{ex:'AR-19870412'}),F('year','Year','num'),F('collection','Collection','enum',{e:['State events','Chief Ministers','Mysuru Dasara','Freedom movement','Development works','Film festivals']}),F('district','District','district',{sw:true}),F('assetType','Asset type','enum',{e:['Photo print','Negative','Video','Film reel']}),F('stage','Stage','enum',{e:['Not digitised','Scanned','Tagged','Published']}),F('requests','Requests','num',{req:false})],
 status:'stage',order:['Not digitised','Scanned','Tagged','Published'],dim:'collection',dimLabel:'Collection',
 cols:['assetId','year','collection','district','assetType','stage','requests'],
 gen:()=>{const r=RNG(79);return Array.from({length:420},(_,i)=>{const y=ri(r,1956,2026);return {assetId:'AR-'+y+String(i).padStart(4,'0'),year:y,collection:rp(r,['State events','Chief Ministers','Mysuru Dasara','Freedom movement','Development works','Film festivals']),district:r()<.5?'Statewide':rDist(r),assetType:y<1990?rw(r,['Negative','Photo print','Film reel'],[.5,.35,.15]):rw(r,['Photo print','Video','Negative'],[.6,.3,.1]),stage:y<1985?rw(r,['Not digitised','Scanned','Tagged','Published'],[.55,.25,.12,.08]):rw(r,['Not digitised','Scanned','Tagged','Published'],[.15,.25,.3,.3]),requests:ri(r,0,9)}})},
 kpis:a=>{const n=a.length||1;return [['Assets catalogued',nIN(a.length),'sample of the collection'],['Digitised',pct(a.filter(r=>r.stage!=='Not digitised').length/n,0),''],['Tagged',pct(a.filter(r=>['Tagged','Published'].includes(r.stage)).length/n,0),''],['Pre-1985 not digitised',a.filter(r=>r.year<1985&&r.stage==='Not digitised').length,'oldest, most at risk','crit'],['Requests',nIN(sumA(a,r=>r.requests)),'']]},
 ai:a=>'Negatives from before 1985 are the most at risk. The Archive agent tags faces, places and events in scanned images so that staff can search the archive in Kannada.'});

REG({id:'grants',group:'Culture & records',title:'Academies and grants',sub:'Grants to bodies under the department and their utilisation certificates',geoAll:true,
 schema:[F('grantId','Grant ID','id',{ex:'GR-2611'}),F('body','Body','enum',{e:['Karnataka Media Academy','Karnataka Chalanachitra Academy','Karnataka State Temperance Board']}),F('purpose','Purpose','text'),F('fy','Financial year','fy'),F('released','Released (₹ lakh)','money'),F('ucDue','Utilisation certificate due','date'),F('stage','Status','enum',{e:['Released','UC due','UC overdue','UC received']}),F('district','District','district',{sw:true,req:false})],
 status:'stage',order:['Released','UC due','UC overdue','UC received'],dim:'body',dimLabel:'Body',sum:'released',
 cols:['grantId','body','purpose','fy','released','ucDue','stage'],
 gen:()=>{const r=RNG(83),P={'Karnataka Media Academy':['Annual journalism awards','Training workshops','Fellowships'],'Karnataka Chalanachitra Academy':['International film festival','Film appreciation courses','Film society grants'],'Karnataka State Temperance Board':['De-addiction awareness','Community programmes']};const rows=[];let i=0;['2024-25','2025-26','2026-27'].forEach(fy=>Object.entries(P).forEach(([b,ps])=>ps.forEach(p=>{const due=addDays(fy.slice(0,4)+'-10-01',365+ri(r,-30,60));const st=due>isoL(T0)?(ageD(due)>-90?'UC due':'Released'):r()<.75?'UC received':'UC overdue';rows.push({grantId:'GR-'+(2600+ ++i),body:b,purpose:p,fy,released:+(10+90*r()).toFixed(1),ucDue:due,stage:st,district:'Statewide'})})));return rows},
 kpis:a=>[['Grants',a.length,'3 years'],['Released',lakh(sumA(a,r=>r.released)),''],['UC overdue',a.filter(r=>r.stage==='UC overdue').length,lakh(sumA(a.filter(r=>r.stage==='UC overdue'),r=>r.released)),'crit'],['UC due soon',a.filter(r=>r.stage==='UC due').length,'next 90 days','warn'],['UC received',a.filter(r=>r.stage==='UC received').length,'']],
 ai:a=>'Overdue utilisation certificates hold up the next year’s release. The agent sends reminders 60, 30 and 7 days before each due date.'});

REG({id:'admin',group:'Administration',title:'Offices and staff',sub:'Posts, equipment and budget use across the head office and district offices',
 schema:[F('office','Office','text'),F('district','District','district',{sw:true}),F('sanctioned','Posts sanctioned','num'),F('filled','Posts filled','num'),F('vehicles','Vehicles','num'),F('cameras','Cameras','num'),F('budgetAlloc','Office budget (₹ lakh)','money'),F('budgetSpent','Spent (₹ lakh)','money'),F('stage','Staffing','enum',{e:['Adequate','Short','Critical']})],
 status:'stage',order:['Adequate','Short','Critical'],dim:'stage',dimLabel:'Staffing',
 cols:['office','district','sanctioned','filled','vehicles','cameras','budgetAlloc','budgetSpent','stage'],
 gen:()=>{const r=RNG(89);const rows=ALL_D.map(d=>{const s=ri(r,7,12),f=s-ri(r,0,5);return {office:'District Information Office, '+d,district:d,sanctioned:s,filled:f,vehicles:ri(r,1,2),cameras:ri(r,1,4),budgetAlloc:+(18+20*r()).toFixed(1),budgetSpent:0,stage:f/s>=.85?'Adequate':f/s>=.65?'Short':'Critical'}});rows.forEach(x=>x.budgetSpent=+(x.budgetAlloc*(.35+.3*r())).toFixed(1));rows.unshift({office:'Head office, Bengaluru',district:'Statewide',sanctioned:186,filled:151,vehicles:14,cameras:22,budgetAlloc:640,budgetSpent:301,stage:'Short'});return rows},
 kpis:a=>{const s=sumA(a,r=>r.sanctioned),f=sumA(a,r=>r.filled),b=sumA(a,r=>r.budgetAlloc),sp=sumA(a,r=>r.budgetSpent);return [['Offices',a.length,''],['Posts filled',s?pct(f/s,0):'—',`${nIN(f)} of ${nIN(s)}`],['Critical shortage',a.filter(r=>r.stage==='Critical').length,'offices','crit'],['Office budget used',b?pct(sp/b,0):'—',`${Math.round(ELAPSED*100)}% of the year gone`],['Cameras',nIN(sumA(a,r=>r.cameras)),'']]},
 ai:a=>'Offices short of staff also file fewer daily reports. The agent suggests where to post staff on deputation during peak events such as Dasara.'});

REG({id:'rti',group:'Administration',title:'RTI applications',sub:'Right to Information applications to the department and their deadlines',
 schema:[F('rtiId','RTI ID','id',{ex:'RTI-26-0331'}),F('received','Received on','date'),F('wing','Wing','enum',{e:['Advertisement','News','Accounts','Film','Establishment','Journalist welfare']}),F('applicant','Applicant type','enum',{e:['Citizen','Media','Vendor','Other']}),F('district','District','district',{sw:true}),F('stage','Stage','enum',{e:['Received','Information sought','Replied','First appeal','Closed']})],
 status:'stage',order:['Received','Information sought','Replied','First appeal','Closed'],dim:'wing',dimLabel:'Wing',
 cols:['rtiId','received','wing','applicant','district','stage','_left'],derive:r=>{r._left=['Replied','Closed'].includes(r.stage)?'':30-ageD(r.received)},
 gen:()=>{const r=RNG(97);return Array.from({length:220},(_,i)=>{const rc=daysAgo(r,150),a=ageD(rc);return {rtiId:'RTI-26-'+String(i+1).padStart(4,'0'),received:rc,wing:rw(r,['Advertisement','News','Accounts','Film','Establishment','Journalist welfare'],[.35,.12,.18,.1,.15,.1]),applicant:rw(r,['Citizen','Media','Vendor','Other'],[.5,.2,.2,.1]),district:r()<.6?'Statewide':rDist(r),stage:a>40?rw(r,['Replied','Closed','First appeal'],[.45,.45,.1]):a>12?rw(r,['Information sought','Replied'],[.5,.5]):rw(r,['Received','Information sought'],[.6,.4])}}).sort((a,b)=>b.received.localeCompare(a.received))},
 kpis:a=>{const o=a.filter(r=>r._left!=='');return [['Applications',a.length,'last 5 months'],['Open',o.length,''],['Due in 7 days',o.filter(r=>r._left>=0&&r._left<=7).length,'','warn'],['Past 30 days',o.filter(r=>r._left<0).length,'','crit'],['First appeals',a.filter(r=>r.stage==='First appeal').length,'']]},
 ai:a=>'Most RTI applications ask about advertisement spend by outlet. The agent drafts replies straight from the spend data, so the Advertisement wing only reviews and signs.'});

REGS.forEach(c=>{DATA[c.id]=c.gen();if(c.derive)DATA[c.id].forEach(c.derive);DATA_SRC[c.id]=null});
const SPEND_SCHEMA=[F('roNo','RO number','id',{ex:'RO/26/01842'}),F('month','Month','month'),F('campaignId','Campaign ID','code'),F('campaign','Campaign name','text'),F('ctype','Campaign type','enum',{e:CTYPES.map(c=>c.k)}),F('department','Department','enum',{e:DEPTS}),F('channel','Channel','enum',{e:CHANNELS}),F('vendorId','Vendor ID','code'),F('vendor','Vendor name','text'),F('district','District','district',{sw:true,ex:'Statewide'}),F('amount','Amount (₹ lakh)','money'),F('status','Status','enum',{e:['RO issued','Billed','Paid']})];
const BUDGET_SCHEMA=[F('fy','Financial year','fy'),F('department','Department','enum',{e:DEPTS}),F('channel','Channel','enum',{e:CHANNELS}),F('budget','Budget (₹ lakh)','money')];
DATA_SRC.spend=null;DATA_SRC.budget=null;
module.exports={DIVS,POP,CODE,HEX,TALUKS,LOWREAD,DB,TB,SCH,LANGS,claims,releases,feed,adFlags,VENDORS,SPEND,BUDGET,CAMPS,CAMP_ROWS,BILL_ROWS,REGS,DATA,SPEND_SCHEMA,BUDGET_SCHEMA,CHANNELS,DEPTS,CTYPES,FYS,CUR_FY,LAST_YM,SCH_L};
