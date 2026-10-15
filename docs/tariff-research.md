# STEG tariff research: checking tariffs.js and calc.js

Research date: 2026-10-15. Every source below was accessed on 2026-10-15.

## How this was checked

1. **STEG tariff page**, read from the raw HTML so the table's `colspan` layout was visible:
   https://www.steg.com.tn/fr/page/les-tarifs-d%C3%A9lectricit%C3%A9
2. **The FTE law that STEG publishes** (JORT n°104, 28 Dec 2018, p. 5462, finance law 2019, art. 68):
   https://www.steg.com.tn/fr/page/jort-fond-de-transition-energitique, PDF at https://www.steg.com.tn/system/files/jort_fte_ar.pdf
3. **STEG's own bill simulator** at https://www.steg.com.tn/fr/simulation. This is a server-side form. It was submitted 17 times, one plain HTTP request at a time with pauses between them (no browser). It returns a full bill made by STEG itself, with energy, fixed fees, CL, FTE(E), RTT, TVA and total. **This is the strongest end-to-end evidence found.** It is STEG's estimate, not a real bill (see point 8).
4. Official texts and press: finance law 2025 (art. 31), the draft finance law 2024, an Alqatiba investigation of the radio-TV fee (2023), STEG's "Comprendre votre facture" page, and press on smart meters.

---

## 1. Residential low-voltage energy prices (since 1 May 2022)

**Verdict: CONFIRMED** for all six prices, the economic-tier condition and the "one price for all kWh" rule.

**Evidence (STEG tariff page, "à compter du 01/05/2022 (Hors taxes)"):**

| Row on the STEG page | Price (mill/kWh) | Columns the cell spans |
|---|---|---|
| Tranche économique (1 et 2 kVA et C° ≤ 100 kWh/mois), Résidentiel (3) "ne dépasse pas 50 kWh/mois" | 62 | 1-50 |
| same, Résidentiel (4) "comprise entre 51 et 100 kWh/mois" | 96 | 1-50 and 51-100 (colspan 2) |
| Tranche économique (1 et 2 kVA et C° > 100) **and** Tranche normale (> 2 kVA), Résidentiel (6) 101-200 | 176 | 1-50 through 101-200 (colspan 3) |
| Résidentiel (7) 201-300 | 218 | colspan 4 |
| Résidentiel (8) 301-500 | 341 | colspan 5 |
| Résidentiel (9) > 500 | 414 | colspan 6 |

- **Not cumulative.** Each price cell spans every column from 1 kWh up to its band. So the band reached by the monthly consumption sets one price for all the kWh. The STEG simulator agrees: 500 kWh over 2 months gives "500 × 0,218 = 109,000", and 602 kWh over 2 months gives "602 × 0,341 = 205,282".
- **A home above 2 kVA using 100 kWh/month or less pays 176**, not 62 or 96. The table puts the 176 cell across columns 1-200 for "Tranche normale (> 2 kVA)", and the simulator gives 3 kVA, 200 kWh over 2 months → 0.176. calc.js already does this.
- **Monthly average = kWh ÷ number of months on the bill.** In the simulator, "Période de Consommation" can be 1, 2, 4, 6, 8, 10 or 12 months. 1000 kWh over 4 months is 250 kWh/month, which gives 0.218. 1500 kWh over 6 months gives 0.218. 201 kWh over 2 months is 100.5 kWh/month, which already counts as "> 100": the bill gets 0.176 and FTE is charged. So fractional averages are not rounded down.
- **No change after 2022.** The STEG page still shows "à compter du 01/05/2022" today. Webmanagercenter (19 Dec 2023) says the planned increase "était programmée pour 2023", "n'a pas été mise en application", and that STEG "n'a pas encore reçu l'autorisation pour l'appliquer" for 2024. No 2025 or 2026 change to the energy prices was found. **The only later change is VAT (point 5).**
- **Billing cadence** (STEG, "Comprendre votre facture"): "La facture sur relève est bimestrielle suite à une relève quadrimestrielle en milieu urbain ou semestrielle en milieu rural." Bills between real readings are estimated ("facture intermédiaire … est une avance").

Sources:
- https://www.steg.com.tn/fr/page/les-tarifs-d%C3%A9lectricit%C3%A9
- https://www.steg.com.tn/fr/simulation
- https://www.steg.com.tn/fr/page/comprendre-votre-facture?menu=particulier
- https://www.webmanagercenter.com/2023/12/19/518169/electricite-ce-que-nous-prepare-la-steg-pour-2024/

## 2. Power fee (redevance de puissance)

**Verdict: CONFIRMED: 700 millimes per kVA per month.**

- The STEG page shows "Redevance de Puissance (mill/kVA/mois): 700" for both the economic and the normal tranche.
- The simulator's "Red. Fixes" column matches it: 2 kVA for 2 months = 2,800; 3 kVA for 2 months = 4,200; 3 kVA for 1 month = 2,100; 3 kVA for 6 months = 12,600; 4 kVA for 2 months = 5,600.
- Side note: the simulator picks power by breaker size. "2 fils" means single-phase and "4 fils" means three-phase. The option codes are 201…250 and 403…600. For 201 to 204 (5 A, 10 A, 15 A, 20 A single-phase) the last two digits matched the kVA billed (1, 2, 3, 4). That mapping for the other codes is my inference and was not tested.

## 3. Municipal surtax (surtaxe municipale, shown on the bill as "CL")

**Verdict: CONFIRMED: 5 millimes per kWh, on all kWh, economic tier included.**

- STEG page: "(2) A majorer de : * La surtaxe municipale : 5 mill/kWh."
- Simulator: the line is "CL / مساهمة الجماعات المحلية". 100 kWh gives 0.500, 500 kWh gives 2.500, and 37 kWh gives 0.185, including for economic-tier homes.

## 4. FTE (Fonds de Transition Energétique) on electricity

**Verdict: 5 millimes per kWh is what STEG applies today. The exemption rule differs from the model (see below).**

- STEG page: "La taxe au profit du Fonds de Transition Energitique (FTE) : 5 mill/kWh, sauf pour les clients de la Basse Tension (tranche économique) dont la consommation ne dépasse pas 100kwh/mois."
- Simulator: "FTE(E)" is 2.500 for 500 kWh and 1.010 for 202 kWh, so 5 mill/kWh.
- **Where the "1 millime" comes from:** the 2019 finance law, art. 68 (JORT n°104, 28 Dec 2018, p. 5462, posted by STEG itself) sets "كهرباء: 1 مليم للكيلواط-ساعة" (electricity: 1 millime per kWh). It exempts "الكهرباء بالنسبة للمشتركين في شبكة الجهد المنخفض في الشريحة الاقتصادية الذين لا يتجاوز استهلاكهم الشهري 100 كيلواط-ساعة" (low-voltage subscribers in the economic tranche using no more than 100 kWh/month). The ilboursa article from the 2022 tariff change also says "1 millime per KWh".
- **What raised it to 5:** the draft finance law 2024 (Ministry of Finance PDF, p. 14 and the explanatory note) proposes multiplying the FTE levies by 5. Its table reads "كهرباء: القيمة الحالية 1 مليم … المقترحة 5 مليم للكيلواط-ساعة" (electricity: current value 1 millime, proposed 5 millimes per kWh). A secondary source says the amount was set by art. 51 of the finance law 2024. I could not open that page (the site is suspended), so **the article number is unconfirmed**. Both the STEG page and the simulator show 5 is in force.
- **Exemption: the simulator differs from calc.js.** The simulator **exempts a 3 kVA home at 100 kWh/month** (3 kVA, 200 kWh over 2 months gives FTE = 0.000) and charges it at 101 kWh/month (202 kWh → 1.010). So STEG's simulator exempts on **monthly consumption ≤ 100 kWh whatever the kVA**. calc.js only exempts when the home is in the economic tier (≤ 2 kVA). The law and the STEG footnote say "tranche économique", so they say the same as calc.js. **Unresolved: needs a real bill from a > 2 kVA home at ≤ 100 kWh/month.**

Sources:
- https://www.steg.com.tn/system/files/jort_fte_ar.pdf
- https://www.finances.gov.tn/sites/default/files/2023-10/projet_LF_2024.pdf
- https://www.ilboursa.com/marches/de-combien-vont-augmenter-les-factures-de-lelectricite-et-du-gaz-naturel-_34570
- https://www.atgf.org/archives/7881 (secondary source; the site showed "Website unavailable")

## 5. VAT (TVA) on residential electricity

**Verdict: the rates are CONFIRMED. The base is DIFFERENT: 7%/13% applies to energy only, and the power fee is taxed at 19%. No VAT on CL, FTE or RTT.**

- STEG page: "7% pour les clients domestiques ayant une consommation inférieur ou égale à 300 kWh/mois sinon 13% sur le prix de l'énergie (hors taxes) de l'usage résidentiel", and "19 % sur toutes les redevances et sur le prix de l'énergie (hors taxes) des usages autres que résidentiel et irrigation".
- Legal basis for the 7%: finance law 2025 (loi n°2024-48 du 9 décembre 2024), art. 31. PKF's summary: "L'électricité des ménages à usage domestique ne dépassant une consommation mensuelle de 300 Kw est soumise à la TVA au taux de 7% seulement au lieu de 13%". Managers.tn (22 Oct 2024) adds that consumers above 300 kWh "continueraient à payer la TVA de 13%". **Before 1 Jan 2025 all residential energy was taxed at 13%.** That matters for checking against old bills.
- **The base comes from the simulator.** Every one of the 17 results fits exactly: `TVA = rate × energy + 19% × power fee`. Some examples:
  - 3 kVA, 2 months, 500 kWh: 7% × 109.000 + 19% × 4.200 = 7.630 + 0.798 = **8.428**. STEG shows 8.428.
  - 2 kVA, 2 months, 100 kWh (economic): 7% × 6.200 + 19% × 2.800 = 0.434 + 0.532 = **0.966**. STEG shows 0.966. **The economic tier is not exempt from VAT.**
  - 3 kVA, 2 months, 602 kWh (301/month): 13% × 205.282 + 19% × 4.200 = 26.687 + 0.798 = **27.485**. STEG shows 27.485.
  - 3 kVA, 2 months, 600 kWh (exactly 300/month): 7% × 130.800 + 0.798 = **9.954**. STEG shows 9.954. So "≤ 300" uses 7%.
- tunisie-electricite.com (a third-party site, "Tarifs vérifiés 1er octobre 2026") describes the same 19% on fixed charges.

Sources:
- https://www.steg.com.tn/fr/page/les-tarifs-d%C3%A9lectricit%C3%A9
- https://pkf.tn/documents/Loi%20de%20finances%202025.pdf
- https://managers.tn/2024/10/22/plf-2025-baisse-de-la-tva-de-13-a-7-sur-lelectricite-pour-les-menages-a-faible-consommation/
- https://www.steg.com.tn/fr/simulation
- https://tunisie-electricite.com/tarifs

## 6. Other items on a residential bill

**RTT: the radio-television contribution ("RTT / معلوم الإذاعة والتلفزة"). Verdict: IT EXISTS, and the model leaves it out.**

- The STEG simulator prints it as a tax line. STEG's "Comprendre votre facture" page also mentions "le montant estimé de la contribution RTT".
- Legal basis (Alqatiba, 2023): finance law 1980 (loi n°79-66). Last changed by finance law 1992, art. 73: at most "دينارين وثمانمائة مليم" (2.800 DT) per bill when the 2-month consumption is ≤ 300 kWh, plus at most 4.200 DT above that. The cap is 7 DT per 2 months, and the fee has not been raised since 1992. STEG's commercial director confirmed the 7 DT cap and that the fee is still collected; 43 MDT were collected in 2021.
- **Formula that reproduces all 17 simulator results.** Here m is the number of months on the bill, and amounts are in millimes:

  `RTT = min(10 × kWh, 1400 × m) + min(4 × max(0, kWh − 150 × m), 2100 × m)`

  | Case | Calculation | STEG simulator |
  |---|---|---|
  | 2 months, 500 kWh | 2800 + 800 = 3.600 | 3.600 |
  | 2 months, 290 kWh | 2800 + 0 = 2.800 | 2.800 |
  | 2 months, 2000 kWh | 2800 + 4200 = 7.000 (cap) | 7.000 |
  | 1 month, 250 kWh | 1400 + 400 = 1.800 | 1.800 |
  | 4 months, 1000 kWh | 5600 + 1600 = 7.200 | 7.200 |
  | 6 months, 1500 kWh | 8400 + 2400 = 10.800 | 10.800 |
  | 1 month, 37 kWh | 370 + 0 = 0.370 | 0.370 |

- There is **no VAT on RTT**, and the economic tier is not exempt.
- **Caution:** in the Alqatiba article, the STEG director's spoken example has a first 50 kWh exempt (450 kWh over 2 months → 3.100 DT). The simulator does not exempt the first 50 kWh: 100 kWh gives 1.000. The simulator was followed here, but **a real bill should settle it**.
- Note: tunisie-electricite.com presents "RTT 1,800" as a fixed monthly amount. That is just its 250 kWh, 1-month example, not a fixed fee.

**Late fees and penalties: they EXIST, but they are not part of the estimate.** Press coverage names "frais de rappel / préavis de coupure, déplacement pour recouvrement, coupure et rétablissement", which STEG has waived during several campaigns. No amounts were found. The simulator says it "ne tient pas compte des montants des services rendus par la STEG, des payements précédents et des arriérés". A real bill can also carry installments (branchement, debt rescheduling).

**Meter rental: NOT FOUND.** The STEG tariff page has no such line for residential low voltage, and neither does the simulator. "Abonnement (mill/Ab/mois)" only appears for special tariffs such as public lighting and water heaters.

**Stamp duty (timbre fiscal): NOT FOUND** on residential electricity bills. The simulator has no such line, and no source puts one on STEG household bills.

**Gas:** the simulator has a separate "FTE(G)" line. It only applies to gas customers and is out of scope.

**Rounding:** STEG shows every line in DT to 3 decimals (to the millime), and the total is the sum of the lines. The VAT examples round half-up at the millime: 0.29358 → 0.294, 3.00832 → 3.008, 27.48466 → 27.485. calc.js's `Math.round` on millimes matches.

Sources:
- https://alqatiba.com/2023/01/27/%D8%A7%D9%82%D8%AA%D8%B7%D8%A7%D8%B9-%D8%B3%D8%AA%D8%A7%D8%BA-%D9%81%D8%A7%D8%AA%D9%88%D8%B1%D8%A9-%D9%85%D8%B9%D9%84%D9%88%D9%85-%D8%A7%D8%B0%D8%A7%D8%B9%D8%A9-%D8%AA%D9%84%D9%81%D8%B2%D8%A9/
- https://www.steg.com.tn/fr/page/comprendre-votre-facture?menu=particulier
- https://www.steg.com.tn/fr/simulation
- https://kapitalis.com/tunisie/2018/01/30/steg-frais-de-retard-veritable-arnaque-clients/
- https://tunisie-electricite.com/tarifs

## 7. Digital meters and their screen codes (1.8.0 / 1.8.1 / 1.8.2 / 2.8.x)

**Verdict: the code meanings are CONFIRMED as the international OBIS/IEC 62056 standard. NOT FOUND: any STEG document saying which register STEG bills on, or naming the "Siconia" model.**

- **Standard meanings** (Wiener Netze meter guide for its customers):
  - 1.8.0: "Positive active energy (A+) in kilowatt hours (kWh)". This is the total imported energy, "the meter reading as it was read on your old Ferraris meter".
  - 1.8.1 and 1.8.2: "Positive active energy (A+) in tariff T1 / T2". These are the same imports split by time-of-use register. Which register means day and which means night is set by the utility.
  - 2.8.0 (and 2.8.1 / 2.8.2): "Negative active energy". This is energy exported to the grid, for example from solar panels.
- **STEG:** smart meters are rolling out under the AFD-financed Smart Grid project. Pilot in Sfax from June 2024; more than 86,000 meters by March 2026 in Sfax, Sousse, Kram and Béja; 450,000 targeted. Partners named in the press: "SIA, Efluid, Siemens et Sagemcom-Siame". **The Sagemcom brand is confirmed; the "Siconia" model name is not.**
- **For a single-rate residential customer, 1.8.0 (total import) is the logical billing index.** The household tariff has no time-of-day prices, so 1.8.1 and 1.8.2 are only parts of that total (1.8.1 + 1.8.2 = 1.8.0). For a home with solar panels, 2.8.0 is the export register. **No STEG source confirms this, so the site should word it as advice ("use 1.8.0"), not as a STEG rule.**

Sources:
- https://www.wienernetze.at/o/document/ex126_sm_anleitung_landis_gyr_eng_v2_bf
- https://managers.tn/2024/05/13/installation-des-premiers-compteurs-intelligents-a-sfax-des-juin
- https://fr.allafrica.com/stories/202604020366.html
- https://managers.tn/2026/03/31/le-compteur-intelligent-de-la-steg-ce-que-change-pour-les-tunisiens/

## 8. Worked example of a bill

**Verdict: no published real bill was found. STEG's official simulator gives full worked examples, though.** The bill below was made by STEG on 2026-10-15 for 3 kVA, 2 months, old index 0, new index 500 ("FACTURE ESTIMEE"):

| Line | STEG simulator (DT) | current calc.js (DT) |
|---|---|---|
| Eclairage: 2 months, 500 kWh × 0,218 | 109.000 | 109.000 |
| Red. Fixes (3 kVA × 0.700 × 2) | 4.200 | 4.200 |
| CL | 2.500 | 2.500 |
| FTE(E) | 2.500 | 2.500 |
| RTT | 3.600 | missing |
| TVA | 8.428 | 7.924 (7% × 113.200) |
| **Montant Simulé** | **130.228** | **126.124** |

The whole 4.104 DT gap comes from the missing RTT (3.600) plus the VAT base (19% instead of 7% on the power fee, +0.504).

More simulator results to use as test cases. **Economic** below means STEG billed the economic tier (≤ 2 kVA and ≤ 100 kWh/month).

| Months | Option code (kVA) | kWh | Price | Energy | Fixed | CL | FTE | RTT | TVA | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 202 (2) | 100 | 0.062 | 6.200 | 2.800 | 0.500 | 0.000 | 1.000 | 0.966 | 11.466 |
| 2 | 202 (2) | 180 | 0.096 | 17.280 | 2.800 | 0.900 | 0.000 | 1.800 | 1.742 | 24.522 |
| 2 | 202 (2) | 200 | 0.096 | 19.200 | 2.800 | 1.000 | 0.000 | 2.000 | 1.876 | 26.876 |
| 2 | 202 (2) | 201 | 0.176 | 35.376 | 2.800 | 1.005 | 1.005 | 2.010 | 3.008 | 45.204 |
| 2 | 202 (2) | 202 | 0.176 | 35.552 | 2.800 | 1.010 | 1.010 | 2.020 | 3.021 | 45.413 |
| 2 | 203 (3) | 200 | 0.176 | 35.200 | 4.200 | 1.000 | **0.000** | 2.000 | 3.262 | 45.662 |
| 2 | 203 (3) | 202 | 0.176 | 35.552 | 4.200 | 1.010 | 1.010 | 2.020 | 3.287 | 47.079 |
| 2 | 203 (3) | 290 | 0.176 | 51.040 | 4.200 | 1.450 | 1.450 | 2.800 | 4.371 | 65.311 |
| 2 | 203 (3) | 600 | 0.218 | 130.800 | 4.200 | 3.000 | 3.000 | 4.000 | 9.954 | 154.954 |
| 2 | 203 (3) | 602 | 0.341 | 205.282 | 4.200 | 3.010 | 3.010 | 4.008 | 27.485 | 246.995 |
| 2 | 204 (4) | 1200 | 0.414 | 496.800 | 5.600 | 6.000 | 6.000 | 6.400 | 65.648 | 586.448 |
| 2 | 204 (4) | 2000 | 0.414 | 828.000 | 5.600 | 10.000 | 10.000 | 7.000 | 108.704 | 969.304 |
| 1 | 203 (3) | 250 | 0.218 | 54.500 | 2.100 | 1.250 | 1.250 | 1.800 | 4.214 | 65.114 |
| 1 | 201 (1) | 37 | 0.062 | 2.294 | 0.700 | 0.185 | 0.000 | 0.370 | 0.294 | 3.843 |
| 4 | 203 (3) | 1000 | 0.218 | 218.000 | 8.400 | 5.000 | 5.000 | 7.200 | 16.856 | 260.456 |
| 6 | 203 (3) | 1500 | 0.218 | 327.000 | 12.600 | 7.500 | 7.500 | 10.800 | 25.284 | 390.684 |

The 1-month, 3 kVA, 250 kWh result (65.114 DT) is the same as the worked example on tunisie-electricite.com.

---

## Changes I recommend to tariffs.js

These values reproduce all 17 STEG simulator results above. They need small matching changes in calc.js: a VAT rate per item, the RTT line, and the FTE exemption.

1. **VAT base and rates.** Replace `vat` with:
   ```js
   vat: {
     verified: true, // STEG page + simulator; 7% from finance law 2025 art. 31 (since 1 Jan 2025)
     energyRules: [ { maxMonthlyKwh: 300, rate: 0.07 }, { maxMonthlyKwh: null, rate: 0.13 } ], // on energy only
     powerFeeRate: 0.19,          // on the redevance de puissance
     // no VAT on surtax (CL), FTE or RTT
   },
   ```
   That gives `vat = round(energy × energyRate + powerFee × 0.19)`. The economic tier is not exempt.
2. **FTE:**
   ```js
   fte: { perKwh: 5, exemptMaxMonthlyKwh: 100, exemptOnlyEconomic: false, verified: false }
   ```
   The 5 is confirmed (STEG page, simulator, draft finance law 2024 going from 1 to 5). `exemptOnlyEconomic: false` follows the simulator, which exempts a 3 kVA home at ≤ 100 kWh/month. Set it to `true` if a real bill shows otherwise.
3. **Add the RTT (radio-TV contribution):**
   ```js
   rtt: { verified: false, // finance law 1992 art. 73; formula fitted to the STEG simulator
     band1: { perKwh: 10, capPerMonth: 1400 },                    // millimes
     band2: { perKwh: 4, aboveKwhPerMonth: 150, capPerMonth: 2100 } // millimes
   }
   // RTT = min(10*kWh, 1400*m) + min(4*max(0, kWh - 150*m), 2100*m), no VAT
   ```
4. **Keep as they are (confirmed):** the economic tiers 62 and 96 (`maxKva: 2`, `maxMonthlyKwh: 100`); the normal tiers 176, 218, 341, 414 at 200, 300 and 500; `powerFeePerKvaMonth: 700`; `municipalSurtaxPerKwh: 5`.
5. **Update `source`/comments:** add `https://www.steg.com.tn/fr/simulation` as the reference used for checking, and note that before 2025-01-01 the energy VAT was 13% for everyone. That matters when a user calibrates against an old bill.
6. **Months (calc.js, not tariffs.js):** STEG averages with the bill's whole number of months ("NBRE. MOIS": 1, 2, 4, 6…). `monthsBetween` (days ÷ 30.4, one decimal) can give 1.9 or 2.1, which moves the average and can flip a tier at the edges. Prefer the month count printed on the bill, or round to a whole month.

## Still to verify against a real bill

- **FTE for > 2 kVA homes at ≤ 100 kWh/month.** The simulator exempts them; the law and the STEG footnote say only the "tranche économique" is exempt.
- **RTT details.** Is there a first 50 kWh exemption? The STEG director's spoken example has one; the simulator does not. Also check that the bands scale with the number of months on 4- and 6-month "sur relève" bills.
- **19% VAT on the power fee** on a printed bill. The simulator is consistent on this, but it is still STEG's estimate tool, not an invoice.
- **How a real bill counts months** for the average (whole billing months or days), and how an estimated "facture intermédiaire" is netted on the next real bill.
- **Which index STEG reads on its digital and smart meters** (1.8.0 assumed), and the model name (Sagemcom confirmed; Siconia not).
- **The exact article of the finance law 2024** that raised FTE from 1 to 5 mill/kWh (reported as art. 51, unconfirmed).
- **Amounts of late, reconnection and reminder fees** (they exist; not found).
