# STEG Bill Estimator

A free, static website that estimates a Tunisian household's **STEG electricity bill** from its meter readings, with a clear line-by-line breakdown. Arabic (right to left), French and English. Made for phones first.

**Private by design:** everything is calculated in the browser. No backend, no login, no tracking, nothing is sent anywhere.

> This is an estimate. The real STEG bill is the only reference, tariffs can change, and this tool is **not affiliated with STEG** (Société Tunisienne de l'Electricité et du Gaz).

## What it does

- You enter the **previous and current meter readings** (kWh), the **billing period** (months, or start and end dates), and your **subscribed power** (kVA). The meter's serial number is never needed: only the readings count.
- Both meter types are explained: old **mechanical** meters (ignore the red last digit) and new **digital** meters (the 1.8.1 screen; optional 1.8.2, added to 1.8.1; never 2.8.x, which is energy sent to the grid).
- The result: estimated total in DT, energy used and per month, the **tier** and its price, energy, power fee, municipal surtax, FTE, VAT, an optional correction, the total and the real cost per kWh.
- **The "cliff" helper:** STEG tiers are not cumulative (the tier you reach sets the price of *every* kWh), so the page tells you how many kWh per month separate you from the next tier, and what it would cost or save.
- **Calibration (optional):** enter your last real bill; the tool compares its own estimate for it with what you paid and can apply the difference to the new estimate.
- Copy the result, print it, light and dark mode, a "how to read your meter" guide and a short FAQ.

## How the bill is calculated (residential, low voltage)

1. Consumption = current reading - previous reading (kWh). Monthly kWh = consumption / number of months.
2. The **tier** comes from the monthly kWh, and its price applies to **all** the kWh of the bill:
   - Economic tier, only for 1 or 2 kVA **and** at most 100 kWh/month: up to 50 -> 62 millimes/kWh, 51 to 100 -> 96.
   - Everyone else: up to 200 -> 176, 201 to 300 -> 218, 301 to 500 -> 341, above 500 -> 414.
3. Power fee = kVA x 700 millimes x months. Municipal surtax ("CL") = 5 millimes per kWh. FTE = 5 millimes per kWh, except at 100 kWh/month or less.
4. Radio and TV contribution (RTT), per bill of *m* months: min(10 x kWh, 1400 x m) + min(4 x max(0, kWh - 150 x m), 2100 x m) millimes (at most 7 DT per 2 months).
5. VAT: 7% of the energy up to 300 kWh/month (since 1 January 2025), 13% above, plus 19% of the power fee. No VAT on CL, FTE or RTT.
6. 1 DT = 1000 millimes; amounts are shown in DT with 3 decimals, rounded to the millime.

**Checked against STEG's own bill simulator** ([steg.com.tn/fr/simulation](https://www.steg.com.tn/fr/simulation)): 17 simulated bills (1 to 6 months, 1 to 4 kVA, 37 to 2000 kWh) match **to the millime**, every line included; they are in `test.js`. The full research, with sources, is in [`docs/tariff-research.md`](docs/tariff-research.md).

All of this lives in two files: the numbers in `tariffs.js`, the logic in `calc.js`.

## Files

| File | What it holds |
|---|---|
| `index.html` | the page |
| `style.css` | the look (phone first, light / dark, right to left for Arabic, print) |
| `app.js` | the form, the results, the languages |
| `calc.js` | the calculation (pure functions, also used by the tests) |
| `tariffs.js` | **every tariff number and tax rate**, with the date they were last checked and the source |
| `i18n.js` | every text in English, French and Arabic |
| `test.js` | the tests (`node test.js`) |

## Update the tariffs

Edit **`tariffs.js` only**: tier limits and prices, the power fee, the surtax, FTE and VAT (rates, and which items the VAT applies to, in `vat.base`). Then set `lastVerified` to today's date (it shows in the footer) and run `node test.js`. If STEG's prices changed, update the expected numbers in `test.js` too.

## Add a language

Add a dictionary to `i18n.js` with **exactly the same keys** as `en` (keep every `{placeholder}`), then add a button for it in the language switcher in `index.html`. `node test.js` checks that every language has every key. For a right-to-left language, add its code to the right-to-left list in `app.js`.

## Run the tests

```
node test.js
```

No install needed (Node only). They cover 17 bills from STEG's own simulator (to the millime), the published sanity cases (150, 250, 350, 450, 550 kWh), every tier boundary (100, 101, 200, 201, 300, 301, 500, 501), the economic tier, the 2-month case (450 kWh over 2 months = 225 kWh/month -> 218 millimes on all 450 kWh), taxes, the cliff helper, calibration and the translations.

## Deploy for free

It is plain files with no build step, so any static host works:
- **GitHub Pages:** repository Settings -> Pages -> deploy from the `main` branch, folder `/`.
- **Cloudflare Pages / Netlify:** connect the repository, no build command, output folder `/`.
- Or just open `index.html` from disk.

## Assumptions to verify

The model reproduces STEG's online simulator exactly, but the simulator is STEG's estimate tool, not a printed invoice. Still to confirm on a **real STEG bill** (the optional calibration covers the gap meanwhile):

- **VAT:** 7% / 13% on the energy and **19% on the power fee**, nothing on CL, FTE, RTT. (The original brief assumed 7% / 13% on energy + power fee.) Before 2025 the energy VAT was 13% for everyone, which matters when calibrating against an old bill.
- **FTE amount and exemption:** STEG applies 5 millimes/kWh (one older source, the 2019 law, said 1 millime). The simulator exempts every home at 100 kWh/month or less, whatever its kVA; the law and the STEG page mention only the economic tier.
- **RTT:** is there an exemption for the first 50 kWh (a STEG official's example suggests one; the simulator has none)? Do the caps scale with the months on 4- and 6-month bills?
- **Months:** how a real bill counts the months for the monthly average (whole billing months or days); the date mode here uses days / 30.4.
- **Digital meters:** which register STEG reads (1.8.0 = total, 1.8.1 / 1.8.2 = day / night sub-registers; 2.8.x = energy sent to the grid, never consumption). The page asks users to check their latest bill.
- **Economic tier:** 1 or 2 kVA and at most 100 kWh/month (confirmed on the STEG page and in the simulator).
- **Other fees** (late payment, reconnection) exist but are not modelled; no amounts were found.
