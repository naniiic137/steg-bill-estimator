/*
 * STEG electricity tariffs used by the estimator. ALL numbers live here, so a tariff change
 * never touches the logic. Money is in millimes (1 DT = 1000 millimes).
 *
 * Source: https://www.steg.com.tn/fr/page/les-tarifs-d%C3%A9lectricit%C3%A9
 * Residential low-voltage tariffs in force since May 2022.
 *
 * Taxes follow STEG's own online bill simulator (https://www.steg.com.tn/fr/simulation), checked
 * on 17 simulated bills (docs/tariff-research.md). Anything marked `verified: false` has not yet
 * been checked against a PRINTED STEG bill (see README.md, "Assumptions to verify").
 */
var STEG_TARIFFS = {
  lastVerified: '2026-10-15', // STEG page + simulator + a printed bill
  source: 'https://www.steg.com.tn/fr/page/les-tarifs-d%C3%A9lectricit%C3%A9',
  currency: { millimesPerDinar: 1000, decimals: 3 },

  residential: {
    // Economic tier: only for 1 or 2 kVA subscriptions AND at most 100 kWh per month.
    economic: {
      maxKva: 2,
      maxMonthlyKwh: 100,
      tiers: [
        { id: 'eco1', upTo: 50, price: 62 },
        { id: 'eco2', upTo: 100, price: 96 },
      ],
    },
    // Everyone else (and economic customers above 100 kWh per month).
    // NOT cumulative: the tier reached by the monthly kWh sets ONE price for ALL kWh of the bill.
    normal: {
      tiers: [
        { id: 't1', upTo: 200, price: 176 },
        { id: 't2', upTo: 300, price: 218 },
        { id: 't3', upTo: 500, price: 341 },
        { id: 't4', upTo: null, price: 414 }, // above 500 kWh per month
      ],
    },
    // Power (subscription) fee: millimes per subscribed kVA per month.
    powerFeePerKvaMonth: 700,
    // Municipal surtax: millimes per kWh, on all kWh.
    municipalSurtaxPerKwh: 5,
    // FTE (Fonds de Transition Energétique): millimes per kWh, on all kWh.
    // STEG's simulator exempts every home at <= 100 kWh per month, whatever its kVA.
    // (The 2019 law said 1 millime; STEG applies 5.) To check on a printed bill.
    fte: { perKwh: 5, exemptUpToMonthlyKwh: 100, verified: false },
    // Radio and TV contribution (RTT), no VAT on it. Per bill of m months, in millimes:
    //   min(10 x kWh, 1400 x m) + min(4 x max(0, kWh - 150 x m), 2100 x m)   (at most 7 DT per 2 months)
    rtt: { perKwh: 10, capPerMonth: 1400, extraAbovePerMonth: 150, extraPerKwh: 4, extraCapPerMonth: 2100 },
    // VAT: on the energy at a rate chosen by the monthly kWh (7% up to 300 kWh/month since
    // 1 January 2025, 13% above), and on the power fee at its own rate. None on CL, FTE, RTT.
    // Matches STEG's simulator, and a printed bill (15/10/2026: 620 kWh, 4 months, 3 kVA, VAT 9.234 DT).
    vat: {
      verified: true,
      energyRules: [
        { maxMonthlyKwh: 300, rate: 0.07 },
        { maxMonthlyKwh: null, rate: 0.13 },
      ],
      powerFeeRate: 0.19,
    },
  },

  // Non-residential has different prices: not built yet ("coming soon" in the form).
  nonResidential: null,
};

if (typeof module !== 'undefined') module.exports = STEG_TARIFFS;
