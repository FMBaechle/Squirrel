/* Squirrel – Ausgaben-Tracker
 * Offline-first: alle Daten liegen in IndexedDB auf dem Gerät. Änderungen landen in einer
 * Warteschlange (Outbox) und werden an die Apps-Script-Schnittstelle des Google Sheets gesendet,
 * sobald eine Verbindung besteht. Die Antwort ist immer der vollständige Stand des Sheets.
 */
(function(){
'use strict';

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const eurF=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const eur0F=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0,minimumFractionDigits:0});
const numF=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const eur=n=>eurF.format(n), eur0=n=>eur0F.format(n);
const bigEur=n=>{const [a,b]=numF.format(n).split(',');return `<span class="int">${a}</span><span class="dec">,${b}&nbsp;€</span>`};
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const WD=['So','Mo','Di','Mi','Do','Fr','Sa'];
const WDL=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1)};
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const addM=(y,m,k)=>{const d=new Date(y,m+k,1);return {y:d.getFullYear(),m:d.getMonth()}};
const sum=a=>a.reduce((s,t)=>s+(typeof t==='number'?t:t.amount),0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseAmt=s=>{const n=Number(String(s||'').trim().replace(/\s|€/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));return isFinite(n)?Math.round(n*100)/100:NaN};
const amtStr=n=>Number(n).toFixed(2).replace('.',',').replace(/,00$/,'');
const uuid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const clone=o=>JSON.parse(JSON.stringify(o));
let TODAY,TODAY_ISO,YDAY_ISO;
function setToday(){TODAY=new Date();TODAY.setHours(0,0,0,0);TODAY_ISO=iso(TODAY);const y=new Date(TODAY);y.setDate(y.getDate()-1);YDAY_ISO=iso(y)}
setToday();

const I={
  search:'<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  left:'<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right:'<svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  chev:'<svg class="i chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  down:'<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  up:'<svg class="i" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  repeat:'<svg class="i" viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M4 12V9a3 3 0 013-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 12v3a3 3 0 01-3 3H4"/></svg>',
  back:'<svg class="i" viewBox="0 0 24 24"><path d="M9 5h10a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sheet:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
  dl:'<svg class="i" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  gear:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  cloudoff:'<svg class="i" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M8 7.5A5 5 0 0116.6 9 4 4 0 0119 16.5M17 18H7a4 4 0 01-1.6-7.7"/></svg>',
  sync:'<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>',
  warn:'<svg class="i" viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
  plus:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};
const COLORS=['#2F9D6B','#E0773A','#5867D6','#2496B5','#8A5CC9','#CC4F8E','#B9852F','#D2483C','#2F8F86','#7D8791','#6C9A2E','#C9603F'];
const DEFAULT_CATS=[
  ['food','Lebensmittel','🛒','#2F9D6B',450],['cafe','Essen & Café','☕','#E0773A',200],['home','Wohnen','🏠','#5867D6',0],
  ['mob','Mobilität','🚆','#2496B5',150],['subs','Abos & Verträge','📄','#8A5CC9',0],['fun','Freizeit','🎟️','#CC4F8E',150],
  ['shop','Shopping','🛍️','#B9852F',150],['health','Gesundheit','💊','#D2483C',0],['travel','Reisen','✈️','#2F8F86',0],['misc','Sonstiges','📦','#7D8791',0]
].map(([id,name,icon,color,budget],order)=>({id,name,icon,color,budget,order}));

/* ---------- state ---------- */
const S={cats:[],tags:[],rec:[],tx:[],
  view:'track',mode:'month',cur:null,ana:null,trendCat:'all',searchOpen:false,q:'',fCat:null,fTag:null};
let OUT=[];                       // ausstehende Änderungen für das Sheet
let CFG={url:'',token:'',lastSync:0};
let syncing=false,syncAgain=false,lastErr='';
function resetPeriods(){S.cur={y:TODAY.getFullYear(),m:TODAY.getMonth()};S.ana={...S.cur}}
resetPeriods();

/* ---------- IndexedDB ---------- */
let DB=null;
function idb(){return new Promise((res,rej)=>{try{const r=indexedDB.open('squirrel',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
const idbGet=k=>new Promise(res=>{if(!DB)return res(undefined);const q=DB.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(undefined)});
const idbSet=(k,v)=>new Promise(res=>{if(!DB)return res();const tx=DB.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>res()});
let saveT;
function persist(){clearTimeout(saveT);saveT=setTimeout(saveNow,120)}
function saveNow(){clearTimeout(saveT);return Promise.all([idbSet('data',{cats:S.cats,tags:S.tags,rec:S.rec,tx:S.tx}),idbSet('outbox',OUT),idbSet('cfg',CFG)])}

/* ---------- mutations (lokal speichern + Outbox) ---------- */
function queue(k,op,id,d){OUT=OUT.filter(o=>!(o.k===k&&o.id===id));OUT.push({k,op,id,d:d?clone(d):null});persist();scheduleSync()}
function upsert(arr,o){const i=arr.findIndex(x=>x.id===o.id);if(i<0)arr.push(o);else arr[i]=o}
const putTx=t=>{upsert(S.tx,t);queue('tx','put',t.id,t)};
const delTx=id=>{S.tx=S.tx.filter(x=>x.id!==id);queue('tx','del',id)};
const putCat=c=>{upsert(S.cats,c);queue('cat','put',c.id,c)};
const delCatRow=id=>{S.cats=S.cats.filter(x=>x.id!==id);queue('cat','del',id)};
const putRec=r=>{upsert(S.rec,r);queue('rec','put',r.id,r)};
const delRecRow=id=>{S.rec=S.rec.filter(x=>x.id!==id);queue('rec','del',id)};
const putTags=()=>queue('tags','put','all',S.tags);
function applyOpLocal(o){
  const map={tx:'tx',cat:'cats',rec:'rec'};
  if(o.k==='tags'){S.tags=o.d.slice();return}
  const key=map[o.k];if(!key)return;
  if(o.op==='del')S[key]=S[key].filter(x=>x.id!==o.id);else upsert(S[key],clone(o.d));
}
const pendingIds=()=>new Set(OUT.filter(o=>o.k==='tx').map(o=>o.id));

/* ---------- Sync mit dem Google Sheet ---------- */
let syncT;
function scheduleSync(ms){clearTimeout(syncT);syncT=setTimeout(()=>sync(false),ms??1200)}
async function call(ops){
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),25000);
  try{
    const r=await fetch(CFG.url,{method:'POST',body:JSON.stringify({token:CFG.token,ops}),headers:{'Content-Type':'text/plain;charset=utf-8'},signal:ctl.signal,redirect:'follow'});
    const j=await r.json();
    if(!j.ok)throw new Error(j.error||'Unbekannter Fehler');
    return j;
  }catch(e){
    if(e.name==='AbortError')throw new Error('Zeitüberschreitung beim Sheet');
    if(e.message==='unauthorized')throw new Error('Zugangsschlüssel ist ungültig');
    if(e instanceof TypeError||e instanceof SyntaxError)throw new Error('Sheet nicht erreichbar');
    throw e;
  }finally{clearTimeout(to)}
}
function applySnapshot(d){
  S.cats=(d.cats||[]).sort((a,b)=>(a.order??0)-(b.order??0));
  S.tags=d.tags||[];S.rec=d.rec||[];S.tx=d.tx||[];
  OUT.forEach(applyOpLocal);           // noch nicht gesendete Änderungen obenauf
}
async function sync(manual){
  if(!CFG.url||!CFG.token){if(manual)toast('Bitte zuerst das Google Sheet verbinden');return}
  if(!navigator.onLine){updateStatus();if(manual)toast('Offline. Die Synchronisierung folgt automatisch.');return}
  if(syncing){syncAgain=true;return}
  syncing=true;updateStatus();
  const sent=OUT.slice();
  try{
    const j=await call(sent);
    OUT=OUT.filter(o=>!sent.includes(o));
    applySnapshot(j.data);
    CFG.lastSync=Date.now();lastErr='';
    materialize();
    await saveNow();
    refresh();
    if(manual)toast('Synchronisiert');
  }catch(e){lastErr=e.message;if(manual)toast(esc(lastErr))}
  finally{syncing=false;updateStatus();if(syncAgain){syncAgain=false;scheduleSync(300)}}
}
async function connect(url,token){
  url=url.trim();token=token.trim();
  if(!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)){toast('Die Adresse muss mit https://script.google.com beginnen');return false}
  if(!token){toast('Bitte den Zugangsschlüssel eingeben');return false}
  const old={...CFG};CFG.url=url;CFG.token=token;
  try{
    const j=await call([]);
    const server=j.data||{};
    if(!(server.cats||[]).length){          // leeres Sheet: alles Lokale hochladen
      S.cats.forEach(c=>queue('cat','put',c.id,c));S.rec.forEach(r=>queue('rec','put',r.id,r));S.tx.forEach(t=>queue('tx','put',t.id,t));putTags();
    }else{                                   // Sheet hat Daten: nur lokale Ausgaben ergänzen
      const ids=new Set((server.tx||[]).map(t=>t.id));S.tx.filter(t=>!ids.has(t.id)).forEach(t=>queue('tx','put',t.id,t));
    }
    clearTimeout(syncT);await sync(false);
    if(lastErr){toast(esc(lastErr));return false}
    toast('Mit dem Google Sheet verbunden');return true;
  }catch(e){CFG.url=old.url;CFG.token=old.token;toast(esc(e.message));return false}
}

/* ---------- wiederkehrende Ausgaben ---------- */
function occurrences(r,from,to){
  const out=[],st=parseISO(r.start);
  let y=from.getFullYear(),m=from.getMonth();
  while(new Date(y,m,1)<=to){
    const ok=r.freq==='monthly'||(r.freq==='yearly'&&m===Number(r.month))||(r.freq==='quarterly'&&((m-st.getMonth())%3+3)%3===0);
    if(ok){const d=new Date(y,m,Math.min(Number(r.day),dim(y,m)));if(d>=from&&d<=to&&d>=st)out.push(iso(d))}
    m++;if(m>11){m=0;y++}
  }
  return out;
}
function materialize(){
  const from=new Date(TODAY);from.setDate(from.getDate()-400);
  const have=new Set(S.tx.map(t=>t.id));let n=0;
  for(const r of S.rec){if(!r.active)continue;const skip=new Set(r.skip||[]);
    for(const ds of occurrences(r,from,TODAY)){const id=`r-${r.id}-${ds}`;if(have.has(id)||skip.has(ds))continue;
      putTx({id,date:ds,amount:r.amount,cat:r.cat,title:r.title,tags:[...(r.tags||[])],note:'',rec:r.id,c:Date.now()});n++}}
  return n;
}
function plannedIn(y,m,filterFn){
  const tom=new Date(TODAY);tom.setDate(tom.getDate()+1);
  const from=new Date(Math.max(tom,new Date(y,m,1))),to=new Date(y,m,dim(y,m));
  if(from>to)return 0;
  let s=0;for(const r of S.rec){if(!r.active)continue;if(filterFn&&!filterFn({...r,note:'',date:''}))continue;s+=occurrences(r,from,to).length*r.amount}
  return s;
}
function nextDate(r){const tom=new Date(TODAY);tom.setDate(tom.getDate()+1);const to=new Date(TODAY);to.setDate(to.getDate()+400);return occurrences(r,tom,to)[0]}
const perMonth=r=>r.freq==='monthly'?r.amount:r.freq==='quarterly'?r.amount/3:r.amount/12;
function rhythm(r){return r.freq==='monthly'?`monatlich am ${r.day}.`:r.freq==='quarterly'?`quartalsweise am ${r.day}.`:`jährlich am ${r.day}. ${MONTHS[r.month]}`}
const shortDate=s=>{const d=parseISO(s);return `${d.getDate()}. ${MON[d.getMonth()]}${d.getFullYear()!==TODAY.getFullYear()?' '+d.getFullYear():''}`};

/* ---------- queries ---------- */
const cat=id=>S.cats.find(c=>c.id===id)||{id,name:'Ohne Kategorie',icon:'•',color:'#7D8791',budget:0};
const title=t=>t.title||cat(t.cat).name;
const monthTx=(y,m)=>{const p=`${y}-${pad(m+1)}`;return S.tx.filter(t=>t.date.startsWith(p))};
const isFiltered=()=>!!(S.q||S.fCat||S.fTag);
function passes(t){const q=S.q.trim().toLowerCase();
  return (!S.fCat||t.cat===S.fCat)&&(!S.fTag||(t.tags||[]).includes(S.fTag))&&(!q||title(t).toLowerCase().includes(q)||(t.note||'').toLowerCase().includes(q)||cat(t.cat).name.toLowerCase().includes(q))}
const sortTx=a=>a.sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:(y.c||0)-(x.c||0));
const catBudgetSum=()=>sum(S.cats.map(c=>Number(c.budget)||0));

/* ---------- status ---------- */
function statusInfo(){
  if(!CFG.url)return null;
  const n=OUT.length;
  if(!navigator.onLine)return {cls:'warn',icon:I.cloudoff,text:n?`Offline · ${n} ausstehend`:'Offline'};
  if(syncing)return {cls:'',icon:I.sync,text:'Synchronisiere'};
  if(lastErr)return {cls:'warn',icon:I.warn,text:n?`${n} ausstehend`:'Sync-Fehler'};
  if(n)return {cls:'',icon:I.sync,text:`${n} ausstehend`};
  return null;
}
function statusPill(){const s=statusInfo();return s?`<button class="offpill ${s.cls}" data-act="syncNow" title="${esc(lastErr||'Jetzt synchronisieren')}">${s.icon}${s.text}</button>`:''}
function updateStatus(){document.querySelectorAll('[data-slot="status"]').forEach(el=>el.innerHTML=statusPill());if(S.view==='set'&&!sheetKind){const b=$('#syncInfo');if(b)b.innerHTML=syncInfoHTML()}}
const brand=()=>`<div class="brand"><img src="icons/icon.svg" alt="" width="24" height="24">Squirrel</div>`;

/* ---------- render ---------- */
function render(){
  const v=$('#view');
  if(S.view==='track')renderTrack(v);else if(S.view==='ana')renderAna(v);else renderSet(v);
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.v===S.view));
}
function refresh(){ // nach Sync: neu zeichnen, ohne Suchfeld oder Scrollposition zu verlieren
  if(S.view==='track'&&document.activeElement&&document.activeElement.id==='q'){renderTrackBody();return}
  if(S.view==='set'&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#view form'))return;
  const y=window.scrollY;render();window.scrollTo(0,y);
}

/* Tracking */
function renderTrack(v){
  const isM=S.mode==='month';
  v.innerHTML=`
  <header class="top">
    <div class="top-row">
      ${brand()}
      <div class="top-actions">
        <span data-slot="status">${statusPill()}</span>
        <div class="seg" role="group" aria-label="Zeitraum">
          <button data-act="mode" data-v="month" class="${isM?'on':''}" aria-pressed="${isM}">Monat</button>
          <button data-act="mode" data-v="year" class="${!isM?'on':''}" aria-pressed="${!isM}">Jahr</button>
        </div>
        <button class="icon-btn ${S.searchOpen||isFiltered()?'on':''}" data-act="toggleSearch" aria-label="Suchen und filtern">${I.search}</button>
        <button class="icon-btn" data-act="tab" data-v="set" aria-label="Einstellungen">${I.gear}</button>
      </div>
    </div>
    <div class="period">
      <button class="icon-btn" data-act="prev" aria-label="Vorheriger Zeitraum">${I.left}</button>
      <h1>${isM?`${MONTHS[S.cur.m]} <span>${S.cur.y}</span>`:S.cur.y}</h1>
      <button class="icon-btn" data-act="next" aria-label="Nächster Zeitraum">${I.right}</button>
    </div>
    ${S.searchOpen?`<div class="search">
      <div class="search-field">${I.search}<input id="q" type="search" placeholder="Titel, Notiz oder Kategorie" value="${esc(S.q)}" autocomplete="off"></div>
      <div class="chips scroll">${S.cats.map(c=>`<button class="chip ${S.fCat===c.id?'on':''}" data-act="fCat" data-v="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
      <div class="chips scroll">${S.tags.map(t=>`<button class="chip ${S.fTag===t?'on':''}" data-act="fTag" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}${isFiltered()?`<button class="chip" data-act="clearFilter">Filter löschen</button>`:''}</div>
    </div>`:''}
  </header>
  <div id="tb"></div>`;
  renderTrackBody();
}
function renderTrackBody(){const tb=$('#tb');if(!tb)return;tb.innerHTML=S.mode==='month'?monthBody():yearBody()}
function txRow(t,pend){
  const c=cat(t.cat);
  const extra=(t.tags||[]).filter(x=>x!=='Privat').map(x=>`<span class="pill ${x==='Beruflich'?'biz':''}">${esc(x)}</span>`).join('');
  return `<li><button class="tx" data-act="edit" data-id="${esc(t.id)}"><span class="ci" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
    <span class="tx-main"><span class="tx-t ${t.title?'':'auto'}">${esc(title(t))}</span>
    <span class="tx-s">${pend&&pend.has(t.id)?`<span class="pend" title="Noch nicht im Sheet">${I.cloudoff}</span>`:''}${t.rec?I.repeat:''}${t.title?esc(c.name):'ohne Titel'}${extra}</span></span>
    <span class="tx-a">${eur(t.amount)}</span></button></li>`;
}
function monthBody(){
  const {y,m}=S.cur;const list=sortTx(monthTx(y,m).filter(passes));const total=sum(list);
  const isCur=y===TODAY.getFullYear()&&m===TODAY.getMonth();
  const future=new Date(y,m,1)>TODAY;
  const budget=S.fTag||S.q?0:S.fCat?Number(cat(S.fCat).budget)||0:catBudgetSum();
  const planned=S.q?0:plannedIn(y,m,passes);
  const days=isCur?TODAY.getDate():future?0:dim(y,m);
  const pct=budget?total/budget:0,ppl=budget?planned/budget:0;
  const pend=pendingIds();
  let html=`<section class="sum" aria-label="Monatssumme">
    <div class="sum-label">${isFiltered()?'Gefiltert · ':''}Ausgaben ${MONTHS[m]}</div>
    <div class="big">${bigEur(total)}</div>
    ${budget?`<div class="bbar"><i class="${pct>1?'over':''}" style="width:${Math.min(pct,1)*100}%"></i><i class="plan" style="width:${Math.max(0,Math.min(ppl,1-Math.min(pct,1)))*100}%"></i></div>`:''}
    <div class="sum-meta">${budget?`<span>${Math.round(pct*100)} % von ${eur0(budget)} Budget</span>`:`<span>${list.length} ${list.length===1?'Buchung':'Buchungen'}</span>`}<span>${days&&total?`Ø ${eur(total/days)} / Tag`:''}</span></div>
    ${planned?`<div class="planned">${I.repeat}<span>Noch geplant bis Monatsende: <b class="num">${eur(planned)}</b></span></div>`:''}
  </section>`;
  if(!list.length){
    const first=!S.tx.length;
    return html+`<div class="empty"><b>${isFiltered()?'Keine Treffer':first?'Willkommen bei Squirrel':'Noch keine Ausgaben'}</b>${isFiltered()?'Ändere Suche oder Filter.':first?'Erfasse deine erste Ausgabe mit dem Plus unten.':`Im ${MONTHS[m]} ist noch nichts erfasst.`}<br><button class="btn primary" data-act="add">Ausgabe erfassen</button></div>`;
  }
  const byDay={};list.forEach(t=>(byDay[t.date]=byDay[t.date]||[]).push(t));
  for(const ds of Object.keys(byDay)){
    const d=parseISO(ds);const items=byDay[ds];
    const rel=ds===TODAY_ISO?' · <b>Heute</b>':ds===YDAY_ISO?' · <b>Gestern</b>':'';
    html+=`<section class="day"><div class="day-h"><span class="d-num">${d.getDate()}</span><span class="d-wd">${WDL[d.getDay()]}${rel}</span><span class="d-sum">${eur(sum(items))}</span></div>
      <ul class="items">${items.map(t=>txRow(t,pend)).join('')}</ul></section>`;
  }
  return html;
}
function yearBody(){
  const y=S.cur.y;
  const ms=Array.from({length:12},(_,m)=>{const l=monthTx(y,m).filter(passes);return {m,total:sum(l),n:l.length,planned:S.q?0:plannedIn(y,m,passes),future:new Date(y,m,1)>TODAY}});
  const total=sum(ms.map(x=>x.total));const withData=ms.filter(x=>x.n);
  const max=Math.max(1,...ms.map(x=>x.future?x.planned:x.total));
  const all=S.tx.filter(t=>t.date.startsWith(y+'-')&&passes(t));
  const byCat=S.cats.map(c=>({c,v:sum(all.filter(t=>t.cat===c.id))})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const top=withData.slice().sort((a,b)=>b.total-a.total)[0];
  let html=`<section class="sum"><div class="sum-label">${isFiltered()?'Gefiltert · ':''}Ausgaben ${y}</div><div class="big">${bigEur(total)}</div>
    ${byCat.length?`<div class="stack">${byCat.map(x=>`<i title="${esc(x.c.name)}" style="width:${x.v/total*100}%;background:${esc(x.c.color)}"></i>`).join('')}</div>`:''}
    <div class="sum-meta"><span>Ø ${eur0(withData.length?total/withData.length:0)} / Monat</span><span>${top?`Höchster Monat: ${MON[top.m]}`:''}</span></div></section>
    <div class="mrows">`;
  for(const x of ms){
    const cur=y===TODAY.getFullYear()&&x.m===TODAY.getMonth();
    const val=x.future?x.planned:x.total;
    html+=`<button class="mrow ${x.future?'future':''} ${cur?'cur':''}" data-act="openMonth" data-m="${x.m}">
      <span class="mn">${MONTHS[x.m]}<small>${x.future?(x.planned?'geplant':'–'):`${x.n} ${x.n===1?'Buchung':'Buchungen'}`}</small></span>
      <span class="mbar"><i style="width:${val/max*100}%"></i></span>
      <span class="mt">${val?eur(val):'–'}</span></button>`;
  }
  return html+`</div>`;
}

/* Analyse */
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p}
const kfmt=n=>n>=1000?(n/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' k':Math.round(n)+'';
function renderAna(v){
  const {y,m}=S.ana;const list=monthTx(y,m);const total=sum(list);
  const p=addM(y,m,-1);const prevT=sum(monthTx(p.y,p.m));
  const delta=prevT?(total-prevT)/prevT:null;
  const months=Array.from({length:12},(_,i)=>{const a=addM(y,m,i-11);const l=monthTx(a.y,a.m);const byCat={};l.forEach(t=>byCat[t.cat]=(byCat[t.cat]||0)+t.amount);return {...a,total:sum(l),byCat}});
  const wd=months.filter(x=>x.total>0);const avg12=wd.length?sum(wd.map(x=>x.total))/wd.length:0;
  const byCat=S.cats.map(c=>({c,v:sum(list.filter(t=>t.cat===c.id))})).filter(x=>x.v>0||Number(x.c.budget)).sort((a,b)=>b.v-a.v);
  const isCur=y===TODAY.getFullYear()&&m===TODAY.getMonth();
  const fixed=sum(list.filter(t=>t.rec)),biz=sum(list.filter(t=>(t.tags||[]).includes('Beruflich')));
  let forecast=0;if(isCur){forecast=total+plannedIn(y,m)+(total-fixed)/TODAY.getDate()*(dim(y,m)-TODAY.getDate())}
  const top=list.filter(t=>!t.rec).sort((a,b)=>b.amount-a.amount).slice(0,5);
  const atEnd=new Date(y,m+1,1)>TODAY;
  const shown=byCat.filter(x=>x.v>0);
  v.innerHTML=`
  <header class="top">
    <div class="top-row">${brand()}<div class="top-actions"><span data-slot="status">${statusPill()}</span><button class="icon-btn" data-act="tab" data-v="set" aria-label="Einstellungen">${I.gear}</button></div></div>
    <div class="period">
      <button class="icon-btn" data-act="anaPrev" aria-label="Vorheriger Monat">${I.left}</button>
      <h1>${MONTHS[m]} <span>${y}</span></h1>
      <button class="icon-btn" data-act="anaNext" aria-label="Nächster Monat" ${atEnd?'disabled':''}>${I.right}</button>
    </div>
  </header>
  <section class="card kpi">
    <div class="lbl">Gesamtausgaben</div>
    <div class="big">${bigEur(total)}</div>
    <div class="kpi-row">
      ${delta!==null?`<span class="delta ${delta>0?'up':'down'}">${delta>0?I.up:I.down}${Math.abs(Math.round(delta*100))} % ggü. ${MON[p.m]}</span>`:''}
      ${avg12?`<span class="delta">Ø 12 Monate ${eur0(avg12)}</span>`:''}
      ${isCur&&total?`<span class="delta">Prognose ${eur0(forecast)}</span>`:''}
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Kategorien</h2><span class="lbl">${MON[m]} ${y}</span></div>
    ${total?`<div class="donut-wrap">${donut(shown,total)}
      <ul class="legend">${shown.slice(0,6).map(x=>`<li><span class="dot" style="background:${esc(x.c.color)}"></span><span class="nm">${esc(x.c.name)}</span><span class="pc">${Math.round(x.v/total*100)} %</span></li>`).join('')}${shown.length>6?`<li><span class="dot" style="background:var(--line)"></span><span class="nm">weitere</span></li>`:''}</ul></div>`:'<p class="muted">Keine Ausgaben in diesem Monat.</p>'}
    <ul class="blist">${byCat.map(x=>{const b=Number(x.c.budget)||0;const r=b?x.v/b:0;return `<li><button class="brow" data-act="trendCat" data-v="${esc(x.c.id)}"><span class="ci sm" style="--c:${esc(x.c.color)}">${esc(x.c.icon)}</span><span>
      <span class="bt"><span>${esc(x.c.name)}</span><span>${eur(x.v)}</span></span>
      ${b?`<span class="pbar"><i style="width:${Math.min(r,1)*100}%;background:${r>1?'var(--danger)':esc(x.c.color)}"></i></span>
      <span class="bs"><span>${Math.round(r*100)} % von ${eur0(b)}</span>${r>1?`<span class="over">+${eur0(x.v-b)} über Budget</span>`:`<span>${eur0(b-x.v)} übrig</span>`}</span>`:''}
    </span></button></li>`}).join('')}</ul>
  </section>
  <section class="card" id="trend">
    <div class="card-h"><h2>Entwicklung</h2><span class="lbl">12 Monate</span></div>
    <div class="chips scroll"><button class="chip ${S.trendCat==='all'?'on':''}" data-act="trendCat" data-v="all">Alle Kategorien</button>${S.cats.map(c=>`<button class="chip ${S.trendCat===c.id?'on':''}" data-act="trendCat" data-v="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>
    ${trendSVG(months)}
  </section>
  <section class="card">
    <div class="card-h"><h2>Struktur</h2><span class="lbl">${MON[m]} ${y}</span></div>
    ${splitBar('Fixkosten (wiederkehrend)','Variabel',fixed,total-fixed,'var(--accent)','var(--warn)')}
    ${splitBar('Beruflich','Privat',biz,total-biz,'#5867D6','var(--muted)')}
  </section>
  <section class="card">
    <div class="card-h"><h2>Größte Einzelausgaben</h2><span class="lbl">variabel</span></div>
    ${top.length?`<ul class="toplist">${top.map(t=>txRow(t)).join('')}</ul>`:'<p class="muted">Keine Einträge.</p>'}
  </section>`;
}
function splitBar(a,b,va,vb,ca,cb){const t=va+vb||1;return `<div class="split"><div class="sl"><span>${a} · ${Math.round(va/t*100)} %</span><span>${eur0(va)}</span></div>
  <div class="sbar"><i style="width:${va/t*100}%;background:${ca}"></i><i style="width:${vb/t*100}%;background:${cb};opacity:.55"></i></div>
  <div class="sl"><span>${b} · ${Math.round(vb/t*100)} %</span><span>${eur0(vb)}</span></div></div>`}
function donut(items,total){
  const r=54,C=2*Math.PI*r;let acc=0;const gap=items.length>1?2:0;
  const segs=items.map(x=>{const len=x.v/total*C;const s=`<circle cx="70" cy="70" r="${r}" fill="none" stroke="${esc(x.c.color)}" stroke-width="20" stroke-dasharray="${Math.max(len-gap,0.5)} ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"></circle>`;acc+=len;return s}).join('');
  return `<svg class="donut" viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Aufteilung nach Kategorie">${segs}
    <text x="70" y="64" text-anchor="middle" class="dl">GESAMT</text><text x="70" y="84" text-anchor="middle" class="dv">${eur0(total)}</text></svg>`;
}
function trendSVG(months){
  const W=340,H=190,pl=34,pr=6,pt=12,pb=22,cid=S.trendCat;
  const c=cid==='all'?null:cat(cid);
  const vals=months.map(x=>cid==='all'?x.total:(x.byCat[cid]||0));
  const budget=c?Number(c.budget)||0:0;
  const max=niceMax(Math.max(1,...vals,budget));
  const ih=H-pt-pb,bw=(W-pl-pr)/months.length,yv=v=>pt+ih-(v/max*ih);
  const nz=vals.filter(v=>v>0);const avg=nz.length?sum(nz)/nz.length:0;
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monatliche Ausgaben über 12 Monate">`;
  [0,.5,1].forEach(f=>{const yy=yv(max*f);s+=`<line class="grid" x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}"/><text class="ax" x="${pl-6}" y="${yy+3}" text-anchor="end">${kfmt(max*f)}</text>`});
  months.forEach((x,i)=>{
    const sel=x.y===S.ana.y&&x.m===S.ana.m;const bx=pl+i*bw+bw*.18,w=bw*.64;const op=sel?1:.5;
    s+=`<g data-act="anaPick" data-y="${x.y}" data-m="${x.m}"><rect x="${pl+i*bw}" y="${pt}" width="${bw}" height="${ih}" fill="transparent"/>`;
    if(cid==='all'){let base=0;S.cats.forEach(ct=>{const v=x.byCat[ct.id]||0;if(!v)return;const y1=yv(base+v),y0=yv(base);s+=`<rect x="${bx}" y="${y1}" width="${w}" height="${Math.max(y0-y1-.6,0)}" fill="${esc(ct.color)}" opacity="${op}"/>`;base+=v})}
    else{const v=vals[i];s+=`<rect x="${bx}" y="${yv(v)}" width="${w}" height="${pt+ih-yv(v)}" rx="3" fill="${esc(c.color)}" opacity="${op}"/>`}
    s+=`<text class="ax ${sel?'sel':''}" x="${pl+i*bw+bw/2}" y="${H-6}" text-anchor="middle">${MON[x.m]}</text></g>`;
  });
  if(avg)s+=`<line class="avg" x1="${pl}" x2="${W-pr}" y1="${yv(avg)}" y2="${yv(avg)}"/>`;
  if(budget)s+=`<line class="bud" x1="${pl}" x2="${W-pr}" y1="${yv(budget)}" y2="${yv(budget)}"/>`;
  s+=`</svg><div class="chart-cap">${avg?`<span><i></i>Ø ${eur0(avg)} / Monat</span>`:''}${budget?`<span><i class="b"></i>Budget ${eur0(budget)}</span>`:''}<span>Tippe auf einen Balken für den Monat</span></div>`;
  return s;
}

/* Einstellungen */
function syncInfoHTML(){
  if(!CFG.url)return '';
  const t=CFG.lastSync?new Date(CFG.lastSync):null;
  const when=t?(iso(t)===TODAY_ISO?`heute ${pad(t.getHours())}:${pad(t.getMinutes())}`:`${shortDate(iso(t))}`):'noch nie';
  const s=statusInfo();
  return `${OUT.length?`${OUT.length} ${OUT.length===1?'Änderung wartet':'Änderungen warten'} · `:''}zuletzt synchronisiert ${when}${lastErr?` · <span class="err">${esc(lastErr)}</span>`:''}${s&&!navigator.onLine?' · offline':''}`;
}
let installEvt=null;
function renderSet(v){
  const cm=monthTx(TODAY.getFullYear(),TODAY.getMonth());
  const fixedPM=sum(S.rec.filter(r=>r.active).map(perMonth));
  const recs=S.rec.slice().sort((a,b)=>(b.active-a.active)||(b.amount-a.amount));
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  v.innerHTML=`
  <header class="top"><div class="top-row"><button class="txt-btn back" data-act="tab" data-v="track">${I.left}Zurück</button><span data-slot="status">${statusPill()}</span></div><div class="period"><h1 style="text-align:left">Einstellungen</h1></div></header>

  <section class="group">
    <div class="group-h"><h2>Kategorien</h2><button class="txt-btn" data-act="editCat">+ Neue Kategorie</button></div>
    <ul class="rows">${S.cats.map(c=>{const val=sum(cm.filter(t=>t.cat===c.id));return `<li><button class="row" data-act="editCat" data-id="${esc(c.id)}"><span class="ci" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
      <span class="row-main"><b>${esc(c.name)}</b><small>${Number(c.budget)?`Budget ${eur0(c.budget)} / Monat · aktuell ${eur0(val)}`:`Kein Budget · aktuell ${eur0(val)}`}</small></span>${I.chev}</button></li>`}).join('')}</ul>
  </section>

  <section class="group">
    <div class="group-h"><h2>Wiederkehrende Ausgaben</h2><button class="txt-btn" data-act="editRec">+ Neu</button></div>
    <p class="hint">Werden am Fälligkeitstag automatisch gebucht.${recs.length?` Fixkosten: <b class="num">${eur(fixedPM)}</b> pro Monat.`:''}</p>
    ${recs.length?`<ul class="rows">${recs.map(r=>{const c=cat(r.cat);const nd=nextDate(r);return `<li><button class="row ${r.active?'':'off'}" data-act="editRec" data-id="${esc(r.id)}"><span class="ci" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
      <span class="row-main"><span class="rt"><b>${esc(r.title)}</b><span class="ra">${eur(r.amount)}</span></span><small>${rhythm(r)}${r.active?(nd?` · nächste ${shortDate(nd)}`:''):' · pausiert'}</small></span></button></li>`}).join('')}</ul>`:`<button class="row rows" data-act="editRec"><span class="ci" style="--c:#0E8A6C">${I.plus}</span><span class="row-main"><b>Erste wiederkehrende Ausgabe anlegen</b><small>z. B. Miete, Strom oder Streaming</small></span></button>`}
  </section>

  <section class="group">
    <h2>Tags</h2>
    <p class="hint">Ergänzen die Kategorie, z. B. für berufliche Ausgaben oder Urlaube. Mehrere pro Ausgabe möglich.</p>
    <div class="chips wrap">${S.tags.map(t=>`<span class="chip tagchip">#${esc(t)}<button data-act="delTag" data-v="${esc(t)}" aria-label="Tag ${esc(t)} löschen">${I.x}</button></span>`).join('')}</div>
    <form class="add-inline" data-form="tag"><input class="inp" id="newTag" placeholder="Neuer Tag, z. B. Steuer" maxlength="20" autocomplete="off"><button class="btn sm" type="submit">Hinzufügen</button></form>
  </section>

  <section class="group">
    <h2 style="margin-bottom:10px">Google Sheet</h2>
    ${CFG.url?`<ul class="rows">
      <li><div class="row"><span class="ci" style="--c:#2F9D6B">${I.sheet}</span><span class="row-main"><b>Verbunden</b><small id="syncInfo">${syncInfoHTML()}</small></span><button class="btn sm" data-act="syncNow">Sync</button></div></li>
      <li><button class="row" data-act="disconnect"><span class="ci" style="--c:#D2483C">${I.x}</span><span class="row-main"><b>Verbindung trennen</b><small>Daten bleiben auf dem Gerät und im Sheet</small></span>${I.chev}</button></li>
    </ul>`:`<p class="hint">Noch nicht verbunden. Deine Ausgaben liegen bisher nur auf diesem Gerät. Die Einrichtung steht in der Anleitung im Repository (README).</p>
    <form class="rows connect" data-form="connect">
      <label class="f">Web-App-Adresse<input class="inp" id="cUrl" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" required></label>
      <label class="f">Zugangsschlüssel<input class="inp" id="cToken" autocomplete="off" placeholder="aus dem Sheet-Setup" required></label>
      <button class="btn primary" type="submit" id="connectBtn">Verbinden</button>
    </form>`}
  </section>

  <section class="group">
    <h2 style="margin-bottom:10px">App</h2>
    <ul class="rows">
      <li><div class="homeprev"><img class="appicon" src="icons/icon.svg" alt="App-Icon Squirrel"><p><b>${standalone?'Squirrel ist installiert':'Auf den Homescreen legen'}</b>${standalone?'Startet ohne Browserleiste und funktioniert offline.':installEvt?'Installiere Squirrel als App.':'iPhone: in Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.'}</p>${installEvt&&!standalone?`<button class="btn sm primary" data-act="install">Installieren</button>`:''}</div></li>
      <li><button class="row" data-act="csv"><span class="ci" style="--c:#5867D6">${I.dl}</span><span class="row-main"><b>Als CSV exportieren</b><small>${S.tx.length} Buchungen, für Excel oder Steuer</small></span>${I.chev}</button></li>
    </ul>
  </section>
  <p class="demo-note">Squirrel · Version ${window.SQUIRREL_VERSION||''}</p>`;
}

/* ---------- Sheets (Overlays) ---------- */
let sheetKind=null;
function openSheet(kind,html){
  sheetKind=kind;const sh=$('#sheet'),sc=$('#scrim');
  sh.innerHTML=html;sh.hidden=false;sc.hidden=false;
  requestAnimationFrame(()=>{sh.classList.add('open');sc.classList.add('open')});
}
function closeSheet(){
  const sh=$('#sheet'),sc=$('#scrim');sh.classList.remove('open');sc.classList.remove('open');sheetKind=null;E=null;
  setTimeout(()=>{if(!sheetKind){sh.hidden=true;sc.hidden=true;sh.innerHTML=''}},280);
}
let toastT;
function toast(msg,undo){
  const el=$('#toast');el.innerHTML=`<span>${msg}</span>${undo?'<button data-act="undo">Rückgängig</button>':''}`;
  el._undo=undo;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),undo?5000:2600);
}

/* Eingabe (der schnelle Weg) */
let E=null;
function templates(){
  const since=new Date(TODAY);since.setDate(since.getDate()-90);const s=iso(since);
  const g={};S.tx.forEach(t=>{if(t.rec||!t.title||t.date<s)return;const k=t.cat+'|'+t.title;(g[k]=g[k]||[]).push(t.amount)});
  return Object.entries(g).filter(([,a])=>a.length>=2).sort((a,b)=>b[1].length-a[1].length).slice(0,7).map(([k,a])=>{
    const i=k.indexOf('|');const c=k.slice(0,i),ti=k.slice(i+1);const so=a.slice().sort((x,y)=>x-y);const med=so[Math.floor(so.length/2)];
    const mean=sum(a)/a.length;const sd=Math.sqrt(sum(a.map(v=>(v-mean)**2))/a.length);
    return {cat:c,title:ti,amount:mean&&sd/mean<.25?Math.round(med*10)/10:null}}).filter(t=>S.cats.some(c=>c.id===t.cat));
}
function openEntry(t,dup){
  E=t?{id:dup?null:t.id,amountStr:amtStr(t.amount),cat:t.cat,title:t.title||'',date:dup?TODAY_ISO:t.date,tags:[...(t.tags||[])],note:t.note||'',rec:dup?null:t.rec,c:t.c,more:!!t.note}
     :{id:null,amountStr:'',cat:null,title:'',date:TODAY_ISO,tags:S.tags.includes('Privat')?['Privat']:[],note:'',rec:null,more:false};
  E.tpls=E.id?[]:templates();
  openSheet('entry',entryHTML());updEntry();
}
function entryHTML(){
  const ed=!!E.id;const rec=E.rec&&S.rec.find(r=>r.id===E.rec);
  return `<div class="sh-head"><button class="txt-btn" data-act="close">Abbrechen</button><h2>${ed?'Ausgabe bearbeiten':'Neue Ausgabe'}</h2><span></span></div>
  <div class="sh-body">
    ${E.tpls.length?`<div class="chips scroll" aria-label="Häufige Ausgaben">${E.tpls.map((t,i)=>`<button class="tpl" data-act="tpl" data-i="${i}"><span>${esc(cat(t.cat).icon)}</span>${esc(t.title)}${t.amount?`<b>${eur(t.amount)}</b>`:''}</button>`).join('')}</div>`:''}
    ${rec?`<div class="recnote">${I.repeat}<span>Automatisch aus „${esc(rec.title)}“</span><button data-act="editRec" data-id="${esc(rec.id)}">Regel</button></div>`:''}
    <div class="amount" id="amt" aria-live="polite"></div>
    <div class="chips date-row" id="dateRow"></div>
    <div class="cat-grid" id="catGrid" role="radiogroup" aria-label="Kategorie"></div>
    <input class="inp" id="eTitle" maxlength="60" autocomplete="off" enterkeyhint="done" value="${esc(E.title)}">
    <div class="chips scroll sugg" id="sugg"></div>
    <div class="chips scroll" id="tagRow" aria-label="Tags"></div>
    <button class="more-toggle" data-act="more" id="moreBtn"></button>
    <div id="more" ${E.more?'':'hidden'}><textarea class="inp" id="eNote" placeholder="Notiz (optional)" maxlength="200">${esc(E.note)}</textarea></div>
  </div>
  <div class="sh-foot">
    <div class="keypad">${['1','2','3','4','5','6','7','8','9',',','0','back'].map(k=>`<button data-act="key" data-k="${k}" ${k==='back'?'aria-label="Ziffer löschen"':''}>${k==='back'?I.back:k}</button>`).join('')}</div>
    <div class="sh-actions">${ed?`<button class="btn danger" data-act="delEntry" aria-label="Löschen">${I.trash}</button><button class="btn" data-act="dupEntry">Duplizieren</button>`:`<button class="btn" data-act="saveEntry" data-next="1">Speichern + neu</button>`}
      <button class="btn primary" id="saveBtn" data-act="saveEntry">Speichern</button></div>
  </div>`;
}
function fmtTyped(v){const [i,d]=v.split(',');return Number(i||0).toLocaleString('de-DE')+(d!==undefined?','+d:'')}
function updAmount(){const a=$('#amt');if(a)a.innerHTML=E.amountStr?`<span>${esc(fmtTyped(E.amountStr))}</span><em>€</em>`:`<span class="ph">0</span><em>€</em>`}
function updSave(){const b=$('#saveBtn');if(!b)return;const okA=parseAmt(E.amountStr)>0;const ok=okA&&E.cat;b.setAttribute('aria-disabled',ok?'false':'true');
  b.textContent=!okA?'Betrag eingeben':!E.cat?'Kategorie wählen':'Speichern'}
function updEntry(){
  updAmount();
  const dOther=E.date!==TODAY_ISO&&E.date!==YDAY_ISO;
  $('#dateRow').innerHTML=`<button class="chip ${E.date===TODAY_ISO?'on':''}" data-act="date" data-v="${TODAY_ISO}">Heute</button>
    <button class="chip ${E.date===YDAY_ISO?'on':''}" data-act="date" data-v="${YDAY_ISO}">Gestern</button>
    <label class="chip date ${dOther?'on':''}">${dOther?`${WD[parseISO(E.date).getDay()]}, ${shortDate(E.date)}`:'Anderes Datum'}<input type="date" id="eDate" value="${E.date}"></label>`;
  $('#catGrid').innerHTML=S.cats.map(c=>`<button class="cb ${E.cat===c.id?'on':''}" style="--c:${esc(c.color)}" data-act="cat" data-v="${esc(c.id)}" role="radio" aria-checked="${E.cat===c.id}"><span class="ci" style="--c:${esc(c.color)}">${esc(c.icon)}</span><span>${esc(c.name.split(' ')[0])}</span></button>`).join('');
  $('#eTitle').placeholder=E.cat?`Titel (sonst „${cat(E.cat).name}“)`:'Titel (optional)';
  updSugg();
  $('#tagRow').innerHTML=S.tags.map(t=>`<button class="chip ${E.tags.includes(t)?'on':''}" data-act="etag" data-v="${esc(t)}" aria-pressed="${E.tags.includes(t)}">#${esc(t)}</button>`).join('');
  $('#tagRow').hidden=!S.tags.length;
  $('#moreBtn').innerHTML=E.more?`${I.up}Notiz ausblenden`:`${I.down}Notiz hinzufügen`;
  updSave();
}
function updSugg(){
  const typed=($('#eTitle')?.value||'').trim().toLowerCase();const g={};
  S.tx.forEach(t=>{if(t.rec||!t.title)return;if(E.cat&&t.cat!==E.cat)return;if(typed&&!t.title.toLowerCase().startsWith(typed))return;const k=t.cat+'|'+t.title;g[k]=(g[k]||0)+1});
  const list=Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k])=>{const i=k.indexOf('|');return [k.slice(0,i),k.slice(i+1)]}).filter(([,ti])=>ti.toLowerCase()!==typed);
  const el=$('#sugg');if(!el)return;
  el.innerHTML=(!E.cat&&!typed)?'':list.map(([c,ti])=>`<button class="chip" data-act="sugg" data-c="${esc(c)}" data-t="${esc(ti)}">${E.cat?'':esc(cat(c).icon)+' '}${esc(ti)}</button>`).join('');
  el.hidden=!el.innerHTML;
}
function key(k){
  let v=E.amountStr;
  if(k==='back')v=v.slice(0,-1);
  else if(k===','){if(!v.includes(','))v=(v||'0')+','}
  else{const [i,d]=v.split(',');if(d!==undefined){if(d.length<2)v+=k}else if(v==='0')v=k;else if(i.length<6)v+=k}
  E.amountStr=v;updAmount();updSave();
}
function shake(el){if(!el)return;el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake')}
function saveEntry(next){
  const amt=parseAmt(E.amountStr);
  if(!(amt>0)){shake($('#amt'));return}
  if(!E.cat){const g=$('#catGrid');g.classList.remove('err');void g.offsetWidth;g.classList.add('err');return}
  const data={date:E.date,amount:amt,cat:E.cat,title:$('#eTitle').value.trim(),tags:[...E.tags],note:($('#eNote')?.value||'').trim()};
  const d=parseISO(data.date);let id;
  if(E.id){const old=S.tx.find(x=>x.id===E.id);const before=clone(old);const t={...old,...data};putTx(t);id=t.id;
    toast('Änderung gespeichert',()=>{putTx(before);render()})}
  else{const t={id:uuid(),...data,rec:null,c:Date.now()};putTx(t);id=t.id;
    toast(`${eur(amt)} · ${esc(title(t))} gespeichert`,()=>{delTx(t.id);render()})}
  S.view='track';S.mode='month';S.cur={y:d.getFullYear(),m:d.getMonth()};
  if(next){E={...E,id:null,amountStr:'',cat:null,title:'',note:'',rec:null};$('#eTitle').value='';if($('#eNote'))$('#eNote').value='';updEntry();render()}
  else{closeSheet();render()}
  requestAnimationFrame(()=>{const el=document.querySelector(`.tx[data-id="${CSS.escape(id)}"]`);if(el){el.classList.add('flash');if(!next)el.scrollIntoView({block:'center',behavior:'smooth'})}});
}

/* Kategorie */
let C=null;
function openCat(id){
  const c=id?S.cats.find(x=>x.id===id):null;C=c?clone(c):{id:null,name:'',icon:'🏷️',color:COLORS[S.cats.length%COLORS.length],budget:0};
  const n=c?S.tx.filter(t=>t.cat===c.id).length:0;
  const fallback=S.cats.find(x=>x.id!==id&&x.id==='misc')||S.cats.find(x=>x.id!==id);
  openSheet('cat',`<div class="sh-head"><button class="txt-btn" data-act="close">Abbrechen</button><h2>${c?'Kategorie bearbeiten':'Neue Kategorie'}</h2><button class="txt-btn" data-act="saveCat">Speichern</button></div>
  <div class="sh-body">
    <div class="frow" style="grid-template-columns:76px 1fr">
      <label class="f">Symbol<input class="inp" id="cIcon" value="${esc(C.icon)}" maxlength="4" style="text-align:center;font-size:22px"></label>
      <label class="f">Name<input class="inp" id="cName" value="${esc(C.name)}" maxlength="24" placeholder="z. B. Haustier"></label>
    </div>
    <div class="f">Farbe<div class="swatches" id="sw">${swatches()}</div></div>
    <label class="f">Monatsbudget (optional)<input class="inp" id="cBudget" inputmode="decimal" value="${Number(C.budget)?amtStr(C.budget):''}" placeholder="0 €"></label>
    ${c&&fallback?`<p class="muted small">${n} ${n===1?'Buchung':'Buchungen'} in dieser Kategorie. Beim Löschen werden sie nach „${esc(fallback.name)}“ verschoben.</p>
    <button class="btn danger" data-act="delCat" data-to="${esc(fallback.id)}">${I.trash}Kategorie löschen</button>`:''}
  </div>`);
}
const swatches=()=>COLORS.map(col=>`<button class="sw ${C.color===col?'on':''}" style="--c:${col}" data-act="sw" data-v="${col}" aria-label="Farbe ${col}"></button>`).join('');
function saveCat(){
  const name=$('#cName').value.trim();if(!name){$('#cName').focus();return}
  const data={name,icon:$('#cIcon').value.trim()||'🏷️',color:C.color,budget:parseAmt($('#cBudget').value)||0};
  if(C.id)putCat({...S.cats.find(c=>c.id===C.id),...data});
  else putCat({id:'c-'+uuid().slice(0,8),...data,order:Math.max(-1,...S.cats.map(c=>c.order||0))+1});
  closeSheet();render();toast(`Kategorie „${esc(name)}“ gespeichert`);
}

/* Wiederkehrend */
let R=null;
function openRec(id){
  const r=id?S.rec.find(x=>x.id===id):null;
  R=r?clone(r):{id:null,title:'',amount:0,cat:null,tags:S.tags.includes('Privat')?['Privat']:[],freq:'monthly',day:TODAY.getDate(),month:TODAY.getMonth(),start:TODAY_ISO,active:true,skip:[]};
  openSheet('rec',`<div class="sh-head"><button class="txt-btn" data-act="close">Abbrechen</button><h2>${r?'Wiederkehrend':'Neue wiederkehrende Ausgabe'}</h2><button class="txt-btn" data-act="saveRec">Speichern</button></div>
  <div class="sh-body">
    <div class="frow"><label class="f">Titel<input class="inp" id="rTitle" value="${esc(R.title)}" placeholder="z. B. Miete" maxlength="40"></label>
    <label class="f">Betrag<input class="inp" id="rAmt" inputmode="decimal" value="${R.amount?amtStr(R.amount):''}" placeholder="0,00 €"></label></div>
    <div class="cat-grid" id="rCats"></div>
    <div class="f">Rhythmus<div class="seg" id="rFreq" style="justify-self:start"></div></div>
    <div class="frow" id="rWhen"></div>
    <div class="chips scroll" id="rTags"></div>
    <div class="preview" id="rPrev"></div>
    <div class="toggle"><span>Aktiv</span><button class="switch" role="switch" id="rActive" data-act="rActive" aria-checked="${R.active}" aria-label="Aktiv"></button></div>
    ${r?`<button class="btn danger" data-act="delRec">${I.trash}Regel löschen</button><p class="muted small">Bereits gebuchte Ausgaben bleiben erhalten.</p>`:''}
  </div>`);
  updRec();
}
function updRec(){
  $('#rCats').innerHTML=S.cats.map(c=>`<button class="cb ${R.cat===c.id?'on':''}" style="--c:${esc(c.color)}" data-act="rCat" data-v="${esc(c.id)}"><span class="ci" style="--c:${esc(c.color)}">${esc(c.icon)}</span><span>${esc(c.name.split(' ')[0])}</span></button>`).join('');
  $('#rFreq').innerHTML=[['monthly','Monatlich'],['quarterly','Quartal'],['yearly','Jährlich']].map(([k,l])=>`<button class="${R.freq===k?'on':''}" data-act="rFreq" data-v="${k}">${l}</button>`).join('');
  $('#rWhen').innerHTML=`<label class="f">Tag im Monat<input class="inp" id="rDay" type="number" min="1" max="31" value="${R.day}"></label>`+
    (R.freq==='yearly'?`<label class="f">Monat<select class="inp" id="rMonth">${MONTHS.map((n,i)=>`<option value="${i}" ${i===Number(R.month)?'selected':''}>${n}</option>`).join('')}</select></label>`
    :`<label class="f">Ab<input class="inp" id="rStart" type="date" value="${R.start}"></label>`);
  $('#rTags').innerHTML=S.tags.map(t=>`<button class="chip ${R.tags.includes(t)?'on':''}" data-act="rTag" data-v="${esc(t)}">#${esc(t)}</button>`).join('');
  updRecPrev();
}
function readRec(){
  R.title=$('#rTitle').value.trim();R.amount=parseAmt($('#rAmt').value)||0;
  R.day=Math.min(31,Math.max(1,parseInt($('#rDay').value,10)||1));
  if($('#rMonth'))R.month=+$('#rMonth').value;if($('#rStart'))R.start=$('#rStart').value||TODAY_ISO;
}
function pastCount(r){const from=new Date(TODAY);from.setDate(from.getDate()-400);const have=new Set(S.tx.map(t=>t.id));return occurrences(r,from,TODAY).filter(ds=>!have.has(`r-${r.id}-${ds}`)&&!(r.skip||[]).includes(ds)).length}
function updRecPrev(){readRec();const nd=nextDate(R);const past=R.id?0:pastCount({...R,id:'_'});
  $('#rPrev').innerHTML=`${R.amount?`<b>${eur(R.amount)}</b> `:''}${rhythm(R)}${nd?` · nächste Buchung <b>${shortDate(nd)}</b>`:''}${R.amount?` · entspricht <b>${eur(perMonth(R))}</b> pro Monat`:''}${past?`<br>Beim Speichern ${past===1?'wird 1 zurückliegende Buchung':`werden ${past} zurückliegende Buchungen`} angelegt.`:''}`}
function saveRec(){
  readRec();if(!R.title){$('#rTitle').focus();return}if(!(R.amount>0)){$('#rAmt').focus();return}if(!R.cat){shake($('#rCats'));toast('Bitte Kategorie wählen');return}
  if(R.freq==='yearly'&&(!R.start||R.start>TODAY_ISO))R.start=`${TODAY.getFullYear()}-01-01`;
  const r={...R,id:R.id||'r'+uuid().slice(0,8)};putRec(r);
  const n=materialize();closeSheet();render();toast(n?`Gespeichert · ${n} ${n>1?'Buchungen':'Buchung'} angelegt`:'Wiederkehrende Ausgabe gespeichert');
}

/* CSV */
function csvText(){
  const rows=[['Datum','Betrag','Kategorie','Titel','Tags','Notiz','Wiederkehrend']];
  sortTx(S.tx.slice()).forEach(t=>rows.push([t.date,amtStr(t.amount),cat(t.cat).name,title(t),(t.tags||[]).join(', '),t.note||'',t.rec?'ja':'nein']));
  return rows.map(r=>r.map(c=>/[;"\n]/.test(c)?`"${String(c).replace(/"/g,'""')}"`:c).join(';')).join('\n');
}
function openCSV(){
  const csv=csvText();
  openSheet('csv',`<div class="sh-head"><button class="txt-btn" data-act="close">Schließen</button><h2>CSV-Export</h2><span></span></div>
   <div class="sh-body"><p class="muted small" style="margin:0">${S.tx.length} Buchungen, Semikolon-getrennt (Excel-kompatibel).</p>
   <textarea class="inp csv" id="csvText" readonly>${esc(csv)}</textarea>
   <div class="sh-actions"><button class="btn" data-act="copyCSV">Kopieren</button><button class="btn primary" data-act="dlCSV">${I.dl}Datei laden</button></div></div>`);
}

/* ---------- Events ---------- */
const A={
  tab:el=>{S.view=el.dataset.v;render();window.scrollTo(0,0)},
  add:()=>openEntry(null),
  edit:el=>{const t=S.tx.find(x=>x.id===el.dataset.id);if(t)openEntry(t)},
  close:closeSheet,
  syncNow:()=>sync(true),
  mode:el=>{S.mode=el.dataset.v;render()},
  prev:()=>{if(S.mode==='month')S.cur=addM(S.cur.y,S.cur.m,-1);else S.cur={...S.cur,y:S.cur.y-1};render()},
  next:()=>{if(S.mode==='month')S.cur=addM(S.cur.y,S.cur.m,1);else S.cur={...S.cur,y:S.cur.y+1};render()},
  openMonth:el=>{S.mode='month';S.cur={y:S.cur.y,m:+el.dataset.m};render();window.scrollTo(0,0)},
  toggleSearch:()=>{S.searchOpen=!S.searchOpen;render();if(S.searchOpen)$('#q')?.focus()},
  fCat:el=>{S.fCat=S.fCat===el.dataset.v?null:el.dataset.v;render()},
  fTag:el=>{S.fTag=S.fTag===el.dataset.v?null:el.dataset.v;render()},
  clearFilter:()=>{S.q='';S.fCat=null;S.fTag=null;render()},
  anaPrev:()=>{S.ana=addM(S.ana.y,S.ana.m,-1);render()},
  anaNext:()=>{S.ana=addM(S.ana.y,S.ana.m,1);render()},
  anaPick:el=>{S.ana={y:+el.dataset.y,m:+el.dataset.m};const sy=window.scrollY;render();window.scrollTo(0,sy)},
  trendCat:el=>{S.trendCat=el.dataset.v;const sy=window.scrollY;render();if(el.classList.contains('brow'))$('#trend').scrollIntoView({behavior:'smooth',block:'start'});else window.scrollTo(0,sy)},
  key:el=>key(el.dataset.k),
  cat:el=>{E.cat=el.dataset.v;updEntry()},
  date:el=>{E.date=el.dataset.v;updEntry()},
  etag:el=>{const t=el.dataset.v;E.tags=E.tags.includes(t)?E.tags.filter(x=>x!==t):(t==='Beruflich'?E.tags.filter(x=>x!=='Privat'):t==='Privat'?E.tags.filter(x=>x!=='Beruflich'):E.tags).concat(t);updEntry()},
  more:()=>{E.more=!E.more;$('#more').hidden=!E.more;updEntry();if(E.more)$('#eNote').focus()},
  tpl:el=>{const t=E.tpls[+el.dataset.i];E.cat=t.cat;$('#eTitle').value=t.title;if(t.amount)E.amountStr=amtStr(t.amount);updEntry()},
  sugg:el=>{E.cat=el.dataset.c;$('#eTitle').value=el.dataset.t;updEntry()},
  saveEntry:el=>saveEntry(!!el.dataset.next),
  delEntry:()=>{
    const t=S.tx.find(x=>x.id===E.id);const r=t.rec&&S.rec.find(x=>x.id===t.rec);let rBefore=null;
    delTx(t.id);
    if(r){rBefore=clone(r);putRec({...r,skip:[...(r.skip||[]),t.date]})}
    closeSheet();render();
    toast(`„${esc(title(t))}“ gelöscht`,()=>{putTx(t);if(rBefore)putRec(rBefore);render()})},
  dupEntry:()=>{const t=S.tx.find(x=>x.id===E.id);closeSheet();setTimeout(()=>openEntry(t,true),300)},
  editCat:el=>openCat(el.dataset.id),
  sw:el=>{C.color=el.dataset.v;$('#sw').innerHTML=swatches()},
  saveCat,
  delCat:el=>{
    const id=C.id,to=el.dataset.to;const c=clone(S.cats.find(x=>x.id===id));
    const moved=S.tx.filter(t=>t.cat===id).map(t=>t.id);const movedR=S.rec.filter(r=>r.cat===id).map(r=>r.id);
    S.tx.filter(t=>t.cat===id).forEach(t=>putTx({...t,cat:to}));S.rec.filter(r=>r.cat===id).forEach(r=>putRec({...r,cat:to}));
    delCatRow(id);closeSheet();render();
    toast(`„${esc(c.name)}“ gelöscht`,()=>{putCat(c);S.cats.sort((a,b)=>(a.order||0)-(b.order||0));
      S.tx.filter(t=>moved.includes(t.id)).forEach(t=>putTx({...t,cat:id}));S.rec.filter(r=>movedR.includes(r.id)).forEach(r=>putRec({...r,cat:id}));render()})},
  editRec:el=>{const id=el.dataset.id;if(sheetKind){closeSheet();setTimeout(()=>openRec(id),300)}else openRec(id)},
  rCat:el=>{readRec();R.cat=el.dataset.v;updRec()},
  rFreq:el=>{readRec();R.freq=el.dataset.v;updRec()},
  rTag:el=>{readRec();const t=el.dataset.v;R.tags=R.tags.includes(t)?R.tags.filter(x=>x!==t):R.tags.concat(t);updRec()},
  rActive:el=>{R.active=!R.active;el.setAttribute('aria-checked',R.active)},
  saveRec,
  delRec:()=>{const r=clone(S.rec.find(x=>x.id===R.id));delRecRow(r.id);closeSheet();render();toast(`„${esc(r.title)}“ gelöscht`,()=>{putRec(r);render()})},
  delTag:el=>{const t=el.dataset.v;const i=S.tags.indexOf(t);S.tags.splice(i,1);putTags();render();toast(`#${esc(t)} entfernt`,()=>{S.tags.splice(i,0,t);putTags();render()})},
  csv:openCSV,
  copyCSV:()=>{const ta=$('#csvText');try{navigator.clipboard.writeText(ta.value).then(()=>toast('CSV kopiert'),()=>{ta.select();toast('Text markiert, bitte kopieren')})}catch(e){ta.select();toast('Text markiert, bitte kopieren')}},
  dlCSV:()=>{const blob=new Blob(['﻿'+csvText()],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`squirrel-ausgaben-${TODAY_ISO}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)},
  disconnect:()=>{const old={...CFG};CFG={url:'',token:'',lastSync:0};persist();render();toast('Verbindung getrennt',()=>{CFG=old;persist();render()})},
  install:async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice;installEvt=null;render()},
  undo:()=>{const el=$('#toast');const f=el._undo;el.classList.remove('show');el._undo=null;if(f)f()},
};
document.addEventListener('click',e=>{
  if(e.target.id==='scrim'){closeSheet();return}
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;
  const f=A[el.dataset.act];if(f){e.preventDefault();f(el,e)}
});
document.addEventListener('input',e=>{
  if(e.target.id==='q'){S.q=e.target.value;renderTrackBody()}
  if(e.target.id==='eTitle')updSugg();
  if(sheetKind==='rec'&&['rTitle','rAmt','rDay','rStart'].includes(e.target.id))updRecPrev();
});
document.addEventListener('change',e=>{
  if(e.target.id==='eDate'&&e.target.value){E.date=e.target.value;updEntry()}
  if(e.target.id==='rMonth')updRecPrev();
});
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target.dataset.form;
  if(f==='tag'){const v=$('#newTag').value.trim().replace(/^#/,'');if(!v)return;if(!S.tags.includes(v)){S.tags.push(v);putTags()}render();toast(`#${esc(v)} hinzugefügt`)}
  if(f==='connect'){const b=$('#connectBtn');b.textContent='Verbinde …';b.setAttribute('aria-disabled','true');
    const ok=await connect($('#cUrl').value,$('#cToken').value);await saveNow();
    if(ok)render();else{b.textContent='Verbinden';b.setAttribute('aria-disabled','false')}}
});
document.addEventListener('keydown',e=>{
  if(!sheetKind)return;
  if(e.key==='Escape'){closeSheet();return}
  if(sheetKind!=='entry')return;
  const tag=document.activeElement&&document.activeElement.tagName;
  if(e.key==='Enter'&&tag!=='TEXTAREA'){e.preventDefault();saveEntry(false);return}
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
  if(/^[0-9]$/.test(e.key)){key(e.key);e.preventDefault()}
  else if(e.key===','||e.key==='.'){key(',');e.preventDefault()}
  else if(e.key==='Backspace'){key('back');e.preventDefault()}
});
window.addEventListener('online',()=>{updateStatus();scheduleSync(300)});
window.addEventListener('offline',updateStatus);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){const before=TODAY_ISO;setToday();if(before!==TODAY_ISO){if(materialize())persist();refresh()}scheduleSync(300)}
  else saveNow();
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(S.view==='set')render()});

/* ---------- Start ---------- */
async function boot(){
  try{DB=await idb()}catch(e){DB=null}
  const [data,out,cfg]=await Promise.all([idbGet('data'),idbGet('outbox'),idbGet('cfg')]);
  if(data&&data.cats){S.cats=data.cats;S.tags=data.tags||[];S.rec=data.rec||[];S.tx=data.tx||[]}
  else{S.cats=clone(DEFAULT_CATS);S.tags=['Privat','Beruflich','Urlaub']}
  OUT=out||[];CFG={...CFG,...(cfg||{})};
  if(materialize())persist();
  render();
  if(/[?&]neu\b/.test(location.search)){history.replaceState(null,'',location.pathname);openEntry(null)}
  if(!DB)toast('Speicher nicht verfügbar. Einträge gehen beim Schließen verloren.');
  scheduleSync(200);
  setInterval(()=>scheduleSync(0),5*60*1000);
}
boot();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register('sw.js').catch(()=>{})}
})();
