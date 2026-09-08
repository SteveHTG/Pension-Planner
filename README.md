# 4350 Pension Planner

A pension and DROP calculator for members of Clermont Professional Firefighters, IAFF Local 4350.
It is a static progressive web app: no server, no accounts, and nothing you type ever leaves your phone.

**Live app:** https://stevehtg.github.io/Pension-Planner/

## What it does

- **Earnings** - enter your 5 highest years of pensionable pay. For years you have worked, upload the last
  pay stub PDF of the year: it is parsed in the browser (nothing is uploaded), the pensionable pay codes are
  summed, overtime hours are estimated from YTD overtime pay at 1.5x the regular rate (base plus incentive
  hourly rates), and anything over the 300-hour cap is removed. For future years, **Project future years**
  grows a known year by the contract raises (2025 +15%, 2026 +4%, 2027 +4%) and an assumed raise after that,
  holding incentive pay flat because the CBA says incentives do not receive pay increases. You can also
  type any year's total directly.
- **Pension** - shows your monthly and annual pension, the percentage of your 5-year average you have earned,
  and how the number was reached.
- **DROP** - shows the frozen monthly benefit deposited into your DROP account and a year-by-year accordion.
  Open any year to see every month's deposit, interest, and running balance.
- **Compare** - build up to three scenarios (different service years, DROP lengths, or pay) side by side.
- **Export** - prints a clean PDF report of everything through your phone's Save as PDF option.

## Plan rules used

From the Firefighters' Retirement Plan Summary Plan Description (Feb 2025):

| Rule | Value |
| --- | --- |
| Average final compensation | Best 5 years of pensionable pay, divided by 12 |
| Multiplier | 3% per year of service |
| At 22 years | Benefit set to 75% of average pay |
| After 22 years | 2% per additional year, capped at 100% (reached at 34.5 years) |
| DROP | Up to 8 years, benefit frozen at entry, account earns 6.5% per year compounded monthly |
| Contributions | 7.5% of salary (stop during DROP) |
| Pensionable overtime | Limited to 300 hours per year |

Pay scales, annual hours, incentives, and holiday pay come from the 2024 to 2027 collective bargaining agreement.

The plan rates can be changed in Settings if a future contract changes them.

## Not included yet

- Actuarial reduction factors for optional payment forms (life only, joint and survivor, and so on).
  The app shows the normal form, which is life with 120 payments guaranteed.
- Early retirement reductions and age based eligibility checks.
- Service before October 1, 2002, which was earned at 2.25%.

## Development

Plain HTML, CSS, and JavaScript. No build step.

```bash
python -m http.server 8093
```

Then open http://localhost:8093/. The calculation engine lives in `js/calc.js` and has no DOM dependencies,
so it can be tested in Node directly.

When you ship a change, bump `CACHE` in `sw.js` so installed copies pick it up.

## Disclaimer

This tool gives estimates only. Official benefit calculations come from the Plan Administrator
(Resource Centers, LLC, 561-624-3277). Where this app and the Plan document disagree, the Plan governs.
