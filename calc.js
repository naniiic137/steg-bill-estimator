/*
 * The bill calculation: pure functions, no page code, so they can be tested with Node (test.js).
 * All money is in millimes (integers); the page turns it into DT with 3 decimals.
 */
(function (root) {
  'use strict';

  /**
   * Months between two dates, counted in WHOLE months like STEG does
   * (a real bill: 26/12 to 20/04 = 115 days, billed as 4 months). At least 1.
   */
  function monthsBetween(start, end) {
    var a = new Date(start), b = new Date(end);
    if (isNaN(a) || isNaN(b) || b <= a) return null;
    var days = Math.round((b - a) / 86400000);
    return Math.max(1, Math.round(days / 30.4));
  }

  /** kWh between two readings; null when a reading is missing or the current one is lower. */
  function consumption(previous, current) {
    if (!isFinite(previous) || !isFinite(current)) return null;
    if (current < previous) return null;
    return current - previous;
  }

  /** The tier list that applies, and whether it's the economic one. */
  function tierSet(monthlyKwh, kva, T) {
    var eco = T.residential.economic;
    var economic = kva <= eco.maxKva && monthlyKwh <= eco.maxMonthlyKwh;
    return { economic: economic, tiers: economic ? eco.tiers : T.residential.normal.tiers };
  }

  /** The tier reached by the monthly kWh (its price applies to ALL kWh of the bill). */
  function findTier(monthlyKwh, kva, T) {
    var set = tierSet(monthlyKwh, kva, T);
    for (var i = 0; i < set.tiers.length; i++) {
      var t = set.tiers[i];
      if (t.upTo === null || monthlyKwh <= t.upTo) {
        return { id: t.id, price: t.price, upTo: t.upTo, from: i === 0 ? 0 : set.tiers[i - 1].upTo, index: i, economic: set.economic, tiers: set.tiers };
      }
    }
    return null;
  }

  function vatRate(monthlyKwh, T) {
    var rules = T.residential.vat.energyRules;
    for (var i = 0; i < rules.length; i++) if (rules[i].maxMonthlyKwh === null || monthlyKwh <= rules[i].maxMonthlyKwh) return rules[i].rate;
    return 0;
  }

  /** Radio and TV contribution for a bill of `months` months (millimes). */
  function rtt(totalKwh, months, r) {
    return Math.round(Math.min(r.perKwh * totalKwh, r.capPerMonth * months) + Math.min(r.extraPerKwh * Math.max(0, totalKwh - r.extraAbovePerMonth * months), r.extraCapPerMonth * months));
  }

  /**
   * Estimate a residential bill.
   * input: { totalKwh, months, kva }  ->  every line in millimes, plus the tier used.
   */
  function estimate(input, T) {
    var totalKwh = Number(input.totalKwh), months = Number(input.months), kva = Number(input.kva);
    if (!(totalKwh >= 0) || !(months > 0) || !(kva > 0)) return null;
    var R = T.residential;
    var monthlyKwh = totalKwh / months;
    var tier = findTier(monthlyKwh, kva, T);
    var lines = {
      energy: Math.round(totalKwh * tier.price),
      powerFee: Math.round(kva * R.powerFeePerKvaMonth * months),
      surtax: Math.round(totalKwh * R.municipalSurtaxPerKwh),
      fte: monthlyKwh <= R.fte.exemptUpToMonthlyKwh ? 0 : Math.round(totalKwh * R.fte.perKwh),
      rtt: rtt(totalKwh, months, R.rtt),
    };
    var rate = vatRate(monthlyKwh, T), rate2 = R.vat.powerFeeRate;
    lines.vat = Math.round(lines.energy * rate + lines.powerFee * rate2);
    var total = lines.energy + lines.powerFee + lines.surtax + lines.fte + lines.rtt + lines.vat;
    return {
      totalKwh: totalKwh, months: months, kva: kva, monthlyKwh: monthlyKwh,
      tier: tier, vatRate: rate, vatPowerRate: rate2, fteExempt: lines.fte === 0 && totalKwh > 0, lines: lines, total: total,
      perKwh: totalKwh > 0 ? total / totalKwh : null, // millimes per kWh, everything included
    };
  }

  /**
   * The "cliff": how far the user is from the next tier up and the one below.
   * up:   kWh per month left before the next (pricier) tier, and the bill if they went just over it.
   * down: kWh per month to cut to drop to the cheaper tier, and the bill there.
   */
  function cliff(input, T) {
    var cur = estimate(input, T); if (!cur) return null;
    var t = cur.tier, out = { current: cur, up: null, down: null };
    var m = cur.months, kva = cur.kva, step = 1; // whole kWh per month
    if (t.upTo !== null) {
      var overMonthly = Math.floor(t.upTo) + step; // the first whole monthly kWh in the next tier
      var nxt = estimate({ totalKwh: overMonthly * m, months: m, kva: kva }, T);
      out.up = { kwhPerMonth: Math.max(0, overMonthly - cur.monthlyKwh), tier: nxt.tier, total: nxt.total, extra: nxt.total - cur.total };
    }
    var eco = T.residential.economic;
    // a 1-2 kVA home just above 100 kWh/month drops back into the economic tier at 100
    var downMonthly = t.from > 0 ? t.from : !t.economic && kva <= eco.maxKva ? eco.maxMonthlyKwh : null;
    if (downMonthly !== null && cur.monthlyKwh > downMonthly) {
      var prev = estimate({ totalKwh: downMonthly * m, months: m, kva: kva }, T);
      if (prev && prev.tier.price < t.price) out.down = { kwhPerMonth: cur.monthlyKwh - downMonthly, tier: prev.tier, total: prev.total, saved: cur.total - prev.total };
    }
    return out;
  }

  /**
   * Calibration from the last real bill.
   * last: { kwh, months, kva, paid (millimes) }, nextMonths: months of the new bill.
   */
  function calibrate(last, nextMonths, T) {
    var est = estimate({ totalKwh: last.kwh, months: last.months, kva: last.kva }, T);
    if (!est || !(last.paid >= 0) || !(nextMonths > 0)) return null;
    var diff = last.paid - est.total;
    return {
      estimatedLast: est.total, paid: last.paid, diff: diff,
      pct: est.total > 0 ? diff / est.total : null,
      perMonth: diff / last.months,
      adjustment: Math.round((diff / last.months) * nextMonths),
      big: est.total > 0 && Math.abs(diff / est.total) > 0.1,
    };
  }

  /**
   * No old reading? Two readings taken some days apart give the daily use, and the daily use
   * gives the kWh of a whole bill (months x 30.4 days). Dates are "YYYY-MM-DD".
   * Returns { tooSoon } (less than a day apart), { lower } (second reading lower), or the projection.
   */
  function projectKwh(startReading, startDate, nowReading, nowDate, months) {
    var a = new Date(startDate), b = new Date(nowDate);
    if (isNaN(a) || isNaN(b) || !(months > 0)) return null;
    var days = Math.round((b - a) / 86400000);
    if (days < 1) return { tooSoon: true, days: days };
    var used = nowReading - startReading;
    if (used < 0) return { lower: true };
    var daily = used / days;
    return { days: days, used: used, daily: daily, projected: Math.round(daily * months * 30.4) };
  }

  /**
   * What is left to pay once earlier bills are counted (all in millimes), as at the bottom of a
   * STEG bill: total + unpaid from earlier bills ("arriérés") - payments already made
   * ("paiements précédents"). STEG bills show the amount to pay rounded DOWN to the whole dinar.
   */
  function amountToPay(total, arrears, paid) {
    var due = total + (arrears || 0) - (paid || 0);
    return { due: due, rounded: due > 0 ? Math.floor(due / 1000) * 1000 : 0, credit: due < 0 ? -due : 0 };
  }

  /** Millimes -> "26.400" (DT, 3 decimals, Western digits). */
  function dt(millimes) {
    var neg = millimes < 0, v = Math.abs(Math.round(millimes));
    var s = Math.floor(v / 1000) + '.' + String(v % 1000).padStart(3, '0');
    return (neg ? '-' : '') + s;
  }

  var api = { projectKwh: projectKwh, amountToPay: amountToPay, monthsBetween: monthsBetween, consumption: consumption, findTier: findTier, vatRate: vatRate, estimate: estimate, cliff: cliff, calibrate: calibrate, dt: dt };
  if (typeof module !== 'undefined') module.exports = api; else root.STEG = api;
})(this);
