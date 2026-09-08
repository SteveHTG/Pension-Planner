/*
 * 4350 Pension Planner - calculation engine
 * Pure functions only. No DOM. Loaded in the browser as window.PensionCalc
 * and in Node (for tests) via module.exports.
 *
 * Sources:
 *  - City of Clermont Firefighters' Retirement Plan, Summary Plan Description (Feb 2025)
 *  - CBA between IAFF Local 4350 and the City of Clermont, Oct 1 2024 - Sept 30 2027
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PensionCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Plan parameters. All editable in Settings; these are the SPD values.
  const DEFAULTS = {
    multiplierPct: 3,      // % of AFC per year of service before the 22-year mark
    cliffYears: 22,        // at this many years the benefit is set to cliffPct
    cliffPct: 75,          // % of AFC at cliffYears
    postCliffPct: 2,       // % of AFC per year after cliffYears
    capPct: 100,           // maximum % of AFC
    floorPct: 2.75,        // minimum % of AFC per year (never binds while multiplier is 3%)
    dropRatePct: 6.5,      // DROP account earnings, per year, compounded monthly
    contribRatePct: 7.5,   // employee contribution (stops during DROP)
    otCapHours: 300,       // pensionable overtime limit per year
    depositTiming: 'end',  // 'end' = interest on prior balance, then deposit. 'start' = deposit, then interest.
  };

  const ANNUAL_HOURS = { firefighter: 2496, engineer: 2496, inspector: 2080, lieutenant: 2496 };

  const RANKS = [
    { id: 'firefighter', label: 'Firefighter' },
    { id: 'engineer', label: 'Engineer' },
    { id: 'inspector', label: 'Firefighter / Inspector' },
    { id: 'lieutenant', label: 'Fire Lieutenant' },
  ];

  // CBA Article 29.1 pay scales (annual minimum / maximum)
  const PAY_SCALES = [
    { id: 'fy25', label: 'FY2025 (Oct 2024 to Oct 5, 2025)',
      firefighter: [50251.69, 82533.48], engineer: [60154.76, 100956.90], inspector: [60154.76, 100956.90], lieutenant: [66250.96, 112062.16] },
    { id: 'fy26', label: 'FY2026 (Oct 6, 2025 to Oct 4, 2026)',
      firefighter: [51759.24, 86621.11], engineer: [60154.76, 100956.90], inspector: [60154.76, 100956.90], lieutenant: [66250.96, 112062.16] },
    { id: 'fy27', label: 'FY2027 (Oct 5, 2026 to Sept 2027)',
      firefighter: [53312.02, 90952.16], engineer: [60154.76, 100956.90], inspector: [60154.76, 100956.90], lieutenant: [66250.96, 112062.16] },
  ];

  // CBA Article 29.5 incentive pay (annual amounts)
  const INCENTIVES = [
    { id: 'paramedic', label: 'Paramedic', amount: 11000 },
    { id: 'leadfto', label: 'Lead Field Training Officer', amount: 1500 },
    { id: 'fto', label: 'Field Training Officer', amount: 1000 },
    { id: 'soc', label: 'Special Operations Coordinator', amount: 1500 },
    { id: 'trt', label: 'Technical Rescue Team Member', amount: 1500 },
    { id: 'trtech', label: 'Technical Rescue Technician Certified', amount: 2000 },
    { id: 'tro', label: 'Technical Rescue Operations Certified', amount: 1200 },
    { id: 'swr', label: 'Surface Water Rescue Technician', amount: 750 },
    { id: 'ladder', label: 'Ladder Truck Company Certified', amount: 750 },
  ];

  const HOLIDAYS_PER_YEAR = 10;   // CBA Article 30.1
  const HOLIDAY_HOURS = 8;        // CBA Article 30.3.A

  // ---------- helpers ----------

  function num(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  // Parse 'YYYY-MM-DD' as a local date (avoids UTC shift from new Date(string)).
  function parseDate(str) {
    if (!str) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  function addMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLabel(date) {
    return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  // ---------- credited service ----------

  // Whole months between two dates, rounded to the nearest completed month
  // (SPD: "rounded to the nearest completed month").
  function monthsBetween(hire, target) {
    if (!hire || !target) return 0;
    let months = (target.getFullYear() - hire.getFullYear()) * 12 + (target.getMonth() - hire.getMonth());
    const dayDiff = target.getDate() - hire.getDate();
    if (dayDiff >= 15) months += 1;
    else if (dayDiff <= -16) months -= 1;
    return Math.max(0, months);
  }

  function creditedService(hireStr, targetStr) {
    const months = monthsBetween(parseDate(hireStr), parseDate(targetStr));
    return { months, years: months / 12, wholeYears: Math.floor(months / 12), remMonths: months % 12 };
  }

  function splitYears(years) {
    const total = Math.round(years * 12);
    return { wholeYears: Math.floor(total / 12), remMonths: total % 12 };
  }

  // ---------- benefit percentage ----------

  // Returns the % of AFC earned for a given number of credited years.
  //  - Before cliffYears: multiplierPct per year (3%)
  //  - At cliffYears: jumps to cliffPct (75%)
  //  - After cliffYears: cliffPct + postCliffPct per additional year (2%)
  //  - Never below floorPct per year, never above capPct
  function benefitPct(years, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    years = Math.max(0, num(years));
    if (years === 0) return 0;
    let pct;
    if (years < s.cliffYears) pct = s.multiplierPct * years;
    else pct = s.cliffPct + s.postCliffPct * (years - s.cliffYears);
    pct = Math.max(pct, s.floorPct * years);
    return Math.min(pct, s.capPct);
  }

  // Human readable explanation of the % calculation
  function explainPct(years, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    years = Math.max(0, num(years));
    const pct = benefitPct(years, s);
    const y = years.toFixed(2).replace(/\.?0+$/, '');
    let text;
    if (years < s.cliffYears) {
      text = s.multiplierPct + '% × ' + y + ' years = ' + round2(pct) + '%';
    } else {
      const extra = years - s.cliffYears;
      const e = extra.toFixed(2).replace(/\.?0+$/, '');
      text = s.cliffPct + '% at ' + s.cliffYears + ' years';
      if (extra > 0) text += ' + ' + s.postCliffPct + '% × ' + e + ' more years';
      text += ' = ' + round2(pct) + '%';
      if (s.cliffPct + s.postCliffPct * extra > s.capPct) text += ' (capped at ' + s.capPct + '%)';
    }
    return text;
  }

  // Years of service needed to reach the cap
  function yearsToCap(s) {
    s = Object.assign({}, DEFAULTS, s || {});
    return s.cliffYears + (s.capPct - s.cliffPct) / s.postCliffPct;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------- average final compensation ----------

  function afc(earnings) {
    const vals = (earnings || []).map(num).filter(v => v > 0);
    if (!vals.length) return { annual: 0, monthly: 0, count: 0 };
    const annual = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { annual, monthly: annual / 12, count: vals.length };
  }

  // ---------- pension ----------

  function pension(input, s) {
    const years = Math.max(0, num(input.years));
    const a = afc(input.earnings);
    const pct = benefitPct(years, s);
    const monthly = a.monthly * pct / 100;
    return {
      years, pct,
      afcAnnual: a.annual, afcMonthly: a.monthly, yearsUsed: a.count,
      monthly, annual: monthly * 12,
      explanation: explainPct(years, s),
    };
  }

  // ---------- DROP ----------

  // Builds the month-by-month DROP account schedule.
  // input: { monthlyBenefit, years (1-8), startDate (Date, first month of DROP) }
  function dropSchedule(input, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const deposit = Math.max(0, num(input.monthlyBenefit));
    const nYears = Math.max(0, Math.min(8, Math.round(num(input.years))));
    const nMonths = nYears * 12;
    const r = num(s.dropRatePct) / 100 / 12;
    const start = input.startDate instanceof Date ? input.startDate : new Date();
    const timing = s.depositTiming === 'start' ? 'start' : 'end';

    let balance = 0, totalDeposits = 0, totalInterest = 0;
    const years = [];
    for (let m = 1; m <= nMonths; m++) {
      let interest;
      if (timing === 'start') {
        balance += deposit;
        interest = balance * r;
        balance += interest;
      } else {
        interest = balance * r;
        balance += interest + deposit;
      }
      totalDeposits += deposit;
      totalInterest += interest;

      const yi = Math.floor((m - 1) / 12);
      if (!years[yi]) {
        years[yi] = { index: yi + 1, deposits: 0, interest: 0, startBalance: balance - interest - deposit, endBalance: 0, months: [], startLabel: '', endLabel: '' };
        years[yi].startLabel = monthLabel(addMonths(start, m - 1));
      }
      const y = years[yi];
      y.deposits += deposit;
      y.interest += interest;
      y.endBalance = balance;
      y.endLabel = monthLabel(addMonths(start, m - 1));
      y.months.push({ index: m, label: monthLabel(addMonths(start, m - 1)), deposit, interest, balance });
    }
    return {
      years, nYears, nMonths, monthlyBenefit: deposit, ratePct: num(s.dropRatePct), timing,
      totalDeposits, totalInterest, finalBalance: balance,
      startLabel: nMonths ? monthLabel(start) : '',
      endLabel: nMonths ? monthLabel(addMonths(start, nMonths - 1)) : '',
    };
  }

  // Extra take-home pay while in DROP (contributions stop)
  function takeHomeBump(annualPay, contribRatePct) {
    const annual = Math.max(0, num(annualPay)) * num(contribRatePct) / 100;
    return { annual, monthly: annual / 12, perPaycheck: annual / 26 };
  }

  // ---------- pay builder (CBA) ----------

  // input: { rank, base, otHours, incentives: [ids], holiday: bool, other }
  function buildPay(input, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const rank = ANNUAL_HOURS[input.rank] ? input.rank : 'firefighter';
    const hours = ANNUAL_HOURS[rank];
    const base = Math.max(0, num(input.base));
    const otHours = Math.max(0, num(input.otHours));
    const ids = new Set(input.incentives || []);
    const incentiveTotal = INCENTIVES.filter(i => ids.has(i.id)).reduce((a, i) => a + i.amount, 0);
    const regularRate = hours ? (base + incentiveTotal) / hours : 0;   // CBA 29.5: incentives are in the FLSA regular rate
    const otPay = otHours * regularRate * 1.5;
    const holidayPay = input.holiday ? HOLIDAYS_PER_YEAR * HOLIDAY_HOURS * regularRate : 0;
    const other = Math.max(0, num(input.other));
    const total = base + incentiveTotal + otPay + holidayPay + other;
    return {
      rank, hours, base, incentiveTotal, regularRate, otHours, otPay, holidayPay, other, total,
      otOverCap: otHours > s.otCapHours, otCapHours: s.otCapHours,
    };
  }

  return {
    DEFAULTS, ANNUAL_HOURS, RANKS, PAY_SCALES, INCENTIVES, HOLIDAYS_PER_YEAR, HOLIDAY_HOURS,
    num, parseDate, addMonths, monthLabel, monthsBetween, creditedService, splitYears,
    benefitPct, explainPct, yearsToCap, afc, pension, dropSchedule, takeHomeBump, buildPay,
  };
});
