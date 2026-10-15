// Unit tests for the bill calculation: node test.js
const T = require('./tariffs.js');
const S = require('./calc.js');
let pass = 0, fail = 0;
const eq = (name, got, want) => { if (got === want) pass++; else { fail++; console.log(`FAIL ${name}: got ${got}, want ${want}`); } };
const energy = (kwh, months = 1, kva = 5) => S.estimate({ totalKwh: kwh, months, kva }, T).lines.energy;

// the sanity cases (energy only, 1 month): 150 -> 26.400 DT ... 550 -> 227.700 DT
eq('150 kWh', S.dt(energy(150)), '26.400');
eq('250 kWh', S.dt(energy(250)), '54.500');
eq('350 kWh', S.dt(energy(350)), '119.350');
eq('450 kWh', S.dt(energy(450)), '153.450');
eq('550 kWh', S.dt(energy(550)), '227.700');

// tier boundaries (normal customer, 5 kVA, 1 month): the price of ALL kWh changes at each limit
const price = (m, kva = 5, months = 1) => S.estimate({ totalKwh: m * months, months, kva }, T).tier.price;
[[100, 176], [101, 176], [200, 176], [201, 218], [300, 218], [301, 341], [500, 341], [501, 414]].forEach(([m, p]) => eq(`tier at ${m} kWh/month`, price(m), p));
// economic customer (1 or 2 kVA, <= 100 kWh/month)
[[50, 62], [51, 96], [100, 96], [101, 176]].forEach(([m, p]) => eq(`economic 2 kVA at ${m}`, price(m, 2), p));
eq('3 kVA never economic', price(50, 3), 176);

// two months: 450 kWh over 2 months = 225 kWh/month -> 218 millimes on all 450 kWh
const two = S.estimate({ totalKwh: 450, months: 2, kva: 5 }, T);
eq('2-month monthly kWh', two.monthlyKwh, 225);
eq('2-month tier price', two.tier.price, 218);
eq('2-month energy', S.dt(two.lines.energy), '98.100');

// other lines (5 kVA, 2 months, 450 kWh)
eq('power fee', two.lines.powerFee, 5 * 700 * 2);
eq('municipal surtax', two.lines.surtax, 450 * 5);
eq('FTE', two.lines.fte, 450 * 5);
eq('RTT', two.lines.rtt, 2800 + 600);
eq('VAT 7% at <= 300 kWh/month', two.vatRate, 0.07);
eq('VAT = 7% of energy + 19% of the power fee', two.lines.vat, Math.round(98100 * 0.07 + 7000 * 0.19));
eq('total adds up', two.total, 98100 + 7000 + 2250 + 2250 + 3400 + Math.round(98100 * 0.07 + 7000 * 0.19));
eq('VAT 13% above 300', S.estimate({ totalKwh: 301, months: 1, kva: 5 }, T).vatRate, 0.13);
eq('FTE exempt at <= 100 kWh/month', S.estimate({ totalKwh: 80, months: 1, kva: 2 }, T).lines.fte, 0);
eq('FTE exempt at <= 100 kWh/month even at 3 kVA', S.estimate({ totalKwh: 200, months: 2, kva: 3 }, T).lines.fte, 0);
eq('FTE charged above 100 even at 2 kVA', S.estimate({ totalKwh: 120, months: 1, kva: 2 }, T).lines.fte, 600);

// STEG's own simulator (steg.com.tn/fr/simulation, 15/10/2026): the full bill, to the millime
[[2, 2, 100, '11.466'], [2, 2, 180, '24.522'], [2, 2, 200, '26.876'], [2, 2, 201, '45.204'], [2, 2, 202, '45.413'],
 [2, 3, 200, '45.662'], [2, 3, 202, '47.079'], [2, 3, 290, '65.311'], [2, 3, 600, '154.954'], [2, 3, 602, '246.995'],
 [2, 4, 1200, '586.448'], [2, 4, 2000, '969.304'], [1, 3, 250, '65.114'], [1, 1, 37, '3.843'], [4, 3, 1000, '260.456'],
 [6, 3, 1500, '390.684'], [2, 3, 500, '130.228']].forEach(([m, kva, kwh, want]) => eq(`STEG simulator: ${kwh} kWh, ${m} months, ${kva} kVA`, S.dt(S.estimate({ totalKwh: kwh, months: m, kva }, T).total), want));

// the cliff helper
const c = S.cliff({ totalKwh: 290, months: 1, kva: 5 }, T);
eq('cliff: kWh to next tier', c.up.kwhPerMonth, 11);
eq('cliff: next tier price', c.up.tier.price, 341);
eq('cliff: drop a tier from 210', S.cliff({ totalKwh: 210, months: 1, kva: 5 }, T).down.kwhPerMonth, 10);
eq('cliff: top tier has no up', S.cliff({ totalKwh: 600, months: 1, kva: 5 }, T).up, null);
eq('cliff: 2 kVA at 110 can drop back to economic', S.cliff({ totalKwh: 110, months: 1, kva: 2 }, T).down.tier.price, 96);

// calibration: paid 10 DT more than estimated on a 2-month bill -> +5 DT per month
const last = S.estimate({ totalKwh: 400, months: 2, kva: 5 }, T);
const cal = S.calibrate({ kwh: 400, months: 2, kva: 5, paid: last.total + 10000 }, 3, T);
eq('calibration diff', cal.diff, 10000);
eq('calibration for a 3-month bill', cal.adjustment, 15000);

// helpers
eq('months from dates', S.monthsBetween('2026-08-01', '2026-10-01'), 2);
eq('months from dates: whole months like a real bill (115 days = 4)', S.monthsBetween('2025-12-26', '2026-04-20'), 4);

// a real printed STEG bill (15/10/2026, numbers only): 620 kWh, 4 months, 3 kVA, residential
const real = S.estimate({ totalKwh: 620, months: 4, kva: 3 }, T);
eq('real bill: energy', S.dt(real.lines.energy), '109.120');
eq('real bill: power fee', S.dt(real.lines.powerFee), '8.400');
eq('real bill: CL', S.dt(real.lines.surtax), '3.100');
eq('real bill: FTE', S.dt(real.lines.fte), '3.100');
eq('real bill: RTT', S.dt(real.lines.rtt), '5.680');
eq('real bill: VAT', S.dt(real.lines.vat), '9.234');
eq('real bill: total', S.dt(real.total), '138.634');
const pay = S.amountToPay(real.total, 0, 68657);
eq('real bill: total - previous payments', S.dt(pay.due), '69.977');
eq('real bill: amount to pay, rounded down to the dinar', S.dt(pay.rounded), '69.000');
eq('arrears are added', S.amountToPay(50000, 12500, 0).due, 62500);
eq('paid more than the bill = credit', S.amountToPay(30000, 0, 45000).credit, 15000);
eq('lower current reading', S.consumption(500, 400), null);
eq('consumption', S.consumption(58628, 58928), 300);
eq('dt rounding', S.dt(1234567), '1234.567');
eq('dt negative', S.dt(-5000), '-5.000');
eq('invalid input', S.estimate({ totalKwh: 'x', months: 1, kva: 5 }, T), null);

// translations: every language has every English key, nothing empty, the same {placeholders}, Western digits
const I = require('./i18n.js');
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
for (const lang of Object.keys(I).filter((l) => l !== 'en')) {
  for (const k of Object.keys(I.en)) {
    if (!(k in I[lang]) || !String(I[lang][k]).trim()) { fail++; console.log(`FAIL ${lang} is missing "${k}"`); continue; }
    if (ph(I[lang][k]) !== ph(I.en[k])) { fail++; console.log(`FAIL ${lang}.${k} placeholders ${ph(I[lang][k])} vs ${ph(I.en[k])}`); continue; }
    if (/[٠-٩]/.test(I[lang][k])) { fail++; console.log(`FAIL ${lang}.${k} uses Eastern Arabic digits`); continue; }
    pass++;
  }
  for (const k of Object.keys(I[lang])) if (!(k in I.en)) { fail++; console.log(`FAIL ${lang} has an extra key "${k}"`); }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
