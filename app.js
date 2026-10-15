/*
 * Page code for the STEG Bill Estimator.
 * Reads the form, validates it, asks calc.js (window.STEG) for every number and renders the
 * result in the chosen language (i18n.js). No tariff math lives here.
 * Plain classic script (no modules), so it also works when index.html is opened from disk.
 */
(function () {
  'use strict';

  var T = STEG_TARIFFS;
  var S = window.STEG;
  var LANGS = ['ar', 'fr', 'en'];
  var LANG_STORE_KEY = 'steg-estimator-lang';
  var DEFAULT_LANG = 'fr';
  var MAX_MONTHLY_KWH = 5000; // above this, warn (errTooBig) but still estimate
  var DEBOUNCE_MS = 350;
  var CHART_MIN_MAX = 600; // the chart always shows at least 0..600 kWh/month

  /*
   * Customer types. Each available type knows how to estimate, find the cliff, calibrate and
   * list its tiers for the chart. To add non-residential later: fill STEG_TARIFFS.nonResidential,
   * give calc.js the matching functions, set available: true and enable the <option>.
   */
  var CUSTOMER_TYPES = {
    residential: {
      available: true,
      estimate: function (input) { return S.estimate(input, T); },
      cliff: function (input) { return S.cliff(input, T); },
      calibrate: function (last, nextMonths) { return S.calibrate(last, nextMonths, T); },
      vatVerified: function () { return !!T.residential.vat.verified; },
      // Tiers shown on the chart: the economic ones only for homes that can get them (kVA).
      chartTiers: function (kva) {
        var R = T.residential, out = [], start = 0;
        if (kva <= R.economic.maxKva) {
          R.economic.tiers.forEach(function (tr) { out.push({ id: tr.id, price: tr.price, from: start, upTo: tr.upTo }); start = tr.upTo; });
          start = R.economic.maxMonthlyKwh;
        }
        R.normal.tiers.forEach(function (tr) {
          if (tr.upTo !== null && tr.upTo <= start) return; // fully covered by the economic tiers
          out.push({ id: tr.id, price: tr.price, from: start, upTo: tr.upTo });
          start = tr.upTo;
        });
        return out;
      },
      // Colour order of every tier id, cheapest first.
      tierOrder: function () {
        return T.residential.economic.tiers.concat(T.residential.normal.tiers).map(function (tr) { return tr.id; });
      },
    },
    nonResidential: { available: false },
  };

  var lang = DEFAULT_LANG;
  var submitted = false;    // "Estimate my bill" was pressed: show every error
  var calSubmitted = false; // "Compare" was pressed
  var touched = {};         // fields the user has left at least once
  var copyText = '';        // plain-text summary of the current result
  var timer = null;
  var copyTimer = null;

  var MAIN_FIELDS = ['prev', 'curr', 'prev2', 'curr2', 'trackStart', 'trackDate', 'trackNow', 'months', 'start', 'end', 'kvaOther'];
  var TRACK_KEY = 'steg-estimator-track'; // a reading saved on this phone, for people with no old reading
  var CAL_FIELDS = ['calKwh', 'calMonths', 'calKva', 'calPaid'];
  var PAY_FIELDS = ['arrears', 'prepaid']; // money from earlier bills, both optional

  /* ---------------- small helpers ---------------- */

  /** Today as "YYYY-MM-DD" in local time. */
  function todayISO() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /** "2026-10-16" -> "16/10/2026" */
  function niceDate(iso8601) { var x = String(iso8601).split('-'); return x.length === 3 ? x[2] + '/' + x[1] + '/' + x[0] : iso8601; }

  function showTrackStatus(text) { var s = $('track-status'); s.textContent = text; s.hidden = !text; }
  /** A reading saved on this phone fills the first reading; with selectMode it also opens that mode. */
  function loadTrack(selectMode) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { saved = null; }
    var has = !!(saved && isFinite(saved.reading) && /^\d{4}-\d{2}-\d{2}$/.test(saved.date));
    $('trackForget').hidden = !has;
    if (!has) return false;
    $('trackStart').value = String(saved.reading);
    $('trackDate').value = saved.date;
    if (selectMode) { var r = document.querySelector('input[name="readMode"][value="track"]'); if (r) r.checked = true; }
    return true;
  }

  function $(id) { return document.getElementById(id); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function checked(name) {
    var c = document.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : null;
  }

  /** Translate a key, filling {placeholders}; falls back to English, then to the key itself. */
  function t(key, vars) {
    var d = I18N[lang] || {}, s = d[key];
    if (s == null || s === '') s = I18N.en[key];
    if (s == null) s = key;
    if (vars) {
      s = String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    }
    return s;
  }

  /** Keep numbers left-to-right inside Arabic text (so "-5.000" never turns into "5.000-"). */
  function iso(s) { return lang === 'ar' ? '⁦' + s + '⁩' : String(s); }

  /** A number with Western digits and at most `dec` decimals, trailing zeros removed. */
  function fmt(x, dec) {
    var p = Math.pow(10, dec == null ? 3 : dec);
    return String(Math.round(x * p) / p);
  }
  function money(millimes) { return iso(S.dt(millimes)) + ' ' + t('unitDT'); }
  function signedMoney(millimes) { return iso((millimes > 0 ? '+' : '') + S.dt(millimes)) + ' ' + t('unitDT'); }
  /** "2 months", "شهرين", "3 أشهر", "12 شهرًا": the right plural form for the language. */
  function plural(base, n) {
    var cat = 'other';
    try { cat = new Intl.PluralRules(lang).select(n); } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    var dict = I18N[lang] || I18N.en, key = base + '_' + cat;
    if (!(key in dict)) key = base + '_other';
    return t(key, { n: iso(fmt(n, 1)) });
  }
  function monthsText(m) { return plural('months', m); }
  function daysText(d) { return plural('days', d); }

  /** Arabic-Indic digits to 0-9, decimal comma to dot, spaces removed. */
  function normalize(raw) {
    return String(raw)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.')
      .replace(/[\s  ]/g, '')
      .replace(',', '.');
  }

  /** { empty } | { error: key } | { value } */
  function parseNumber(raw) {
    var s = normalize(raw);
    if (s === '') return { empty: true };
    if (/^-(\d+\.?\d*|\.\d+)$/.test(s)) return { error: 'errNegative' };
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { error: 'errNumber' };
    var v = parseFloat(s);
    return isFinite(v) ? { value: v } : { error: 'errNumber' };
  }

  /* ---------------- language ---------------- */

  function detectLang() {
    try {
      var saved = localStorage.getItem(LANG_STORE_KEY);
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) { /* storage blocked: ignore */ }
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i] || '').toLowerCase();
      for (var j = 0; j < LANGS.length; j++) if (code.indexOf(LANGS[j]) === 0) return LANGS[j];
    }
    return DEFAULT_LANG;
  }

  function applyI18n() {
    each(document.querySelectorAll('[data-i18n]'), function (node) {
      var vars = null, raw = node.getAttribute('data-i18n-vars');
      if (raw) { try { vars = JSON.parse(raw); } catch (e) { vars = null; } }
      node.textContent = t(node.getAttribute('data-i18n'), vars);
    });
    each(document.querySelectorAll('[data-i18n-attr]'), function (node) {
      node.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length === 2) node.setAttribute(parts[0].trim(), t(parts[1].trim()));
      });
    });
    document.title = t('metaTitle');
    setMeta('meta[name="description"]', t('metaDescription'));
    setMeta('meta[property="og:title"]', t('metaTitle'));
    setMeta('meta[property="og:description"]', t('metaDescription'));
    $('footer-verified').textContent = t('footerVerified', { date: iso(niceDate(T.lastVerified)) });
    each(document.querySelectorAll('[data-months]'), function (o) { o.textContent = monthsText(Number(o.getAttribute('data-months'))); });
    $('footer-source').setAttribute('href', T.source);
    each(document.querySelectorAll('.lang-btn'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  function setMeta(selector, value) {
    var m = document.querySelector(selector);
    if (m) m.setAttribute('content', value);
  }

  function setLang(l, remember) {
    lang = LANGS.indexOf(l) !== -1 ? l : DEFAULT_LANG;
    var html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    if (remember) { try { localStorage.setItem(LANG_STORE_KEY, lang); } catch (e) { /* ignore */ } }
    applyI18n();
    update();
  }

  /* ---------------- reading + validating ---------------- */

  /*
   * Errors are { key, vars, soft }. A "soft" error (empty required field, current < previous)
   * only shows once the field was left or the button was pressed, so it does not flash while typing.
   */
  function readMain() {
    var errs = {}, warns = {};
    function err(id, key, vars, soft) { errs[id] = { key: key, vars: vars || null, soft: !!soft }; }
    function numField(id) {
      var r = parseNumber($(id).value);
      if (r.empty) { err(id, 'errRequired', null, true); return null; }
      if (r.error) { err(id, r.error); return null; }
      return r.value;
    }

    var meter = checked('meterType');
    var readMode = checked('readMode') || 'both';
    var useSecond = readMode === 'both' && meter === 'digital' && $('has2').checked;

    // billing period (first: a daily use is turned into a whole bill with it)
    var mode = checked('periodMode'), months = null, fromDates = null;
    if (mode === 'dates') {
      var a = $('start').value, b = $('end').value;
      if (!a) err('start', 'errRequired', null, true);
      if (!b) err('end', 'errRequired', null, true);
      if (a && b) {
        var m = S.monthsBetween(a, b);
        if (m === null) err('end', 'errDates');
        else if (m > 12) err('end', 'errDatesTooLong');
        else {
          months = fromDates = m;
          // bills count whole months: a few days still counts as 1 month
          if ((new Date(b) - new Date(a)) / 86400000 < 20) warns.end = { key: 'warnShortPeriod', vars: null };
        }
      }
    } else {
      months = Number($('months').value);
      if (!(months >= 0.5 && months <= 12)) { err('months', 'errMonths'); months = null; }
    }

    // energy used
    var kwh = null, track = null;
    if (readMode === 'track') {
      var tStart = numField('trackStart'), tNow = numField('trackNow'), tDate = $('trackDate').value;
      if (!tDate) err('trackDate', 'errRequired', null, true);
      else if (tDate > todayISO()) { err('trackDate', 'errTrackFuture'); tDate = ''; }
      if (tStart !== null && tNow !== null && tDate && months !== null) {
        var pr = S.projectKwh(tStart, tDate, tNow, todayISO(), months);
        if (!pr) err('trackDate', 'errDates');
        else if (pr.lower) err('trackNow', 'errLower', null, true);
        else if (pr.tooSoon) err('trackNow', 'trackWait');
        else { kwh = pr.projected; track = pr; }
      }
    }
    var prev = readMode === 'both' ? numField('prev') : null, curr = readMode === 'both' ? numField('curr') : null;
    if (prev !== null && curr !== null) {
      kwh = S.consumption(prev, curr);
      if (kwh === null) err('curr', 'errLower', null, true);
    }
    if (useSecond) {
      var prev2 = numField('prev2'), curr2 = numField('curr2'), kwh2 = null;
      if (prev2 !== null && curr2 !== null) {
        kwh2 = S.consumption(prev2, curr2);
        if (kwh2 === null) err('curr2', 'errLower', null, true);
      }
      kwh = kwh !== null && kwh2 !== null ? kwh + kwh2 : null;
    }
    if (kwh !== null) kwh = Math.round(kwh * 1000) / 1000; // drop float noise from decimal readings

    // subscribed power
    var kva = null;
    if ($('kva').value === 'other') {
      var k = parseNumber($('kvaOther').value);
      if (k.empty) err('kvaOther', 'errRequired', null, true);
      else if (k.error) err('kvaOther', k.error);
      else if (k.value < 1 || k.value > 100) err('kvaOther', 'errKva');
      else kva = k.value;
    } else {
      kva = Number($('kva').value);
    }

    // customer type
    var type = $('customer').value;
    var ct = CUSTOMER_TYPES[type];

    var ok = !Object.keys(errs).length && kwh !== null && months !== null && kva !== null && ct && ct.available;
    var input = ok ? { totalKwh: kwh, months: months, kva: kva } : null;
    var est = ok ? ct.estimate(input) : null;
    if (est && est.monthlyKwh > MAX_MONTHLY_KWH) warns[readMode === 'track' ? 'trackNow' : 'curr'] = { key: 'errTooBig', vars: { n: MAX_MONTHLY_KWH } };

    return { valid: !!est, errs: errs, warns: warns, est: est, input: input, ct: ct, fromDates: fromDates, meter: meter, useSecond: useSecond, mode: mode, readMode: readMode, track: track };
  }

  function readCal(main) {
    var errs = {};
    function err(id, key, soft) { errs[id] = { key: key, vars: null, soft: !!soft }; }
    var vals = {};
    CAL_FIELDS.forEach(function (id) {
      var r = parseNumber($(id).value);
      if (r.empty) { err(id, 'errRequired', true); vals[id] = null; }
      else if (r.error) { err(id, r.error); vals[id] = null; }
      else vals[id] = r.value;
    });
    if (vals.calMonths !== null && (vals.calMonths < 0.5 || vals.calMonths > 12)) { err('calMonths', 'errMonths'); vals.calMonths = null; }
    if (vals.calKva !== null && (vals.calKva < 1 || vals.calKva > 100)) { err('calKva', 'errKva'); vals.calKva = null; }

    var result = null;
    if (!Object.keys(errs).length && main.valid && main.ct.calibrate) {
      result = main.ct.calibrate({
        kwh: vals.calKwh, months: vals.calMonths, kva: vals.calKva,
        paid: Math.round(vals.calPaid * 1000), // DT -> millimes
      }, main.est.months);
    }
    return { errs: errs, result: result };
  }

  /** Arrears and previous payments (DT -> millimes); empty boxes count as 0. */
  function readPay() {
    var errs = {}, vals = {};
    PAY_FIELDS.forEach(function (id) {
      var r = parseNumber($(id).value);
      if (r.error) { errs[id] = { key: r.error, vars: null, soft: false }; vals[id] = 0; }
      else vals[id] = r.empty ? 0 : Math.round(r.value * 1000);
    });
    return { errs: errs, arrears: vals.arrears, paid: vals.prepaid, any: vals.arrears > 0 || vals.prepaid > 0 };
  }

  /* ---------------- rendering ---------------- */

  function showMsg(id, msg, kind) {
    var input = $(id), box = $(id + '-err');
    if (!input || !box) return;
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      box.className = 'msg';
      input.removeAttribute('aria-invalid');
      return;
    }
    box.hidden = false;
    box.textContent = msg;
    box.className = 'msg msg-' + kind;
    if (kind === 'error') input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function renderMessages(ids, errs, warns, force) {
    ids.forEach(function (id) {
      var e = errs[id], w = warns && warns[id];
      if (e && (!e.soft || force || touched[id])) showMsg(id, t(e.key, e.vars), 'error');
      else if (w) showMsg(id, t(w.key, w.vars), 'warn');
      else showMsg(id, null);
    });
  }

  function syncVisibility() {
    var digital = checked('meterType') === 'digital';
    $('digital-note').hidden = !digital;
    var track = checked('readMode') === 'track';
    $('both-wrap').hidden = track;
    $('track-wrap').hidden = !track;
    $('digital-second').hidden = !digital || track;
    $('second-block').hidden = !(digital && $('has2').checked);
    var dates = checked('periodMode') === 'dates';
    $('months-wrap').hidden = dates;
    $('dates-wrap').hidden = !dates;
    $('kva-other-wrap').hidden = $('kva').value !== 'other';
  }

  /** One row of the breakdown: used for both the table and the copied text. */
  function row(label, value, cls) { return { label: label, value: value, cls: cls || '' }; }

  function renderResult(main, cal, pay) {
    var box = $('result');
    if (!main.valid) { box.hidden = true; copyText = ''; return; }
    box.hidden = false;

    var est = main.est, tier = est.tier;
    var applied = !!(cal && $('calApply').checked);
    var adjustment = applied ? cal.adjustment : 0;
    var total = est.total + adjustment;

    $('res-total').textContent = money(total);
    var forText = t('resFor', { kwh: iso(fmt(est.totalKwh)), months: monthsText(est.months) });
    $('res-for').textContent = forText;

    var info = main.track ? [
      row(t('rowMeasured'), t('trackMeasured', { kwh: iso(fmt(main.track.used)), days: daysText(main.track.days) })),
      row(t('rowDaily'), iso(main.track.daily.toFixed(1)) + ' ' + t('unitKwh')),
      row(t('rowProjectedKwh'), iso(fmt(est.totalKwh)) + ' ' + t('unitKwh')),
    ] : [
      row(t('rowTotalKwh'), iso(fmt(est.totalKwh)) + ' ' + t('unitKwh')),
    ];
    info.push(
      row(t('rowMonthlyKwh'), iso(est.monthlyKwh.toFixed(1)) + ' ' + t('unitKwhMonth')),
      row(t('rowTier'), t('tier_' + tier.id), 'wrap-ok'),
      row(t('rowPrice'), iso(fmt(tier.price)) + ' ' + t('unitMillimesKwh'))
    );
    var L = est.lines;
    var lines = [
      row(t('rowEnergy'), money(L.energy)),
      row(t('rowPowerFee', { kva: iso(fmt(est.kva)), months: monthsText(est.months) }), money(L.powerFee)),
      row(t('rowSurtax'), money(L.surtax)),
      row(t('rowFte'), est.fteExempt ? t('rowFteExempt') : money(L.fte), est.fteExempt ? 'wrap-ok' : ''),
      row(t('rowRtt'), money(L.rtt)),
      row(t('rowVat', { rate: iso(fmt(est.vatRate * 100, 2)), rate2: iso(fmt(est.vatPowerRate * 100, 2)) }), money(L.vat), 'wrap-ok'),
    ];
    if (applied) lines.push(row(t('rowCalibration'), signedMoney(adjustment), 'row-cal'));
    lines.push(row(t('rowTotal'), money(total), 'row-total'));
    if (est.totalKwh > 0) {
      // with a correction applied, the real cost per kWh includes it
      var perKwh = applied ? total / est.totalKwh : est.perKwh;
      lines.push(row(t('rowPerKwh'), iso(perKwh.toFixed(1)) + ' ' + t('unitMillimesKwh'), 'row-perkwh'));
    }
    // what is left to pay once earlier bills are counted, like the bottom of a STEG bill
    var toPay = $('res-topay');
    toPay.hidden = true;
    if (pay && pay.any) {
      var due = S.amountToPay(total, pay.arrears, pay.paid);
      if (pay.arrears > 0) lines.push(row(t('rowArrears'), signedMoney(pay.arrears), 'row-pay'));
      if (pay.paid > 0) lines.push(row(t('rowPrevious'), signedMoney(-pay.paid), 'row-pay'));
      if (due.credit > 0) {
        lines.push(row(t('rowCredit'), money(due.credit), 'row-topay'));
        toPay.textContent = t('resCredit', { amount: money(due.credit) });
      } else {
        lines.push(row(t('rowToPay'), money(due.due), 'row-pay'));
        lines.push(row(t('rowToPayRounded'), money(due.rounded), 'row-topay'));
        toPay.textContent = t('resToPay', { amount: money(due.rounded) });
      }
      toPay.hidden = false;
    }

    fillRows($('res-info'), info);
    fillRows($('res-money'), lines);
    $('vat-note').hidden = main.ct.vatVerified();
    $('track-note').hidden = !main.track;

    var cliffLines = renderCliff(main);
    renderChart(main);

    copyText = [
      t('copyHeader'),
      t('resTotalLabel') + ': ' + money(total) + ' (' + t('resBadge') + ')',
      forText,
      '',
    ].concat(info.concat(lines).map(function (r) { return r.label + ': ' + r.value; }))
      .concat(cliffLines.length ? [''].concat(cliffLines) : [])
      .concat(['', t('disclaimer')])
      .join('\n');
  }

  function fillRows(tbody, rows) {
    tbody.textContent = '';
    rows.forEach(function (r) {
      var tr = el('tr', r.cls.indexOf('row-') === 0 ? r.cls : '');
      var th = el('th', '', r.label);
      th.setAttribute('scope', 'row');
      var td = el('td', r.cls === 'wrap-ok' ? 'wrap-ok' : '', r.value);
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  /** The "price cliff" messages; returns their text for the copied summary. */
  function renderCliff(main) {
    var list = $('cliff-list'), out = [];
    list.textContent = '';
    var c = main.ct.cliff(main.input);
    if (!c) return out;
    function item(cls, icon, text) {
      var li = el('li', cls);
      var i = el('span', 'cliff-icon', icon);
      i.setAttribute('aria-hidden', 'true');
      li.appendChild(i);
      li.appendChild(el('span', '', text));
      list.appendChild(li);
      out.push(text);
    }
    if (c.up) {
      item('cliff-up', '▲', t('cliffUp', {
        kwh: iso(String(Math.ceil(c.up.kwhPerMonth))),
        price: iso(fmt(c.up.tier.price)),
        extra: iso(S.dt(c.up.extra)),
      }));
    } else {
      item('cliff-top', '■', t('cliffTop'));
    }
    if (c.down) {
      item('cliff-down', '▼', t('cliffDown', {
        kwh: iso(String(Math.ceil(c.down.kwhPerMonth))),
        price: iso(fmt(c.down.tier.price)),
        saved: iso(S.dt(c.down.saved)),
      }));
    }
    return out;
  }

  /** Tier bar: segments + "You" marker, all placed with inset-inline-start so it mirrors in RTL. */
  function renderChart(main) {
    var est = main.est, ct = main.ct;
    var tiers = ct.chartTiers(est.kva), order = ct.tierOrder();
    var monthly = est.monthlyKwh;
    var max = Math.max(est.tier.economic ? 250 : CHART_MIN_MAX, Math.ceil(monthly * 1.08)); // 0..250 makes the 50 / 100 economic tiers readable
    function pct(v) { return Math.max(0, Math.min(100, (v / max) * 100)); }

    var segs = $('chart-segs'), ticks = $('chart-ticks'), legend = $('chart-legend');
    segs.textContent = ''; ticks.textContent = ''; legend.textContent = '';
    var lastTick = -100;

    tiers.forEach(function (tr) {
      if (tr.from >= max) return;
      var start = pct(tr.from), end = pct(tr.upTo === null ? max : tr.upTo);
      var color = 'tier-c' + Math.min(5, Math.max(0, order.indexOf(tr.id)));
      var current = tr.id === est.tier.id;

      var seg = el('div', 'chart-seg ' + color + (current ? ' is-current' : ''), end - start >= 6 ? fmt(tr.price) : '');
      seg.style.setProperty('--x', start + '%');
      seg.style.setProperty('--w', (end - start) + '%');
      segs.appendChild(seg);

      if (start - lastTick >= 7) {
        var tick = el('span', 'chart-tick' + (start === 0 ? ' edge-start' : ''), fmt(tr.from));
        tick.style.setProperty('--x', start + '%');
        ticks.appendChild(tick);
        lastTick = start;
      }

      var li = el('li', current ? 'is-current' : '');
      var mark = el('span', 'mark', current ? '✓' : '');
      mark.setAttribute('aria-hidden', 'true');
      var sw = el('span', 'swatch ' + color);
      sw.setAttribute('aria-hidden', 'true');
      li.appendChild(mark);
      li.appendChild(sw);
      li.appendChild(el('span', '', t('tier_' + tr.id) + ' — ' + iso(fmt(tr.price)) + ' ' + t('unitMillimesKwh')));
      if (current) li.setAttribute('aria-current', 'true');
      legend.appendChild(li);
    });

    var x = pct(monthly);
    var you = $('chart-you'), label = $('chart-you-label');
    you.style.setProperty('--x', x + '%');
    label.textContent = t('chartYou') + ' · ' + iso(monthly.toFixed(1));
    label.className = 'chart-you-label' + (x < 15 ? ' edge-start' : x > 85 ? ' edge-end' : '');
  }

  function renderCalibration(main, cal) {
    var msg = $('cal-msg'), verdict = $('cal-verdict'), wrap = $('calApplyWrap');
    verdict.hidden = true;
    verdict.textContent = '';
    if (!main.valid) {
      msg.textContent = t('calNeedResult');
      wrap.hidden = true;
      return;
    }
    var r = cal.result;
    if (!r) { msg.textContent = ''; wrap.hidden = true; return; }
    msg.textContent = t('calMessage', { paid: iso(S.dt(r.paid)), est: iso(S.dt(r.estimatedLast)), diff: iso((r.diff > 0 ? '+' : '') + S.dt(r.diff)) });
    verdict.hidden = false;
    verdict.textContent = r.big ? t('calBig') : t('calSmall');
    verdict.className = 'cal-verdict' + (r.big ? ' is-big' : '');
    wrap.hidden = false;
  }

  /** Recompute everything from the form. Cheap, so it simply runs on every change. */
  function update() {
    clearTimeout(timer);
    syncVisibility();
    var main = readMain();
    var cal = readCal(main);

    var activeMain = MAIN_FIELDS.filter(function (id) { return !isHidden($(id)); });
    renderMessages(MAIN_FIELDS, filterKeys(main.errs, activeMain), main.warns, submitted);
    renderMessages(CAL_FIELDS, cal.errs, null, calSubmitted);
    var pay = readPay();
    renderMessages(PAY_FIELDS, pay.errs, null, true);

    $('months-computed').textContent = main.fromDates !== null ? t('monthsComputed', { months: monthsText(main.fromDates) }) : '';

    renderCalibration(main, cal);
    renderResult(main, cal.result, pay);
    return main;
  }

  function filterKeys(obj, keep) {
    var out = {};
    keep.forEach(function (k) { if (obj[k]) out[k] = obj[k]; });
    return out;
  }
  function isHidden(node) {
    for (var n = node; n && n !== document.body; n = n.parentElement) if (n.hidden) return true;
    return false;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, DEBOUNCE_MS); }

  function firstErrorField(ids) {
    for (var i = 0; i < ids.length; i++) {
      var f = $(ids[i]);
      if (f && f.getAttribute('aria-invalid') === 'true' && !isHidden(f)) return f;
    }
    return null;
  }

  /* ---------------- copy + print ---------------- */

  function copyToClipboard(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function onCopy() {
    if (!copyText) return;
    var status = $('copy-status');
    copyToClipboard(copyText).then(function (ok) {
      status.textContent = ok ? t('copied') : t('copyFailed');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { status.textContent = ''; }, 3000);
    });
  }

  /* ---------------- events ---------------- */

  function init() {
    loadTrack(true);
    $('trackDate').max = todayISO();
    ['trackStart', 'trackDate'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var s = parseNumber($('trackStart').value), d = $('trackDate').value;
        if (s.empty || s.error || !d || d > todayISO()) return;
        try { localStorage.setItem(TRACK_KEY, JSON.stringify({ reading: s.value, date: d })); } catch (e) { /* storage blocked */ }
        $('trackForget').hidden = false;
      });
    });
    var form = $('form');

    each(document.querySelectorAll('.lang-btn'), function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang'), true); });
    });

    // live: debounced while typing, immediate on change / leaving a field
    [form, $('cal'), $('pay')].forEach(function (scope) {
      scope.addEventListener('input', function (e) {
        if (e.target.type === 'text') schedule(); else update();
      });
      scope.addEventListener('change', update);
      scope.addEventListener('focusout', function (e) {
        if (e.target.id && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
          if (e.target.value !== '' || submitted) touched[e.target.id] = true;
          update();
        }
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitted = true;
      var main = update();
      if (main.valid) {
        var h = $('res-title');
        var smooth = window.matchMedia && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        h.focus({ preventScroll: true });
        h.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      } else {
        var f = firstErrorField(MAIN_FIELDS);
        if (f) f.focus();
      }
    });

    $('clear').addEventListener('click', function () {
      var keepMode = checked('readMode') || 'both';
      form.reset();
      var rm = document.querySelector('input[name="readMode"][value="' + keepMode + '"]'); if (rm) rm.checked = true;
      submitted = false;
      MAIN_FIELDS.forEach(function (id) { delete touched[id]; });
      loadTrack(false); // a reading saved on this phone survives Clear
      update();
      $(keepMode === 'track' ? 'trackNow' : 'prev').focus();
    });

    $('trackSave').addEventListener('click', function () {
      var r = parseNumber($('trackNow').value);
      if (r.empty || r.error) { showTrackStatus(t('trackNeedNow')); $('trackNow').focus(); return; }
      var oldStart = parseNumber($('trackStart').value), oldDate = $('trackDate').value;
      if (!oldStart.empty && !oldStart.error && oldDate && oldDate !== todayISO() &&
          !window.confirm(t('trackReplaceConfirm', { kwh: fmt(oldStart.value), date: niceDate(oldDate) }))) return;
      var saved = { reading: r.value, date: todayISO() };
      try { localStorage.setItem(TRACK_KEY, JSON.stringify(saved)); } catch (e) { /* storage blocked: still fill the fields */ }
      $('trackForget').hidden = false;
      $('trackStart').value = String(saved.reading);
      $('trackDate').value = saved.date;
      $('trackNow').value = '';
      delete touched.trackNow;
      update();
      showTrackStatus(t('trackSaved', { kwh: iso(fmt(saved.reading)), date: iso(niceDate(saved.date)) }));
    });
    $('trackForget').addEventListener('click', function () {
      try { localStorage.removeItem(TRACK_KEY); } catch (e) { /* ignore */ }
      $('trackStart').value = ''; $('trackDate').value = ''; $('trackNow').value = '';
      ['trackStart', 'trackDate', 'trackNow'].forEach(function (id) { delete touched[id]; });
      update();
      $('trackForget').hidden = true;
      showTrackStatus(t('trackForgotten'));
    });

    $('calCompare').addEventListener('click', function () {
      calSubmitted = true;
      update();
      var f = firstErrorField(CAL_FIELDS);
      if (f) f.focus();
    });

    $('copy').addEventListener('click', onCopy);
    $('print').addEventListener('click', function () { window.print(); });

    // the browser may restore field values when going back to the page
    window.addEventListener('pageshow', function () { update(); });

    setLang(detectLang(), false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// Phone: the estimated total follows you down the page until the result itself is on screen.
(function () {
  var bar = document.getElementById('totalbar'), result = document.getElementById('result');
  var total = document.getElementById('res-total'), value = document.getElementById('totalbar-value');
  if (!bar || !result || !total || !value) return;
  var resultOnScreen = false;
  function sync() {
    var has = !result.hidden && total.textContent.trim() !== '';
    value.textContent = total.textContent;
    var show = has && !resultOnScreen;
    bar.hidden = !show;
    document.body.classList.toggle('has-totalbar', show);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { resultOnScreen = entries[0].isIntersecting; sync(); }, { threshold: 0.12 }).observe(result);
  }
  new MutationObserver(sync).observe(result, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true, characterData: true });
  document.getElementById('totalbar-go').addEventListener('click', function () {
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    result.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    var title = document.getElementById('res-title'); if (title) title.focus({ preventScroll: true });
  });
  sync();
})();
