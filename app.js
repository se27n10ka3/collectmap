(function(){
"use strict";

/* ================= 定義 ================= */
var GROUPS = {
  me:{label:"道の駅",           color:"#0B5394"},
  hw:{label:"ハイウェイスタンプ", color:"#00796B"},
  pf:{label:"ポケふた",         color:"#D81B60"},
  rt:{label:"国道ステッカー",   color:"#455A64"},
  mh:{label:"マンホールカード", color:"#7A3E9D"},
  et:{label:"エキタグ",         color:"#00ACC1"},
  sp:{label:"スタンプ",         color:"#827717"},
  cu:{label:"その他",           color:"#8A8F94"},
  yu:{label:"ゆるキャラ",       color:"#F57C00"},
  gm:{label:"ゴミ袋",           color:"#8D6E63"}
};
var GROUP_ORDER = ["me","hw","pf","rt","mh","et","sp","cu"];
var KIND_COLOR = {me:"#0B5394", sa:"#00796B", pf:"#D81B60", sh:"#455A64", mh:"#7A3E9D", et:"#00ACC1", sp:"#827717", cu:"#8A8F94", yu:"#F57C00"};
var MCI = {};   // マンホールカード：種別ID → {n:名前, s:弾, st:配布状況, d:配布開始日}
var ME_TYPES = ["stamp","kippu","card","shitei"];
var TYPE_LABEL = {stamp:"スタンプ", kippu:"きっぷ", card:"カード", shitei:"指定券", hw:"ハイウェイスタンプ", pf:"ポケふた", cu:"記念", yu:"ゆるキャラグッズ", et:"エキタグ", sp:"スタンプ"};
var TYPE_SHORT = {stamp:"ス", kippu:"き", card:"カ", shitei:"指", hw:"ハ", pf:"ポ", cu:"記", yu:"ゆ", et:"エ", sp:"印"};
var HAS_NO = {kippu:true};           // 番号を控える収集物
var PREF_ORDER = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
var CHIHOU_ORDER = ["北海道","東北","関東","中部","近畿","中国","四国","九州・沖縄","その他"];
var RALLY_ORDER = ["北海道","東北","関東","北陸","中部","近畿","中国","四国","九州・沖縄"];
var RALLY_NOTE = {
  "北海道":"北海道",
  "東北":"青森・岩手・宮城・秋田・山形・福島",
  "関東":"茨城・栃木・群馬・埼玉・千葉・東京・神奈川・山梨・長野（伊那谷と木曽を除く）",
  "北陸":"新潟・富山・石川",
  "中部":"静岡・愛知・岐阜・三重・長野（上伊那・下伊那・木曽）",
  "近畿":"福井・滋賀・京都・大阪・兵庫・奈良・和歌山",
  "中国":"鳥取・島根・岡山・広島・山口",
  "四国":"徳島・香川・愛媛・高知",
  "九州・沖縄":"福岡・佐賀・長崎・熊本・大分・宮崎・鹿児島・沖縄"
};

function grp(t){
  if(t.indexOf("mc_") === 0) return "mh";
  if(ME_TYPES.indexOf(t) >= 0) return "me";
  if(t === "hw") return "hw";
  if(t === "pf") return "pf";
  if(/^r\d+$/.test(t)) return "rt";
  if(t === "yu") return "yu";
  if(t === "et") return "et";
  if(t === "sp") return "sp";
  return "cu";
}
function tLabel(t){
  if(t.indexOf("mc_") === 0){
    var m = MCI[t] || {};
    var extra = [m.s, m.st && m.st !== "配布中" ? m.st : ""].filter(Boolean).join("・");
    return "マンホールカード " + (m.n || t.slice(3)) + (extra ? "（" + extra + "）" : "");
  }
  return /^r\d+$/.test(t) ? "国道" + t.slice(1) + "号ステッカー" : (TYPE_LABEL[t] || t);
}
function tShort(t){ return t.indexOf("mc_") === 0 ? "マ" : /^r\d+$/.test(t) ? t.slice(1) : (TYPE_SHORT[t] || "?"); }

var KEY = "collectmap.v2";

/* ================= 状態 ================= */
var MASTER = [], PLACES = [], byId = {};
var user = {version:2, visits:[], custom:[], areas:[], gomi:[], yuru:[], trips:[], stamps:[], rallies:[], tkchk:[]};
var got = {};   // got[pid][type] = {n, last, nos:[]}
var gotR = {};
var pendPf = {};  // ポケふた：訪問済みで写真がないもの  // 国道ステッカーは番号単位 gotR["r23"] = {n, last, where:[pid]}
var filt = {g:{me:true,hw:true,pf:true,rt:true,mh:true,et:true,sp:true,cu:true,yu:true,gm:true}, meMode:"all", status:"all", pref:"", q:""};
var me = null, watchId = null, manual = false, lastFix = null, lastFixT = 0;
var map = null, mapOK = false, markers = {}, meMarker = null;
var selId = null, listLimit = 100;
var editVisit = null;   // {pid, id|null}

/* ================= 便利関数 ================= */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function toast(msg){
  var t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}
function pad(n){ return (n < 10 ? "0" : "") + n; }
function ymd(d){ return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()); }
function today(){ return ymd(new Date()); }
function fmtDate(s){ return s ? s.replace(/-/g, "/") : ""; }
function nowIso(){ return new Date().toISOString(); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function dist(a,b){
  var R = 6371, p = Math.PI/180, dLa = (b.lat-a.lat)*p, dLo = (b.lng-a.lng)*p;
  var x = Math.sin(dLa/2)*Math.sin(dLa/2) + Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return 2*R*Math.asin(Math.sqrt(x));
}
function fmtKm(km){ return km < 1 ? Math.round(km*1000) + " m" : (km < 20 ? km.toFixed(1) : Math.round(km)) + " km"; }
function pct(d,t){ return t ? Math.round(d/t*1000)/10 : 0; }

/* ================= 保存 ================= */
function load(){
  try{
    var raw = localStorage.getItem(KEY);
    if(raw){
      var d = JSON.parse(raw);
      if(d && Array.isArray(d.visits)) user = {version:2, visits:d.visits, custom:d.custom || [], areas:d.areas || [], gomi:d.gomi || [], yuru:d.yuru || [], trips:d.trips || [], stamps:d.stamps || [], rallies:d.rallies || [], tkchk:d.tkchk || []};
    }
  }catch(e){}
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(user)); }
  catch(e){ toast("端末に保存できませんでした。バックアップを書き出してください"); }
}

/* ================= 索引 ================= */
function rebuildPlaces(){
  PLACES = MASTER.concat(user.custom.filter(function(c){ return !c.del; }));
  byId = {};
  PLACES.forEach(function(p){ byId[p.id] = p; });
}
function isR(t){ return /^r\d+$/.test(t) || t.indexOf("mc_") === 0; }
function rebuildGot(){
  rebuildExtra();
  got = {}; gotR = {}; pendPf = {};
  user.visits.forEach(function(v){
    if(v.del) return;
    var g = got[v.pid] || (got[v.pid] = {});
    Object.keys(v.g || {}).forEach(function(t){
      if(t === "pf" && !(v.ph && v.ph.length)){ pendPf[v.pid] = (pendPf[v.pid] || 0) + 1; return; }
      var e = g[t] || (g[t] = {n:0, last:"", nos:[]});
      e.n++;
      if(v.d > e.last) e.last = v.d;
      var no = v.g[t] && v.g[t].no;
      if(no) e.nos.push(no);
      if(isR(t)){
        var r = gotR[t] || (gotR[t] = {n:0, last:"", where:[]});
        r.n++; if(v.d > r.last) r.last = v.d;
        if(r.where.indexOf(v.pid) < 0) r.where.push(v.pid);
      }
    });
  });
}
function has(pid, t){
  if(t === "yu") return !!(yuruBy[pid] && yuruBy[pid].length);
  if(t === "sp") return !!(stampsBy[pid] && stampsBy[pid].length);
  return isR(t) ? !!gotR[t] : !!(got[pid] && got[pid][t]);
}

/* 絞り込み条件で数える収集物 */
function scopeTypes(p){
  return p.c.filter(function(t){
    var g = grp(t);
    if(!filt.g[g]) return false;
    if(g === "me" && filt.meMode !== "all" && t !== filt.meMode) return false;
    return true;
  });
}
function stateOf(p){
  var s = scopeTypes(p), d = 0;
  s.forEach(function(t){ if(has(p.id, t)) d++; });
  return {tot:s.length, done:d};
}
function visiblePlaces(){
  var q = filt.q.trim().toLowerCase();
  return PLACES.filter(function(p){
    var st = stateOf(p);
    if(st.tot === 0) return false;
    if(filt.status === "undone" && st.done === st.tot) return false;
    if(filt.status === "done" && st.done === 0) return false;
    if(filt.pref && !prefMatch(prefOf(p), filt.pref)) return false;
    if(q && (p.n + " " + (p.a || "") + " " + (p.p || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

/* ================= 描画 ================= */
function renderHeader(list){
  var d = 0, t = 0, rs = {};
  list.forEach(function(p){
    scopeTypes(p).forEach(function(x){
      if(x === "yu" || x === "sp") return;
      if(isR(x)){ if(rs[x]) return; rs[x] = 1; }
      t++; if(has(p.id, x)) d++;
    });
  });
  $("pDone").textContent = d; $("pAll").textContent = t;
}
/* 絞り込み欄：一度作ったら使い回し、状態だけ更新する（開いた選択肢が閉じないように） */
var FILT = null, FILT_SIG = "";
function makeSelect(label, opts, onchange){
  var s = document.createElement("select"); s.className = "chipsel"; s.setAttribute("aria-label", label);
  opts.forEach(function(o){
    if(o[0] === "__group"){ var g = document.createElement("optgroup"); g.label = o[1]; s.appendChild(g); s._g = g; return; }
    var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; (s._g || s).appendChild(op);
  });
  s.onchange = function(){ onchange(s.value); };
  return s;
}
/* 都道府県の選択肢（地方単位も選べる） */
function prefOptions(allLabel){
  var o = [["", allLabel], ["__group","地方"]];
  CHIHOU_ORDER.forEach(function(c){ if(c !== "その他") o.push(["ch:" + c, c]); });
  o.push(["__group","都道府県"]);
  PREF_ORDER.forEach(function(p){ o.push(["pf:" + p, p]); });
  return o;
}
function prefMatch(pref, f){
  if(!f) return true;
  if(f.indexOf("pf:") === 0) return pref === f.slice(3);
  return (PREF_CH[pref] || "") === f.slice(3);
}
/* 自分で立てた地点など県が空のものは、一番近い既存の地点の県とみなす */
var PREF_CACHE = {};
function prefOf(p){
  if(!p) return "";
  if(p.p) return p.p;
  var ck = p.id + "@" + p.la + "," + p.lo;
  if(PREF_CACHE[ck] !== undefined) return PREF_CACHE[ck];
  if(!MASTER.length) return "";
  var best = null, bd = 1e9;
  for(var i = 0; i < MASTER.length; i++){
    var q = MASTER[i]; if(!q.p) continue;
    var d = Math.abs(q.la - p.la) + Math.abs(q.lo - p.lo);
    if(d < bd){ bd = d; best = q; }
  }
  PREF_CACHE[ck] = best && bd < 1.0 ? best.p : "";
  return PREF_CACHE[ck];
}
function presentGroups(){
  return GROUP_ORDER.filter(function(g){
    if(g === "yu" || g === "gm") return false;
    return PLACES.some(function(p){ return p.c.some(function(t){ return grp(t) === g; }); });
  });
}
function makeChip(label, color, onclick){
  var b = document.createElement("button");
  b.type = "button"; b.className = "chip";
  b.style.setProperty("--c", color);
  b.innerHTML = '<span class="dot"></span><span>' + esc(label) + "</span>";
  b.onclick = onclick;
  return b;
}
function setPressed(el, on){ var v = on ? "true" : "false"; if(el.getAttribute("aria-pressed") !== v) el.setAttribute("aria-pressed", v); }
function renderFilters(){
  var groups = presentGroups(), sig = groups.join(",");
  if(!FILT || sig !== FILT_SIG){
    var w = $("filters"); w.innerHTML = ""; FILT = {chips:{}, sel:null, undone:null, work:null}; FILT_SIG = sig;
    FILT.work = makeChip("記録日: 今日", "#E5A100", openWork); w.appendChild(FILT.work);
    groups.forEach(function(g){
      var b = makeChip(GROUPS[g].label, GROUPS[g].color, function(){ filt.g[g] = !filt.g[g]; listLimit = 100; renderAll(); });
      FILT.chips[g] = b; w.appendChild(b);
      if(g === "me"){
        var s = document.createElement("select");
        s.className = "chipsel"; s.setAttribute("aria-label","道の駅の判定");
        [["all","道の駅: 4種すべて"],["stamp","道の駅: スタンプ"],["kippu","道の駅: きっぷ"],["card","道の駅: カード"],["shitei","道の駅: 指定券"]]
          .forEach(function(o){ var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
        s.onchange = function(){ filt.meMode = s.value; renderAll(); };
        FILT.sel = s; w.appendChild(s);
      }
    });
    ["yu","gm"].forEach(function(g){
      var b = makeChip(GROUPS[g].label, GROUPS[g].color, function(){ filt.g[g] = !filt.g[g]; renderAll(); });
      FILT.chips[g] = b; w.appendChild(b);
    });
    FILT.status = makeSelect("表示", [["all","表示: すべて"],["undone","表示: 未完了のみ"],["done","表示: 取得済みのみ"]], function(v){ filt.status = v; listLimit = 100; renderAll(); });
    w.appendChild(FILT.status);
    FILT.pref = makeSelect("都道府県", prefOptions("場所: 全国"), function(v){ filt.pref = v; listLimit = 100; renderAll(); fitPlaces(_vis); });
    w.appendChild(FILT.pref);
  }
  Object.keys(FILT.chips).forEach(function(g){ setPressed(FILT.chips[g], filt.g[g]); });
  if(FILT.status.value !== filt.status) FILT.status.value = filt.status;
  if(FILT.pref.value !== filt.pref) FILT.pref.value = filt.pref;
  FILT.status.classList.toggle("on", filt.status !== "all");
  FILT.pref.classList.toggle("on", !!filt.pref);
  setPressed(FILT.work, !!workDate);
  var wl = FILT.work.lastChild, wt = "記録日: " + (workDate ? dayLabel(workDate) : "今日");
  if(wl.textContent !== wt) wl.textContent = wt;
  if(FILT.sel){
    if(FILT.sel.value !== filt.meMode) FILT.sel.value = filt.meMode;
    if(FILT.sel.disabled !== !filt.g.me) FILT.sel.disabled = !filt.g.me;
  }
}
function sorted(list){
  if(me){
    list.forEach(function(p){ p._d = dist(me, {lat:p.la, lng:p.lo}); });
    return list.slice().sort(function(a,b){ return a._d - b._d; });
  }
  list.forEach(function(p){ p._d = null; });
  return list.slice().sort(function(a,b){ return a.n.localeCompare(b.n, "ja"); });
}
function badgesHtml(p){
  var s = scopeTypes(p), h = "";
  var rts = s.filter(function(t){ return grp(t) === "rt"; });
  var mhs = s.filter(function(t){ return grp(t) === "mh"; });
  s.forEach(function(t){
    if(grp(t) === "rt" || grp(t) === "mh") return;
    h += '<span class="bd' + (has(p.id,t) ? " on" : "") + '" style="--c:' + GROUPS[grp(t)].color + '">' + esc(tShort(t)) + "</span>";
  });
  if(rts.length){
    var d = rts.filter(function(t){ return has(p.id,t); }).length;
    h += '<span class="bd' + (d === rts.length ? " on" : "") + '" style="--c:' + GROUPS.rt.color + '">国' + d + "/" + rts.length + "</span>";
  }
  if(mhs.length){
    var dm = mhs.filter(function(t){ return has(p.id,t); }).length;
    h += '<span class="bd' + (dm === mhs.length ? " on" : "") + '" style="--c:' + GROUPS.mh.color + '">マ' + (mhs.length > 1 ? dm + "/" + mhs.length : "") + "</span>";
  }
  return h;
}
function renderList(list){
  var el = $("list"); el.innerHTML = "";
  $("sheetLbl").innerHTML = "<b>" + list.length + "</b> 地点" + (me ? (manual ? "・地図の中心から近い順" : "・近い順") : "");
  if(!MASTER.length){ el.innerHTML = '<p class="empty">データを読み込んでいます…</p>'; return; }
  if(list.length === 0){ el.innerHTML = '<p class="empty">この条件に合う地点はありません。</p>'; return; }
  var frag = document.createDocumentFragment();
  list.slice(0, listLimit).forEach(function(p){
    var st = stateOf(p);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "row" + (st.done === st.tot ? " full" : "");
    b.style.setProperty("--c", KIND_COLOR[p.k] || GROUPS.cu.color);
    var meta = (p.p || "") + (p._d != null ? "・" + fmtKm(p._d) : "");
    b.innerHTML = '<span class="bar"></span><span class="body"><span class="nm" style="display:block">' + esc(p.n) +
      '</span><span class="meta" style="display:block">' + esc(meta) + '</span></span><span class="badges">' + badgesHtml(p) + "</span>";
    b.onclick = function(){ select(p.id, true); };
    frag.appendChild(b);
  });
  el.appendChild(frag);
  if(list.length > listLimit){
    var m = document.createElement("button");
    m.type = "button"; m.className = "btn more";
    m.textContent = "さらに表示（残り " + (list.length - listLimit) + " 地点）";
    m.onclick = function(){ listLimit += 100; renderList(list); };
    el.appendChild(m);
  }
}
function isPending(p, st){ return st.done < st.tot && !!pendPf[p.id] && scopeTypes(p).indexOf("pf") >= 0; }
function pinHtml(p){
  var st = stateOf(p);
  var cls = st.done === st.tot ? " full" : ((st.done || isPending(p, st)) ? " part" : "");
  if(p.id === selId) cls += " sel";
  return '<span class="pin' + cls + '" style="--c:' + (KIND_COLOR[p.k] || GROUPS.cu.color) + '"></span>';
}
var dots = {}, DOT_ZOOM = 9;
function dotStyle(p){
  var st = stateOf(p), c = KIND_COLOR[p.k] || GROUPS.cu.color;
  if(st.done === st.tot) return {radius:4, color:c, weight:1.5, fillColor:"#fff", fillOpacity:1};
  return {radius:4, color:"#fff", weight:1, fillColor:c, fillOpacity: (st.done || isPending(p, st)) ? 0.55 : 1};
}
function renderMarkers(list){
  if(!mapOK) return;
  if(map.getZoom() < DOT_ZOOM){
    Object.keys(markers).forEach(function(id){ map.removeLayer(markers[id]); delete markers[id]; });
    var keepD = {};
    list.forEach(function(p){
      keepD[p.id] = true;
      var d = dots[p.id];
      if(!d){
        d = L.circleMarker([p.la, p.lo], dotStyle(p)).addTo(map);
        d.on("click", function(){ select(p.id, true); });
        dots[p.id] = d;
      }else d.setStyle(dotStyle(p));
    });
    Object.keys(dots).forEach(function(id){ if(!keepD[id]){ map.removeLayer(dots[id]); delete dots[id]; } });
    return;
  }
  Object.keys(dots).forEach(function(id){ map.removeLayer(dots[id]); delete dots[id]; });
  var b = map.getBounds().pad(0.4), keep = {};
  list.forEach(function(p){
    if(!b.contains([p.la, p.lo])) return;
    keep[p.id] = true;
    var icon = L.divIcon({className:"", html:pinHtml(p), iconSize:[22,22], iconAnchor:[11,22]});
    var m = markers[p.id];
    if(!m){
      m = L.marker([p.la, p.lo], {icon:icon}).addTo(map);
      m.on("click", function(){ select(p.id, false); });
      markers[p.id] = m;
    }else{
      m.setIcon(icon);
    }
  });
  Object.keys(markers).forEach(function(id){
    if(!keep[id]){ map.removeLayer(markers[id]); delete markers[id]; }
  });
}
var _vis = [];
function renderAll(){
  _vis = sorted(visiblePlaces());
  renderHeader(_vis); renderFilters(); renderList(_vis); renderMarkers(_vis);
  renderAreas();
  if(selId) renderDetail();
  else if(selArea) renderAreaDetail();
  else if(selTrip) renderTripDetail();
  else if(selRally) renderRallyDetail();
}

/* ================= 地点詳細 ================= */
function openSheet(on){
  var s = $("sheet"); s.classList.toggle("open", on);
  $("handle").setAttribute("aria-expanded", on ? "true" : "false");
  $("sheetArrow").textContent = on ? "▼" : "▲";
  if(mapOK) setTimeout(function(){ map.invalidateSize(); }, 240);
}
function select(pid, pan){
  if(selTrip){ tripReturn = selTrip; selTrip = null; }
  if(selRally){ selRally = null; if(rallyLayer) rallyLayer.clearLayers(); }
  selId = pid; selArea = null;
  var p = byId[pid]; if(!p) return;
  $("sheet").classList.add("detail");
  openSheet(true);
  renderDetail();
  renderMarkers(_vis);
  if(pan && mapOK) map.setView([p.la, p.lo], Math.max(map.getZoom(), 13));
}
function closeDetail(){
  selId = null; selArea = null; selTrip = null; tripReturn = null; selRally = null;
  if(rallyLayer) rallyLayer.clearLayers();
  if(tripLayer) tripLayer.clearLayers();
  $("sheet").classList.remove("detail");
  renderAll();
}
function visitsOf(pid){
  return user.visits.filter(function(v){ return v.pid === pid && !v.del; })
    .sort(function(a,b){ return (b.d + b.ua).localeCompare(a.d + a.ua); });
}
function todayVisit(pid){
  var t = curDate();
  var vs = visitsOf(pid).filter(function(v){ return v.d === t; });
  return vs[0] || null;
}
function renderDetail(){
  var p = byId[selId], el = $("detail");
  if(!p){ closeDetail(); return; }
  var tv = todayVisit(p.id);
  var h = backHtml() + '<div class="dhead"><h2>' + esc(p.n) + '</h2><button class="btn sm ghost" type="button" id="dClose" aria-label="閉じる">✕</button></div>';
  var meta = [p.p];
  if(p.ra) meta.push("帳: " + p.ra);
  h += '<div class="dmeta">' + esc(meta.filter(Boolean).join("・")) + (p.a ? "<br>" + esc(p.a) : "") + (p.h ? "<br>" + esc(p.h) : "") + "</div>";
  h += '<div class="dlinks">';
  if(p.u) h += '<a class="btn sm" href="' + esc(p.u) + '" target="_blank" rel="noopener">' + (p.k === "mh" ? "在庫・配布情報" : "公式ページ") + "</a>";
  h += '<a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=' + p.la + "," + p.lo + '" target="_blank" rel="noopener">経路</a>';
  if(p.k !== "yu" && p.k !== "sp") h += '<button class="btn sm primary" type="button" id="dVisit">訪問を記録</button>';
  if(p.k === "cu" || p.k === "yu" || p.k === "sp" || p.k === "et") h += '<button class="btn sm danger" type="button" id="dDelPlace">地点を削除</button>';
  h += "</div>";

  if(p.c.some(function(t){ return t !== "yu" && t !== "sp"; })) h += '<div class="sect">収集物</div>';
  p.c.forEach(function(t){
    if(t === "yu" || t === "sp") return;
    var e = got[p.id] && got[p.id][t];
    var elsewhere = isR(t) && !e && gotR[t];
    var inToday = !!(tv && tv.g && tv.g[t]);
    var st = e ? ("取得済み・" + e.n + "回・最終 " + fmtDate(e.last) + (e.nos.length ? "・No." + e.nos.map(esc).join(", ") : ""))
           : (elsewhere ? "取得済み（" + esc((byId[gotR[t].where[0]] || {}).n || "別の店") + "で）"
           : (t === "pf" && pendPf[p.id] ? '訪問済み・<span class="pending">写真待ち</span>' : "未取得"));
    if(elsewhere) e = gotR[t];
    h += '<div class="crow"><div class="cl"><div class="cn">' + esc(tLabel(t)) + '</div><div class="cs' + (e ? " got" : "") + '">' + st + "</div></div>" +
         '<button class="tbtn" type="button" data-t="' + esc(t) + '" aria-pressed="' + (inToday ? "true" : "false") + '">' + (inToday ? dayBtn() + " ✓" : dayBtn()) + "</button></div>";
  });

  var vs = visitsOf(p.id);
  if(p.k !== "yu" && p.k !== "sp") h += '<div class="sect">訪問記録（' + vs.length + "件）</div>";
  if(!vs.length && p.k !== "yu" && p.k !== "sp") h += '<p class="help">まだ記録はありません。</p>';
  vs.forEach(function(v){
    var items = Object.keys(v.g || {}).map(function(t){
      var no = v.g[t] && v.g[t].no;
      return tLabel(t) + (no ? "（No." + no + "）" : "");
    }).join("・");
    h += '<div class="visit"><div class="vb"><div class="vd">' + esc(fmtDate(v.d)) + '</div><div class="vi">' + esc(items || "記録なし") + "</div>" +
         (v.note ? '<div class="vn">' + esc(v.note) + "</div>" : "") + ((v.ph && v.ph.length) ? '<div class="thumbs" data-phs="' + esc(v.ph.join(",")) + '"></div>' : "") +
         '</div><button class="btn sm" type="button" data-v="' + esc(v.id) + '">編集</button></div>';
  });
  var sps = (stampsBy[p.id] || []);
  var stampSect = '<div class="sect">スタンプ（' + sps.length + '個）</div>' + stampListHtml(sps) + '<button class="btn sm" type="button" id="dStamp">スタンプを追加</button>';
  var ys = (yuruBy[p.id] || []);
  var yuruSect = '<div class="sect">ゆるキャラグッズ（' + ys.length + '点）</div>' + yuruListHtml(ys) + '<button class="btn sm" type="button" id="dYuru">ゆるキャラグッズを追加</button>';
  h += p.k === "sp" ? stampSect + yuruSect : yuruSect + stampSect;
  el.innerHTML = h;
  fillPhotoSlots(el); bindBack();
  $("dYuru").onclick = function(){ openYuru({pid:p.id}, null); };
  $("dStamp").onclick = function(){ openStamp({pid:p.id}, null); };
  el.querySelectorAll("button[data-sp]").forEach(function(b){ b.onclick = function(){ openStamp({pid:p.id}, b.getAttribute("data-sp")); }; });
  bindYuruEdit(el);
  $("dClose").onclick = closeDetail;
  if($("dVisit")) $("dVisit").onclick = function(){ openVisit(p.id, null, null); };
  if($("dDelPlace")) $("dDelPlace").onclick = function(){
    if(!confirm("この地点と記録を削除しますか？")) return;
    var c = user.custom.filter(function(x){ return x.id === p.id; })[0];
    if(c){ c.del = true; c.ua = nowIso(); }
    user.visits.forEach(function(v){ if(v.pid === p.id && !v.del){ v.del = true; v.ua = nowIso(); } });
    user.yuru.forEach(function(y){ if(y.pid === p.id && !y.del){ y.del = true; y.ua = nowIso(); } });
    user.stamps.forEach(function(x){ if(x.pid === p.id && !x.del){ x.del = true; x.ua = nowIso(); } });
    save(); rebuildPlaces(); rebuildGot(); closeDetail();
  };
  el.querySelectorAll("button[data-t]").forEach(function(b){
    b.onclick = function(){ quickToggle(p.id, b.getAttribute("data-t")); };
  });
  el.querySelectorAll("button[data-v]").forEach(function(b){
    b.onclick = function(){ openVisit(p.id, b.getAttribute("data-v"), null); };
  });
}

/* 「今日」ボタン：今日の訪問記録に足す／外す */
function quickToggle(pid, t){
  var v = todayVisit(pid);
  var on = !!(v && v.g[t]);
  if(!on && (HAS_NO[t] || t === "pf")){ openVisit(pid, v ? v.id : null, t); return; }  // きっぷは番号、ポケふたは写真の入力へ
  if(v){
    if(on) delete v.g[t]; else v.g[t] = {};
    if(!Object.keys(v.g).length && !v.note) v.del = true;
    v.ua = nowIso();
  }else{
    var g = {}; g[t] = {};
    user.visits.push({id:"v" + uid(), pid:pid, d:curDate(), g:g, note:"", ca:nowIso(), ua:nowIso()});
  }
  save(); rebuildGot(); renderAll();
  if(!on) toast(tLabel(t) + " を記録しました");
}

/* ================= 訪問ダイアログ ================= */
function openVisit(pid, vid, preset){
  var p = byId[pid]; if(!p) return;
  var v = vid ? user.visits.filter(function(x){ return x.id === vid; })[0] : null;
  editVisit = {pid:pid, id:v ? v.id : null, ph:(v && v.ph || []).slice(), add:[], del:[], busy:0};
  $("vTitle").textContent = v ? "訪問記録を編集" : "訪問を記録";
  $("vDate").value = v ? v.d : curDate();
  renderDateChips("vDateChips", "vDate");
  renderVThumbs();
  $("vNote").value = v ? (v.note || "") : "";
  $("vMsg").textContent = "";
  $("vDel").style.display = v ? "" : "none";
  var box = $("vItems"); box.innerHTML = "";
  var types = p.c.slice();
  if(v) Object.keys(v.g).forEach(function(t){ if(types.indexOf(t) < 0) types.push(t); });
  var focusEl = null;
  types.forEach(function(t){
    var checked = !!(v && v.g[t]) || t === preset;
    var row = document.createElement("label");
    row.className = "chk";
    row.innerHTML = '<input type="checkbox" data-t="' + esc(t) + '"' + (checked ? " checked" : "") + "><span>" + esc(tLabel(t)) + "</span>" +
      (HAS_NO[t] ? '<input class="no" type="text" inputmode="numeric" placeholder="番号" data-no="' + esc(t) + '" value="' + esc(v && v.g[t] && v.g[t].no || "") + '">' : "");
    box.appendChild(row);
    if(HAS_NO[t]){
      var cb = row.querySelector("input[type=checkbox]"), no = row.querySelector(".no");
      no.style.visibility = checked ? "visible" : "hidden";
      cb.onchange = function(){ no.style.visibility = cb.checked ? "visible" : "hidden"; if(cb.checked) no.focus(); };
      no.onclick = function(e){ e.preventDefault(); no.focus(); };
      if(t === preset) focusEl = no;
    }
  });
  $("dlgVisit").showModal();
  if(focusEl) setTimeout(function(){ focusEl.focus(); }, 80);
}
$("formVisit").addEventListener("submit", function(e){
  e.preventDefault();
  if(!editVisit) return;
  var d = $("vDate").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ $("vMsg").textContent = "訪問日を入れてください"; return; }
  var g = {};
  $("vItems").querySelectorAll("input[type=checkbox]").forEach(function(cb){
    if(!cb.checked) return;
    var t = cb.getAttribute("data-t"), o = {};
    var no = $("vItems").querySelector('input[data-no="' + t + '"]');
    if(no && no.value.trim()) o.no = no.value.trim();
    g[t] = o;
  });
  var note = $("vNote").value.trim(), ev = editVisit;
  if(!Object.keys(g).length && !note && !ev.ph.length && !ev.add.length){ $("vMsg").textContent = "手に入れたものを選ぶか、コメントを入れてください"; return; }
  if(ev.busy){ $("vMsg").textContent = "写真の処理が終わるまで少し待ってください"; return; }
  var vid = ev.id || ("v" + uid()), newIds = [];
  var jobs = ev.add.map(function(a){ var id = "ph" + uid() + newIds.length; newIds.push(id); return idbPut("photos", {id:id, blob:a.blob, pid:ev.pid, vid:vid, ca:nowIso()}); });
  $("vMsg").textContent = jobs.length ? "写真を保存しています…" : "";
  function finish(){
    ev.del.forEach(function(id){ idbDel("photos", id).catch(function(){}); if(PH_URL[id]){ URL.revokeObjectURL(PH_URL[id]); delete PH_URL[id]; } });
    var ph = ev.ph.concat(newIds);
    if(ev.id){
      var v = user.visits.filter(function(x){ return x.id === ev.id; })[0];
      v.d = d; v.g = g; v.note = note; v.ph = ph; v.ua = nowIso();
    }else{
      user.visits.push({id:vid, pid:ev.pid, d:d, g:g, note:note, ph:ph, ca:nowIso(), ua:nowIso()});
    }
    save(); rebuildGot(); $("dlgVisit").close(); renderAll();
    toast(g.pf && !ph.length ? "記録しました（ポケふたは写真を付けると完了）" : "記録しました");
  }
  if(!jobs.length){ finish(); return; }
  Promise.all(jobs).then(finish).catch(function(err){ $("vMsg").textContent = "写真を保存できませんでした：" + err.message; });
});
$("vDel").onclick = function(){
  if(!editVisit || !editVisit.id) return;
  if(!confirm("この訪問記録を削除しますか？")) return;
  var v = user.visits.filter(function(x){ return x.id === editVisit.id; })[0];
  v.del = true; v.ua = nowIso();
  (v.ph || []).forEach(function(id){ idbDel("photos", id).catch(function(){}); });
  save(); rebuildGot(); $("dlgVisit").close(); renderAll(); toast("削除しました");
};

/* ================= 進捗 ================= */
var PROG_KINDS = [["gm","指定ごみ袋（自治体）"],["yu","ゆるキャラグッズ"],["sp","スタンプ帳（街中のスタンプ）"],["me:all","道の駅（4種合計）"],["me:stamp","道の駅 スタンプ"],["me:kippu","道の駅 きっぷ"],["me:card","道の駅 カード"],
  ["me:shitei","道の駅 指定券"],["hw","ハイウェイスタンプ"],["pf","ポケふた"],["rt","国道ステッカー"],["mh","マンホールカード"],["all","すべて"]];
function kindMatch(kind, t){
  if(kind === "all") return true;
  var g = grp(t);
  if(kind === "me:all") return g === "me";
  if(kind.indexOf("me:") === 0) return t === kind.slice(3);
  return g === kind;
}
function tally(places, kind){
  var d = 0, t = 0, rs = {};
  places.forEach(function(p){ p.c.forEach(function(x){
    if(!kindMatch(kind, x) || x === "yu" || x === "sp") return;
    if(isR(x)){ if(rs[x]) return; rs[x] = 1; }
    t++; if(has(p.id, x)) d++;
  }); });
  return {d:d, t:t};
}
function pgRow(name, r, color, cls, onclick){
  var b = document.createElement("button");
  b.type = "button"; b.className = "pg" + (cls ? " " + cls : "");
  if(color) b.style.setProperty("--c", color);
  b.innerHTML = '<span class="pn">' + esc(name) + '</span><span class="pb"><i style="width:' + pct(r.d, r.t) + '%"></i></span>' +
    '<span class="pv"><b>' + pct(r.d, r.t) + "%</b> " + r.d + "/" + r.t + "</span>";
  if(onclick) b.onclick = onclick;
  return b;
}
function fitPlaces(ps){
  if(!mapOK || !ps.length) return;
  map.fitBounds(L.latLngBounds(ps.map(function(p){ return [p.la, p.lo]; })), {padding:[30,30], maxZoom:13});
}
function renderProgArea(){
  var kind = $("progKind").value, body = $("progAreaBody");
  body.innerHTML = "";
  if(kind === "gm"){ renderProgGomi(body); return; }
  if(kind === "yu"){ renderProgYuru(body); return; }
  if(kind === "sp"){ renderProgStamp(body); return; }
  var color = kind === "all" ? "#0B5394" : GROUPS[kind.indexOf("me") === 0 ? "me" : kind].color;
  body.appendChild(pgRow("全体", tally(PLACES, kind), color, "sum"));
  CHIHOU_ORDER.forEach(function(ch){
    var inCh = PLACES.filter(function(p){ return (p.r || "その他") === ch; });
    var tc = tally(inCh, kind);
    if(!tc.t) return;
    var h = document.createElement("div"); h.className = "pg-h"; h.textContent = ch;
    body.appendChild(h);
    body.appendChild(pgRow(ch + " 計", tc, color, "sum", function(){ $("dlgProg").close(); fitPlaces(inCh); }));
    var prefs = {};
    inCh.forEach(function(p){ (prefs[p.p || "未設定"] = prefs[p.p || "未設定"] || []).push(p); });
    Object.keys(prefs).sort(function(a,b){
      var ia = PREF_ORDER.indexOf(a), ib = PREF_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).forEach(function(pr){
      var r = tally(prefs[pr], kind);
      if(!r.t) return;
      body.appendChild(pgRow(pr, r, color, "", function(){ $("dlgProg").close(); fitPlaces(prefs[pr]); }));
    });
  });
}
function renderProgRally(){
  var el = $("progRally"); el.innerHTML = "";
  var eki = PLACES.filter(function(p){ return p.k === "me" && p.ra; });
  RALLY_ORDER.forEach(function(ra){
    var ps = eki.filter(function(p){ return p.ra === ra; });
    if(!ps.length) return;
    var box = document.createElement("div"); box.className = "rally";
    box.innerHTML = "<h3>" + esc(ra) + "「道の駅」</h3><div class=\"rs\">" + ps.length + " 駅" + (RALLY_NOTE[ra] ? "・" + esc(RALLY_NOTE[ra]) : "") + "</div>";
    ME_TYPES.forEach(function(t){
      box.appendChild(pgRow(TYPE_LABEL[t], tally(ps, "me:" + t), GROUPS.me.color, "", function(){ $("dlgProg").close(); fitPlaces(ps); }));
    });
    el.appendChild(box);
  });
}
function openProg(){
  var s = $("progKind");
  if(!s.options.length) PROG_KINDS.slice(3).concat(PROG_KINDS.slice(0,3)).forEach(function(k){ var o = document.createElement("option"); o.value = k[0]; o.textContent = k[1]; s.appendChild(o); });
  renderProgArea(); renderProgRally(); renderProgTeku();
  if(!$("progList").hidden) renderProgList();
  $("dlgProg").showModal();
}
$("progKind").onchange = renderProgArea;
document.querySelectorAll(".tab").forEach(function(tb){
  tb.onclick = function(){
    document.querySelectorAll(".tab").forEach(function(x){ x.setAttribute("aria-selected", x === tb ? "true" : "false"); });
    $("progArea").hidden = tb.dataset.tab !== "area";
    $("progRally").hidden = tb.dataset.tab !== "rally";
    $("progTeku").hidden = tb.dataset.tab !== "teku";
    $("progList").hidden = tb.dataset.tab !== "list";
    if(tb.dataset.tab === "list") renderProgList();
  };
});

/* ================= 読み込み・書き出し ================= */
function exportJson(){
  return JSON.stringify({app:"collectmap", version:2, exported:nowIso(), visits:user.visits, custom:user.custom,
    areas:user.areas, gomi:user.gomi, yuru:user.yuru, trips:user.trips, stamps:user.stamps, rallies:user.rallies, tkchk:user.tkchk});
}
function ioMsg(s, err){ var m = $("ioMsg"); m.textContent = s; m.className = "msg" + (err ? " err" : ""); }
function mergeV2(d){
  var add = 0, upd = 0;
  var vi = {}; user.visits.forEach(function(v){ vi[v.id] = v; });
  (d.visits || []).forEach(function(v){
    if(!v || !v.id || !v.pid) return;
    var cur = vi[v.id];
    if(!cur){ user.visits.push(v); vi[v.id] = v; add++; }
    else if((v.ua || "") > (cur.ua || "")){ Object.assign(cur, v); upd++; }
  });
  var ci = {}; user.custom.forEach(function(c){ ci[c.id] = c; });
  (d.custom || []).forEach(function(c){
    if(!c || !c.id) return;
    if(!ci[c.id]){ user.custom.push(c); ci[c.id] = c; }
    else if((c.ua || "") > (ci[c.id].ua || "")) Object.assign(ci[c.id], c);
  });
  ["areas","gomi","yuru","trips","stamps","rallies","tkchk"].forEach(function(k){
    var idx = {}; user[k].forEach(function(x){ idx[x.id] = x; });
    (d[k] || []).forEach(function(x){
      if(!x || !x.id) return;
      if(!idx[x.id]){ user[k].push(x); idx[x.id] = x; add++; }
      else if((x.ua || "") > (idx[x.id].ua || "")){ Object.assign(idx[x.id], x); upd++; }
    });
  });
  return "記録 新規 " + add + " 件・更新 " + upd + " 件を読み込みました";
}
/* 旧版（HTMLファイル版）からの移行 */
function migrateV1(items){
  var idx = {};
  MASTER.forEach(function(p){ idx[p.la.toFixed(3) + "," + p.lo.toFixed(3)] = (idx[p.la.toFixed(3) + "," + p.lo.toFixed(3)] || []).concat([p]); });
  var byName = {}; MASTER.forEach(function(p){ byName[p.n] = p; });
  var kindOf = {michinoeki:"me", highway:"sa", pokefuta:"pf"};
  var groups = {}, moved = 0, newPlaces = 0, skipped = 0;
  function find(it, wantKinds){
    var cand = (idx[(+it.lat).toFixed(3) + "," + (+it.lng).toFixed(3)] || []).filter(function(p){ return wantKinds.indexOf(p.k) >= 0; });
    if(cand.length === 1) return cand[0];
    if(cand.length > 1){
      var ex = cand.filter(function(p){ return p.n === it.name; })[0];
      if(ex) return ex;
      return cand.sort(function(a,b){ return dist({lat:it.lat,lng:it.lng},{lat:a.la,lng:a.lo}) - dist({lat:it.lat,lng:it.lng},{lat:b.la,lng:b.lo}); })[0];
    }
    var bn = byName[it.name];
    return bn && wantKinds.indexOf(bn.k) >= 0 ? bn : null;
  }
  items.forEach(function(it){
    if(!it || !isFinite(it.lat) || !isFinite(it.lng)) return;
    var p = null, types = [];
    if(kindOf[it.cat]){
      p = find(it, [kindOf[it.cat]]);
      if(p) types = it.cat === "michinoeki" ? ["stamp"] : (it.cat === "highway" ? ["hw"] : ["pf"]);
    }else if(it.cat === "kokudo"){
      p = find(it, ["sh","me"]);
      if(p){
        var m = String(it.name).match(/国道([\d・]+)号/);
        var nos = m ? m[1].split("・").map(function(n){ return "r" + n; }) : [];
        types = p.c.filter(function(t){ return /^r\d+$/.test(t) && (!nos.length || nos.indexOf(t) >= 0); });
      }
    }
    if(!p){
      // 旧版で自分で追加した地点など
      var key = it.name + "|" + (+it.lat).toFixed(5) + "|" + (+it.lng).toFixed(5);
      p = user.custom.filter(function(c){ return c._k === key && !c.del; })[0];
      if(!p){
        p = {id:"cu" + uid(), k:"cu", n:String(it.name || "地点"), la:+it.lat, lo:+it.lng, p:"", r:"", a:String(it.note || ""), c:["cu"], _k:key, ua:nowIso()};
        user.custom.push(p); newPlaces++;
      }
      types = ["cu"];
    }
    if(!it.done) return;
    types = types.filter(function(t){ return !has(p.id, t) && !(t === "pf" && pendPf[p.id]); });
    if(!types.length){ skipped++; return; }
    var d = it.doneAt ? ymd(new Date(it.doneAt)) : today();
    var gk = p.id + "|" + d;
    var v = groups[gk];
    if(!v){ v = groups[gk] = {id:"v" + uid(), pid:p.id, d:d, g:{}, note:"旧版から移行", ca:nowIso(), ua:nowIso()}; user.visits.push(v); }
    types.forEach(function(t){ v.g[t] = {}; moved++; });
  });
  return "旧版から " + moved + " 件の取得記録を移しました" + (newPlaces ? "（自作の地点 " + newPlaces + " 件を追加）" : "") + (skipped ? "・記録済みのため " + skipped + " 件を省略" : "");
}
function importText(text){
  var d = JSON.parse(text);
  var msg;
  if(d && d.version === 2 && Array.isArray(d.visits)) msg = mergeV2(d);
  else if(d && Array.isArray(d.items)) msg = migrateV1(d.items);
  else if(Array.isArray(d)) msg = migrateV1(d);
  else throw new Error("形式が違います");
  save(); rebuildPlaces(); rebuildGot(); renderAll();
  return msg;
}
$("btnExport").onclick = function(){
  try{
    var blob = new Blob([exportJson()], {type:"application/json"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "collectmap-backup-" + today() + ".json";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    ioMsg("書き出しました", false);
  }catch(e){ $("btnShowJson").onclick(); ioMsg("保存できないため文字で表示しました。コピーして控えてください", true); }
};
$("btnShowJson").onclick = function(){ var t = $("ioOut"); t.style.display = "block"; t.value = exportJson(); t.select(); };
$("ioFile").onchange = function(){
  var f = this.files && this.files[0]; if(!f) return;
  var fr = new FileReader();
  fr.onload = function(){ $("ioIn").value = fr.result; ioMsg("内容を読み込みました。「読み込む」を押してください", false); };
  fr.readAsText(f);
};
$("btnImport").onclick = function(){
  var t = $("ioIn").value.trim();
  if(!t){ ioMsg("ファイルを選ぶか、貼り付けてください", true); return; }
  if(!MASTER.length){ ioMsg("地点データの読み込みが終わってから実行してください", true); return; }
  try{ ioMsg(importText(t), false); $("ioIn").value = ""; }
  catch(e){ ioMsg("読み込めませんでした: " + e.message, true); }
};

/* ================= 地点の追加 ================= */
var pendingLatLng = null;
function openAddPlace(ll){
  pendingLatLng = ll;
  $("plName").value = ""; $("plNote").value = "";
  $("plLat").value = ll ? ll.lat.toFixed(6) : (me ? me.lat.toFixed(6) : "");
  $("plLng").value = ll ? ll.lng.toFixed(6) : (me ? me.lng.toFixed(6) : "");
  $("dlgPlace").showModal();
}
$("formPlace").addEventListener("submit", function(e){
  e.preventDefault();
  var la = parseFloat($("plLat").value), lo = parseFloat($("plLng").value), n = $("plName").value.trim();
  if(!n || !isFinite(la) || !isFinite(lo)){ toast("名前と緯度経度を入れてください"); return; }
  var p = {id:"cu" + uid(), k:"cu", n:n, la:la, lo:lo, p:"", r:"", a:$("plNote").value.trim(), c:["cu"], ua:nowIso()};
  user.custom.push(p); save(); rebuildPlaces(); rebuildGot();
  $("dlgPlace").close(); renderAll(); select(p.id, false);
});

/* ================= 現在地 ================= */
function setManual(on){
  manual = on;
  var b = $("btnLoc");
  b.classList.toggle("manual", on);
  if(!mapOK) return;
  if(on){ map.on("moveend", manualUpdate); manualUpdate(true); }
  else map.off("moveend", manualUpdate);
}
function manualUpdate(force){
  if(!manual || !mapOK) return;
  var c = map.getCenter();
  if(force !== true && me && dist(me, {lat:c.lat, lng:c.lng}) < 0.2) return;
  me = {lat:c.lat, lng:c.lng}; renderAll();
}
function stopLocate(){
  if(watchId !== null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  if(manual) setManual(false);
  $("btnLoc").classList.remove("on");
  if(meMarker && mapOK){ map.removeLayer(meMarker); meMarker = null; }
  me = null; lastFix = null; renderAll();
}
function toggleLocate(){
  if(watchId !== null || manual){ stopLocate(); return; }
  if(!navigator.geolocation){ setManual(true); toast("現在地が使えないため、地図の中心を基準にします"); return; }
  $("btnLoc").classList.add("on");
  watchId = navigator.geolocation.watchPosition(function(pos){
    var fix = {lat:pos.coords.latitude, lng:pos.coords.longitude};
    var moved = !lastFix || dist(lastFix, fix) >= 0.05 || (Date.now() - lastFixT) > 30000;
    me = fix;
    if(mapOK){
      if(!meMarker){
        meMarker = L.marker([me.lat, me.lng], {icon:L.divIcon({className:"", html:'<span class="me"></span>', iconSize:[16,16], iconAnchor:[8,8]}), zIndexOffset:1000, interactive:false}).addTo(map);
        map.setView([me.lat, me.lng], Math.max(map.getZoom(), 12));
      }else meMarker.setLatLng([me.lat, me.lng]);
    }
    if(moved){ lastFix = fix; lastFixT = Date.now(); renderAll(); }
  }, function(err){
    watchId = null; $("btnLoc").classList.remove("on");
    setManual(true);
    toast(err.code === 1 ? "位置情報が許可されていないため、地図の中心を基準にします" : "現在地を取得できないため、地図の中心を基準にします");
  }, {enableHighAccuracy:true, maximumAge:15000, timeout:20000});
}

/* ================= 地図 ================= */
function initMap(){
  if(typeof L === "undefined"){ $("mapfail").style.display = "grid"; document.querySelector(".mapbtns").style.display = "none"; openSheet(true); return; }
  mapOK = true;
  map = L.map("map", {zoomControl:false, preferCanvas:true}).setView([36.4, 137.8], 5);
  L.control.zoom({position:"topleft"}).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, crossOrigin:true, attribution:"&copy; OpenStreetMap contributors"}).addTo(map);
  map.on("contextmenu", function(e){ if(!pick) openAddMenu(e.latlng); });
  areaLayer = L.layerGroup().addTo(map);
  pickLayer = L.layerGroup().addTo(map);
  map.on("click", onMapClickPick);
  map.on("moveend", function(){ if(pick && pick.mode !== "point") drawPickBoundaries(); });
  map.on("moveend", function(){ renderMarkers(_vis); });
  setTimeout(function(){ map.invalidateSize(); }, 200);
}

/* ================= エリア（ゴミ袋・ゆるキャラ） ================= */
var yuruBy = {}, yuruByArea = {}, gomiBy = {}, stampsBy = {};
var selArea = null, areaLayer = null, pickLayer = null, pick = null;
var BIDX = null, BND = {}, BLOADING = {};
var AREA_COLOR = {gm:"#8D6E63", yu:"#F57C00"};
var SWATCH = [["半透明","#EEF1F4"],["透明","#FFFFFF"],["白","#FFFFFF"],["水色","#7EC8F0"],["黄","#F7D842"],["青","#2F6FD6"],["緑","#3FA34D"],
  ["赤","#D93A3A"],["ピンク","#F28CB8"],["オレンジ","#F59A23"],["紫","#8E5BC4"],["茶","#8D6E63"],["灰","#9E9E9E"],["グレー","#9E9E9E"],["黒","#222222"]];

function rebuildExtra(){
  yuruBy = {}; yuruByArea = {}; gomiBy = {};
  user.yuru.forEach(function(y){
    if(y.del) return;
    if(y.pid) (yuruBy[y.pid] = yuruBy[y.pid] || []).push(y);
    if(y.aid) (yuruByArea[y.aid] = yuruByArea[y.aid] || []).push(y);
  });
  user.gomi.forEach(function(g){ if(!g.del) (gomiBy[g.aid] = gomiBy[g.aid] || []).push(g); });
  stampsBy = {}; chkMap = {};
  (user.stamps || []).forEach(function(x){ if(!x.del && x.pid) (stampsBy[x.pid] = stampsBy[x.pid] || []).push(x); });
  Object.keys(stampsBy).forEach(function(k){ stampsBy[k].sort(function(a,b){ return ((parseInt(a.bk,10)||0) - (parseInt(b.bk,10)||0)) || ((parseInt(a.pg,10)||0) - (parseInt(b.pg,10)||0)); }); });
  (user.tkchk || []).forEach(function(c){ if(!c.del && (!chkMap[c.k] || c.d < chkMap[c.k])) chkMap[c.k] = c.d; });
  [yuruBy, yuruByArea, gomiBy].forEach(function(m){
    Object.keys(m).forEach(function(k){ m[k].sort(function(a,b){ return (b.d || "").localeCompare(a.d || ""); }); });
  });
}
function liveAreas(){ return user.areas.filter(function(a){ return !a.del; }); }
function areaById(id){ return user.areas.filter(function(a){ return a.id === id; })[0]; }

/* ---- 境界データ（都道府県ごとに必要な分だけ読む） ---- */
function loadIndex(){
  return fetch("b/index.json").then(function(r){ return r.json(); }).then(function(d){ BIDX = d; });
}
function loadPref(pc){
  if(BND[pc]) return Promise.resolve(BND[pc]);
  if(BLOADING[pc]) return BLOADING[pc];
  BLOADING[pc] = fetch("b/" + pc + ".json").then(function(r){ return r.json(); }).then(function(d){
    var m = {}; d.m.forEach(function(f){ m[f.c] = f; });
    BND[pc] = {p:d.p, list:d.m, byCode:m}; delete BLOADING[pc];
    return BND[pc];
  }).catch(function(e){ delete BLOADING[pc]; throw e; });
  return BLOADING[pc];
}
function featByCode(c){ var b = BND[c.slice(0,2)]; return b ? b.byCode[c] : null; }
function unitOf(c){ return (BIDX && BIDX.unit[c]) || c; }
function unitName(u){ return (BIDX && BIDX.uname[u]) || u; }
function unitPref(u){ return u.charAt(0) === "s" ? u.slice(1,3) : u.slice(0,2); }
function areaUnits(a){ var s = {}; (a.codes || []).forEach(function(c){ s[unitOf(c)] = 1; }); return Object.keys(s); }
function suggestName(codes, poly){
  var names = []; var seen = {};
  codes.forEach(function(c){ var u = unitOf(c); if(!seen[u]){ seen[u] = 1; names.push(unitName(u)); } });
  if(!names.length) return poly ? "描いた範囲" : "";
  return names.length > 3 ? names.slice(0,3).join("・") + " ほか" + (names.length - 3) : names.join("・");
}
function areaPrefs(a){
  var s = {}; (a.codes || []).forEach(function(c){ s[c.slice(0,2)] = 1; });
  return Object.keys(s).map(function(pc){ return BIDX && BIDX.pref[pc] ? BIDX.pref[pc].n : pc; });
}

/* ---- 地図に塗る ---- */
function renderAreas(){
  if(!mapOK || !areaLayer) return;
  areaLayer.clearLayers();
  var need = {};
  liveAreas().forEach(function(a){
    var types = [];
    if(filt.g.gm && gomiBy[a.id]) types.push("gm");
    if(filt.g.yu && yuruByArea[a.id]) types.push("yu");
    if(!types.length && a.id !== selArea) return;
    var geos = [];
    (a.codes || []).forEach(function(c){
      var f = featByCode(c);
      if(f) geos.push(f.g); else need[c.slice(0,2)] = 1;
    });
    if(a.poly && a.poly.length >= 3) geos.push([a.poly]);
    var list = types.length ? types : ["sel"];
    list.forEach(function(t, i){
      var col = AREA_COLOR[t] || "#0B5394";
      geos.forEach(function(g){
        var lay = L.polygon(g, {color:col, weight: a.id === selArea ? 3 : 1.4, fillColor:col,
          fillOpacity: t === "sel" ? 0.08 : (i ? 0.14 : 0.24), dashArray: i ? "5 4" : null});
        lay.on("click", function(ev){ if(pick) return; L.DomEvent.stopPropagation(ev); selectArea(a.id, false); });
        areaLayer.addLayer(lay);
      });
    });
  });
  var pcs = Object.keys(need);
  if(pcs.length) Promise.all(pcs.map(loadPref)).then(renderAreas).catch(function(){ toast("自治体の境界を読み込めませんでした（通信を確認してください）"); });
}

/* ---- エリアの詳細 ---- */
function selectArea(aid, pan){
  if(selTrip){ tripReturn = selTrip; selTrip = null; }
  selArea = aid; selId = null;
  $("sheet").classList.add("detail");
  openSheet(true);
  renderAreaDetail(); renderMarkers(_vis); renderAreas();
  if(pan && mapOK){
    var a = areaById(aid), pts = [];
    (a.codes || []).forEach(function(c){ var f = featByCode(c); if(f) f.g.forEach(function(p){ p[0].forEach(function(x){ pts.push(x); }); }); });
    (a.poly || []).forEach(function(x){ pts.push(x); });
    if(pts.length) map.fitBounds(L.latLngBounds(pts), {padding:[30,30], maxZoom:13});
  }
}
function swatch(col){
  var hit = null;
  for(var i = 0; i < SWATCH.length; i++){ if(String(col || "").indexOf(SWATCH[i][0]) >= 0){ hit = SWATCH[i][1]; break; } }
  return hit ? '<span class="sw" style="background:' + hit + '"></span>' : "";
}
function yuruListHtml(list){
  if(!list.length) return '<p class="help">まだ登録はありません。</p>';
  return list.map(function(y){
    return '<div class="visit"><div class="vb"><div class="vd">' + esc(y.ch || "（キャラ名なし）") + (y.it ? '<span class="tag">' + esc(y.it) + "</span>" : "") +
      '</div><div class="vi">' + esc(fmtDate(y.d)) + "</div>" + (y.note ? '<div class="vn">' + esc(y.note) + "</div>" : "") +
      '</div><button class="btn sm" type="button" data-y="' + esc(y.id) + '">編集</button></div>';
  }).join("");
}
function bindYuruEdit(el){
  el.querySelectorAll("button[data-y]").forEach(function(b){
    b.onclick = function(){
      var y = user.yuru.filter(function(x){ return x.id === b.getAttribute("data-y"); })[0];
      if(y) openYuru(y.pid ? {pid:y.pid} : {aid:y.aid}, y.id);
    };
  });
}
function renderAreaDetail(){
  var a = areaById(selArea), el = $("detail");
  if(!a || a.del){ closeDetail(); return; }
  var units = areaUnits(a);
  var h = backHtml() + '<div class="dhead"><h2>' + esc(a.n) + '</h2><button class="btn sm ghost" type="button" id="dClose" aria-label="閉じる">✕</button></div>';
  var comp = units.map(unitName);
  h += '<div class="dmeta">' + esc(areaPrefs(a).join("・")) + (comp.length ? "<br>範囲：" + esc(comp.slice(0,15).join("・")) + (comp.length > 15 ? " ほか" + (comp.length - 15) : "") : "") +
       (a.poly ? "<br>範囲：地図上に描いた範囲" + (comp.length ? "を含む" : "") : "") + "</div>";
  h += '<div class="dlinks"><button class="btn sm" type="button" id="aRename">名前を変更</button><button class="btn sm danger" type="button" id="aDel">エリアを削除</button></div>';
  var gs = gomiBy[a.id] || [];
  h += '<div class="sect">ゴミ袋（' + gs.length + '枚）</div>';
  if(!gs.length) h += '<p class="help">まだ登録はありません。</p>';
  gs.forEach(function(g){
    var head = [g.t, g.s].filter(Boolean).join("・");
    h += '<div class="visit"><div class="vb"><div class="vd">' + swatch(g.col) + esc(head || "（種別なし）") + (g.col ? '<span class="tag">' + esc(g.col) + "</span>" : "") +
      '</div><div class="vi">' + esc(fmtDate(g.d)) + "</div>" + (g.note ? '<div class="vn">' + esc(g.note) + "</div>" : "") +
      '</div><button class="btn sm" type="button" data-g="' + esc(g.id) + '">編集</button></div>';
  });
  h += '<button class="btn sm" type="button" id="aGomi">袋を追加</button>';
  var ys = yuruByArea[a.id] || [];
  h += '<div class="sect">ゆるキャラグッズ（' + ys.length + '点）</div>' + yuruListHtml(ys) +
       '<button class="btn sm" type="button" id="aYuru">ゆるキャラグッズを追加</button>';
  el.innerHTML = h; bindBack();
  $("dClose").onclick = closeDetail;
  $("aGomi").onclick = function(){ openGomi({aid:a.id}, null); };
  $("aYuru").onclick = function(){ openYuru({aid:a.id}, null); };
  $("aRename").onclick = function(){
    var n = prompt("エリアの名前", a.n);
    if(n && n.trim()){ a.n = n.trim(); a.ua = nowIso(); save(); renderAll(); }
  };
  $("aDel").onclick = function(){
    if(!confirm("このエリアと、登録したゴミ袋・グッズを削除しますか？")) return;
    var t = nowIso(); a.del = true; a.ua = t;
    user.gomi.forEach(function(g){ if(g.aid === a.id && !g.del){ g.del = true; g.ua = t; } });
    user.yuru.forEach(function(y){ if(y.aid === a.id && !y.del){ y.del = true; y.ua = t; } });
    save(); rebuildGot(); closeDetail();
  };
  el.querySelectorAll("button[data-g]").forEach(function(b){ b.onclick = function(){ openGomi({aid:a.id}, b.getAttribute("data-g")); }; });
  bindYuruEdit(el);
}

/* ---- ゴミ袋の登録 ---- */
var editG = null;
function openGomi(target, gid){
  var g = gid ? user.gomi.filter(function(x){ return x.id === gid; })[0] : null;
  editG = {target:target, id:g ? g.id : null};
  $("gTitle").textContent = g ? "ゴミ袋を編集" : "ゴミ袋を登録";
  $("gAreaWrap").style.display = target.newArea ? "" : "none";
  $("gArea").value = target.newArea ? target.newArea.name : "";
  $("gType").value = g ? (g.t || "") : ""; $("gSize").value = g ? (g.s || "") : "";
  $("gColor").value = g ? (g.col || "") : ""; $("gDate").value = g ? (g.d || curDate()) : curDate();
  $("gNote").value = g ? (g.note || "") : ""; $("gMsg").textContent = "";
  $("gDel").style.display = g ? "" : "none";
  renderDateChips("gDateChips", "gDate");
  $("dlgGomi").showModal();
}
function createArea(na, name){
  var a = {id:"a" + uid(), n:name || na.name || "エリア", codes:na.codes || [], poly:na.poly || null, ca:nowIso(), ua:nowIso()};
  user.areas.push(a); return a.id;
}
$("formGomi").addEventListener("submit", function(e){
  e.preventDefault();
  if(!editG) return;
  var rec = {t:$("gType").value.trim(), s:$("gSize").value.trim(), col:$("gColor").value.trim(), d:$("gDate").value, note:$("gNote").value.trim()};
  if(!rec.t && !rec.s && !rec.col && !rec.note){ $("gMsg").textContent = "種別・大きさ・色・コメントのどれかを入れてください"; return; }
  var aid = editG.target.aid;
  if(editG.target.newArea){
    var nm = $("gArea").value.trim();
    if(!nm){ $("gMsg").textContent = "エリアの名前を入れてください"; return; }
    aid = createArea(editG.target.newArea, nm);
  }
  if(editG.id){
    var g = user.gomi.filter(function(x){ return x.id === editG.id; })[0];
    Object.assign(g, rec); g.ua = nowIso();
  }else{
    user.gomi.push(Object.assign({id:"g" + uid(), aid:aid, ca:nowIso(), ua:nowIso()}, rec));
  }
  save(); rebuildGot(); $("dlgGomi").close(); selectArea(aid, !!editG.target.newArea); renderAll();
  toast("ゴミ袋を登録しました");
});
$("gDel").onclick = function(){
  if(!editG || !editG.id || !confirm("この袋の登録を削除しますか？")) return;
  var g = user.gomi.filter(function(x){ return x.id === editG.id; })[0];
  g.del = true; g.ua = nowIso();
  save(); rebuildGot(); $("dlgGomi").close(); renderAll();
};

/* ---- ゆるキャラグッズの登録 ---- */
var editY = null;
function charaNames(){
  var s = {}; user.yuru.forEach(function(y){ if(!y.del && y.ch) s[y.ch] = 1; });
  return Object.keys(s).sort(function(a,b){ return a.localeCompare(b, "ja"); });
}
function openYuru(target, yid){
  var y = yid ? user.yuru.filter(function(x){ return x.id === yid; })[0] : null;
  editY = {target:target, id:y ? y.id : null};
  $("yTitle").textContent = y ? "ゆるキャラグッズを編集" : "ゆるキャラグッズを登録";
  var needName = target.newArea || target.newPoint;
  $("yTargetWrap").style.display = needName ? "" : "none";
  $("yTargetLbl").textContent = target.newPoint ? "施設・会社などの名前" : "エリアの名前";
  $("yTarget").value = target.newArea ? target.newArea.name : "";
  $("yTarget").placeholder = target.newPoint ? "〇〇観光センター、〇〇株式会社 など" : "〇〇市、〇〇地区 など";
  var dl = $("dlChara"); dl.innerHTML = "";
  charaNames().forEach(function(n){ var o = document.createElement("option"); o.value = n; dl.appendChild(o); });
  $("yChara").value = y ? (y.ch || "") : ""; $("yItem").value = y ? (y.it || "") : "";
  $("yDate").value = y ? (y.d || curDate()) : curDate(); $("yNote").value = y ? (y.note || "") : "";
  $("yMsg").textContent = ""; $("yDel").style.display = y ? "" : "none";
  renderDateChips("yDateChips", "yDate");
  $("dlgYuru").showModal();
}
$("formYuru").addEventListener("submit", function(e){
  e.preventDefault();
  if(!editY) return;
  var rec = {ch:$("yChara").value.trim(), it:$("yItem").value.trim(), d:$("yDate").value, note:$("yNote").value.trim()};
  if(!rec.ch && !rec.it){ $("yMsg").textContent = "キャラクター名かグッズのどちらかを入れてください"; return; }
  var t = editY.target, link = {};
  if(t.newPoint || t.newArea){
    var nm = $("yTarget").value.trim();
    if(!nm){ $("yMsg").textContent = t.newPoint ? "施設・会社などの名前を入れてください" : "エリアの名前を入れてください"; return; }
    if(t.newPoint){
      var p = {id:"yu" + uid(), k:"yu", n:nm, la:t.newPoint.lat, lo:t.newPoint.lng, p:"", r:"", a:"", c:["yu"], ua:nowIso()};
      user.custom.push(p); rebuildPlaces(); link.pid = p.id;
    }else link.aid = createArea(t.newArea, nm);
  }else if(t.pid) link.pid = t.pid; else link.aid = t.aid;
  if(editY.id){
    var y = user.yuru.filter(function(x){ return x.id === editY.id; })[0];
    Object.assign(y, rec); y.ua = nowIso();
  }else{
    user.yuru.push(Object.assign({id:"y" + uid(), ca:nowIso(), ua:nowIso()}, link, rec));
  }
  save(); rebuildGot(); $("dlgYuru").close();
  if(link.pid) select(link.pid, !!t.newPoint); else selectArea(link.aid, !!t.newArea);
  renderAll(); toast("ゆるキャラグッズを登録しました");
});
$("yDel").onclick = function(){
  if(!editY || !editY.id || !confirm("このグッズの登録を削除しますか？")) return;
  var y = user.yuru.filter(function(x){ return x.id === editY.id; })[0];
  y.del = true; y.ua = nowIso();
  save(); rebuildGot(); $("dlgYuru").close(); renderAll();
};

/* ---- 範囲を選ぶモード ---- */
var POINT_PURPOSES = {yuruPoint:1, stampPoint:1, ekitagPoint:1, rallySpot:1};
function startPick(purpose, extra){
  if(!mapOK){ toast("地図が使えないため場所を選べません"); return; }
  var isPoint = !!POINT_PURPOSES[purpose];
  if(!isPoint && !BIDX){ toast("自治体データを読み込み中です。少し待ってから試してください"); loadIndex().catch(function(){}); return; }
  pick = Object.assign({purpose:purpose, mode: isPoint ? "point" : "muni", sel:{}, ward:false, poly:[]}, extra || {});
  closeDetail(); openSheet(false);
  $("pickBar").classList.add("on");
  if(pick.mode !== "point" && map.getZoom() < 8) map.setZoom(8);
  updatePickBar(); drawPickBoundaries();
}
function endPick(){ pick = null; if(pickLayer) pickLayer.clearLayers(); $("pickBar").classList.remove("on"); }
function pickCount(){ return Object.keys(pick.sel).length; }
function updatePickBar(){
  if(!pick) return;
  var msg = "", btns = [];
  if(pick.mode === "point"){
    msg = {yuruPoint:"地図をタップして、施設や会社の場所を指定してください", stampPoint:"地図をタップして、スタンプのある場所を指定してください",
      ekitagPoint:"地図をタップして、エキタグを取った駅の場所を指定してください", rallySpot:"地図をタップして、ラリーのスポットを指定してください"}[pick.purpose];
    btns.push(["やめる","cancel",""]);
  }else if(pick.mode === "muni"){
    var names = suggestName(Object.keys(pick.sel), null);
    msg = "自治体をタップして選択（" + areaUnitsOfSel().length + "件）<small>" + (names ? esc(names) : "複数選ぶと清掃組合などのまとまりになります") +
          "・政令市は" + (pick.ward ? "区ごと" : "市全体") + "で選択</small>";
    btns.push([pick.ward ? "市全体で選ぶ" : "区ごとに選ぶ","ward",""]);
    btns.push(["範囲を描く","draw",""]);
    btns.push(["名前で入力","names",""]);
    btns.push(["やめる","cancel",""]);
    btns.push(["決定","ok", (pickCount() || pick.poly.length >= 3) ? "primary" : "primary\" disabled=\"disabled"]);
  }else{
    msg = "地図をタップして範囲の頂点を置く（" + pick.poly.length + "点）<small>3点以上で決定できます。選んだ自治体と合わせて1つのエリアになります</small>";
    btns.push(["1つ戻す","undo",""]);
    btns.push(["自治体選択に戻る","muni",""]);
    btns.push(["やめる","cancel",""]);
    btns.push(["決定","ok", (pick.poly.length >= 3 || pickCount()) ? "primary" : "primary\" disabled=\"disabled"]);
  }
  $("pickMsg").innerHTML = msg.replace(/&lt;small&gt;|&lt;\/small&gt;/g, "");
  $("pickBtns").innerHTML = btns.map(function(b){ return '<button class="btn sm ' + b[2] + '" type="button" data-pk="' + b[1] + '">' + b[0] + "</button>"; }).join("");
  $("pickBtns").querySelectorAll("[data-pk]").forEach(function(b){ b.onclick = function(){ pickAction(b.getAttribute("data-pk")); }; });
}
function areaUnitsOfSel(){ var s = {}; Object.keys(pick.sel).forEach(function(c){ s[unitOf(c)] = 1; }); return Object.keys(s); }
function pickAction(k){
  if(k === "cancel"){ endPick(); return; }
  if(k === "names"){ var p = pick.purpose; endPick(); openNames(p); return; }
  if(k === "ward"){ pick.ward = !pick.ward; updatePickBar(); return; }
  if(k === "draw"){ pick.mode = "draw"; updatePickBar(); drawPickBoundaries(); return; }
  if(k === "muni"){ pick.mode = "muni"; updatePickBar(); drawPickBoundaries(); return; }
  if(k === "undo"){ pick.poly.pop(); updatePickBar(); drawPickBoundaries(); return; }
  if(k === "ok") pickDecide();
}
function togglePickFeature(pc, f){
  var codes = [f.c];
  if(f.s && !pick.ward) codes = BND[pc].list.filter(function(x){ return x.s === f.s; }).map(function(x){ return x.c; });
  var allOn = codes.every(function(c){ return pick.sel[c]; });
  codes.forEach(function(c){ if(allOn) delete pick.sel[c]; else pick.sel[c] = 1; });
  updatePickBar(); drawPickBoundaries();
}
function drawPickBoundaries(){
  if(!pick || !pickLayer) return;
  pickLayer.clearLayers();
  if(pick.mode === "point") return;
  var z = map.getZoom(), vb = map.getBounds(), want = {};
  Object.keys(pick.sel).forEach(function(c){ want[c.slice(0,2)] = 1; });
  if(z >= 8) Object.keys(BIDX.pref).forEach(function(pc){
    var b = BIDX.pref[pc].b;
    if(vb.intersects(L.latLngBounds([b[0], b[1]], [b[2], b[3]]))) want[pc] = 1;
  });
  var missing = Object.keys(want).filter(function(pc){ return !BND[pc]; });
  if(missing.length){
    Promise.all(missing.map(loadPref)).then(drawPickBoundaries).catch(function(){ toast("自治体の境界を読み込めませんでした"); });
  }
  var interactive = pick.mode === "muni";
  Object.keys(want).forEach(function(pc){
    var B = BND[pc]; if(!B) return;
    B.list.forEach(function(f){
      var on = !!pick.sel[f.c];
      if(!on && z < 8) return;
      var lay = L.polygon(f.g, {color: on ? "#0B5394" : "#5A6B77", weight: on ? 2 : 0.8, fillColor:"#0B5394",
        fillOpacity: on ? 0.35 : 0.02, interactive:interactive});
      if(interactive) lay.on("click", function(ev){ L.DomEvent.stopPropagation(ev); togglePickFeature(pc, f); });
      pickLayer.addLayer(lay);
    });
  });
  if(pick.poly.length){
    pick.poly.forEach(function(pt){ pickLayer.addLayer(L.circleMarker(pt, {radius:5, color:"#E5A100", weight:2, fillColor:"#fff", fillOpacity:1, interactive:false})); });
    if(pick.poly.length >= 3) pickLayer.addLayer(L.polygon(pick.poly, {color:"#E5A100", weight:2, fillOpacity:0.2, interactive:false}));
    else pickLayer.addLayer(L.polyline(pick.poly, {color:"#E5A100", weight:2, interactive:false}));
  }
}
function onMapClickPick(e){
  if(!pick) return;
  if(pick.mode === "point"){
    var ll = e.latlng, pp = pick, np = {lat:+ll.lat.toFixed(6), lng:+ll.lng.toFixed(6)}; endPick();
    if(pp.purpose === "stampPoint") openStamp({newPoint:np}, null);
    else if(pp.purpose === "ekitagPoint"){ var en = prompt("駅の名前（例：〇〇駅）"); if(en && en.trim()) registerEkitag({n:en.trim(), la:np.lat, lo:np.lng}); }
    else if(pp.purpose === "rallySpot"){ var rn = prompt("スポットの名前"); if(rn && rn.trim()) addRallySpot(pp.rid, {k:"sp:" + uid(), n:rn.trim(), la:np.lat, lo:np.lng}); else showRally(pp.rid); }
    else openYuru({newPoint:np}, null);
    return;
  }
  if(pick.mode === "draw"){
    pick.poly.push([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]);
    updatePickBar(); drawPickBoundaries();
  }
}
function pickDecide(){
  var codes = Object.keys(pick.sel).sort(), poly = pick.poly.length >= 3 ? pick.poly.slice() : null;
  if(!codes.length && !poly){ toast("自治体を選ぶか、範囲を描いてください"); return; }
  var purpose = pick.purpose;
  endPick();
  finishArea(purpose, codes, poly);
}

/* ---- 進捗（ゴミ袋・ゆるキャラ） ---- */
function renderProgGomi(body){
  if(!BIDX){ body.innerHTML = '<p class="help">自治体データを読み込み中です。</p>'; return; }
  var got = {};
  liveAreas().forEach(function(a){ if(gomiBy[a.id]) areaUnits(a).forEach(function(u){ got[u] = 1; }); });
  var pref2ch = {}; PLACES.forEach(function(p){ if(p.p && p.r) pref2ch[p.p] = p.r; });
  var pcs = Object.keys(BIDX.pref).sort();
  var byPc = {}; Object.keys(got).forEach(function(u){ var pc = unitPref(u); byPc[pc] = (byPc[pc] || 0) + 1; });
  var totalU = pcs.reduce(function(s, pc){ return s + BIDX.pref[pc].units; }, 0);
  var col = GROUPS.gm.color;
  body.appendChild(pgRow("全国", {d:Object.keys(got).length, t:totalU}, col, "sum"));
  var p = document.createElement("p"); p.className = "help";
  p.textContent = "ゴミ袋を1枚以上登録した自治体の数です。清掃組合のように複数の自治体をまとめたエリアは、含まれる自治体をすべて数えます。描いた範囲だけのエリアは数に入りません。";
  body.appendChild(p);
  CHIHOU_ORDER.forEach(function(ch){
    var list = pcs.filter(function(pc){ return (pref2ch[BIDX.pref[pc].n] || "その他") === ch; });
    if(!list.length) return;
    var hd = document.createElement("div"); hd.className = "pg-h"; hd.textContent = ch; body.appendChild(hd);
    var d = 0, t = 0; list.forEach(function(pc){ d += byPc[pc] || 0; t += BIDX.pref[pc].units; });
    body.appendChild(pgRow(ch + " 計", {d:d, t:t}, col, "sum"));
    list.forEach(function(pc){
      var b = BIDX.pref[pc].b;
      body.appendChild(pgRow(BIDX.pref[pc].n, {d:byPc[pc] || 0, t:BIDX.pref[pc].units}, col, "", function(){
        $("dlgProg").close(); if(mapOK) map.fitBounds([[b[0], b[1]], [b[2], b[3]]]);
      }));
    });
  });
}
function renderProgYuru(body){
  var live = user.yuru.filter(function(y){ return !y.del; });
  var cnt = {}; live.forEach(function(y){ var k = y.ch || "（キャラ名なし）"; cnt[k] = (cnt[k] || 0) + 1; });
  var names = Object.keys(cnt).sort(function(a,b){ return cnt[b] - cnt[a] || a.localeCompare(b, "ja"); });
  var h = '<div class="pg sum" style="cursor:default"><span class="pn">合計</span><span class="pv" style="width:auto;flex:1;text-align:left"><b>' +
          live.length + "点</b>・" + names.length + "キャラ</span></div>";
  names.forEach(function(n){
    h += '<div class="pg" style="cursor:default"><span class="pn" style="width:auto;flex:1">' + esc(n) + '</span><span class="pv">' + cnt[n] + "点</span></div>";
  });
  if(!live.length) h += '<p class="help">まだ登録はありません。地図の「＋」から登録できます。</p>';
  body.innerHTML = h;
}

/* ---- 登録メニュー ---- */
/* ---- 自治体を名前で指定 ---- */
var NAMEIDX = null, UNITCODES = null, namesCtx = null, namesTimer = null, namesRes = [];
function nfkc(t){ try{ return String(t).normalize("NFKC"); }catch(e){ return String(t); } }
function buildNameIdx(){
  NAMEIDX = {}; UNITCODES = {};
  Object.keys(BIDX.unit).forEach(function(c){ var u = BIDX.unit[c]; (UNITCODES[u] = UNITCODES[u] || []).push(c); });
  function add(n, rec){ (NAMEIDX[n] = NAMEIDX[n] || []).push(rec); }
  Object.keys(BIDX.uname).forEach(function(u){ add(BIDX.uname[u], {u:u, pc:unitPref(u), label:BIDX.uname[u]}); });
  Object.keys(BIDX.cn).forEach(function(c){
    var u = BIDX.unit[c];
    if(u && u.charAt(0) === "s") add(BIDX.uname[u] + BIDX.cn[c], {c:c, pc:c.slice(0,2), label:BIDX.uname[u] + BIDX.cn[c]});
  });
}
function resolveToken(tok, pcFilter){
  var t = nfkc(tok).replace(/\s+/g, "");
  if(!t) return null;
  var pc = pcFilter || "";
  Object.keys(BIDX.pref).some(function(k){
    var n = BIDX.pref[k].n;
    if(t.indexOf(n) === 0 && t.length > n.length){ pc = k; t = t.slice(n.length); return true; }
    return false;
  });
  t = t.replace(/^.+?郡(?=.+[町村]$)/, "");
  var c = (NAMEIDX[t] || []).slice();
  if(!c.length) ["市","町","村","区"].forEach(function(sfx){ c = c.concat(NAMEIDX[t + sfx] || []); });
  if(pc) c = c.filter(function(x){ return x.pc === pc; });
  return {tok:tok.trim(), cands:c};
}
function prefName(pc){ return BIDX.pref[pc] ? BIDX.pref[pc].n : pc; }
function candKey(x){ return x.u ? "u:" + x.u : "c:" + x.c; }
function candCodes(x){ return x.u ? (UNITCODES[x.u] || []) : [x.c]; }
function openNames(purpose){
  if(!BIDX){ toast("自治体データを読み込み中です。少し待ってから試してください"); loadIndex().catch(function(){}); return; }
  if(!NAMEIDX) buildNameIdx();
  namesCtx = {purpose:purpose, pick:{}};
  $("nTitle").textContent = purpose === "gomi" ? "ゴミ袋：自治体を名前で指定" : "ゆるキャラ：自治体を名前で指定";
  var sel = $("nPref");
  if(sel.options.length <= 1) Object.keys(BIDX.pref).sort().forEach(function(pc){
    var o = document.createElement("option"); o.value = pc; o.textContent = BIDX.pref[pc].n; sel.appendChild(o);
  });
  $("nText").value = ""; $("nRes").innerHTML = "";
  $("dlgNames").showModal();
  setTimeout(function(){ $("nText").focus(); }, 60);
}
function refreshNames(){
  if(!namesCtx) return;
  var pc = $("nPref").value;
  var toks = $("nText").value.split(/[,、，\n;；・]+/).map(function(x){ return x.trim(); }).filter(Boolean);
  namesRes = toks.map(function(t){ return resolveToken(t, pc); }).filter(Boolean);
  var okList = [], amb = [], ng = [];
  namesRes.forEach(function(r){
    if(r.cands.length === 1) okList.push(r.cands[0]);
    else if(r.cands.length > 1) amb.push(r);
    else ng.push(r.tok);
  });
  var h = "";
  if(okList.length) h += '<div class="ok">✓ ' + okList.map(function(x){ return esc(x.label) + "（" + esc(prefName(x.pc)) + "）"; }).join("、") + "</div>";
  amb.forEach(function(r, i){
    h += '<div class="amb">「' + esc(r.tok) + '」は複数あります。該当するものを選んでください：<br>' + r.cands.map(function(x){
      var k = candKey(x);
      return '<label><input type="checkbox" data-k="' + esc(k) + '"' + (namesCtx.pick[k] ? " checked" : "") + ">" + esc(x.label) + "（" + esc(prefName(x.pc)) + "）</label>";
    }).join("") + "</div>";
  });
  if(ng.length) h += '<div class="ng">見つかりません：' + ng.map(esc).join("、") + '<br><small>表記を確かめるか、合併前の名前なら「地図で選ぶ」から範囲を描いてください。</small></div>';
  $("nRes").innerHTML = h;
  $("nRes").querySelectorAll("input[data-k]").forEach(function(cb){
    cb.onchange = function(){ if(cb.checked) namesCtx.pick[cb.getAttribute("data-k")] = 1; else delete namesCtx.pick[cb.getAttribute("data-k")]; };
  });
}
function namesCodes(){
  var set = {};
  namesRes.forEach(function(r){
    var use = r.cands.length === 1 ? r.cands : r.cands.filter(function(x){ return namesCtx.pick[candKey(x)]; });
    use.forEach(function(x){ candCodes(x).forEach(function(c){ set[c] = 1; }); });
  });
  return Object.keys(set).sort();
}
$("nText").addEventListener("input", function(){ clearTimeout(namesTimer); namesTimer = setTimeout(refreshNames, 200); });
$("nPref").onchange = refreshNames;
$("nOk").onclick = function(){
  refreshNames();
  var codes = namesCodes();
  if(!codes.length){ toast("該当する自治体がありません"); return; }
  var purpose = namesCtx.purpose;
  $("dlgNames").close(); namesCtx = null;
  finishArea(purpose, codes, null);
};
$("nMap").onclick = function(){ var p = namesCtx && namesCtx.purpose; $("dlgNames").close(); namesCtx = null; if(p) startPick(p); };

/* ---- 選んだ範囲からエリアを作る（地図・名前の共通） ---- */
function finishArea(purpose, codes, poly){
  var same = poly ? null : liveAreas().filter(function(a){ return !a.poly && (a.codes || []).slice().sort().join(",") === codes.join(","); })[0];
  var target = same ? {aid:same.id} : {newArea:{codes:codes, poly:poly, name:suggestName(codes, poly)}};
  if(same) toast("登録済みのエリア「" + same.n + "」に追加します");
  var need = {}; codes.forEach(function(c){ need[c.slice(0,2)] = 1; });
  Promise.all(Object.keys(need).map(loadPref)).then(renderAreas).catch(function(){});
  if(purpose === "gomi") openGomi(target, null); else openYuru(target, null);
}

/* ---- 登録メニュー（＋ボタンと長押しの共通） ---- */
var addCtx = null;
function openAddMenu(ll){
  if(pick) return;
  addCtx = ll ? {lat:+ll.lat.toFixed(6), lng:+ll.lng.toFixed(6)} : null;
  $("addCtx").style.display = addCtx ? "block" : "none";
  $("yuruPointSub").textContent = addCtx ? "長押しした場所に登録" : "地図をタップして場所を指定";
  $("placeSub").textContent = addCtx ? "長押しした場所に追加" : "現在地、または緯度経度を入力して追加";
  $("stampSub").textContent = addCtx ? "長押しした場所に、写真・冊とページ・コメントを記録" : "場所を指定して、写真・冊とページ・コメントを記録";
  $("dlgAdd").showModal();
}

$("btnAddAny").onclick = function(){ openAddMenu(null); };
document.querySelectorAll("[data-add]").forEach(function(b){
  b.onclick = function(){
    var k = b.getAttribute("data-add"), ll = addCtx; $("dlgAdd").close(); addCtx = null;
    if(k === "place") openAddPlace(ll ? L.latLng(ll.lat, ll.lng) : null);
    else if(k === "stamp"){ if(ll) openStamp({newPoint:ll}, null); else startPick("stampPoint"); }
    else if(k === "ekitag"){ if(ll){ var en = prompt("駅の名前（例：〇〇駅）"); if(en && en.trim()) registerEkitag({n:en.trim(), la:ll.lat, lo:ll.lng}); } else openStationSearch({mode:"ekitag"}); }
    else if(k === "rally") openRallyForm(null);
    else if(k === "yuruPoint"){ if(ll) openYuru({newPoint:ll}, null); else startPick("yuruPoint"); }
    else openNames(k);
  };
});

/* ================= 写真・軌跡の保存領域（IndexedDB） ================= */
var IDBP = null;
function idb(){
  if(IDBP) return IDBP;
  IDBP = new Promise(function(res, rej){
    if(!window.indexedDB){ rej(new Error("この環境では写真を保存できません")); return; }
    var r = indexedDB.open("collectmap", 2);
    r.onupgradeneeded = function(){
      var db = r.result;
      if(!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", {keyPath:"id"});
      if(!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", {keyPath:"id"});
      if(!db.objectStoreNames.contains("days")) db.createObjectStore("days", {keyPath:"id"});
    };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error || new Error("保存領域を開けません")); };
  });
  IDBP.catch(function(){ IDBP = null; });
  return IDBP;
}
function idbReq(store, mode, fn){
  return idb().then(function(db){ return new Promise(function(res, rej){
    var tx = db.transaction(store, mode), out;
    var q = fn(tx.objectStore(store));
    if(q) q.onsuccess = function(){ out = q.result; };
    tx.oncomplete = function(){ res(out); };
    tx.onerror = function(){ rej(tx.error || new Error("保存に失敗しました")); };
    tx.onabort = function(){ rej(tx.error || new Error("保存が中断されました（容量不足の可能性）")); };
  }); });
}
function idbPut(s, o){ return idbReq(s, "readwrite", function(st){ return st.put(o); }); }
function idbGet(s, id){ return idbReq(s, "readonly", function(st){ return st.get(id); }); }
function idbDel(s, id){ return idbReq(s, "readwrite", function(st){ return st.delete(id); }); }
function idbAll(s){ return idbReq(s, "readonly", function(st){ return st.getAll(); }); }
function idbClear(s){ return idbReq(s, "readwrite", function(st){ return st.clear(); }); }
function readAB(b){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = function(){ rej(fr.error); }; fr.readAsArrayBuffer(b); }); }
function readText(b){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result)); }; fr.onerror = function(){ rej(fr.error); }; fr.readAsText(b); }); }

/* ================= 写真 ================= */
var PH_URL = {};
function photoURL(id){
  if(PH_URL[id]) return Promise.resolve(PH_URL[id]);
  return idbGet("photos", id).then(function(r){
    if(!r || !r.blob) return null;
    PH_URL[id] = URL.createObjectURL(r.blob); return PH_URL[id];
  }).catch(function(){ return null; });
}
function resizeImage(file){
  if(window.__cmNoResize) return Promise.resolve(file);
  return new Promise(function(res){
    var done = false, url = URL.createObjectURL(file), img = new Image();
    function fin(b){ if(done) return; done = true; try{ URL.revokeObjectURL(url); }catch(e){} res(b || file); }
    setTimeout(function(){ fin(null); }, 20000);
    img.onload = function(){
      try{
        var s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function(b){ fin(b); }, "image/jpeg", 0.82);
      }catch(e){ fin(null); }
    };
    img.onerror = function(){ fin(null); };
    img.src = url;
  });
}
function makeThumb(getUrl, onRemove){
  var d = document.createElement("div"); d.className = "thumb wait"; d.textContent = "…";
  getUrl().then(function(u){
    d.textContent = ""; d.classList.remove("wait");
    if(u){
      var im = document.createElement("img"); im.src = u; im.alt = ""; d.appendChild(im);
      d.onclick = function(){ $("phView").src = u; $("dlgPhoto").showModal(); };
    }else{ d.classList.add("wait"); d.textContent = "端末に無し"; }
    if(onRemove){
      var x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "✕"; x.setAttribute("aria-label","写真を外す");
      x.onclick = function(e){ e.stopPropagation(); onRemove(); }; d.appendChild(x);
    }
  });
  return d;
}
function fillPhotoSlots(el){
  el.querySelectorAll("[data-phs]").forEach(function(box){
    (box.getAttribute("data-phs") || "").split(",").filter(Boolean).forEach(function(id){
      box.appendChild(makeThumb(function(){ return photoURL(id); }, null));
    });
  });
}
function renderVThumbs(){
  var ev = editVisit, box = $("vThumbs"); if(!ev) return;
  box.innerHTML = "";
  ev.ph.forEach(function(id){
    box.appendChild(makeThumb(function(){ return photoURL(id); }, function(){
      ev.ph = ev.ph.filter(function(x){ return x !== id; }); ev.del.push(id); renderVThumbs();
    }));
  });
  ev.add.forEach(function(a){
    box.appendChild(makeThumb(function(){ return Promise.resolve(a.url); }, function(){
      ev.add = ev.add.filter(function(x){ return x !== a; }); renderVThumbs();
    }));
  });
  if(ev.busy){ var w = document.createElement("div"); w.className = "thumb wait"; w.textContent = "処理中"; box.appendChild(w); }
  var p = byId[ev.pid];
  $("vPhLbl").textContent = "写真" + (p && p.c.indexOf("pf") >= 0 ? "（ポケふたは写真を付けると完了）" : "");
}
$("vPhotoIn").onchange = function(){
  var files = [].slice.call(this.files || []); this.value = "";
  var ev = editVisit; if(!files.length || !ev) return;
  ev.busy += files.length; renderVThumbs();
  files.forEach(function(f){
    resizeImage(f).then(function(b){
      ev.add.push({blob:b, url:URL.createObjectURL(b)}); ev.busy--;
      if(editVisit === ev) renderVThumbs();
    });
  });
};

/* ================= 日付の1タップ入力・記録日 ================= */
function dayBtn(){ return workDate ? shortDate(workDate) : "今日"; }
var workDate = null;
function curDate(){ return workDate || today(); }
function shortDate(d){ var m = String(d || "").split("-"); return m.length === 3 ? (+m[1]) + "/" + (+m[2]) : String(d || ""); }
var WD = ["日","月","火","水","木","金","土"];
function dayLabel(d){ var x = new Date(d + "T00:00:00"); return shortDate(d) + "（" + WD[x.getDay()] + "）"; }
function lastDate(){
  var best = null;
  [user.visits, user.gomi, user.yuru].forEach(function(arr){
    (arr || []).forEach(function(x){ if(!x.del && x.d && (!best || (x.ua || "") > (best.ua || ""))) best = x; });
  });
  return best ? best.d : null;
}
function liveTrips(){ return (user.trips || []).filter(function(t){ return !t.del; }).sort(function(a,b){ return (b.d1 || "").localeCompare(a.d1 || ""); }); }
function tripById(id){ return (user.trips || []).filter(function(t){ return t.id === id; })[0]; }
function inTrip(t, d){ return !!d && t.d1 <= d && d <= t.d2; }
function tripsOn(d){ return liveTrips().filter(function(t){ return inTrip(t, d); }); }
function tripDays(t){
  var out = [], d = new Date(t.d1 + "T00:00:00"), e = new Date(t.d2 + "T00:00:00");
  while(d <= e && out.length < 31){ out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function renderDateChips(boxId, inputId){
  var box = $(boxId), inp = $(inputId); if(!box || !inp) return;
  var cur = inp.value, t = today(), list = [["今日", t]];
  var ld = lastDate();
  if(ld && ld !== t) list.push(["直前と同じ日 " + shortDate(ld), ld]);
  if(workDate && workDate !== t && workDate !== ld) list.push(["記録日 " + shortDate(workDate), workDate]);
  var trip = (selTrip && tripById(selTrip)) || (tripReturn && tripById(tripReturn)) || tripsOn(cur)[0] || tripsOn(curDate())[0] || (ld && tripsOn(ld)[0]);
  var h = list.map(function(x){ return '<button type="button" class="dchip' + (x[1] === cur ? " on" : "") + '" data-d="' + x[1] + '">' + esc(x[0]) + "</button>"; }).join("");
  if(trip){
    var days = tripDays(trip).filter(function(d){ return !list.some(function(x){ return x[1] === d; }); }).slice(0, 12);
    if(days.length) h += '<span class="help" style="margin:5px 2px 0 4px">' + esc(trip.n) + "：</span>" + days.map(function(d){
      return '<button type="button" class="dchip' + (d === cur ? " on" : "") + '" data-d="' + d + '">' + esc(shortDate(d)) + "</button>";
    }).join("");
  }
  box.innerHTML = h;
  box.querySelectorAll("[data-d]").forEach(function(b){ b.onclick = function(){ inp.value = b.getAttribute("data-d"); renderDateChips(boxId, inputId); }; });
  inp.oninput = function(){ renderDateChips(boxId, inputId); };
}
function openWork(){ $("wDate").value = curDate(); renderDateChips("wDateChips", "wDate"); $("dlgWork").showModal(); }
$("wOk").onclick = function(){
  var d = $("wDate").value; if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  workDate = d === today() ? null : d; $("dlgWork").close(); renderAll();
  toast(workDate ? dayLabel(workDate) + " の日付で記録します" : "今日の日付で記録します");
};
$("wToday").onclick = function(){ workDate = null; $("dlgWork").close(); renderAll(); toast("今日の日付で記録します"); };

/* ================= 旅程 ================= */
var selTrip = null, tripReturn = null, tripLayer = null, TRK = {}, editTrip = null, candList = [];
function tripItems(t){
  var items = [];
  user.visits.forEach(function(v){ if(!v.del && inTrip(t, v.d)) items.push({d:v.d, o:v.ca || v.ua || "", v:v}); });
  user.gomi.forEach(function(g){ if(!g.del && inTrip(t, g.d)) items.push({d:g.d, o:g.ca || "", g:g}); });
  user.yuru.forEach(function(y){ if(!y.del && inTrip(t, y.d)) items.push({d:y.d, o:y.ca || "", y:y}); });
  return items.sort(function(a,b){ return (a.d + a.o).localeCompare(b.d + b.o); });
}
function tripCount(items){
  return items.reduce(function(s, it){ return s + (it.v ? Object.keys(it.v.g || {}).length : 1); }, 0);
}
function openTrips(){
  var list = liveTrips(), el = $("tripList");
  if(!list.length) el.innerHTML = '<p class="help">まだ旅程はありません。「新しい旅程」から作ってください。</p>';
  else{
    el.innerHTML = "";
    list.forEach(function(t){
      var b = document.createElement("button"); b.type = "button"; b.className = "trow";
      var n = tripDays(t).length, c = tripCount(tripItems(t));
      b.innerHTML = "<b>" + esc(t.n) + "</b><small>" + esc(fmtDate(t.d1)) + "〜" + esc(fmtDate(t.d2)) + "（" + n + "日）・収集 " + c + " 点</small>";
      b.onclick = function(){ $("dlgTrips").close(); showTrip(t.id, true); };
      el.appendChild(b);
    });
  }
  $("dlgTrips").showModal();
}
function openTripForm(id){
  var t = id ? tripById(id) : null;
  editTrip = t ? t.id : null;
  $("tTitle").textContent = t ? "旅程を編集" : "新しい旅程";
  $("tName").value = t ? t.n : ""; $("tD1").value = t ? t.d1 : curDate(); $("tD2").value = t ? t.d2 : curDate();
  $("tNote").value = t ? (t.note || "") : ""; $("tMsg").textContent = "";
  $("tDel").style.display = t ? "" : "none";
  $("dlgTrip").showModal();
}
$("formTrip").addEventListener("submit", function(e){
  e.preventDefault();
  var n = $("tName").value.trim(), d1 = $("tD1").value, d2 = $("tD2").value;
  if(!n){ $("tMsg").textContent = "旅程の名前を入れてください"; return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)){ $("tMsg").textContent = "開始日と終了日を入れてください"; return; }
  if(d2 < d1){ $("tMsg").textContent = "終了日が開始日より前になっています"; return; }
  var id = editTrip;
  if(id){ var t = tripById(id); t.n = n; t.d1 = d1; t.d2 = d2; t.note = $("tNote").value.trim(); t.ua = nowIso(); delete TRK[id]; }
  else{ id = "t" + uid(); user.trips.push({id:id, n:n, d1:d1, d2:d2, note:$("tNote").value.trim(), ca:nowIso(), ua:nowIso()}); }
  save(); $("dlgTrip").close(); showTrip(id, true);
});
$("tDel").onclick = function(){
  if(!editTrip || !confirm("この旅程を削除しますか？（訪問記録そのものは残ります）")) return;
  var t = tripById(editTrip); t.del = true; t.ua = nowIso();
  idbDel("tracks", t.id).catch(function(){}); delete TRK[t.id];
  save(); $("dlgTrip").close(); closeDetail();
};
$("btnTrip").onclick = openTrips;
$("tripNew").onclick = function(){ $("dlgTrips").close(); openTripForm(null); };

function getTrack(id){
  if(TRK[id] !== undefined) return Promise.resolve(TRK[id]);
  return idbGet("tracks", id).catch(function(){ return null; }).then(function(own){
    if(own && own.pts && own.pts.length){ own.src = "file"; return own; }
    var t = tripById(id); if(!t) return null;
    return Promise.all(tripDays(t).map(function(d){ return idbGet("days", d).catch(function(){ return null; }); })).then(function(ds){
      var pts = [], stays = [];
      ds.forEach(function(x){ if(x){ pts = pts.concat(x.pts || []); stays = stays.concat(x.stays || []); } });
      return pts.length ? {id:id, pts:pts, stays:stays, src:"timeline"} : null;
    });
  }).then(function(r){ TRK[id] = r || null; return TRK[id]; });
}
function hm(sec){ var d = new Date(sec * 1000); return d.getHours() + ":" + pad(d.getMinutes()); }
function drawTrip(fit){
  if(!mapOK) return;
  if(!tripLayer) tripLayer = L.layerGroup().addTo(map);
  tripLayer.clearLayers();
  var id = selTrip || tripReturn; if(!id) return;
  getTrack(id).then(function(tr){
    if((selTrip || tripReturn) !== id) return;
    tripLayer.clearLayers();
    var info = $("tTrkInfo");
    if(!tr || !tr.pts || !tr.pts.length){ if(info) info.textContent = "この期間の軌跡はまだありません。メニュー「≡」のタイムラインから取り込むと自動で表示されます。"; return; }
    var line = tr.pts.map(function(p){ return [p[0], p[1]]; });
    tripLayer.addLayer(L.polyline(line, {color:"#6A1B9A", weight:3, opacity:0.8, interactive:false}));
    (tr.stays || []).forEach(function(s){
      tripLayer.addLayer(L.circleMarker([s[0], s[1]], {radius:5, color:"#6A1B9A", weight:2, fillColor:"#fff", fillOpacity:1, interactive:false}));
    });
    if(info) info.textContent = (tr.src === "timeline" ? "軌跡（タイムラインから）：" : "軌跡：") + tr.pts.length + "点・とどまった場所 " + (tr.stays || []).length + " か所（" +
      shortDate(ymd(new Date(tr.pts[0][2] * 1000))) + " " + hm(tr.pts[0][2]) + "〜" + shortDate(ymd(new Date(tr.pts[tr.pts.length-1][2] * 1000))) + " " + hm(tr.pts[tr.pts.length-1][2]) + "）";
    if(fit) map.fitBounds(L.latLngBounds(line), {padding:[30,30]});
  });
}
function showTrip(id, fit){
  selTrip = id; selId = null; selArea = null; tripReturn = null;
  $("sheet").classList.add("detail"); openSheet(true);
  renderTripDetail(); renderMarkers(_vis); renderAreas(); drawTrip(fit);
}
function itemLine(it){
  if(it.v){
    var p = byId[it.v.pid], labs = Object.keys(it.v.g || {}).map(function(t){
      var no = it.v.g[t] && it.v.g[t].no;
      return tLabel(t) + (no ? "（No." + no + "）" : "") + (t === "pf" && !(it.v.ph && it.v.ph.length) ? "（写真待ち）" : "");
    });
    return {pid:it.v.pid, c:p ? (KIND_COLOR[p.k] || GROUPS.cu.color) : GROUPS.cu.color,
      text:(p ? p.n : "（削除された地点）") + (labs.length ? " — " + labs.join("・") : (it.v.note ? " — " + it.v.note : ""))};
  }
  if(it.g){ var a = areaById(it.g.aid); return {aid:it.g.aid, c:GROUPS.gm.color, text:(a ? a.n : "エリア") + " — ゴミ袋 " + [it.g.t, it.g.s, it.g.col].filter(Boolean).join("・")}; }
  var y = it.y, tgt = y.pid ? byId[y.pid] : areaById(y.aid);
  return {pid:y.pid, aid:y.aid, c:GROUPS.yu.color, text:(tgt ? tgt.n : "") + " — " + [y.ch, y.it].filter(Boolean).join("・")};
}
function renderTripDetail(){
  var t = tripById(selTrip), el = $("detail");
  if(!t || t.del){ closeDetail(); return; }
  var items = tripItems(t);
  var h = '<div class="dhead"><h2>' + esc(t.n) + '</h2><button class="btn sm ghost" type="button" id="dClose" aria-label="閉じる">✕</button></div>';
  h += '<div class="dmeta">' + esc(fmtDate(t.d1)) + "〜" + esc(fmtDate(t.d2)) + "（" + tripDays(t).length + "日）" + (t.note ? "<br>" + esc(t.note) : "") + '<br><span id="tTrkInfo">軌跡を確認しています…</span></div>';
  h += '<div class="dlinks"><button class="btn sm" type="button" id="tTrack">軌跡を読み込む</button><button class="btn sm primary" type="button" id="tCand">立ち寄り候補を探す</button>' +
       '<button class="btn sm" type="button" id="tWork">記録日を旅程の日に</button><button class="btn sm" type="button" id="tEdit">編集</button></div>';
  h += '<div class="sect">この旅で収集したもの（' + tripCount(items) + '点）</div>';
  if(!items.length) h += '<p class="help">この期間の記録はまだありません。立ち寄り候補から登録するか、各地点で記録してください。</p>';
  var lastD = "";
  items.forEach(function(it, i){
    if(it.d !== lastD){ h += '<div class="dayh">' + esc(dayLabel(it.d)) + "</div>"; lastD = it.d; }
    var L2 = itemLine(it);
    h += '<button type="button" class="titem" data-i="' + i + '" style="--c:' + L2.c + '"><span class="dot"></span><span>' + esc(L2.text) + "</span></button>";
  });
  el.innerHTML = h;
  $("dClose").onclick = closeDetail;
  $("tTrack").onclick = function(){ $("trackIn").click(); };
  $("tCand").onclick = function(){ openCandidates(t); };
  $("tWork").onclick = openWork;
  $("tEdit").onclick = function(){ openTripForm(t.id); };
  el.querySelectorAll("[data-i]").forEach(function(b){
    b.onclick = function(){
      var L2 = itemLine(items[+b.getAttribute("data-i")]);
      if(L2.pid && byId[L2.pid]) select(L2.pid, true); else if(L2.aid) selectArea(L2.aid, true);
    };
  });
  drawTrip(false);
}
function backHtml(){ return tripReturn && tripById(tripReturn) ? '<button class="btn sm ghost" type="button" id="dBack" style="margin-bottom:6px">← 旅程「' + esc(tripById(tripReturn).n) + '」に戻る</button>' : ""; }
function bindBack(){ var b = $("dBack"); if(b) b.onclick = function(){ showTrip(tripReturn, false); }; }

/* ---- 軌跡の読み込み（Googleマップのタイムライン JSON・GPX） ---- */
function parseLL(s){
  if(s == null) return null;
  if(typeof s === "object"){
    if(s.latLng) return parseLL(s.latLng);
    if(s.LatLng) return parseLL(s.LatLng);
    if("latitudeE7" in s) return [s.latitudeE7 / 1e7, s.longitudeE7 / 1e7];
    if("lat" in s) return [+s.lat, +(s.lng != null ? s.lng : s.lon)];
    return null;
  }
  var m = String(s).replace(/^geo:/, "").replace(/°/g, "").split(",");
  if(m.length < 2) return null;
  var a = parseFloat(m[0]), b = parseFloat(m[1]);
  return isFinite(a) && isFinite(b) ? [a, b] : null;
}
function tsec(x){
  if(x == null || x === "") return NaN;
  if(typeof x === "number") return x > 1e12 ? x / 1000 : x;
  if(/^\d+$/.test(x)) return +x > 1e12 ? +x / 1000 : +x;
  return Date.parse(x) / 1000;
}
function detectStays(pts){
  var out = [], i = 0;
  while(i < pts.length){
    var j = i;
    while(j + 1 < pts.length && dist({lat:pts[i][0], lng:pts[i][1]}, {lat:pts[j+1][0], lng:pts[j+1][1]}) < 0.15) j++;
    if(pts[j][2] - pts[i][2] >= 300){
      var la = 0, lo = 0;
      for(var k = i; k <= j; k++){ la += pts[k][0]; lo += pts[k][1]; }
      out.push([la / (j - i + 1), lo / (j - i + 1), pts[i][2], pts[j][2]]); i = j + 1;
    }else i++;
  }
  return out;
}
function thinTrack(pts){
  var out = [], last = null;
  pts.forEach(function(p){ if(!last || dist({lat:last[0], lng:last[1]}, {lat:p[0], lng:p[1]}) >= 0.02){ out.push(p); last = p; } });
  if(out.length > 30000){ var st = Math.ceil(out.length / 30000); out = out.filter(function(_, i){ return i % st === 0; }); }
  return out;
}
function parseTrack(text, d1, d2){
  var from = new Date(d1 + "T00:00:00").getTime() / 1000, to = new Date(d2 + "T23:59:59").getTime() / 1000;
  var pts = [], stays = [];
  function addP(ll, t){ if(ll && isFinite(t) && t >= from && t <= to) pts.push([+ll[0].toFixed(6), +ll[1].toFixed(6), Math.round(t)]); }
  function addS(ll, t1, t2){ if(ll && isFinite(t1) && isFinite(t2) && t2 >= from && t1 <= to) stays.push([ll[0], ll[1], Math.round(t1), Math.round(t2)]); }
  var s = String(text).replace(/^\uFEFF/, "").trim();
  if(s.charAt(0) === "<"){
    var doc = new DOMParser().parseFromString(s, "application/xml");
    var nodes = doc.getElementsByTagName("trkpt");
    if(!nodes.length) nodes = doc.getElementsByTagName("rtept");
    if(!nodes.length) throw new Error("GPXに位置の記録がありません");
    for(var i = 0; i < nodes.length; i++){
      var nd = nodes[i], tm = nd.getElementsByTagName("time")[0];
      var t = tm ? tsec(tm.textContent.trim()) : from;
      addP([parseFloat(nd.getAttribute("lat")), parseFloat(nd.getAttribute("lon"))], t);
    }
  }else{
    var d = JSON.parse(s);
    var segs = Array.isArray(d) ? d : (d.semanticSegments || []);
    segs.forEach(function(g){
      var st0 = tsec(g.startTime);
      (g.timelinePath || []).forEach(function(p){
        var t = p.time != null ? tsec(p.time) : st0 + 60 * (+p.durationMinutesOffsetFromStartTime || 0);
        addP(parseLL(p.point), t);
      });
      if(g.visit){ var c = g.visit.topCandidate || {}; addS(parseLL(c.placeLocation), st0, tsec(g.endTime)); }
      if(g.activity){ addP(parseLL(g.activity.start), st0); addP(parseLL(g.activity.end), tsec(g.endTime)); }
    });
    (d.rawSignals || []).forEach(function(r){ if(r.position) addP(parseLL(r.position.LatLng || r.position.latLng), tsec(r.position.timestamp)); });
    (d.locations || []).forEach(function(r){ addP(parseLL(r), tsec(r.timestamp || r.timestampMs)); });
    (d.timelineObjects || []).forEach(function(o){
      if(o.placeVisit){ var du = o.placeVisit.duration || {}; addS(parseLL(o.placeVisit.location), tsec(du.startTimestamp || du.startTimestampMs), tsec(du.endTimestamp || du.endTimestampMs)); }
      if(o.activitySegment){
        var a = o.activitySegment, du2 = a.duration || {}, ts = tsec(du2.startTimestamp || du2.startTimestampMs);
        addP(parseLL(a.startLocation), ts); addP(parseLL(a.endLocation), tsec(du2.endTimestamp || du2.endTimestampMs));
        ((a.waypointPath || {}).waypoints || []).forEach(function(w){ addP(parseLL(w), ts); });
      }
    });
  }
  // とどまった場所を軌跡の点としても使う（線がつながるように）
  stays.forEach(function(x){ pts.push([x[0], x[1], x[2]]); });
  pts.sort(function(a,b){ return a[2] - b[2]; });
  if(!stays.length) stays = detectStays(pts);
  stays.sort(function(a,b){ return a[2] - b[2]; });
  return {pts:thinTrack(pts), stays:stays};
}
$("trackIn").onchange = function(){
  var f = this.files && this.files[0]; this.value = "";
  var t = selTrip && tripById(selTrip); if(!f || !t) return;
  if(f.size > 30 * 1024 * 1024){
    toast("大きなファイルは、メニュー「≡」のタイムラインから取り込んでください");
    $("btnMenu").onclick(); return;
  }
  toast("軌跡を読み込んでいます…");
  var fr = new FileReader();
  fr.onload = function(){
    var tr;
    try{ tr = parseTrack(String(fr.result), t.d1, t.d2); }
    catch(e){ toast("読み込めませんでした：" + e.message); return; }
    if(!tr.pts.length){ toast("旅程の期間（" + shortDate(t.d1) + "〜" + shortDate(t.d2) + "）の位置記録がファイルにありません"); return; }
    tr.id = t.id;
    idbPut("tracks", tr).then(function(){
      TRK[t.id] = tr; drawTrip(true);
      toast("軌跡を読み込みました（とどまった場所 " + tr.stays.length + " か所）");
    }).catch(function(e){ toast("保存できませんでした：" + e.message); });
  };
  fr.readAsText(f);
};

/* ---- 立ち寄り候補 ---- */
function primaryTypes(p){ return p.k === "me" ? ["stamp"] : p.k === "sa" ? ["hw"] : p.k === "pf" ? ["pf"] : p.k === "mh" ? p.c.slice() : p.k === "cu" ? ["cu"] : []; }
function findCandidates(tr){
  var out = [], seen = {};
  (tr.stays || []).forEach(function(s){
    var d = ymd(new Date(s[2] * 1000));
    PLACES.forEach(function(p){
      if(p.k === "yu") return;
      if(Math.abs(p.la - s[0]) > 0.01 || Math.abs(p.lo - s[1]) > 0.013) return;
      var km = dist({lat:s[0], lng:s[1]}, {lat:p.la, lng:p.lo});
      if(km > (p.k === "sa" ? 0.35 : 0.15)) return;
      var key = p.id + "|" + d; if(seen[key]) return; seen[key] = 1;
      if(visitsOf(p.id).some(function(v){ return v.d === d; })) return;
      out.push({pid:p.id, d:d, t:s[2], km:km, stay:Math.round((s[3] - s[2]) / 60)});
    });
  });
  return out.sort(function(a,b){ return a.t - b.t; });
}
function openCandidates(t){
  getTrack(t.id).then(function(tr){
    if(!tr || !tr.pts.length){ toast("先に「軌跡を読み込む」で軌跡を入れてください"); return; }
    candList = findCandidates(tr);
    var el = $("candList");
    if(!candList.length) el.innerHTML = '<p class="help">新しい候補は見つかりませんでした（すでに記録済みのものは出しません）。候補にない地点は、地点を開いて記録してください。</p>';
    else el.innerHTML = candList.map(function(c, i){
      var p = byId[c.pid], ty = primaryTypes(p).map(tLabel).join("・") || "立ち寄りのみ";
      return '<label class="cand"><input type="checkbox" data-ci="' + i + '" checked><span><b>' + esc(p.n) + "</b><small>" + esc(dayLabel(c.d)) + " " + hm(c.t) +
        "頃・約" + c.stay + "分滞在・" + Math.round(c.km * 1000) + "m ／ 記録：" + esc(ty) + "</small></span></label>";
    }).join("");
    $("dlgCand").showModal();
  });
}
$("candOk").onclick = function(){
  var n = 0;
  $("candList").querySelectorAll("input[data-ci]").forEach(function(cb){
    if(!cb.checked) return;
    var c = candList[+cb.getAttribute("data-ci")], p = byId[c.pid]; if(!p) return;
    var g = {}; primaryTypes(p).forEach(function(t){ g[t] = {}; });
    user.visits.push({id:"v" + uid(), pid:p.id, d:c.d, g:g, note:Object.keys(g).length ? "旅程から登録" : "立ち寄り（旅程から登録）", ca:nowIso(), ua:nowIso()});
    n++;
  });
  save(); rebuildGot(); $("dlgCand").close(); renderAll();
  toast(n + " か所を登録しました");
};

/* ================= 写真と軌跡の書き出し（zip） ================= */
var CRC_T = null;
function crc32(u8){
  if(!CRC_T){ CRC_T = new Uint32Array(256); for(var n = 0; n < 256; n++){ var c = n; for(var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  var crc = 0xFFFFFFFF;
  for(var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function strU8(s){ return new TextEncoder().encode(s); }
function toU8(x){ return ArrayBuffer.isView(x) ? Promise.resolve(x) : readAB(x).then(function(ab){ return new Uint8Array(ab); }); }
function zipBuild(entries){
  var parts = [], cd = [], off = 0;
  return entries.reduce(function(pr, e){
    return pr.then(function(){ return toU8(e.data).then(function(bytes){
      var name = strU8(e.name), crc = crc32(bytes), size = bytes.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, (typeof Blob !== "undefined" && e.data instanceof Blob) ? e.data : bytes);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cd.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + size;
    }); });
  }, Promise.resolve()).then(function(){
    var cdSize = cd.reduce(function(s, x){ return s + x.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cd, [new Uint8Array(e.buffer)]), {type:"application/zip"});
  });
}
function zipRead(file){
  var tail = Math.min(file.size, 65557);
  return readAB(file.slice(file.size - tail)).then(function(ab){
    var dv = new DataView(ab), i;
    for(i = ab.byteLength - 22; i >= 0; i--) if(dv.getUint32(i, true) === 0x06054b50) break;
    if(i < 0) throw new Error("zipファイルではありません");
    var n = dv.getUint16(i + 10, true), cdSize = dv.getUint32(i + 12, true), cdOff = dv.getUint32(i + 16, true);
    return readAB(file.slice(cdOff, cdOff + cdSize)).then(function(cab){
      var c = new DataView(cab), p = 0, list = [], dec = new TextDecoder();
      for(var k = 0; k < n; k++){
        if(c.getUint32(p, true) !== 0x02014b50) throw new Error("zipの形式が違います");
        var nl = c.getUint16(p + 28, true), el = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
        list.push({name:dec.decode(new Uint8Array(cab, p + 46, nl)), method:c.getUint16(p + 10, true), size:c.getUint32(p + 20, true), lho:c.getUint32(p + 42, true)});
        p += 46 + nl + el + cl;
      }
      return Promise.all(list.map(function(e){
        return readAB(file.slice(e.lho, e.lho + 30)).then(function(hab){
          var h = new DataView(hab), start = e.lho + 30 + h.getUint16(26, true) + h.getUint16(28, true);
          if(e.method !== 0) throw new Error("圧縮されたzipには対応していません（アプリで書き出したファイルを使ってください）");
          return {name:e.name, blob:file.slice(start, start + e.size)};
        });
      }));
    });
  });
}
function mediaMsg(s, err){ var m = $("mediaMsg"); m.textContent = s; m.className = "msg" + (err ? " err" : ""); }
function downloadBlob(blob, name){
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function buildMediaZip(){
  return Promise.all([idbAll("photos"), idbAll("tracks")]).then(function(r){
    var ph = r[0] || [], tr = r[1] || [];
    var man = {app:"collectmap", kind:"media", version:1, exported:nowIso(),
      photos:ph.map(function(p){ return {id:p.id, pid:p.pid, vid:p.vid, ca:p.ca, file:"photos/" + p.id + ".jpg"}; }),
      tracks:tr.map(function(t){ return {id:t.id, file:"tracks/" + t.id + ".json"}; })};
    var entries = [{name:"manifest.json", data:strU8(JSON.stringify(man))}];
    ph.forEach(function(p){ entries.push({name:"photos/" + p.id + ".jpg", data:p.blob}); });
    tr.forEach(function(t){ entries.push({name:"tracks/" + t.id + ".json", data:strU8(JSON.stringify(t))}); });
    return zipBuild(entries).then(function(blob){ return {blob:blob, np:ph.length, nt:tr.length}; });
  });
}
function importMediaZip(file){
  return zipRead(file).then(function(ents){
    var by = {}; ents.forEach(function(e){ by[e.name] = e; });
    if(!by["manifest.json"]) throw new Error("収集マップで書き出したファイルではありません");
    return readText(by["manifest.json"].blob).then(function(t){
      var man = JSON.parse(t), nP = 0, nT = 0;
      var jobs = (man.photos || []).map(function(p){
        var e = by[p.file]; if(!e) return null;
        return idbGet("photos", p.id).then(function(ex){
          if(ex) return; nP++;
          return idbPut("photos", {id:p.id, pid:p.pid, vid:p.vid, ca:p.ca, blob:new Blob([e.blob], {type:"image/jpeg"})});
        });
      }).concat((man.tracks || []).map(function(x){
        var e = by[x.file]; if(!e) return null;
        return readText(e.blob).then(function(s){ var tr = JSON.parse(s); nT++; TRK[tr.id] = tr; return idbPut("tracks", tr); });
      }));
      return Promise.all(jobs).then(function(){ return {np:nP, nt:nT}; });
    });
  });
}
$("btnMediaExport").onclick = function(){
  mediaMsg("書き出しの準備をしています…");
  buildMediaZip().then(function(r){
    if(!r.np && !r.nt){ mediaMsg("書き出す写真・軌跡がまだありません", true); return; }
    downloadBlob(r.blob, "collectmap-media-" + today() + ".zip");
    mediaMsg("写真 " + r.np + " 枚・軌跡 " + r.nt + " 件を書き出しました");
  }).catch(function(e){ mediaMsg("書き出せませんでした：" + e.message, true); });
};
$("mediaIn").onchange = function(){
  var f = this.files && this.files[0]; this.value = ""; if(!f) return;
  mediaMsg("読み込んでいます…");
  importMediaZip(f).then(function(r){ mediaMsg("写真 " + r.np + " 枚・軌跡 " + r.nt + " 件を読み込みました"); renderAll(); })
    .catch(function(e){ mediaMsg("読み込めませんでした：" + e.message, true); });
};


/* ================= タイムラインの取り込み（大きなファイルを少しずつ） ================= */
function TLScanner(onItem){
  this.depth = 0; this.inStr = false; this.esc = false; this.started = false; this.topArray = false;
  this.keyBuf = null; this.lastStr = ""; this.key = ""; this.arrKey = null;
  this.cap = null; this.capDepth = -1; this.capKey = null; this.onItem = onItem;
}
var TL_KEYS = {semanticSegments:1, rawSignals:1, locations:1, timelineObjects:1};
TLScanner.prototype.feed = function(s){
  var capStart = this.cap !== null ? 0 : -1;
  for(var i = 0, n = s.length; i < n; i++){
    var c = s.charCodeAt(i);
    if(this.inStr){
      if(this.esc) this.esc = false;
      else if(c === 92) this.esc = true;
      else if(c === 34){ this.inStr = false; if(this.keyBuf !== null){ this.lastStr = this.keyBuf; this.keyBuf = null; } }
      else if(this.keyBuf !== null && this.keyBuf.length < 40) this.keyBuf += s[i];
      continue;
    }
    if(c === 34){ this.inStr = true; if(this.depth === 1 && !this.topArray && this.cap === null) this.keyBuf = ""; continue; }
    if(c === 58){ if(this.depth === 1 && !this.topArray) this.key = this.lastStr; continue; }
    if(c === 123 || c === 91){
      if(!this.started){ this.started = true; this.topArray = c === 91; this.depth = 1; continue; }
      this.depth++;
      if(this.cap === null){
        if(c === 91 && !this.topArray && this.depth === 2) this.arrKey = TL_KEYS[this.key] ? this.key : null;
        else if(c === 123 && ((this.topArray && this.depth === 2) || (!this.topArray && this.depth === 3 && this.arrKey))){
          this.cap = ""; capStart = i; this.capDepth = this.depth; this.capKey = this.topArray ? "semanticSegments" : this.arrKey;
        }
      }
      continue;
    }
    if(c === 125 || c === 93){
      if(this.cap !== null && c === 125 && this.depth === this.capDepth){
        var text = this.cap + s.slice(capStart, i + 1);
        this.cap = null; capStart = -1;
        this.onItem(this.capKey, text);
      }
      if(c === 93 && this.depth === 2 && !this.topArray) this.arrKey = null;
      this.depth--;
    }
  }
  if(this.cap !== null) this.cap += s.slice(capStart);
};
/* 記録1件を点と滞在に分ける（Android・iPhone・旧Takeoutの形式） */
function handleTL(key, g, addP, addS){
  if(key === "semanticSegments"){
    var st0 = tsec(g.startTime);
    (g.timelinePath || []).forEach(function(p){
      addP(parseLL(p.point), p.time != null ? tsec(p.time) : st0 + 60 * (+p.durationMinutesOffsetFromStartTime || 0));
    });
    if(g.visit){ var c = g.visit.topCandidate || {}; addS(parseLL(c.placeLocation), st0, tsec(g.endTime)); }
    if(g.activity){ addP(parseLL(g.activity.start), st0); addP(parseLL(g.activity.end), tsec(g.endTime)); }
  }else if(key === "rawSignals"){
    if(g.position) addP(parseLL(g.position.LatLng || g.position.latLng), tsec(g.position.timestamp));
  }else if(key === "locations"){
    addP(parseLL(g), tsec(g.timestamp || g.timestampMs));
  }else if(key === "timelineObjects"){
    if(g.placeVisit){ var du = g.placeVisit.duration || {}; addS(parseLL(g.placeVisit.location), tsec(du.startTimestamp || du.startTimestampMs), tsec(du.endTimestamp || du.endTimestampMs)); }
    if(g.activitySegment){
      var a = g.activitySegment, du2 = a.duration || {}, ts = tsec(du2.startTimestamp || du2.startTimestampMs);
      addP(parseLL(a.startLocation), ts); addP(parseLL(a.endLocation), tsec(du2.endTimestamp || du2.endTimestampMs));
      ((a.waypointPath || {}).waypoints || []).forEach(function(w){ addP(parseLL(w), ts); });
    }
  }
}
var TL_META_KEY = "collectmap.timeline";
function tlMeta(){ try{ return JSON.parse(localStorage.getItem(TL_META_KEY) || "null"); }catch(e){ return null; } }
function showTlStat(){
  var m = tlMeta(), el = $("tlStat"); if(!el) return;
  el.textContent = m && m.days ? "取り込み済み：" + fmtDate(m.first) + "〜" + fmtDate(m.last) + "（" + m.days + "日分・" + m.pts + "点、" + fmtDate(m.at.slice(0,10)) + "に取り込み）" : "まだ取り込んでいません。";
}
function importTimeline(file, fromDate, onProgress){
  var from = new Date(fromDate + "T00:00:00").getTime() / 1000;
  var buckets = {}, flushed = {}, nDays = 0, nPts = 0, first = null, last = null, bad = 0;
  function bucket(t){ var d = ymd(new Date(t * 1000)); return buckets[d] || (buckets[d] = {pts:[], stays:[]}); }
  function addP(ll, t){ if(ll && isFinite(t) && t >= from) bucket(t).pts.push([+ll[0].toFixed(6), +ll[1].toFixed(6), Math.round(t)]); }
  function addS(ll, t1, t2){ if(ll && isFinite(t1) && isFinite(t2) && t1 >= from){ bucket(t1).stays.push([ll[0], ll[1], Math.round(t1), Math.round(t2)]); bucket(t1).pts.push([ll[0], ll[1], Math.round(t1)]); } }
  var sc = new TLScanner(function(key, text){
    var g; try{ g = JSON.parse(text); }catch(e){ bad++; return; }
    handleTL(key, g, addP, addS);
  });
  function flush(keepRecent){
    var ds = Object.keys(buckets).sort();
    if(keepRecent) ds = ds.slice(0, Math.max(0, ds.length - 2));
    return ds.reduce(function(pr, d){
      return pr.then(function(){
        var b = buckets[d]; delete buckets[d];
        var prev = flushed[d] ? idbGet("days", d) : Promise.resolve(null);
        return prev.then(function(old){
          var pts = (old ? old.pts : []).concat(b.pts), stays = (old ? old.stays : []).concat(b.stays);
          pts.sort(function(a,b2){ return a[2] - b2[2]; }); stays.sort(function(a,b2){ return a[2] - b2[2]; });
          if(!stays.length) stays = detectStays(pts);
          var thin = thinTrack(pts);
          if(!flushed[d]){ nDays++; } else if(old) nPts -= old.pts.length;
          flushed[d] = 1; nPts += thin.length;
          if(!first || d < first) first = d; if(!last || d > last) last = d;
          return idbPut("days", {id:d, pts:thin, stays:stays});
        });
      });
    }, Promise.resolve());
  }
  var CH = 4 * 1024 * 1024, pos = 0, dec = new TextDecoder("utf-8");
  function step(){
    if(pos >= file.size){ sc.feed(dec.decode()); return flush(false); }
    var part = file.slice(pos, pos + CH); pos += CH;
    return readAB(part).then(function(ab){
      sc.feed(dec.decode(new Uint8Array(ab), {stream:true}));
      var lastDay = Object.keys(buckets).sort().pop();
      if(onProgress) onProgress(Math.min(1, pos / file.size), lastDay);
      var more = Object.keys(buckets).length > 40 ? flush(true) : Promise.resolve();
      return more.then(function(){ return new Promise(function(r){ setTimeout(r, 0); }); }).then(step);
    });
  }
  return step().then(function(){
    if(!sc.started) throw new Error("タイムラインのファイルではないようです");
    var m = tlMeta() || {};
    var meta = {first: m.first && m.first < first ? m.first : first, last: m.last && m.last > last ? m.last : last,
      days: nDays, pts: nPts, at: nowIso(), from: fromDate, bad: bad};
    if(first) localStorage.setItem(TL_META_KEY, JSON.stringify(meta));
    TRK = {};
    return meta;
  });
}
$("tlIn").onchange = function(){
  var f = this.files && this.files[0]; this.value = ""; if(!f) return;
  var fromDate = $("tlFrom").value || "2022-01-01", msg = $("tlMsg");
  msg.className = "msg"; msg.textContent = "取り込みを始めます…（" + Math.round(f.size / 1048576) + "MB）";
  importTimeline(f, fromDate, function(r, d){
    msg.textContent = "取り込み中… " + Math.round(r * 100) + "%" + (d ? "（" + d.slice(0, 7).replace("-", "年") + "月まで）" : "");
  }).then(function(m){
    msg.textContent = m.days ? "取り込みました：" + m.days + "日分（" + m.pts + "点）" : fromDate.replace(/-/g, "/") + " 以降の記録は見つかりませんでした";
    showTlStat();
    if(selTrip || tripReturn) drawTrip(false);
  }).catch(function(e){ msg.className = "msg err"; msg.textContent = "取り込めませんでした：" + e.message; });
};
$("tlClear").onclick = function(){
  if(!confirm("取り込んだタイムラインの記録を消しますか？（旅程や収集記録は消えません）")) return;
  idbClear("days").then(function(){ localStorage.removeItem(TL_META_KEY); TRK = {}; showTlStat(); $("tlMsg").textContent = "消しました"; if(selTrip) drawTrip(false); })
    .catch(function(e){ $("tlMsg").textContent = "消せませんでした：" + e.message; });
};
/* ================= 都道府県→地方 ================= */
var PREF_CH = {};
[["北海道",["北海道"]],["東北",["青森県","岩手県","宮城県","秋田県","山形県","福島県"]],["関東",["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"]],
 ["中部",["新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県"]],["近畿",["三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"]],
 ["中国",["鳥取県","島根県","岡山県","広島県","山口県"]],["四国",["徳島県","香川県","愛媛県","高知県"]],
 ["九州・沖縄",["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]]].forEach(function(x){ x[1].forEach(function(p){ PREF_CH[p] = x[0]; }); });

/* ================= 駅データ（必要なときだけ読む） ================= */
var STN = null, STN_P = null;
function loadStations(){
  if(STN) return Promise.resolve(STN);
  if(STN_P) return STN_P;
  STN_P = fetch("stations.json").then(function(r){ return r.json(); }).then(function(d){
    var linesOf = {};
    d.lines.forEach(function(l){ l.s.forEach(function(id){ (linesOf[id] = linesOf[id] || []).push(l.n); }); });
    STN = {st:d.st, lines:d.lines, linesOf:linesOf}; return STN;
  });
  STN_P.catch(function(){ STN_P = null; });
  return STN_P;
}
function searchStations(q){
  q = nfkc(q).replace(/\s+/g, "").replace(/駅$/, "");
  if(!q || !STN) return [];
  var exact = [], pre = [], part = [];
  Object.keys(STN.st).forEach(function(id){
    var n = nfkc(STN.st[id][0]);
    if(n === q) exact.push(id); else if(n.indexOf(q) === 0) pre.push(id); else if(q.length >= 2 && n.indexOf(q) > 0) part.push(id);
  });
  var big = function(a, b){ return (STN.linesOf[b] || []).length - (STN.linesOf[a] || []).length; };
  return exact.sort(big).concat(pre.sort(big), part).slice(0, 60);
}
function stName(id){ var s = STN.st[id]; return s[0] + "駅（" + s[1] + "）"; }
var stnCtx = null, stnTimer = null;
function openStationSearch(ctx){
  stnCtx = ctx;
  $("snTitle").textContent = ctx.mode === "ekitag" ? "エキタグを取った駅" : "ラリーに駅を追加";
  $("snQ").value = ""; $("snRes").innerHTML = '<p class="help">駅名を入れてください（「駅」は付けなくて大丈夫です）。</p>';
  $("snMap").textContent = ctx.mode === "ekitag" ? "地図で場所を指定" : "地図でスポットを追加";
  $("dlgStation").showModal();
  loadStations().catch(function(){ $("snRes").innerHTML = '<p class="help">駅データを読み込めませんでした。通信のある場所で試してください。</p>'; });
  setTimeout(function(){ $("snQ").focus(); }, 60);
}
function renderStationResults(){
  if(!STN) return;
  var ids = searchStations($("snQ").value), el = $("snRes");
  if(!$("snQ").value.trim()){ el.innerHTML = ""; return; }
  if(!ids.length){ el.innerHTML = '<p class="help">見つかりません。新しい駅などは「地図で場所を指定」から登録できます。</p>'; return; }
  el.innerHTML = ids.map(function(id){
    var s = STN.st[id];
    return '<button type="button" class="srow" data-sid="' + id + '"><span class="sn"><b>' + esc(stName(id)) + "</b><small>" + esc(s[4] + "・" + (STN.linesOf[id] || []).join("・")) + "</small></span></button>";
  }).join("");
  el.querySelectorAll("[data-sid]").forEach(function(b){ b.onclick = function(){ pickStation(b.getAttribute("data-sid")); }; });
}
$("snQ").addEventListener("input", function(){ clearTimeout(stnTimer); stnTimer = setTimeout(renderStationResults, 150); });
$("snMap").onclick = function(){
  var ctx = stnCtx; $("dlgStation").close();
  if(ctx.mode === "ekitag") startPick("ekitagPoint"); else startPick("rallySpot", {rid:ctx.rid});
};
function pickStation(id){
  var ctx = stnCtx; $("dlgStation").close();
  if(ctx.mode === "ekitag") registerEkitag(id);
  else{ var s = STN.st[id]; addRallySpot(ctx.rid, {k:"st:" + s[1] + "|" + s[0], n:s[0] + "駅", la:s[2], lo:s[3]}); }
}

/* ================= エキタグ（取った駅だけ登録） ================= */
function registerEkitag(spec){
  var n, la, lo, p = "";
  if(typeof spec === "string"){ var s = STN.st[spec]; n = stName(spec); la = s[2]; lo = s[3]; p = s[4]; }
  else{ n = spec.n; la = spec.la; lo = spec.lo; }
  var ex = user.custom.filter(function(c){ return !c.del && c.k === "et" && c.n === n; })[0], tmp = false, pid;
  if(ex) pid = ex.id;
  else{
    var pl = {id:"et" + uid(), k:"et", n:n, la:la, lo:lo, p:p, r:PREF_CH[p] || "", a:"エキタグ", c:["et"], ua:nowIso()};
    user.custom.push(pl); rebuildPlaces(); pid = pl.id; tmp = true;
  }
  openVisit(pid, null, "et");
  if(editVisit) editVisit.tmpPlace = tmp;
}
/* 新しく作った地点で、記録を保存せずに閉じたら地点も取り消す */
$("dlgVisit").addEventListener("close", function(){
  var ev = editVisit;
  if(ev && ev.tmpPlace && !visitsOf(ev.pid).length){
    user.custom = user.custom.filter(function(c){ return c.id !== ev.pid; });
    rebuildPlaces(); rebuildGot(); renderAll();
  }
  if(ev) ev.tmpPlace = false;
});

/* ================= 街中のスタンプ ================= */
var editS = null;
function nextBookPage(){
  var last = null;
  user.stamps.forEach(function(s){ if(!s.del && (!last || (s.ca || "") > (last.ca || ""))) last = s; });
  return last ? {bk:last.bk || "1", pg:String((parseInt(last.pg, 10) || 0) + 1)} : {bk:"1", pg:"1"};
}
function openStamp(target, sid){
  var r = sid ? user.stamps.filter(function(x){ return x.id === sid; })[0] : null;
  editS = {target:target, id:r ? r.id : null, ph:(r && r.ph || []).slice(), add:[], del:[], busy:0};
  $("sTitle").textContent = r ? "スタンプを編集" : "スタンプを記録";
  $("sPlaceWrap").style.display = target.newPoint ? "" : "none";
  $("sPlace").value = "";
  var nb = nextBookPage();
  $("sName").value = r ? (r.n || "") : ""; $("sBook").value = r ? (r.bk || "") : nb.bk; $("sPage").value = r ? (r.pg || "") : nb.pg;
  $("sDate").value = r ? (r.d || curDate()) : curDate(); $("sNote").value = r ? (r.note || "") : "";
  $("sMsg").textContent = ""; $("sDel").style.display = r ? "" : "none";
  renderDateChips("sDateChips", "sDate"); renderSThumbs();
  $("dlgStamp").showModal();
}
function renderSThumbs(){
  var ev = editS, box = $("sThumbs"); if(!ev) return;
  box.innerHTML = "";
  ev.ph.forEach(function(id){ box.appendChild(makeThumb(function(){ return photoURL(id); }, function(){ ev.ph = ev.ph.filter(function(x){ return x !== id; }); ev.del.push(id); renderSThumbs(); })); });
  ev.add.forEach(function(a){ box.appendChild(makeThumb(function(){ return Promise.resolve(a.url); }, function(){ ev.add = ev.add.filter(function(x){ return x !== a; }); renderSThumbs(); })); });
  if(ev.busy){ var w = document.createElement("div"); w.className = "thumb wait"; w.textContent = "処理中"; box.appendChild(w); }
}
$("sPhotoIn").onchange = function(){
  var files = [].slice.call(this.files || []); this.value = "";
  var ev = editS; if(!files.length || !ev) return;
  ev.busy += files.length; renderSThumbs();
  files.forEach(function(f){ resizeImage(f).then(function(b){ ev.add.push({blob:b, url:URL.createObjectURL(b)}); ev.busy--; if(editS === ev) renderSThumbs(); }); });
};
$("formStamp").addEventListener("submit", function(e){
  e.preventDefault();
  var ev = editS; if(!ev) return;
  if(ev.busy){ $("sMsg").textContent = "写真の処理が終わるまで少し待ってください"; return; }
  var rec = {n:$("sName").value.trim(), bk:$("sBook").value.trim(), pg:$("sPage").value.trim(), d:$("sDate").value, note:$("sNote").value.trim()};
  if(!rec.n && !ev.ph.length && !ev.add.length && !rec.note && !rec.pg){ $("sMsg").textContent = "名前・ページ・写真・コメントのどれかを入れてください"; return; }
  var pid = ev.target.pid;
  if(ev.target.newPoint && !$("sPlace").value.trim()){ $("sMsg").textContent = "場所の名前を入れてください"; return; }
  var sid = ev.id || ("sp" + uid()), newIds = [];
  var jobs = ev.add.map(function(a){ var id = "ph" + uid() + newIds.length; newIds.push(id); return idbPut("photos", {id:id, blob:a.blob, pid:pid || "", sid:sid, ca:nowIso()}); });
  function finish(){
    if(ev.target.newPoint){
      var np = ev.target.newPoint;
      var pl = {id:"sp" + uid(), k:"sp", n:$("sPlace").value.trim(), la:np.lat, lo:np.lng, p:"", r:"", a:"", c:["sp"], ua:nowIso()};
      user.custom.push(pl); rebuildPlaces(); pid = pl.id;
    }
    ev.del.forEach(function(id){ idbDel("photos", id).catch(function(){}); });
    var ph = ev.ph.concat(newIds);
    if(ev.id){ var r = user.stamps.filter(function(x){ return x.id === ev.id; })[0]; Object.assign(r, rec); r.ph = ph; r.ua = nowIso(); }
    else user.stamps.push(Object.assign({id:sid, pid:pid, ph:ph, ca:nowIso(), ua:nowIso()}, rec));
    save(); rebuildGot(); $("dlgStamp").close(); select(pid, !!ev.target.newPoint); renderAll();
    toast("スタンプを記録しました" + (rec.bk || rec.pg ? "（" + (rec.bk ? rec.bk + "冊目 " : "") + (rec.pg ? rec.pg + "ページ" : "") + "）" : ""));
  }
  if(!jobs.length){ finish(); return; }
  $("sMsg").textContent = "写真を保存しています…";
  Promise.all(jobs).then(finish).catch(function(err){ $("sMsg").textContent = "写真を保存できませんでした：" + err.message; });
});
$("sDel").onclick = function(){
  if(!editS || !editS.id || !confirm("このスタンプの記録を削除しますか？")) return;
  var r = user.stamps.filter(function(x){ return x.id === editS.id; })[0];
  r.del = true; r.ua = nowIso(); (r.ph || []).forEach(function(id){ idbDel("photos", id).catch(function(){}); });
  save(); rebuildGot(); $("dlgStamp").close(); renderAll();
};
function bkLabel(s){ return (s.bk ? s.bk + "冊目" : "") + (s.pg ? " p." + s.pg : ""); }
function stampListHtml(list){
  if(!list.length) return '<p class="help">まだ記録はありません。</p>';
  return list.map(function(s){
    return '<div class="visit"><div class="vb"><div class="vd">' + (bkLabel(s) ? '<span class="bk">' + esc(bkLabel(s)) + "</span>" : "") + esc(s.n || "（名前なし）") +
      '</div><div class="vi">' + esc(fmtDate(s.d)) + "</div>" + (s.note ? '<div class="vn">' + esc(s.note) + "</div>" : "") +
      ((s.ph && s.ph.length) ? '<div class="thumbs" data-phs="' + esc(s.ph.join(",")) + '"></div>' : "") +
      '</div><button class="btn sm" type="button" data-sp="' + esc(s.id) + '">編集</button></div>';
  }).join("");
}

/* ================= テクテクライフのラリー ================= */
var selRally = null, rallyLayer = null, editR = null, rLineTimer = null, chkMap = {};
function rallyById(id){ return (user.rallies || []).filter(function(r){ return r.id === id; })[0]; }
function liveRallies(){ return (user.rallies || []).filter(function(r){ return !r.del; }); }
function rallyProg(r){
  if(r.t === "count") return {d:+r.done || 0, t:+r.total || 0};
  var d = (r.spots || []).filter(function(s){ return chkMap[s.k]; }).length;
  return {d:d, t:Math.max((r.spots || []).length, +r.total || 0)};
}
function updateCleared(){
  liveRallies().forEach(function(r){
    var p = rallyProg(r);
    if(p.t && p.d >= p.t){ if(!r.cleared){ r.cleared = curDate(); r.ua = nowIso(); } }
    else if(r.cleared){ r.cleared = ""; r.ua = nowIso(); }
  });
}
function openRallyForm(id){
  var r = id ? rallyById(id) : null;
  editR = {id:r ? r.id : null, line:null};
  $("rTitle").textContent = r ? "ラリーを編集" : "ラリーを作る";
  $("rName").value = r ? r.n : ""; $("rType").value = r ? r.t : "line"; $("rType").disabled = !!r;
  $("rTotal").value = r ? (r.total || "") : ""; $("rDone").value = r ? (r.done || "") : "";
  $("rNote").value = r ? (r.note || "") : ""; $("rMsg").textContent = "";
  $("rLineQ").value = ""; $("rLineRes").innerHTML = ""; $("rLineSel").textContent = r && r.line ? "路線：" + r.line : "";
  $("rDel").style.display = r ? "" : "none";
  rTypeUI(!!r);
  $("dlgRally").showModal();
  if(!r) loadStations().catch(function(){});
}
function rTypeUI(editing){
  var t = $("rType").value;
  $("rLineWrap").style.display = t === "line" && !editing ? "" : "none";
  $("rCountWrap").style.display = t === "line" && !editing ? "none" : "";
  $("rDoneWrap").style.display = t === "count" ? "" : "none";
  $("rTotal").placeholder = t === "spot" ? "わかれば（空欄でも可）" : "";
}
$("rType").onchange = function(){ rTypeUI(false); };
function renderLineResults(){
  var q = nfkc($("rLineQ").value).replace(/\s+/g, ""), el = $("rLineRes");
  if(!STN || !q){ el.innerHTML = ""; return; }
  var hits = STN.lines.filter(function(l){ return nfkc(l.n).indexOf(q) >= 0 || nfkc(l.o).indexOf(q) >= 0; }).slice(0, 40);
  el.innerHTML = hits.length ? hits.map(function(l){
    return '<button type="button" class="srow" data-lid="' + l.id + '"><span class="sn"><b>' + esc(l.o + " " + l.n) + "</b><small>" + l.s.length + "駅：" +
      esc(l.s.slice(0, 4).map(function(id){ return STN.st[id][0]; }).join("・")) + (l.s.length > 4 ? "…" : "") + "</small></span></button>";
  }).join("") : '<p class="help">見つかりません。</p>';
  el.querySelectorAll("[data-lid]").forEach(function(b){
    b.onclick = function(){
      var l = STN.lines.filter(function(x){ return x.id === b.getAttribute("data-lid"); })[0];
      editR.line = l; $("rLineSel").textContent = "選んだ路線：" + l.o + " " + l.n + "（" + l.s.length + "駅）"; el.innerHTML = "";
      if(!$("rName").value.trim()) $("rName").value = l.o + " " + l.n;
    };
  });
}
$("rLineQ").addEventListener("input", function(){ clearTimeout(rLineTimer); rLineTimer = setTimeout(function(){ loadStations().then(renderLineResults).catch(function(){}); }, 150); });
$("formRally").addEventListener("submit", function(e){
  e.preventDefault();
  var n = $("rName").value.trim(), t = $("rType").value;
  if(!n){ $("rMsg").textContent = "ラリーの名前を入れてください"; return; }
  if(editR.id){
    var r = rallyById(editR.id);
    r.n = n; r.note = $("rNote").value.trim(); r.total = $("rTotal").value.trim(); if(r.t === "count") r.done = $("rDone").value.trim(); r.ua = nowIso();
    updateCleared(); save(); $("dlgRally").close(); showRally(r.id); return;
  }
  var rec = {id:"ra" + uid(), n:n, t:t, spots:[], total:$("rTotal").value.trim(), done:t === "count" ? $("rDone").value.trim() : "", note:$("rNote").value.trim(), cleared:"", ca:nowIso(), ua:nowIso()};
  if(t === "line"){
    if(!editR.line){ $("rMsg").textContent = "路線を選んでください"; return; }
    var l = editR.line; rec.line = l.o + " " + l.n;
    rec.spots = l.s.map(function(id){ var s = STN.st[id]; return {k:"st:" + s[1] + "|" + s[0], n:s[0] + "駅", la:s[2], lo:s[3]}; });
  }
  user.rallies.push(rec); updateCleared(); save(); $("dlgRally").close(); showRally(rec.id);
});
$("rDel").onclick = function(){
  if(!editR || !editR.id || !confirm("このラリーを削除しますか？（チェックインの記録は他のラリーのために残ります）")) return;
  var r = rallyById(editR.id); r.del = true; r.ua = nowIso();
  save(); $("dlgRally").close(); closeDetail();
};
function addRallySpot(rid, sp){
  var r = rallyById(rid); if(!r) return;
  if((r.spots || []).some(function(x){ return x.k === sp.k; })){ toast("すでにこのラリーに入っています"); showRally(rid); return; }
  r.spots = (r.spots || []).concat([sp]); r.ua = nowIso();
  updateCleared(); save(); showRally(rid); toast(sp.n + " を追加しました");
}
function toggleChk(k, name){
  var ex = user.tkchk.filter(function(c){ return c.k === k && !c.del; })[0];
  if(ex){ if(!confirm((name || "このスポット") + " のチェックインを取り消しますか？")) return; ex.del = true; ex.ua = nowIso(); }
  else user.tkchk.push({id:"tk" + uid(), k:k, n:name || "", d:curDate(), ca:nowIso(), ua:nowIso()});
  rebuildExtra(); updateCleared(); save(); renderAll();
}
function showRally(id){
  selRally = id; selId = null; selArea = null; selTrip = null; tripReturn = null;
  $("sheet").classList.add("detail"); openSheet(true);
  renderRallyDetail(); drawRally(true);
}
function drawRally(fit){
  if(!mapOK) return;
  if(!rallyLayer) rallyLayer = L.layerGroup().addTo(map);
  rallyLayer.clearLayers();
  var r = selRally && rallyById(selRally); if(!r) return;
  var pts = [];
  (r.spots || []).forEach(function(s){
    if(!isFinite(s.la)) return;
    var on = !!chkMap[s.k]; pts.push([s.la, s.lo]);
    var m = L.circleMarker([s.la, s.lo], {radius:7, color:"#3949AB", weight:2, fillColor:on ? "#3949AB" : "#fff", fillOpacity:1});
    m.on("click", function(){ if(!on && !confirm(s.n + " にチェックインしましたか？")) return; toggleChk(s.k, s.n); });
    rallyLayer.addLayer(m);
  });
  if(fit && pts.length) map.fitBounds(L.latLngBounds(pts), {padding:[40,40], maxZoom:14});
}
function renderRallyDetail(){
  var r = rallyById(selRally), el = $("detail");
  if(!r || r.del){ closeDetail(); return; }
  var p = rallyProg(r), TL = {line:"路線", spot:"スポット", count:"数だけ記録"};
  var h = '<div class="dhead"><h2>' + esc(r.n) + '</h2><button class="btn sm ghost" type="button" id="dClose" aria-label="閉じる">✕</button></div>';
  h += '<div class="dmeta">テクテクライフ・' + TL[r.t] + (r.line ? "（" + esc(r.line) + "）" : "") + "<br><b>" + p.d + " / " + (p.t || "?") + "</b>" + (p.t ? "（" + pct(p.d, p.t) + "%）" : "") +
       (r.cleared ? '・<span style="color:var(--done);font-weight:700">達成 ' + esc(fmtDate(r.cleared)) + "</span>" : "") + (r.note ? "<br>" + esc(r.note) : "") + "</div>";
  h += '<div class="dlinks">';
  if(r.t === "count") h += '<button class="btn sm" type="button" id="rMinus">−1</button><button class="btn sm primary" type="button" id="rPlus">＋1</button>';
  else h += '<button class="btn sm" type="button" id="rAddSt">駅を追加</button><button class="btn sm" type="button" id="rAddMap">地図で追加</button><button class="btn sm" type="button" id="rAddPl">地点から追加</button>';
  h += '<button class="btn sm" type="button" id="rEdit">編集</button></div>';
  if(r.t !== "count"){
    h += '<div class="sect">スポット（' + (r.spots || []).length + "）</div>";
    if(!(r.spots || []).length) h += '<p class="help">まだスポットがありません。上のボタンから追加してください。</p>';
    (r.spots || []).forEach(function(s, i){
      var d = chkMap[s.k];
      h += '<div class="srow"><button type="button" class="chkb' + (d ? " on" : "") + '" data-ck="' + i + '">' + (d ? "✓ " + esc(shortDate(d)) : "未") + '</button>' +
           '<button type="button" class="sn" data-go="' + i + '" style="background:none;border:0;text-align:left;padding:0"><b>' + esc(s.n) + "</b></button>" +
           '<button type="button" class="xbtn" data-rm="' + i + '" aria-label="外す">✕</button></div>';
    });
  }
  el.innerHTML = h;
  $("dClose").onclick = closeDetail;
  $("rEdit").onclick = function(){ openRallyForm(r.id); };
  if(r.t === "count"){
    $("rPlus").onclick = function(){ r.done = String((+r.done || 0) + 1); r.ua = nowIso(); updateCleared(); save(); renderAll(); };
    $("rMinus").onclick = function(){ r.done = String(Math.max(0, (+r.done || 0) - 1)); r.ua = nowIso(); updateCleared(); save(); renderAll(); };
  }else{
    $("rAddSt").onclick = function(){ openStationSearch({mode:"rally", rid:r.id}); };
    $("rAddMap").onclick = function(){ startPick("rallySpot", {rid:r.id}); };
    $("rAddPl").onclick = function(){ openPlacePick(r.id); };
  }
  el.querySelectorAll("[data-ck]").forEach(function(b){ b.onclick = function(){ var s = r.spots[+b.getAttribute("data-ck")]; toggleChk(s.k, s.n); }; });
  el.querySelectorAll("[data-go]").forEach(function(b){ b.onclick = function(){ var s = r.spots[+b.getAttribute("data-go")]; if(mapOK && isFinite(s.la)) map.setView([s.la, s.lo], Math.max(map.getZoom(), 14)); }; });
  el.querySelectorAll("[data-rm]").forEach(function(b){ b.onclick = function(){
    var s = r.spots[+b.getAttribute("data-rm")]; if(!confirm(s.n + " をこのラリーから外しますか？")) return;
    r.spots = r.spots.filter(function(x){ return x !== s; }); r.ua = nowIso(); updateCleared(); save(); renderAll();
  }; });
  drawRally(false);
}
var ppRid = null, ppTimer = null;
function openPlacePick(rid){ ppRid = rid; $("ppQ").value = ""; $("ppRes").innerHTML = ""; $("dlgPlacePick").showModal(); setTimeout(function(){ $("ppQ").focus(); }, 60); }
$("ppQ").addEventListener("input", function(){ clearTimeout(ppTimer); ppTimer = setTimeout(function(){
  var q = nfkc($("ppQ").value).replace(/\s+/g, ""), el = $("ppRes");
  if(!q){ el.innerHTML = ""; return; }
  var hits = PLACES.filter(function(p){ return nfkc(p.n).replace(/\s+/g, "").indexOf(q) >= 0; }).slice(0, 40);
  el.innerHTML = hits.length ? hits.map(function(p){ return '<button type="button" class="srow" data-pp="' + esc(p.id) + '"><span class="sn"><b>' + esc(p.n) + "</b><small>" + esc(p.p || "") + "</small></span></button>"; }).join("") : '<p class="help">見つかりません。</p>';
  el.querySelectorAll("[data-pp]").forEach(function(b){ b.onclick = function(){
    var p = byId[b.getAttribute("data-pp")]; $("dlgPlacePick").close();
    addRallySpot(ppRid, {k:"pl:" + p.id, n:p.n, la:p.la, lo:p.lo});
  }; });
}, 150); });
function renderProgTeku(){
  var el = $("progTeku"); el.innerHTML = "";
  var list = liveRallies().slice().sort(function(a,b){ var pa = rallyProg(a), pb = rallyProg(b); return (pct(pb.d, pb.t) - pct(pa.d, pa.t)) || a.n.localeCompare(b.n, "ja"); });
  var done = list.filter(function(r){ return r.cleared; }).length;
  var top = document.createElement("div"); top.className = "help";
  top.innerHTML = "ラリー " + list.length + " 件・達成 " + done + " 件";
  el.appendChild(top);
  list.forEach(function(r){
    var p = rallyProg(r);
    var row = pgRow(r.n, {d:p.d, t:p.t}, "#3949AB", r.cleared ? "sum" : "", function(){ $("dlgProg").close(); showRally(r.id); });
    row.querySelector(".pn").style.width = "auto"; row.querySelector(".pn").style.flex = "1 1 40%";
    el.appendChild(row);
  });
  var b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.style.marginTop = "12px"; b.textContent = "新しいラリー";
  b.onclick = function(){ $("dlgProg").close(); openRallyForm(null); };
  el.appendChild(b);
}
function renderProgStamp(body){
  var live = user.stamps.filter(function(s){ return !s.del; });
  live.sort(function(a,b){ return ((parseInt(a.bk,10)||0) - (parseInt(b.bk,10)||0)) || ((parseInt(a.pg,10)||0) - (parseInt(b.pg,10)||0)) || (a.d || "").localeCompare(b.d || ""); });
  var h = '<p class="help">スタンプ ' + live.length + " 個。スタンプ帳の冊・ページ順に並べています。行を押すと場所を開きます。</p>", lastBk = null;
  live.forEach(function(s, i){
    if(s.bk !== lastBk){ h += '<div class="pg-h">' + esc(s.bk ? s.bk + "冊目" : "冊の指定なし") + "</div>"; lastBk = s.bk; }
    var p = byId[s.pid];
    h += '<button type="button" class="titem" data-si="' + i + '" style="--c:#827717"><span class="dot"></span><span><span class="bk">' + esc(s.pg ? "p." + s.pg : "") + "</span>" +
         esc((s.n || "（名前なし）") + (p ? "（" + p.n + "）" : "")) + "</span></button>";
  });
  body.innerHTML = h;
  body.querySelectorAll("[data-si]").forEach(function(b){ b.onclick = function(){ var s = live[+b.getAttribute("data-si")]; $("dlgProg").close(); if(byId[s.pid]) select(s.pid, true); }; });
}


/* ================= 取得一覧（取ったもの1つずつ） ================= */
var LIST_CATS = [["", "種類: すべて"], ["me","道の駅（4種すべて）"], ["me:stamp","道の駅 スタンプ"], ["me:kippu","道の駅 きっぷ"], ["me:card","道の駅 カード"], ["me:shitei","道の駅 指定券"],
  ["hw","ハイウェイスタンプ"], ["pf","ポケふた"], ["rt","国道ステッカー"], ["mh","マンホールカード"], ["et","エキタグ"],
  ["gm","指定ごみ袋"], ["yu","ゆるキャラグッズ"], ["sp","街中のスタンプ"], ["cu","その他"]];
var listLimitL = 200;
function acquiredItems(){
  var items = [], first = {};
  user.visits.filter(function(v){ return !v.del; }).sort(function(a,b){ return (a.d || "").localeCompare(b.d || ""); }).forEach(function(v){
    Object.keys(v.g || {}).forEach(function(t){
      if(t === "pf" && !(v.ph && v.ph.length)) return;     // ポケふたは写真付きで取得
      var key = isR(t) ? t : v.pid + "|" + t;
      var it = first[key];
      if(!it){ it = first[key] = {kind:"v", t:t, pid:v.pid, d:v.d, n:0, nos:[]}; items.push(it); }
      it.n++; var no = v.g[t] && v.g[t].no; if(no) it.nos.push(no);
    });
  });
  user.gomi.forEach(function(g){ if(!g.del) items.push({kind:"g", g:g, aid:g.aid, d:g.d}); });
  user.yuru.forEach(function(y){ if(!y.del) items.push({kind:"y", y:y, pid:y.pid, aid:y.aid, d:y.d}); });
  (user.stamps || []).forEach(function(x){ if(!x.del) items.push({kind:"s", s:x, pid:x.pid, d:x.d}); });
  return items;
}
function itemInfo(it){
  var p = it.pid ? byId[it.pid] : null, a = it.aid ? areaById(it.aid) : null;
  var pref = p ? prefOf(p) : (a && BIDX ? (areaPrefs(a)[0] || "") : "");
  if(it.kind === "v"){
    var g = grp(it.t);
    return {cat: g === "me" ? "me:" + it.t : g, color: (GROUPS[g] || GROUPS.cu).color, pref: pref, where: p ? p.n : "（削除された地点）",
      label: tLabel(it.t) + (it.nos.length ? "（No." + it.nos.join(", ") + "）" : "") + (it.n > 1 ? "・" + it.n + "回" : "")};
  }
  if(it.kind === "g") return {cat:"gm", color:GROUPS.gm.color, pref:pref, where:a ? a.n : "エリア", label:"ゴミ袋 " + [it.g.t, it.g.s, it.g.col].filter(Boolean).join("・")};
  if(it.kind === "y") return {cat:"yu", color:GROUPS.yu.color, pref:pref, where:p ? p.n : (a ? a.n : ""), label:"ゆるキャラ " + [it.y.ch, it.y.it].filter(Boolean).join("・")};
  return {cat:"sp", color:GROUPS.sp.color, pref:pref, where:p ? p.n : "", label:"スタンプ " + (it.s.n || "（名前なし）") + (bkLabel(it.s) ? "（" + bkLabel(it.s) + "）" : "")};
}
function catMatch(cat, c){ return !c || cat === c || (c === "me" && cat.indexOf("me:") === 0); }
function initListUI(){
  if($("lCat").options.length) return;
  LIST_CATS.forEach(function(o){ var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; $("lCat").appendChild(op); });
  var ps = makeSelect("都道府県", prefOptions("場所: 全国"), function(){});
  $("lPref").innerHTML = ps.innerHTML;
  ["lCat","lPref","lSort"].forEach(function(id){ $(id).onchange = function(){ listLimitL = 200; renderProgList(); }; });
  var tm = null; $("lQ").oninput = function(){ clearTimeout(tm); tm = setTimeout(function(){ listLimitL = 200; renderProgList(); }, 150); };
}
function renderProgList(){
  initListUI();
  var cat = $("lCat").value, pf = $("lPref").value, sort = $("lSort").value;
  var q = nfkc($("lQ").value).toLowerCase().replace(/\s+/g, "");
  var all = acquiredItems();
  all.forEach(function(it){ it.info = itemInfo(it); });
  var list = all.filter(function(it){
    if(!catMatch(it.info.cat, cat) || !prefMatch(it.info.pref, pf)) return false;
    return !q || nfkc(it.info.label + it.info.where + it.info.pref).toLowerCase().replace(/\s+/g, "").indexOf(q) >= 0;
  });
  list.sort(function(a,b){
    if(sort === "name") return a.info.label.localeCompare(b.info.label, "ja") || a.info.where.localeCompare(b.info.where, "ja");
    var c = (a.d || "").localeCompare(b.d || "");
    return sort === "old" ? c : -c;
  });
  $("lSum").textContent = list.length + " 件" + (list.length !== all.length ? "（全 " + all.length + " 件中）" : "") +
    "。同じものを何度も取った場合は、最初に取った日で1件にまとめています。";
  var el = $("lBody"); el.innerHTML = "";
  if(!list.length){ el.innerHTML = '<p class="help">条件に合うものはありません。</p>'; return; }
  var frag = document.createDocumentFragment();
  list.slice(0, listLimitL).forEach(function(it){
    var b = document.createElement("button"); b.type = "button"; b.className = "litem"; b.style.setProperty("--c", it.info.color);
    b.innerHTML = '<span class="dot"></span><span class="lb">' + esc(it.info.label) + "<small>" + esc([it.info.where, it.info.pref].filter(Boolean).join("・")) +
      '</small></span><span class="ld">' + esc(fmtDate(it.d)) + "</span>";
    b.onclick = function(){
      $("dlgProg").close();
      if(it.pid && byId[it.pid]) select(it.pid, true); else if(it.aid && areaById(it.aid)) selectArea(it.aid, true);
    };
    frag.appendChild(b);
  });
  el.appendChild(frag);
  if(list.length > listLimitL){
    var m = document.createElement("button"); m.type = "button"; m.className = "btn more";
    m.textContent = "さらに表示（残り " + (list.length - listLimitL) + " 件）";
    m.onclick = function(){ listLimitL += 200; renderProgList(); };
    el.appendChild(m);
  }
}
/* ================= 配線 ================= */
document.addEventListener("click", function(e){
  var t = e.target;
  if(t && t.hasAttribute && t.hasAttribute("data-close")){
    var d = t.closest("dialog"); if(d) d.close();
  }
});
$("btnMenu").onclick = function(){ $("ioOut").style.display = "none"; ioMsg("", false); showTlStat(); $("dlgMenu").showModal(); };
$("btnProg").onclick = openProg;
$("btnLoc").onclick = toggleLocate;
$("btnFit").onclick = function(){ fitPlaces(_vis); };
$("handle").onclick = function(){
  if($("sheet").classList.contains("detail") && $("sheet").classList.contains("open")){ closeDetail(); return; }
  openSheet(!$("sheet").classList.contains("open"));
};
$("search").oninput = function(){ filt.q = this.value; listLimit = 100; renderAll(); };
$("aboutData").innerHTML = "地点データの出典：道の駅＝国土数値情報（道の駅）・OpenStreetMap 由来の公開データ／ハイウェイスタンプ＝NEXCO東日本・中日本・西日本 公式一覧／国道ステッカー＝国道ステッカー公式 番号別販売店リスト（一部店舗の位置はGoogleマップで補完）／ポケふた＝公開トラッカーデータ。マンホールカード＝mhcard-map（MIT License, Copyright (c) 2026 akh）を加工、元の情報は下水道広報プラットホーム（GKP）・各自治体の公式ページ／自治体境界＝国土交通省 国土数値情報（行政区域）2021年を加工（smartnews-smri/japan-topography）。駅（テクテクライフの路線・エキタグの駅検索）＝国土交通省 国土数値情報（駅別乗降客数データ）2025年度版を加工。地図 &copy; OpenStreetMap contributors。";

/* ================= 起動 ================= */
load();
rebuildPlaces(); rebuildGot();
initMap();
renderAll();
fetch("data.json", {cache:"no-cache"}).then(function(r){ return r.json(); }).then(function(d){
  var base = d.places || [];
  return fetch("mc.json", {cache:"no-cache"}).then(function(r){ return r.json(); }).catch(function(){ return null; }).then(function(mc){
    MCI = (mc && mc.cards) || {};
    MASTER = base.concat((mc && mc.places) || []);
  });
}).then(function(){
  rebuildPlaces(); rebuildGot(); renderAll();
  loadIndex().then(renderAll).catch(function(){});
}).catch(function(){
  $("list").innerHTML = '<p class="empty">地点データを読み込めませんでした。<br>通信のある場所で一度開いてください。</p>';
});
if("serviceWorker" in navigator){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
}
if(navigator.storage && navigator.storage.persist){ navigator.storage.persist().catch(function(){}); }

// テスト用フック
window.__cm = {user:function(){ return user; }, places:function(){ return PLACES; }, got:function(){ return got; },
  importText:importText, quickToggle:quickToggle, select:select, tally:tally, visible:function(){ return _vis; }, filt:filt,
  map:function(){ return map; }, pick:function(){ return pick; }, bidx:function(){ return BIDX; }, bnd:function(){ return BND; },
  loadPref:loadPref, togglePickFeature:togglePickFeature, pickAction:pickAction, onMapClickPick:onMapClickPick,
  areaLayer:function(){ return areaLayer; }, exportJson:exportJson, selectArea:selectArea,
  openAddMenu:openAddMenu, openNames:openNames, refreshNames:refreshNames,
  parseTrack:parseTrack, findCandidates:findCandidates, showTrip:showTrip, openCandidates:openCandidates, getTrack:getTrack,
  buildMediaZip:buildMediaZip, importMediaZip:importMediaZip, zipRead:zipRead, idbAll:idbAll, idbDel:idbDel, curDate:curDate,
  pend:function(){ return pendPf; }, renderProgList:renderProgList, acquiredItems:acquiredItems, prefOf:prefOf, loadStations:loadStations, registerEkitag:registerEkitag, openStamp:openStamp, showRally:showRally,
  openRallyForm:openRallyForm, toggleChk:toggleChk, chk:function(){ return chkMap; }, rallyProg:rallyProg, stn:function(){ return STN; }, trk:function(){ return TRK; }, openVisit:openVisit, importTimeline:importTimeline, fire:function(ev, ll){ map.fire(ev, {latlng:L.latLng(ll[0], ll[1])}); }};
})();
