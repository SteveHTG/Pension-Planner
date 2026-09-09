/* 4350 Pension Planner - UI */
(function () {
  'use strict';

  const C = window.PensionCalc;
  const KEY = 'pp4350.v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------- formatting ----------
  const money = (n, d) => (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const money0 = n => money(n, 0);
  const pct = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
  const parseMoney = s => { const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : ''; };
  const fmtIn = v => (v === '' || v == null) ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const svcText = years => { const s = C.splitYears(years || 0); return plural(s.wholeYears, 'yr') + ' ' + s.remMonths + ' mo'; };
  const yrsShort = years => { const s = C.splitYears(years || 0); return s.remMonths ? s.wholeYears + 'y ' + s.remMonths + 'm' : s.wholeYears + ' yrs'; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const longDate = d => d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

  // ---------- state ----------
  function blankEarning() {
    return { label: '', labelAuto: true, amount: '', open: false, builder: { stub: blankStub() } };
  }
  function blankStub() { return { rate: '', incRate: 0, otHours: '', gross: '', lines: {}, extras: [], imported: null }; }
  function defaultState() {
    return {
      hireDate: '', targetDate: '', useManual: false, manualYears: '',
      earnings: [blankEarning(), blankEarning(), blankEarning(), blankEarning(), blankEarning()],
      dropYears: 8, currentPay: '', scenarios: [],
      proj: { baseIndex: -1, raisePct: 3 },
      settings: Object.assign({}, C.DEFAULTS),
      includeMonthly: false, tab: 'earnings', openYears: { 1: true }, introSeen: false,
    };
  }
  function load() {
    const d = defaultState();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const s = JSON.parse(raw);
      const out = Object.assign(d, s);
      out.settings = Object.assign({}, C.DEFAULTS, s.settings || {});
      out.earnings = (Array.isArray(s.earnings) ? s.earnings : []).slice(0, 5).map(e => {
        const b = blankEarning();
        const merged = Object.assign(b, e, { builder: Object.assign(b.builder, e && e.builder ? e.builder : {}) });
        merged.builder.stub = Object.assign(blankStub(), merged.builder.stub || {});
        if (!merged.builder.stub.lines || typeof merged.builder.stub.lines !== 'object') merged.builder.stub.lines = {};
        return merged;
      });
      while (out.earnings.length < 5) out.earnings.push(blankEarning());
      out.scenarios = (Array.isArray(s.scenarios) ? s.scenarios : []).slice(0, 3);
      out.proj = Object.assign({ baseIndex: -1, raisePct: 3 }, s.proj || {});
      out.openYears = s.openYears || { 1: true };
      return out;
    } catch (e) { return d; }
  }
  // ?demo=<scene> loads sample data for the help screenshots. Nothing is saved in demo mode.
  const DEMO = new URLSearchParams(location.search).get('demo');
  function save() { if (DEMO) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }

  let state = DEMO ? demoState(DEMO) : load();

  function demoState(scene) {
    const s = defaultState();
    s.introSeen = true; s.hireDate = '2009-03-15'; s.targetDate = '2031-03-01'; s.dropYears = 8; s.tab = 'earnings';
    const stub = {
      rate: 40.5, incRate: 6.11, otHours: '', gross: 125055.36, extras: [],
      lines: { regular: 84000, vacation: 9500, sick: 5000, holiday: 3200, holwork: 4200, adminlv: 0, jury: 0, ot: 6500, woc: 2000, special: 300, retro: 0, paramedic: 11000, trttech: 2000, trtteam: 1500, surface: 750 },
      imported: { name: 'Dec 2025 pay stub.pdf', year: 2025, periodEnd: { month: 12, day: 14, year: 2025 }, matched: 12, rate: 40.5, excluded: [{ code: 'LUMP SUM', ytd: 100 }, { code: 'UNIFORMS', ytd: 205.36 }], partial: false },
    };
    const withStub = (row, imported) => {
      row.label = '2025'; row.labelAuto = false;
      row.builder.stub = JSON.parse(JSON.stringify(stub));
      if (!imported) { row.builder.stub.imported = null; row.builder.stub.lines = {}; row.builder.stub.rate = ''; row.builder.stub.gross = ''; return; }
      const out = C.buildFromStub(row.builder.stub, s.settings);
      row.amount = Math.round(out.total * 100) / 100; row.source = 'stub'; row.meta = 'through 12/14/2025';
    };
    if (scene === 'stub') { withStub(s.earnings[0], false); s.earnings[0].open = true; }
    if (scene === 'stub-done') { withStub(s.earnings[0], true); s.earnings[0].open = true; }
    if (scene === 'project' || scene === 'counted' || scene === 'drop' || scene === 'pension') {
      withStub(s.earnings[0], true);
      s.proj.baseIndex = 0;
      if (scene !== 'project') {
        const base = C.buildFromStub(s.earnings[0].builder.stub, s.settings);
        s.earnings.push(blankEarning());
        [2030, 2029, 2028, 2027, 2026].forEach((y, k) => {
          const r = s.earnings[k + 1];
          r.label = String(y); r.labelAuto = false;
          r.amount = Math.round(C.projectPay({ raised: base.raisedPortion, flat: base.flatPortion }, 2025, y, 3).amount * 100) / 100;
          r.source = 'projected'; r.meta = 'from 2025, incentives held flat';
        });
      }
      if (scene === 'drop') s.tab = 'drop';
      if (scene === 'pension') s.tab = 'pension';
    }
    return s;
  }
  function applyDemoScene() {
    if (!DEMO) return;
    document.body.classList.add('demo');
    const targets = {
      dates: '#hireDate', stub: '#erow-0 .file-btn', 'stub-done': '#erow-0 [data-import-result]', project: '#projectBox',
      counted: '#earningsRows', drop: '#dropYears', pension: '.hero',
    };
    const focus = { dates: '.panel.active .card', stub: '#erow-0 .import-box', 'stub-done': '#erow-0 .import-box', project: '#projectBox', counted: '#earningsRows', drop: '#dropYears', pension: '.panel.active .hero' };
    const hl = $(targets[DEMO]);
    if (hl) hl.classList.add('demo-hl');
    const f = $(focus[DEMO]);
    if (f) f.scrollIntoView({ block: DEMO === 'dates' || DEMO === 'pension' ? 'start' : 'center' });
    if (DEMO === 'dates' || DEMO === 'pension') window.scrollTo(0, 0);
  }
  let computed = null;

  // ---------- derived ----------
  function serviceYears() {
    if (state.useManual) return Math.max(0, C.num(state.manualYears));
    return C.creditedService(state.hireDate, state.targetDate).years;
  }
  function dropStart() {
    const t = C.parseDate(state.targetDate);
    if (t) return new Date(t.getFullYear(), t.getMonth(), 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  function currentPayValue() {
    if (state.currentPay !== '' && C.num(state.currentPay) > 0) return C.num(state.currentPay);
    return C.num(state.earnings[0].amount);
  }
  function compute() {
    const years = serviceYears();
    const pension = C.pension({ years, earnings: state.earnings.map(e => e.amount) }, state.settings);
    const start = dropStart();
    const drop = C.dropSchedule({ monthlyBenefit: pension.monthly, years: state.dropYears, startDate: start }, state.settings);
    const bump = C.takeHomeBump(currentPayValue(), state.settings.contribRatePct);
    computed = { years, pension, drop, start, bump };
    return computed;
  }

  // ---------- tabs ----------
  const TAB_NAMES = { earnings: 'Earnings', pension: 'Pension', drop: 'DROP', compare: 'Compare', settings: 'Settings' };
  function showTab(name, opts) {
    if (!TAB_NAMES[name]) name = 'earnings';
    state.tab = name; save();
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    $('#topbarSub').textContent = TAB_NAMES[name];
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
  }

  // ---------- intro / help ----------
  function showIntro() {
    const el = $('#intro');
    el.hidden = false;
    document.body.classList.add('intro-open');
    $('.intro-body', el).scrollTop = 0;
    setTimeout(() => { const b = $('.intro-foot .btn', el); if (b) b.focus({ preventScroll: true }); }, 50);
  }
  function hideIntro() {
    $('#intro').hidden = true;
    document.body.classList.remove('intro-open');
    if (!state.introSeen) { state.introSeen = true; save(); }
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- money input binding ----------
  function bindMoney(input, get, set, after) {
    input.value = fmtIn(get());
    input.addEventListener('input', () => { set(parseMoney(input.value)); save(); after && after(); });
    input.addEventListener('blur', () => { input.value = fmtIn(get()); });
    input.addEventListener('focus', () => { const v = get(); input.value = v === '' ? '' : String(v); input.select && setTimeout(() => input.select(), 0); });
  }

  // =========================================================
  // EARNINGS
  // =========================================================
  // Auto-labelled rows get the most recent years before the DROP date that no other row already uses.
  function refreshAutoLabels() {
    const t = C.parseDate(state.targetDate);
    const recent = t ? (t.getMonth() >= 6 ? t.getFullYear() : t.getFullYear() - 1) : null;
    const taken = new Set(state.earnings.filter(e => !e.labelAuto && e.label).map(e => String(e.label).trim()));
    let y = recent;
    state.earnings.forEach((e, i) => {
      if (!e.labelAuto) return;
      let label = '';
      if (recent != null) {
        while (taken.has(String(y))) y--;
        label = String(y); taken.add(label); y--;
      }
      e.label = label;
      const inp = $('#erow-' + i + ' .label-in');
      if (inp && document.activeElement !== inp) inp.value = e.label;
    });
  }

  function addYearRow() {
    if (state.earnings.length >= 10) { toast('The plan looks at your last 10 years'); return; }
    state.earnings.push(blankEarning());
    save(); buildEarningsRows(); update();
  }
  function removeYearRow(i) {
    if (state.earnings.length <= 5) return;
    state.earnings.splice(i, 1);
    if (state.proj.baseIndex === i) state.proj.baseIndex = -1;
    else if (state.proj.baseIndex > i) state.proj.baseIndex -= 1;
    save(); buildEarningsRows(); update();
  }

  function buildEarningsRows() {
    const wrap = $('#earningsRows');
    wrap.innerHTML = '';
    state.earnings.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'erow'; row.id = 'erow-' + i;
      row.innerHTML =
        '<div class="erow-main">' +
          '<span class="erow-idx">' + (i + 1) + '</span>' +
          '<input class="label-in" type="text" aria-label="Year" placeholder="Year ' + (i + 1) + '">' +
          '<div class="money"><span class="cur">$</span><input class="amount-in" type="text" inputmode="decimal" placeholder="' + (i === 0 ? 'Most recent year' : '0') + '" aria-label="Annual pay ' + (i + 1) + '"></div>' +
          '<button class="chip build-toggle" type="button">Pay stub</button>' +
        '</div>' +
        '<div class="erow-meta" hidden></div>' +
        '<div class="builder" hidden></div>';
      wrap.appendChild(row);

      const labelIn = $('.label-in', row);
      labelIn.value = e.label || '';
      labelIn.addEventListener('input', () => { e.label = labelIn.value; e.labelAuto = labelIn.value.trim() === ''; if (e.labelAuto) refreshAutoLabels(); save(); renderProjection(); });
      labelIn.addEventListener('blur', () => { if (e.labelAuto) labelIn.value = e.label; });

      // Once a row has pay in it, its year label stays put even if other rows are relabelled.
      bindMoney($('.amount-in', row), () => e.amount, v => { e.amount = v; e.source = 'manual'; e.meta = ''; if (v !== '' && e.labelAuto && e.label) e.labelAuto = false; }, update);
      renderRowMeta(i);

      const toggle = $('.build-toggle', row);
      const builder = $('.builder', row);
      toggle.classList.toggle('on', !!e.open);
      builder.hidden = !e.open;
      if (e.open) renderBuilder(i);
      toggle.addEventListener('click', () => {
        e.open = !e.open; save();
        toggle.classList.toggle('on', e.open);
        builder.hidden = !e.open;
        if (e.open) renderBuilder(i);
      });
    });
  }

  function renderBuilder(i) {
    const host = $('#erow-' + i + ' .builder');
    host.innerHTML = '<div class="builder-panel"></div>';
    renderStubForm(i);
  }

  function renderRowMeta(i) {
    const e = state.earnings[i];
    const row = $('#erow-' + i);
    const el = row && $('.erow-meta', row);
    if (!el) return;
    const counted = C.topFiveIndexes(state.earnings.map(x => x.amount));
    const has = C.num(e.amount) > 0;
    const isCounted = counted.indexOf(i) >= 0;
    row.classList.toggle('counted', isCounted);
    row.classList.toggle('uncounted', has && !isCounted);
    let h = '';
    if (e.source === 'stub') h += '<span class="tag tag-stub">Pay stub</span><span>' + esc(e.meta || '') + '</span>';
    else if (e.source === 'projected') h += '<span class="tag tag-proj">Projected</span><span>' + esc(e.meta || '') + '</span>';
    if (has && !isCounted) h += '<span class="tag tag-out">Not in your top 5</span>';
    if (state.earnings.length > 5) h += '<button class="chip row-remove" type="button" aria-label="Remove this year">Remove</button>';
    el.hidden = !h;
    el.innerHTML = h;
    const rm = $('.row-remove', el);
    if (rm) rm.addEventListener('click', () => removeYearRow(i));
  }

  // ----- from pay stub -----
  function renderStubForm(i) {
    const e = state.earnings[i];
    const st = e.builder.stub;
    const host = $('#erow-' + i + ' .builder .builder-panel');
    const ok = !!(st.imported && !st.imported.error);
    const groups = [
      { id: 'pay', title: 'Regular pay and paid leave' },
      { id: 'ot', title: 'Overtime' },
      { id: 'inc', title: 'Incentives' },
      { id: 'other', title: 'Other pay' },
    ];
    const rowHtml = c =>
      '<label class="stub-row"><span class="stub-code"><span class="code">' + c.code + '</span><span class="stub-label">' + c.label + '</span></span>' +
      '<span class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-line="' + c.id + '" placeholder="0" aria-label="' + c.label + ' year to date"></span></label>';
    host.innerHTML =
      '<div class="import-box">' +
        '<div class="import-title">Upload the last pay stub of the year</div>' +
        '<p class="hint">Download the PDF stub from the payroll portal and pick it here. It is read right on your phone or computer and never sent anywhere.</p>' +
        '<label class="btn btn-primary btn-block file-btn"><input type="file" accept="application/pdf,.pdf" data-file>' +
          '<svg viewBox="0 0 24 24" class="btn-ico"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v3h16v-3"/></svg>' + (ok ? 'Upload a different stub' : 'Choose pay stub PDF') + '</label>' +
        '<div class="import-status" data-import-status></div>' +
        '<div data-import-result>' + importResultHtml(st) + '</div>' +
      '</div>' +
      '<details class="adv review"' + (ok ? '' : ' open') + '><summary>' + (ok ? 'Review or edit the lines we read' : 'Or type the YTD lines yourself') + '</summary>' +
        '<div class="grid-2" style="margin-top:10px">' +
          '<label class="field"><span>Hourly rate (RATE on the REGULAR line)</span><div class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-s="rate" placeholder="0.00"></div></label>' +
          '<label class="field"><span>Overtime hours this year</span><input type="text" inputmode="decimal" data-s="otHours" placeholder="Blank = estimate from OT pay"></label>' +
        '</div>' +
        groups.map(g => '<div class="stub-group"><div class="stub-group-title">' + g.title + '</div>' + C.STUB_CODES.filter(c => c.group === g.id).map(rowHtml).join('') + '</div>').join('') +
        '<label class="field" style="margin-top:12px"><span>Gross pay YTD (optional, from ADVICE TOTALS, to check nothing was missed)</span><div class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-s="gross" placeholder="0"></div></label>' +
      '</details>' +
      '<div class="ot-check" data-ot-check></div>' +
      '<div class="build-summary"><dl class="kv-list" data-summary></dl></div>' +
      '<button class="btn btn-primary btn-block" type="button" data-use style="margin-top:12px">Use this total</button>';

    $('[data-file]', host).addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (f) importStubFile(i, f);
      ev.target.value = '';
    });
    $$('[data-extra]', host).forEach(cb => cb.addEventListener('change', () => {
      const x = st.extras[+cb.dataset.extra];
      if (x) { x.include = cb.checked; save(); renderStubOut(i); }
    }));
    bindMoney($('[data-s="rate"]', host), () => st.rate, v => { st.rate = v; }, () => renderStubOut(i));
    bindMoney($('[data-s="gross"]', host), () => st.gross, v => { st.gross = v; }, () => renderStubOut(i));
    const oh = $('[data-s="otHours"]', host);
    oh.value = st.otHours;
    oh.addEventListener('input', () => { st.otHours = oh.value.trim() === '' ? '' : parseMoney(oh.value); save(); renderStubOut(i); });
    $$('[data-line]', host).forEach(inp => {
      const id = inp.dataset.line;
      bindMoney(inp, () => (st.lines[id] == null ? '' : st.lines[id]), v => { st.lines[id] = v; }, () => renderStubOut(i));
    });
    $('[data-use]', host).addEventListener('click', () => {
      const out = C.buildFromStub(st, state.settings);
      e.amount = Math.round(out.total * 100) / 100;
      if (e.source !== 'stub') { e.source = 'manual'; e.meta = ''; }
      $('#erow-' + i + ' .amount-in').value = fmtIn(e.amount);
      save(); update();
      toast((e.label || 'Year ' + (i + 1)) + ' set to ' + money0(e.amount));
    });
    renderStubOut(i);
  }

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function importResultHtml(st) {
    const imp = st.imported;
    if (!imp) return '';
    if (imp.error) return '<div class="import-result err">' + esc(imp.error) + '</div>';
    const pe = imp.periodEnd;
    const when = pe ? ' · pay period ending ' + pe.month + '/' + pe.day + '/' + pe.year : '';
    let h = '<div class="import-result ok">✓ Read <strong>' + esc(imp.name) + '</strong>' + when + '. ' + plural(imp.matched, 'pay line') + ' filled' + (imp.rate ? ', hourly rate ' + money(imp.rate) : '') + '.';
    if (imp.partial && pe) h += '<span class="warn-line">⚠ This stub is from ' + MONTH_NAMES[pe.month - 1] + ', so the YTD figures cover only part of the year. Use the last stub of the year when you have it.</span>';
    if (imp.excluded && imp.excluded.length) h += '<span class="sub">Not counted (not pensionable): ' + imp.excluded.map(x => esc(x.code) + ' ' + money(x.ytd)).join(', ') + '</span>';
    if (st.extras && st.extras.length) {
      h += '<span class="sub">Lines the app did not recognize. Tick any that are pensionable pay:</span>' +
        st.extras.map((x, k) => '<label class="extra-line check"><input type="checkbox" data-extra="' + k + '"' + (x.include ? ' checked' : '') + '><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span><span class="code">' + esc(x.code) + '</span><span class="amt">' + money(x.amount) + '</span></label>').join('');
    }
    return h + '</div>';
  }

  function renderStubOut(i) {
    const st = state.earnings[i].builder.stub;
    const host = $('#erow-' + i + ' .builder .builder-panel');
    if (!host) return;
    const out = C.buildFromStub(st, state.settings);
    $('[data-ot-check]', host).innerHTML = otCheckHtml(out.ot, out.regularRate);
    let sum =
      '<div><dt>Pay entered</dt><dd>' + money(out.subtotal) + '</dd></div>' +
      (out.incentiveTotal ? '<div><dt>of which incentives (held flat in projections)</dt><dd>' + money(out.incentiveTotal) + '</dd></div>' : '') +
      (out.extrasTotal ? '<div><dt>Other lines you included</dt><dd>' + money(out.extrasTotal) + '</dd></div>' : '');
    if (out.ot.excludedPay > 0) sum += '<div><dt>Overtime over the cap (removed)</dt><dd>−' + money(out.ot.excludedPay) + '</dd></div>';
    sum += '<div class="total"><dt>Pensionable total</dt><dd>' + money(out.total) + '</dd></div>';
    if (out.unaccounted != null) {
      const diff = out.unaccounted;
      sum += '<div><dt>' + (diff >= -0.005 ? 'Not counted (' + C.STUB_EXCLUDED.join(', ').toLowerCase() + ')' : 'Entered more than gross, check your numbers') + '</dt><dd>' + money(Math.abs(diff)) + '</dd></div>';
    }
    $('[data-summary]', host).innerHTML = sum;
  }

  // ----- PDF import (runs entirely in the browser) -----
  let pdfJsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfJsPromise) {
      pdfJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/pdf.min.js';
        s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js'; resolve(window.pdfjsLib); } catch (e) { reject(e); } };
        s.onerror = () => { pdfJsPromise = null; reject(new Error('The PDF reader could not be loaded. Check your connection once and try again.')); };
        document.head.appendChild(s);
      });
    }
    return pdfJsPromise;
  }

  // Returns the PDF as visual rows of text, left to right, top to bottom.
  async function extractPdfRows(file) {
    const lib = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter(it => it.str && it.str.trim())
        .map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      let cur = null;
      items.forEach(it => {
        if (!cur || Math.abs(cur.y - it.y) > 2.5) { cur = { y: it.y, items: [] }; rows.push(cur); }
        cur.items.push(it);
      });
    }
    return rows.map(r => r.items.sort((a, b) => a.x - b.x).map(x => x.s).join(' '));
  }

  async function importStubFile(i, file) {
    const e = state.earnings[i];
    const st = e.builder.stub;
    const status = $('#erow-' + i + ' [data-import-status]');
    const isPdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
    try {
      if (!isPdf) throw new Error('Photos and screenshots are not supported yet. Download the PDF pay stub from the payroll portal and upload that.');
      if (status) status.textContent = 'Reading your stub…';
      const rows = await extractPdfRows(file);
      const parsed = C.parseStubRows(rows);
      if (!parsed.matched.length) throw new Error('No earnings lines were found in that PDF. Make sure it is a City of Clermont pay stub PDF, not a scan or a photo.');
      st.lines = Object.assign({}, parsed.lines);
      st.rate = parsed.rate || '';
      st.incRate = parsed.incRate || 0;
      st.gross = parsed.grossYtd || '';
      st.otHours = '';
      st.extras = parsed.unmatched.map(x => ({ code: x.code, amount: x.ytd, include: false }));
      st.imported = { name: file.name, year: parsed.year, periodEnd: parsed.periodEnd, matched: parsed.matched.length, rate: parsed.rate, excluded: parsed.excluded, partial: parsed.partialYear };
      if (parsed.year) { e.label = String(parsed.year); e.labelAuto = false; }
      const out = C.buildFromStub(st, state.settings);
      e.amount = Math.round(out.total * 100) / 100;
      e.source = 'stub';
      e.meta = parsed.periodEnd ? 'through ' + parsed.periodEnd.month + '/' + parsed.periodEnd.day + '/' + parsed.periodEnd.year : '';
      save(); buildEarningsRows(); update();
      toast((parsed.year || 'Year') + ' filled from your stub: ' + money0(e.amount));
    } catch (err) {
      st.imported = { error: (err && err.message) ? err.message : 'That file could not be read.' };
      save(); buildEarningsRows(); update();
    }
  }

  // ----- projection -----
  function rowYear(e) { const y = parseInt(String(e.label || '').trim(), 10); return Number.isFinite(y) && y > 1900 ? y : null; }
  function projCandidates() {
    return state.earnings
      .map((e, i) => ({ i, e, year: rowYear(e), amount: C.num(e.amount) }))
      .filter(c => c.year && c.amount > 0 && c.e.source !== 'projected');
  }
  function projBaseParts(e) {
    if (e.source === 'stub' && e.builder && e.builder.stub) {
      const out = C.buildFromStub(e.builder.stub, state.settings);
      return { raised: out.raisedPortion, flat: out.flatPortion, split: true };
    }
    return { raised: C.num(e.amount), flat: 0, split: false };
  }
  function projTargets(base) {
    return state.earnings
      .map((e, i) => ({ i, e, year: rowYear(e) }))
      .filter(t => t.year && t.year > base.year && t.i !== base.i && t.e.source !== 'stub')
      .sort((a, b) => a.year - b.year);
  }
  function renderProjection() {
    const sel = $('#projBase'), prev = $('#projPreview'), btn = $('#projFill'), note = $('#projRulesNote');
    if (!sel) return;
    $('#projRaisesBadge').textContent = Object.keys(C.CONTRACT_RAISES).map(y => y + ' +' + C.CONTRACT_RAISES[y] + '%').join(' · ');
    const cands = projCandidates();
    if (!cands.length) {
      sel.innerHTML = '<option value="">Add a year with pay first</option>'; sel.disabled = true; btn.disabled = true; prev.innerHTML = '';
      note.textContent = C.projectionRulesText(state.proj.raisePct);
      return;
    }
    sel.disabled = false;
    let baseIdx = state.proj.baseIndex;
    if (!cands.some(c => c.i === baseIdx)) {
      const stubs = cands.filter(c => c.e.source === 'stub');
      baseIdx = (stubs.length ? stubs : cands).slice().sort((a, b) => b.year - a.year)[0].i;
      state.proj.baseIndex = baseIdx;
    }
    sel.innerHTML = cands.map(c => '<option value="' + c.i + '"' + (c.i === baseIdx ? ' selected' : '') + '>' + c.year + ' · ' + money0(c.amount) + (c.e.source === 'stub' ? ' (pay stub)' : '') + '</option>').join('');
    const base = cands.find(c => c.i === baseIdx);
    const parts = projBaseParts(base.e);
    const targets = projTargets(base);
    if (!targets.length) {
      prev.innerHTML = '<div class="proj-empty">No later years to fill. Rows labeled with a year after ' + base.year + ' will be projected.</div>';
      btn.disabled = true;
    } else {
      btn.disabled = false;
      prev.innerHTML = targets.map(t => {
        const r = C.projectPay(parts, base.year, t.year, state.proj.raisePct);
        const last = r.steps[r.steps.length - 1];
        return '<div class="proj-chip ' + last.source + '"><small>' + t.year + ' · ' + last.source + ' +' + last.pct + '%</small><strong>' + money0(r.amount) + '</strong></div>';
      }).join('');
    }
    note.textContent = C.projectionRulesText(state.proj.raisePct) + (parts.split ? '' : ' The start year has no pay stub breakdown, so the raise is applied to the whole amount, incentives included.');
  }
  function fillProjection() {
    const cands = projCandidates();
    const base = cands.find(c => c.i === state.proj.baseIndex);
    if (!base) return;
    const parts = projBaseParts(base.e);
    const targets = projTargets(base);
    targets.forEach(t => {
      const r = C.projectPay(parts, base.year, t.year, state.proj.raisePct);
      t.e.amount = Math.round(r.amount * 100) / 100;
      t.e.source = 'projected';
      t.e.meta = 'from ' + base.year + (parts.split ? ', incentives held flat' : '');
    });
    save(); buildEarningsRows(); update();
    toast(targets.length ? 'Filled ' + plural(targets.length, 'year') + ' from ' + base.year : 'Nothing to fill');
  }

  function otCheckHtml(ot, rate) {
    const cap = ot.cap;
    if (ot.otPay <= 0 && ot.hours <= 0) return '<div class="ot-line muted">No overtime entered. The plan counts up to ' + cap + ' overtime hours a year.</div>';
    if (ot.hours <= 0) return '<div class="ot-line warn">⚠ Enter your hourly rate or your overtime hours so the ' + cap + '-hour cap can be checked.</div>';
    const hrs = ot.hours.toLocaleString('en-US', { maximumFractionDigits: 1 });
    const how = ot.estimated ? 'estimated from ' + money(ot.otPay) + ' ÷ ' + money(ot.otRate) + '/hr OT rate' : 'entered';
    if (!ot.over) return '<div class="ot-line ok">✓ <strong>' + hrs + ' OT hours</strong> (' + how + '). Under the ' + cap + '-hour cap, so all of it counts.</div>';
    return '<div class="ot-line warn">⚠ <strong>' + hrs + ' OT hours</strong> (' + how + '). That is <strong>' + ot.overHours.toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' hours over</strong> the ' + cap + '-hour cap. <strong>' + money(ot.excludedPay) + '</strong> of overtime is not pensionable and has been removed from the total.</div>';
  }


  function renderEarnings() {
    const { years, pension } = computed;
    const badge = $('#serviceBadge');
    badge.textContent = svcText(years);
    state.earnings.forEach((e, i) => renderRowMeta(i));
    const withPay = state.earnings.filter(e => C.num(e.amount) > 0).length;
    $('#countedBadge').textContent = pension.yearsUsed + ' of ' + withPay + ' counted';
    $('#addYear').disabled = state.earnings.length >= 10;
    $('#afcAnnual').textContent = money(pension.afcAnnual);
    $('#afcMonthly').textContent = money(pension.afcMonthly);
    $('#afcNote').textContent = pension.yearsUsed === 0 ? 'enter your earnings above' : pension.yearsUsed < 5 ? 'average of ' + pension.yearsUsed + ' year' + (pension.yearsUsed === 1 ? '' : 's') + ' entered' : 'best 5 years';
    const hint = $('#eligHint');
    if (years > 0 && years < 20) {
      hint.hidden = false;
      hint.textContent = 'Normal retirement, and DROP entry, requires 20 years of service or age 55 with 10 years. You would have ' + svcText(years) + ' on that date.';
    } else hint.hidden = true;
  }

  // =========================================================
  // PENSION
  // =========================================================
  function renderPension() {
    const { years, pension } = computed;
    const s = state.settings;
    $('#penMonthly').textContent = money(pension.monthly);
    $('#penAnnual').textContent = money(pension.annual);
    $('#penPct').textContent = pct(pension.pct);
    $('#penBar').style.width = Math.min(100, pension.pct / s.capPct * 100) + '%';
    $('.bar-mark').style.left = (s.cliffPct / s.capPct * 100) + '%';
    $('.bar-scale').children[1].textContent = s.cliffPct + '% at ' + s.cliffYears + ' yrs';
    $('#penExplain').textContent = years > 0 ? pension.explanation : 'Enter your service and earnings to see the math.';

    const notice = $('#penNotice');
    if (years > 0 && years < 20) {
      notice.hidden = false;
      notice.innerHTML = '<strong>Heads up:</strong> with ' + svcText(years) + ' you would not yet meet normal retirement (20 years, or age 55 with 10 years). The number above is what the formula produces; early retirement reductions are not applied here.';
    } else if (years >= s.cliffYears - 1 && years < s.cliffYears) {
      const need = C.splitYears(s.cliffYears - years);
      notice.hidden = false;
      notice.innerHTML = '<strong>You are close to the jump.</strong> At exactly ' + s.cliffYears + ' years your benefit goes from ' + pct(pension.pct) + ' to ' + s.cliffPct + '%. That is ' + (need.wholeYears ? plural(need.wholeYears, 'year') + ' and ' : '') + plural(need.remMonths, 'month') + ' away from your current date.';
    } else notice.hidden = true;

    $('#calcService').textContent = svcText(years) + ' (' + (Math.round(years * 100) / 100) + ' yrs)';
    $('#calcAfc').textContent = money(pension.afcAnnual) + ' / yr · ' + money(pension.afcMonthly) + ' / mo';
    $('#calcPct').textContent = pct(pension.pct);
    $('#calcMonthly').textContent = money(pension.afcMonthly) + ' × ' + pct(pension.pct) + ' = ' + money(pension.monthly);
    $('#ruleText').textContent = 'Rule: ' + s.multiplierPct + '% of average pay for each year of service. At ' + s.cliffYears + ' years the benefit becomes ' + s.cliffPct + '%, then ' + s.postCliffPct + '% for each year after that, up to ' + s.capPct + '% (reached at ' + C.yearsToCap(s) + ' years).';

    // milestones
    const tb = $('#milestones tbody');
    const rows = [];
    const marks = [20, s.cliffYears, 25, 30, C.yearsToCap(s)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
    const all = [{ y: years, now: true }].concat(marks.filter(m => m > years + 0.01).map(m => ({ y: m })));
    all.forEach(m => {
      const p = C.benefitPct(m.y, s);
      const mo = pension.afcMonthly * p / 100;
      rows.push('<tr' + (m.now ? ' class="now"' : '') + '><td>' + (m.now ? 'Now · ' : '') + yrsShort(m.y) + '</td><td>' + pct(p) + '</td><td class="num">' + money(mo) + '</td><td class="num">' + money0(mo * 12) + '</td></tr>');
    });
    tb.innerHTML = rows.join('');
  }

  // =========================================================
  // DROP
  // =========================================================
  function buildDropSeg() {
    const seg = $('#dropYearsSeg');
    seg.innerHTML = '';
    for (let y = 1; y <= 8; y++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'seg-btn'; b.textContent = y; b.dataset.years = y;
      b.setAttribute('aria-label', plural(y, 'year'));
      b.addEventListener('click', () => { state.dropYears = y; save(); update(); });
      seg.appendChild(b);
    }
  }

  function renderDrop() {
    const { pension, drop, bump } = computed;
    const s = state.settings;
    $$('#dropYearsSeg .seg-btn').forEach(b => b.classList.toggle('on', +b.dataset.years === state.dropYears));
    $('#dropLenBadge').textContent = plural(state.dropYears, 'year');
    $('#dropBenefit').textContent = money(pension.monthly) + ' / mo';
    $('#dropPeriod').textContent = drop.nMonths ? drop.startLabel + ' to ' + drop.endLabel : '—';
    $('#dropRateText').textContent = s.dropRatePct + '% per year, compounded monthly';
    $('#dropFinal').textContent = money(drop.finalBalance);
    $('#dropDeposits').textContent = money(drop.totalDeposits);
    $('#dropInterest').textContent = money(drop.totalInterest);
    $('#dropAfter').innerHTML = pension.monthly > 0
      ? 'After ' + plural(state.dropYears, 'year') + ' you leave with <strong>' + money0(drop.finalBalance) + '</strong> in your DROP account, and your <strong>' + money(pension.monthly) + '</strong> monthly pension starts paying to you directly.'
      : 'Enter your service and earnings on the Earnings tab to see your DROP account grow.';

    const cp = currentPayValue();
    const cpInput = $('#currentPay');
    if (document.activeElement !== cpInput) cpInput.placeholder = state.earnings[0].amount ? fmtIn(state.earnings[0].amount) : '0';
    $('#bumpCheck').textContent = money(bump.perPaycheck);
    $('#bumpMonth').textContent = money(bump.monthly);
    $('#bumpYear').textContent = money(bump.annual);
    $('#bumpNote').textContent = cp > 0
      ? 'That is the ' + s.contribRatePct + '% you no longer contribute on ' + money0(cp) + ' a year' + (state.currentPay === '' ? ' (your most recent year, change it above)' : '') + '. Before taxes.'
      : 'Enter your pay above, or fill in your most recent year on the Earnings tab.';

    // accordion
    const host = $('#dropYears');
    if (!drop.nMonths || pension.monthly <= 0) {
      host.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg><div>Your year-by-year DROP schedule will appear here.</div></div>';
      return;
    }
    host.innerHTML = drop.years.map(y => {
      const open = !!state.openYears[y.index];
      const months = y.months.map(m =>
        '<tr><td>' + m.label + '</td><td class="num">' + money(m.deposit) + '</td><td class="num int">+' + money(m.interest) + '</td><td class="num"><strong>' + money(m.balance) + '</strong></td></tr>').join('');
      return '<div class="acc-item' + (open ? ' open' : '') + '" data-year="' + y.index + '">' +
        '<button class="acc-btn" type="button" aria-expanded="' + open + '">' +
          '<span class="acc-num">Yr ' + y.index + '</span>' +
          '<span class="acc-title"><strong>' + y.startLabel + ' to ' + y.endLabel + '</strong><span>' + money0(y.deposits) + ' deposited</span></span>' +
          '<span class="acc-val"><strong>' + money(y.endBalance) + '</strong><span>+' + money0(y.interest) + ' interest</span></span>' +
          '<svg class="acc-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="acc-body"><div class="acc-inner"><div class="table-wrap"><table class="table">' +
          '<thead><tr><th>Month</th><th class="num">Deposit</th><th class="num">Interest</th><th class="num">Balance</th></tr></thead>' +
          '<tbody>' + months + '</tbody></table></div></div></div>' +
      '</div>';
    }).join('');
    $$('.acc-btn', host).forEach(btn => btn.addEventListener('click', () => {
      const item = btn.parentElement; const y = item.dataset.year;
      const open = !item.classList.contains('open');
      item.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
      if (open) state.openYears[y] = true; else delete state.openYears[y];
      save();
    }));
  }

  // =========================================================
  // COMPARE
  // =========================================================
  const SCN_COLORS = ['#E11A35', '#38bdf8', '#34d399'];

  function addScenario() {
    if (state.scenarios.length >= 3) { toast('You can compare up to three scenarios'); return; }
    const { years, pension } = computed;
    const n = state.scenarios.length + 1;
    state.scenarios.push({
      id: Date.now() + '' + n,
      name: n === 1 ? 'My plan' : 'Scenario ' + n,
      years: Math.round(years * 100) / 100,
      dropYears: state.dropYears,
      afcAnnual: Math.round(pension.afcAnnual * 100) / 100,
    });
    save(); renderCompare(); showTab('compare');
    toast('Scenario added');
  }

  function renderCompare() {
    const host = $('#scenarioCards');
    const addBtn = $('#addScenarioBtn');
    addBtn.disabled = state.scenarios.length >= 3;
    addBtn.textContent = state.scenarios.length >= 3 ? 'Maximum of three scenarios' : '+ Add scenario from my current numbers';
    if (!state.scenarios.length) {
      host.innerHTML = '<div class="card"><div class="empty"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/></svg><div>No scenarios yet. Add one from your current numbers, then change the years, DROP length, or pay to see how it compares.</div></div></div>';
      $('#compareCard').hidden = true;
      return;
    }
    host.innerHTML = state.scenarios.map((sc, i) =>
      '<div class="card scn" data-id="' + sc.id + '">' +
        '<div class="scn-head"><span class="scn-dot" style="color:' + SCN_COLORS[i] + ';background:' + SCN_COLORS[i] + '"></span>' +
          '<input type="text" data-f="name" aria-label="Scenario name" maxlength="24">' +
          '<button class="icon-btn" type="button" data-remove aria-label="Remove scenario"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="grid-3">' +
          '<label class="field"><span>Years of service</span><input type="text" inputmode="decimal" data-f="years"></label>' +
          '<label class="field"><span>Years in DROP</span><select data-f="dropYears">' + [1, 2, 3, 4, 5, 6, 7, 8].map(y => '<option value="' + y + '"' + (sc.dropYears === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></label>' +
          '<label class="field wide"><span>5-year average pay (per year)</span><div class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-f="afcAnnual"></div></label>' +
        '</div>' +
        '<div class="scn-out"><div>Monthly pension<strong data-o="monthly"></strong></div><div>DROP at exit<strong data-o="final"></strong></div></div>' +
      '</div>').join('');

    state.scenarios.forEach(sc => {
      const card = $('.scn[data-id="' + sc.id + '"]', host);
      const nameIn = $('[data-f="name"]', card);
      nameIn.value = sc.name;
      nameIn.addEventListener('input', () => { sc.name = nameIn.value; save(); renderCompareTable(); });
      const yIn = $('[data-f="years"]', card);
      yIn.value = sc.years;
      yIn.addEventListener('input', () => { sc.years = Math.max(0, C.num(yIn.value)); save(); renderCompareTable(); });
      $('[data-f="dropYears"]', card).addEventListener('change', ev => { sc.dropYears = +ev.target.value; save(); renderCompareTable(); });
      bindMoney($('[data-f="afcAnnual"]', card), () => sc.afcAnnual, v => { sc.afcAnnual = v; }, renderCompareTable);
      $('[data-remove]', card).addEventListener('click', () => {
        state.scenarios = state.scenarios.filter(x => x.id !== sc.id); save(); renderCompare();
      });
    });
    renderCompareTable();
  }

  function scenarioResult(sc) {
    const s = state.settings;
    const p = C.benefitPct(sc.years, s);
    const monthly = C.num(sc.afcAnnual) / 12 * p / 100;
    const drop = C.dropSchedule({ monthlyBenefit: monthly, years: sc.dropYears, startDate: dropStart() }, s);
    return { pct: p, monthly, annual: monthly * 12, drop };
  }

  function renderCompareTable() {
    const card = $('#compareCard');
    if (!state.scenarios.length) { card.hidden = true; return; }
    card.hidden = false;
    const res = state.scenarios.map(scenarioResult);
    state.scenarios.forEach((sc, i) => {
      const c = $('.scn[data-id="' + sc.id + '"]');
      if (c) { $('[data-o="monthly"]', c).textContent = money(res[i].monthly); $('[data-o="final"]', c).textContent = money0(res[i].drop.finalBalance); }
    });
    const head = '<thead><tr><th></th>' + state.scenarios.map((sc, i) => '<th><span class="scn-dot" style="display:inline-block;vertical-align:middle;margin-right:6px;width:10px;height:10px;border-radius:50%;background:' + SCN_COLORS[i] + '"></span>' + esc(sc.name || 'Scenario') + '</th>').join('') + '</tr></thead>';
    const row = (label, fn, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td>' + res.map((r, i) => '<td>' + fn(r, state.scenarios[i]) + '</td>').join('') + '</tr>';
    $('#compareTable').innerHTML = head + '<tbody>' +
      row('Years of service', (r, sc) => yrsShort(sc.years)) +
      row('Benefit %', r => pct(r.pct)) +
      row('5-yr average pay', (r, sc) => money0(sc.afcAnnual)) +
      row('Monthly pension', r => money(r.monthly), 'hl') +
      row('Annual pension', r => money0(r.annual)) +
      row('Years in DROP', (r, sc) => plural(sc.dropYears, 'yr')) +
      row('DROP deposits', r => money0(r.drop.totalDeposits)) +
      row('DROP interest', r => money0(r.drop.totalInterest)) +
      row('DROP at exit', r => money0(r.drop.finalBalance), 'hl') +
      row('Pension + DROP over ' + '10 yrs after exit', r => money0(r.drop.finalBalance + r.annual * 10)) +
      '</tbody>';
  }

  // =========================================================
  // SETTINGS
  // =========================================================
  function bindSettings() {
    $$('[data-setting]').forEach(inp => {
      const k = inp.dataset.setting;
      inp.value = state.settings[k];
      inp.addEventListener('input', () => {
        const v = C.num(inp.value);
        if (inp.value.trim() !== '' && Number.isFinite(v)) { state.settings[k] = v; save(); update(); }
      });
      inp.addEventListener('blur', () => { inp.value = state.settings[k]; });
    });
    $$('#timingSeg .seg-btn').forEach(b => b.addEventListener('click', () => { state.settings.depositTiming = b.dataset.timing; save(); update(); }));
    const im = $('#includeMonthly');
    im.checked = !!state.includeMonthly;
    im.addEventListener('change', () => { state.includeMonthly = im.checked; save(); });
  }
  function renderSettings() {
    $$('[data-setting]').forEach(inp => { if (document.activeElement !== inp) inp.value = state.settings[inp.dataset.setting]; });
    $$('#timingSeg .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.timing === (state.settings.depositTiming === 'start' ? 'start' : 'end')));
  }
  function restoreDefaults() {
    state.settings = Object.assign({}, C.DEFAULTS); save(); update(); toast('Plan rates restored');
  }
  function resetAll() {
    if (!confirm('Clear everything you have entered on this device?')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    location.reload();
  }

  // =========================================================
  // EXPORT / PRINT
  // =========================================================
  function buildReport() {
    const { years, pension, drop, bump } = computed;
    const s = state.settings;
    const now = new Date();
    const kv = (k, v) => '<div class="rp-kv"><span>' + k + '</span><strong>' + v + '</strong></div>';
    let h = '';
    h += '<div class="rp-head"><img src="icons/logo-256.png" alt=""><div><h1>4350 Pension Planner</h1><div class="rp-sub">Pension and DROP estimate · Clermont Professional Firefighters, IAFF Local 4350</div></div><div class="rp-date">Prepared ' + longDate(now) + '<br>Estimate only</div></div>';

    h += '<h2>Your inputs</h2><div class="rp-grid">' +
      kv('Hire date', state.useManual ? '—' : longDate(C.parseDate(state.hireDate))) +
      kv('DROP entry / retirement date', longDate(C.parseDate(state.targetDate))) +
      kv('Credited service', svcText(years) + ' (' + (Math.round(years * 100) / 100) + ' yrs)') +
      kv('Years of pay used', pension.yearsUsed + ' of 5') + '</div>';
    const counted = C.topFiveIndexes(state.earnings.map(x => x.amount));
    h += '<h3>Pensionable pay by year (best 5 counted)</h3><table class="rp-table"><thead><tr><th>Year</th><th>Counted</th><th>Pay</th></tr></thead><tbody>' +
      state.earnings.map((e, i) => '<tr><td>' + esc(e.label || ('Year ' + (i + 1))) + (e.source === 'stub' ? ' (pay stub' + (e.meta ? ' ' + esc(e.meta) : '') + ')' : e.source === 'projected' ? ' (projected' + (e.meta ? ' ' + esc(e.meta) : '') + ')' : '') + '</td><td>' + (counted.indexOf(i) >= 0 ? 'Yes' : (C.num(e.amount) > 0 ? 'No' : '')) + '</td><td>' + (e.amount === '' ? '—' : money(C.num(e.amount))) + '</td></tr>').join('') +
      '<tr class="yr"><td>Average of the best ' + pension.yearsUsed + '</td><td></td><td>' + money(pension.afcAnnual) + ' per year · ' + money(pension.afcMonthly) + ' per month</td></tr></tbody></table>' +
      (state.earnings.some(e => e.source === 'projected') ? '<p class="rp-note">' + esc(C.projectionRulesText(state.proj.raisePct)) + '</p>' : '');

    h += '<h2>Pension</h2><div class="rp-big"><div><span>Monthly pension</span><strong>' + money(pension.monthly) + '</strong></div><div><span>Annual pension</span><strong>' + money(pension.annual) + '</strong></div><div><span>Benefit</span><strong>' + pct(pension.pct) + '</strong></div></div>' +
      '<p class="rp-note">' + esc(pension.explanation) + '. Monthly pension = ' + money(pension.afcMonthly) + ' × ' + pct(pension.pct) + '. Normal form of payment: life with 120 payments guaranteed. Optional payment forms are not reflected.</p>';

    h += '<h2>DROP · ' + plural(state.dropYears, 'year') + '</h2>' +
      '<div class="rp-big"><div><span>Account at exit</span><strong>' + money(drop.finalBalance) + '</strong></div><div><span>Deposits</span><strong>' + money(drop.totalDeposits) + '</strong></div><div><span>Interest earned</span><strong>' + money(drop.totalInterest) + '</strong></div></div>' +
      '<p class="rp-note">Frozen benefit of ' + money(pension.monthly) + ' per month deposited from ' + drop.startLabel + ' through ' + drop.endLabel + ', earning ' + s.dropRatePct + '% per year compounded monthly (' + (drop.timing === 'start' ? 'deposit at start of month' : 'deposit at end of month') + '). Contributions stop during DROP: about ' + money(bump.perPaycheck) + ' more per paycheck (' + money0(bump.annual) + ' per year) on ' + money0(currentPayValue()) + ' of pay.</p>';
    h += '<table class="rp-table"><thead><tr><th>Period</th><th>Deposits</th><th>Interest</th><th>Balance</th></tr></thead><tbody>' +
      drop.years.map(y => '<tr class="yr"><td>Year ' + y.index + ' · ' + y.startLabel + ' to ' + y.endLabel + '</td><td>' + money(y.deposits) + '</td><td>' + money(y.interest) + '</td><td>' + money(y.endBalance) + '</td></tr>' +
        (state.includeMonthly ? y.months.map(m => '<tr class="mo"><td>&nbsp;&nbsp;&nbsp;' + m.label + '</td><td>' + money(m.deposit) + '</td><td>' + money(m.interest) + '</td><td>' + money(m.balance) + '</td></tr>').join('') : '')).join('') +
      '</tbody></table>';

    if (state.scenarios.length) {
      const res = state.scenarios.map(scenarioResult);
      const row = (label, fn) => '<tr><td>' + label + '</td>' + res.map((r, i) => '<td>' + fn(r, state.scenarios[i]) + '</td>').join('') + '</tr>';
      h += '<h2 class="' + (state.includeMonthly ? 'rp-break' : '') + '">Scenario comparison</h2><table class="rp-table"><thead><tr><th></th>' + state.scenarios.map(sc => '<th>' + esc(sc.name) + '</th>').join('') + '</tr></thead><tbody>' +
        row('Years of service', (r, sc) => yrsShort(sc.years)) + row('Benefit %', r => pct(r.pct)) + row('5-yr average pay', (r, sc) => money0(sc.afcAnnual)) +
        row('Monthly pension', r => money(r.monthly)) + row('Annual pension', r => money0(r.annual)) + row('Years in DROP', (r, sc) => plural(sc.dropYears, 'yr')) +
        row('DROP deposits', r => money0(r.drop.totalDeposits)) + row('DROP interest', r => money0(r.drop.totalInterest)) + row('DROP at exit', r => money0(r.drop.finalBalance)) +
        '</tbody></table>';
    }

    h += '<h2>Plan rules used</h2><div class="rp-grid">' +
      kv('Multiplier before ' + s.cliffYears + ' years', s.multiplierPct + '% per year') + kv('Benefit at ' + s.cliffYears + ' years', s.cliffPct + '%') +
      kv('Multiplier after ' + s.cliffYears + ' years', s.postCliffPct + '% per year') + kv('Maximum benefit', s.capPct + '%') +
      kv('DROP earnings rate', s.dropRatePct + '% compounded monthly') + kv('Employee contribution', s.contribRatePct + '% (stops in DROP)') + '</div>';
    h += '<div class="rp-foot">This report is an estimate produced by 4350 Pension Planner using the City of Clermont Firefighters\' Retirement Plan Summary Plan Description (Feb 2025) and the 2024 to 2027 collective bargaining agreement. It is not an official benefit statement. Official calculations come from the Plan Administrator, Resource Centers, LLC, 561-624-3277. Where this estimate and the Plan document disagree, the Plan governs.</div>';
    return h;
  }
  function exportPdf() {
    compute();
    $('#report').innerHTML = buildReport();
    toast('Choose "Save as PDF" in the print dialog');
    setTimeout(() => window.print(), 150);
  }

  // =========================================================
  // UPDATE / INIT
  // =========================================================
  function update() {
    compute();
    refreshAutoLabels();
    renderEarnings();
    renderProjection();
    renderPension();
    renderDrop();
    renderSettings();
    renderCompareTable();
  }

  function bindStatic() {
    const hire = $('#hireDate'), target = $('#targetDate'), useManual = $('#useManual'), manual = $('#manualYears');
    hire.value = state.hireDate; target.value = state.targetDate; useManual.checked = !!state.useManual; manual.value = state.manualYears;
    $('#manualWrap').hidden = !state.useManual;
    hire.addEventListener('change', () => { state.hireDate = hire.value; save(); update(); });
    target.addEventListener('change', () => { state.targetDate = target.value; save(); update(); });
    useManual.addEventListener('change', () => { state.useManual = useManual.checked; $('#manualWrap').hidden = !state.useManual; save(); update(); });
    manual.addEventListener('input', () => { state.manualYears = manual.value; save(); update(); });
    bindMoney($('#currentPay'), () => state.currentPay, v => { state.currentPay = v; }, update);
    $('#projBase').addEventListener('change', ev => { state.proj.baseIndex = +ev.target.value; save(); renderProjection(); });
    const pr = $('#projRaise');
    pr.value = state.proj.raisePct;
    pr.addEventListener('input', () => { if (pr.value.trim() !== '') { state.proj.raisePct = C.num(pr.value); save(); renderProjection(); } });
    pr.addEventListener('blur', () => { pr.value = state.proj.raisePct; });
    $('#projFill').addEventListener('click', fillProjection);
    $('#addYear').addEventListener('click', addYearRow);
  }

  function bindGlobal() {
    document.addEventListener('click', ev => {
      const t = ev.target.closest('[data-tab], [data-tab-go], [data-action]');
      if (!t) return;
      if (t.dataset.tab) showTab(t.dataset.tab);
      else if (t.dataset.tabGo) showTab(t.dataset.tabGo);
      else if (t.dataset.action === 'help') showIntro();
      else if (t.dataset.action === 'intro-close') hideIntro();
      else if (t.dataset.action === 'export') exportPdf();
      else if (t.dataset.action === 'compare-current') addScenario();
      else if (t.dataset.action === 'add-scenario') addScenario();
      else if (t.dataset.action === 'restore-defaults') restoreDefaults();
      else if (t.dataset.action === 'reset') resetAll();
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#intro').hidden) hideIntro(); });
    // light haptic tap on supported phones
    document.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'touch' && ev.target.closest('button') && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } }
    }, { passive: true });
  }

  let booted = false;
  function init() {
    bindStatic();
    buildEarningsRows();
    buildDropSeg();
    bindSettings();
    renderCompare();
    update();
    showTab(state.tab, { keepScroll: true });
    if (!booted) { bindGlobal(); booted = true; }
    if (!state.introSeen) showIntro();
    applyDemoScene();
  }

  init();

  // Small debug surface for support and testing (read-only helpers).
  window.PensionPlanner = {
    buildReport: () => { compute(); return buildReport(); },
    getState: () => JSON.parse(JSON.stringify(state)),
    importStub: (i, file) => importStubFile(i, file),
    parseStubRows: rows => C.parseStubRows(rows),
  };

  // Offline support. Skipped on localhost so development reloads always fetch fresh files.
  const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isLocalDev) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ }); });
    // When a new version of the worker takes over, reload once so the fresh files are used.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !navigator.serviceWorker.controller) return;
      refreshing = true; location.reload();
    });
  }
})();
