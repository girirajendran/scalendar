/* =========================================================
   Saturday Calendar — Outlook-style app (month / year / agenda)
   Holiday data is loaded from data/holidays.json, which a weekly GitHub Action
   regenerates from the open-source `holidays` library (scripts/generate_holidays.py).
   ========================================================= */
(() => {
  "use strict";

  /* ---------- Constants ---------- */
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MON = MONTHS.map(m => m.slice(0, 3));
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const DAY3 = DAYS.map(d => d.slice(0, 3));
  const VIEWS = ["month", "year", "agenda"];
  const TYPE = {
    sat: { name: "Saturdays off",       label: "Alternate Saturday off" },
    tn:  { name: "Tamil Nadu holidays", label: "Tamil Nadu public holiday" },
    us:  { name: "US holidays",         label: "US federal holiday" }
  };

  /* ---------- Small helpers ---------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;          // m is 0-based
  const keyD = d => keyOf(d.getFullYear(), d.getMonth(), d.getDate());
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = d => addDays(d, -d.getDay());
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const dayDiff = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
  const fmtLong = d => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const relDays = n => n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`;

  const store = {
    get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  /* ---------- State ---------- */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = keyD(today);
  const state = {
    view: store.get("scal.view", "month"),
    date: new Date(today),
    show: Object.assign({ sat: true, tn: true, us: true }, store.get("scal.filters", {}))
  };
  if (!VIEWS.includes(state.view)) state.view = "month";

  /* ---------- Events ---------- */
  const REF = Date.UTC(2026, 0, 3);           // alternate Saturdays anchored on 3 Jan 2026
  function isOffSaturday(y, m, d){
    if (new Date(y, m, d).getDay() !== 6) return false;
    const weeks = Math.round((Date.UTC(y, m, d) - REF) / 864e5) / 7;
    return ((weeks % 2) + 2) % 2 === 0;
  }
  /* Holiday data: { source, years: { "2026": { tn: [{date, name, estimated?}], us: [...] } } } */
  let DATA = { years: {} };
  let loadState = "loading";                  // loading | ready | error
  const cache = {};
  function yearData(y){
    if (cache[y]) return cache[y];
    const map = {};
    const add = (date, type, name, estimated) => (map[date] ||= []).push({ type, name, estimated: !!estimated });
    for (let m = 0; m < 12; m++)
      for (let d = 1; d <= daysIn(y, m); d++)
        if (isOffSaturday(y, m, d)) add(keyOf(y, m, d), "sat", "Saturday off");
    const yr = DATA.years[y];
    if (yr){
      (yr.tn || []).forEach(h => add(h.date, "tn", h.name, h.estimated));
      (yr.us || []).forEach(h => add(h.date, "us", h.name, h.estimated));
    }
    const result = { map, hasData: !!yr };
    if (loadState !== "loading") cache[y] = result;   // don't cache the empty pre-load result
    return result;
  }
  const label = e => TYPE[e.type].label + (e.estimated ? " · date may change (moon sighting)" : "");
  const allOn = d => yearData(d.getFullYear()).map[keyD(d)] || [];
  const eventsOn = d => allOn(d).filter(e => state.show[e.type]);
  const typesOf = ev => [...new Set(ev.map(e => e.type))];
  const onlySat = () => state.show.sat && !state.show.tn && !state.show.us;
  /* holidays worth listing (Saturdays-off only when nothing else is switched on) */
  const listable = ev => ev.length && (onlySat() || ev.some(e => e.type !== "sat"));

  /* ---------- Routing (#view/yyyy-mm-dd) ---------- */
  function readHash(){
    const m = location.hash.match(/^#(month|year|agenda)(?:\/(\d{4})-(\d{2})-(\d{2}))?$/);
    if (!m) return;
    state.view = m[1];
    if (m[2]) {
      const d = new Date(+m[2], +m[3] - 1, +m[4]);
      if (!isNaN(d)) state.date = d;
    }
  }
  const writeHash = () => history.replaceState(null, "", `#${state.view}/${keyD(state.date)}`);

  /* ---------- Rendering ---------- */
  const viewEl = $("view");

  function render(opts = {}){
    hidePop(); hideTip();
    writeHash();
    store.set("scal.view", state.view);

    document.querySelectorAll(".views button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === state.view));
    const title = rangeTitle();
    $("rangeTitle").innerHTML = title;
    document.title = `${title.replace("<small>", " · ").replace(/<[^>]+>/g, "")} — Saturday Calendar`;

    ({ month: renderMonth, year: renderYear, agenda: renderAgenda })[state.view]();
    renderCalendars(); renderUpcoming();
  }

  function rangeTitle(){
    const d = state.date, y = d.getFullYear();
    switch (state.view){
      case "month": return `${MONTHS[d.getMonth()]} ${y}`;
      case "year": return `${y}`;
      default: return `${y}<small>Agenda</small>`;
    }
  }

  const chip = (e, k) =>
    `<button class="chip ${e.type}" data-pop="${k}" title="${esc(e.name)}">${esc(e.name)}</button>`;

  /* ---- Month ---- */
  function renderMonth(){
    const y = state.date.getFullYear(), m = state.date.getMonth();
    const start = startOfWeek(new Date(y, m, 1));
    const weeks = Math.ceil((new Date(y, m, 1).getDay() + daysIn(y, m)) / 7);
    let cells = "";
    for (let i = 0; i < weeks * 7; i++){
      const d = addDays(start, i), k = keyD(d), ev = eventsOn(d), dow = d.getDay();
      const cls = ["mv-cell",
        d.getMonth() !== m && "out", dow === 0 && "sun", (dow === 0 || dow === 6) && "wkend",
        k === todayKey && "today"].filter(Boolean).join(" ");
      const label = d.getDate() === 1 ? `${d.getDate()} ${MON[d.getMonth()]}` : d.getDate();
      cells += `<div class="${cls}" data-key="${k}">
        <span class="mv-num num">${label}</span>
        ${ev.map(e => chip(e, k)).join("")}
      </div>`;
    }
    viewEl.innerHTML = `<div class="mv">
      <div class="mv-head">${DAYS.map(n => `<div><span class="long">${n}</span><span class="short">${n[0]}</span></div>`).join("")}</div>
      <div class="mv-grid" style="--weeks:${weeks}">${cells}</div>
    </div>`;
  }

  /* ---- Year ---- */
  function renderYear(){
    const y = state.date.getFullYear();
    let html = `<div class="yv">`;
    for (let m = 0; m < 12; m++){
      const first = new Date(y, m, 1).getDay(), total = daysIn(y, m);
      let off = 0, days = "";
      for (let i = 0; i < first; i++) days += `<span class="yd empty"></span>`;
      for (let d = 1; d <= total; d++){
        const date = new Date(y, m, d), k = keyD(date), ev = eventsOn(date), types = typesOf(ev);
        if (ev.length && date.getDay() !== 0) off++;
        const cls = ["yd", date.getDay() === 0 && "sun", k === todayKey && "today", ev.length && "has-event", ...types.map(t => "is-" + t)].filter(Boolean).join(" ");
        days += `<button class="${cls}" data-show="${k}" ${ev.length ? "data-tip" : ""} aria-label="${fmtLong(date)}${ev.length ? ": " + esc(ev.map(e => e.name).join("; ")) : ""}">${d}</button>`;
      }
      for (let i = first + total; i < 42; i++) days += `<span class="yd empty"></span>`;
      const current = y === today.getFullYear() && m === today.getMonth();
      html += `<section class="ym${current ? " current" : ""}">
        <button class="ym-head" data-go="month" data-key="${keyOf(y, m, 1)}" title="Open ${MONTHS[m]}"><span>${MONTHS[m]}</span><span class="cnt">${off ? off + " off" : ""}</span></button>
        <div class="ym-dow">${DAYS.map(n => `<span>${n[0]}</span>`).join("")}</div>
        <div class="ym-days num">${days}</div>
      </section>`;
    }
    viewEl.innerHTML = html + `</div>`;
  }

  /* ---- Agenda ---- */
  function renderAgenda(){
    const y = state.date.getFullYear(), { map } = yearData(y);
    const keys = Object.keys(map).sort().filter(k => listable(map[k].filter(e => state.show[e.type])));

    let sat = 0, tn = 0, us = 0, off = 0;
    Object.keys(map).forEach(k => {
      const ev = map[k].filter(e => state.show[e.type]);
      if (!ev.length || fromKey(k).getDay() === 0) return;
      off++;
      const satOff = ev.some(e => e.type === "sat");
      if (satOff) sat++;
      if (!satOff && ev.some(e => e.type === "tn")) tn++;
      if (!satOff && ev.some(e => e.type === "us")) us++;
    });
    const stats = `<div class="ag-stats">
      <div class="stat"><b>${off}</b><span>Days off (excl. Sundays)</span></div>
      <div class="stat c-sat" style="--c:var(--sat)"><b>${sat}</b><span>Saturdays off</span></div>
      <div class="stat" style="--c:var(--tn)"><b>${tn}</b><span>TN holidays on working days</span></div>
      <div class="stat" style="--c:var(--us)"><b>${us}</b><span>US holidays on working days</span></div>
    </div>`;

    if (!keys.length){
      viewEl.innerHTML = `<div class="ag">${stats}<p class="ag-empty">${Object.values(state.show).some(Boolean) ? "No holidays to show." : "Switch on a calendar in the sidebar to see dates."}</p></div>`;
      return;
    }
    const nextKey = keys.find(k => k >= todayKey);
    let html = "", month = -1, rows = "";
    const flush = () => { if (month >= 0) html += `<h3 class="ag-month"><b>${MONTHS[month]}</b><span>${rows.split('class="ag-row').length - 1}</span></h3>${rows}`; rows = ""; };
    keys.forEach(k => {
      const d = fromKey(k);
      if (d.getMonth() !== month){ flush(); month = d.getMonth(); }
      const ev = map[k].filter(e => state.show[e.type]);
      const named = ev.filter(e => onlySat() || e.type !== "sat");
      const types = typesOf(ev);
      const rel = dayDiff(today, d);
      rows += `<button class="ag-row${k < todayKey ? " past" : ""}${k === todayKey ? " today" : ""}" data-show="${k}">
        <div class="ag-date"><b class="num">${d.getDate()}</b><span>${DAY3[d.getDay()]}</span></div>
        <div class="ag-bars">${types.map(t => `<i style="--c:var(--${t})"></i>`).join("")}</div>
        <div><div class="ag-name">${[...new Set(named.map(e => e.name))].map(esc).join(" · ")}${k === nextKey ? `<span class="next">Next</span>` : ""}</div>
          <div class="ag-meta">${types.map(t => `<span class="tag c-${t}">${TYPE[t].label}</span>`).join("")}</div></div>
        <div class="ag-rel">${relDays(rel)}</div>
      </button>`;
    });
    flush();
    viewEl.innerHTML = `<div class="ag">${stats}${html}</div>`;
    const next = viewEl.querySelector(".ag-row:not(.past)");
    if (next && y === today.getFullYear()) next.scrollIntoView({ block: "center" });
  }

  /* ---------- Sidebar ---------- */

  function renderCalendars(){
    const y = state.date.getFullYear(), { map, hasData } = yearData(y);
    const count = t => Object.values(map).filter(l => l.some(e => e.type === t && !/\(observed\)/.test(e.name))).length;
    ["sat", "tn", "us"].forEach(t => $("c-" + t).textContent = count(t));
    const note = $("tnNote");
    const msg = loadState === "loading" ? "Loading holidays…"
      : loadState === "error" ? "Couldn't load holiday data. Check your connection and refresh the page."
      : !hasData ? `Holiday data for ${y} isn't available yet. It's added automatically as the year gets closer.`
      : "";
    note.hidden = !msg || !(state.show.tn || state.show.us);
    note.classList.toggle("error", loadState === "error");
    note.textContent = msg;
  }

  function renderUpcoming(){
    if (loadState === "loading"){ $("upcoming").innerHTML = `<p class="up-empty">Loading holidays…</p>`; return; }
    const out = [];
    for (let i = 0; i <= 400 && out.length < 5; i++){
      const d = addDays(today, i), ev = eventsOn(d);
      if (listable(ev)) out.push([d, ev]);
    }
    $("upcoming").innerHTML = out.length ? out.map(([d, ev]) => {
      const named = ev.filter(e => onlySat() || e.type !== "sat");
      const main = named[0] || ev[0];
      return `<button class="up" data-show="${keyD(d)}">
        <div class="up-date" style="--c:var(--${main.type})"><div class="m">${MON[d.getMonth()]}</div><div class="dd num">${d.getDate()}</div></div>
        <div><div class="up-name">${[...new Set(named.map(e => e.name))].map(esc).join(" · ")}</div><div class="up-meta">${DAY3[d.getDay()]} · ${relDays(dayDiff(today, d))}</div></div>
      </button>`;
    }).join("") : `<p class="up-empty">Nothing coming up.</p>`;
  }

  /* ---------- Popover (click a chip) ---------- */
  const pop = $("pop");
  function showPop(anchor, k){
    const d = fromKey(k), ev = eventsOn(d);
    if (!ev.length) return;
    pop.innerHTML = `<div class="pop-head"><div><b>${fmtLong(d)}</b><span>${relDays(dayDiff(today, d))}</span></div>
        <button class="icon-btn sm" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="pop-body">${ev.map(e => `<div class="ev-card c-${e.type}"><b>${esc(e.name)}</b><span>${label(e)}</span></div>`).join("")}</div>
      <div class="pop-foot"><button class="link-btn" data-close>Close</button></div>`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + pw > innerWidth - 8) x = innerWidth - pw - 8;
    if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
    pop.style.left = Math.max(8, x) + "px"; pop.style.top = y + "px";
  }
  function hidePop(){ pop.hidden = true; }

  /* ---------- Hover tooltip (year view) ---------- */
  const tip = $("tip");
  function showTip(el){
    const d = fromKey(el.dataset.key), ev = eventsOn(d);
    if (!ev.length) return hideTip();
    tip.innerHTML = `<div class="td">${fmtLong(d)}</div>` + ev.map(e => `<div class="r c-${e.type}"><i></i><span>${esc(e.name)}</span></div>`).join("");
    tip.classList.add("show");
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8)) + "px";
    tip.style.top = (r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8) + "px";
  }
  function hideTip(){ tip.classList.remove("show"); }

  /* ---------- Search ---------- */
  const search = $("search"), results = $("searchResults");
  let hits = [], active = 0;
  function runSearch(){
    const q = search.value.trim().toLowerCase();
    if (q.length < 2){ results.hidden = true; return; }
    const years = [...new Set([today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, state.date.getFullYear()])].sort();
    hits = [];
    years.forEach(y => {
      const { map } = yearData(y);
      Object.keys(map).sort().forEach(k => map[k].forEach(e => {
        if (e.type !== "sat" && e.name.toLowerCase().includes(q)) hits.push({ k, e });
      }));
    });
    // upcoming first, then past (most recent first)
    const up = hits.filter(h => h.k >= todayKey), past = hits.filter(h => h.k < todayKey).reverse();
    hits = [...up, ...past].slice(0, 10);
    active = 0;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    results.innerHTML = hits.length ? hits.map((h, i) => {
      const d = fromKey(h.k);
      return `<button class="sr${i === 0 ? " active" : ""}" data-show="${h.k}" role="option">
        <span class="bar" style="background:var(--${h.e.type})"></span>
        <span class="when">${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}</span>
        <span class="what">${esc(h.e.name).replace(re, "<mark>$1</mark>")}</span>
        <span class="yr">${relDays(dayDiff(today, d))}</span></button>`;
    }).join("") : `<div class="sr-empty">No holidays match “${esc(search.value.trim())}”.</div>`;
    results.hidden = false;
  }
  search.addEventListener("input", runSearch);
  search.addEventListener("focus", runSearch);
  search.addEventListener("keydown", e => {
    const items = results.querySelectorAll(".sr");
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault(); if (!items.length) return;
      items[active]?.classList.remove("active");
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[active].classList.add("active"); items[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter"){
      items[active]?.click();
    } else if (e.key === "Escape"){
      search.value = ""; results.hidden = true; search.blur();
    }
  });

  /* ---------- Navigation ---------- */
  function go(view, date){
    if (view) state.view = view;
    if (date) state.date = date;
    results.hidden = true; search.blur();
    document.body.classList.remove("nav-open");
    render();
  }
  function step(dir){
    const d = new Date(state.date);
    if (state.view === "month"){ const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + dir); d.setDate(Math.min(day, daysIn(d.getFullYear(), d.getMonth()))); }
    else { const day = d.getDate(), m = d.getMonth(); d.setDate(1); d.setFullYear(d.getFullYear() + dir); d.setDate(Math.min(day, daysIn(d.getFullYear(), m))); }
    go(null, d);
  }
  /* open a date: jump to its month, highlight it and show its details */
  function showDate(k){
    go("month", fromKey(k));
    const cell = viewEl.querySelector(`.mv-cell[data-key="${k}"]`);
    if (!cell) return;
    cell.scrollIntoView({ block: "nearest" });
    cell.classList.remove("flash"); void cell.offsetWidth; cell.classList.add("flash");
    setTimeout(() => showPop(cell, k), 80);   // after any scroll from scrollIntoView, which closes popups
  }
  function flashKey(k){
    const el = viewEl.querySelector(`[data-key="${k}"].mv-cell, .yd[data-key="${k}"]`);
    if (el){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }

  /* ---------- Events wiring ---------- */
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-close]")){ hidePop(); return; }
    const chipEl = t.closest("[data-pop]");
    if (chipEl){ e.stopPropagation(); showPop(chipEl, chipEl.dataset.pop); return; }
    const goEl = t.closest("[data-go]");
    if (goEl){ go(goEl.dataset.go, fromKey(goEl.dataset.key)); return; }
    const viewBtn = t.closest("[data-view]");
    if (viewBtn){ go(viewBtn.dataset.view); return; }
    const showEl = t.closest("[data-show]");
    if (showEl){ showDate(showEl.dataset.show); return; }
    if (!t.closest(".pop")) hidePop();
    if (!t.closest(".search")) results.hidden = true;
  });

  viewEl.addEventListener("mouseover", e => { const el = e.target.closest("[data-tip]"); el ? showTip(el) : hideTip(); });
  viewEl.addEventListener("mouseleave", hideTip);
  viewEl.addEventListener("scroll", () => { hidePop(); hideTip(); }, { passive: true, capture: true });

  $("todayBtn").addEventListener("click", () => { go(null, new Date(today)); flashKey(todayKey); });
  $("prevBtn").addEventListener("click", () => step(-1));
  $("nextBtn").addEventListener("click", () => step(1));
  $("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));


  document.querySelectorAll(".cals input").forEach(input => {
    input.checked = !!state.show[input.dataset.key];
    input.addEventListener("change", () => {
      state.show[input.dataset.key] = input.checked;
      store.set("scal.filters", state.show);
      render();
    });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape"){ hidePop(); hideTip(); document.body.classList.remove("nav-open"); return; }
    if (e.target.closest?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { m: "month", y: "year", a: "agenda" };
    if (map[k]) go(map[k]);
    else if (k === "t"){ go(null, new Date(today)); }
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "/"){ e.preventDefault(); search.focus(); }
    else return;
  });

  addEventListener("hashchange", () => { readHash(); render(); });
  addEventListener("resize", () => { hidePop(); hideTip(); });

  $("todayPill").textContent = `Today · ${DAY3[today.getDay()]}, ${today.getDate()} ${MON[today.getMonth()]}`;

  readHash();
  render();                                   // draw straight away (Saturdays only) …
  fetch("data/holidays.json", { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => { DATA = json && json.years ? json : { years: {} }; loadState = "ready"; })
    .catch(err => { console.warn("Holiday data failed to load:", err); loadState = "error"; })
    .finally(() => { for (const k in cache) delete cache[k]; render(); });   // … then redraw with holidays
})();
