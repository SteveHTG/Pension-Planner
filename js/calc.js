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

  // Pay codes as they appear in the EARNINGS block of a City of Clermont pay stub.
  // Members copy the YTD column from the last stub of the year.
  // pensionable: counted toward salary. ot: subject to the 300-hour cap.
  const STUB_CODES = [
    { id: 'regular',  code: 'REGULAR',    label: 'Regular pay',                group: 'pay',  pensionable: true },
    { id: 'vacation', code: 'VACATION',   label: 'Vacation (time used)',       group: 'pay',  pensionable: true },
    { id: 'sick',     code: 'SICK',       label: 'Sick (time used)',           group: 'pay',  pensionable: true },
    { id: 'holiday',  code: 'HOLIDAY',    label: 'Holiday pay',                group: 'pay',  pensionable: true },
    { id: 'holwork',  code: 'HOL WORK',   label: 'Holiday worked',             group: 'pay',  pensionable: true },
    { id: 'adminlv',  code: 'ADMIN LV',   label: 'Admin leave',                group: 'pay',  pensionable: true },
    { id: 'jury',     code: 'JURY DUTY',  label: 'Jury duty',                  group: 'pay',  pensionable: true },
    { id: 'ot',       code: 'OT REG 1.5', label: 'Overtime',                   group: 'ot',   pensionable: true, ot: true },
    { id: 'woc',      code: 'W.O.C',      label: 'Working out of class',       group: 'other', pensionable: true },
    { id: 'special',  code: 'SPECIAL EV', label: 'Special events',             group: 'other', pensionable: true },
    { id: 'retro',    code: 'RETRO PAY',  label: 'Retro pay',                  group: 'other', pensionable: true },
    { id: 'paramedic', code: 'PARAMEDIC', label: 'Paramedic incentive',        group: 'inc',  pensionable: true },
    { id: 'trttech',  code: 'TRT TECH',   label: 'Tech Rescue Technician',     group: 'inc',  pensionable: true },
    { id: 'trtteam',  code: 'TRT TEAM',   label: 'Tech Rescue Team',           group: 'inc',  pensionable: true },
    { id: 'surface',  code: 'SURFACE WA', label: 'Surface Water Rescue',       group: 'inc',  pensionable: true },
    { id: 'otherinc', code: 'FTO / other', label: 'Other incentive',           group: 'inc',  pensionable: true },
    { id: 'otherpay', code: 'OTHER',      label: 'Other pensionable pay',      group: 'other', pensionable: true },
  ];
  // Codes that appear on stubs but are NOT pensionable salary (shown for reconciliation only).
  const STUB_EXCLUDED = ['LUMP SUM', 'LIFE BENEF', 'MOTIVATE', 'UNIFORMS'];

  // Stub code text -> line id. Matched after uppercasing and collapsing spaces.
  const STUB_ALIASES = {
    'REGULAR': 'regular', 'VACATION': 'vacation', 'SICK': 'sick', 'HOLIDAY': 'holiday', 'HOL WORK': 'holwork',
    'ADMIN LV': 'adminlv', 'JURY DUTY': 'jury', 'OT REG 1.5': 'ot', 'W.O.C': 'woc', 'SPECIAL EV': 'special',
    'RETRO PAY': 'retro', 'PARAMEDIC': 'paramedic', 'TRT TECH': 'trttech', 'TRT TEAM': 'trtteam', 'SURFACE WA': 'surface',
  };

  // CBA Article 29.4 raises, expressed as "pay in this calendar year vs. the year before".
  // The 15% took effect Oct 2024, the 4% raises Oct 2025 and Oct 2026, so they mostly land in the following calendar year.
  const CONTRACT_RAISES = { 2025: 15, 2026: 4, 2027: 4 };

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

  // Best 5 years out of those entered (the plan averages the 5 highest of the last 10).
  function afc(earnings) {
    const vals = (earnings || []).map(num).filter(v => v > 0).sort((a, b) => b - a).slice(0, 5);
    if (!vals.length) return { annual: 0, monthly: 0, count: 0 };
    const annual = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { annual, monthly: annual / 12, count: vals.length };
  }

  // Indexes of the entries that make up the best 5.
  function topFiveIndexes(earnings) {
    return (earnings || []).map((v, i) => ({ v: num(v), i })).filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.i);
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

  // ---------- overtime cap check ----------

  // Checks overtime against the pensionable cap (300 hours per year).
  // input: { otPay, otHours, hourlyRate }
  //   otHours may be blank; then hours are estimated as otPay / (hourlyRate * 1.5).
  function otCapCheck(input, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const cap = Math.max(0, num(s.otCapHours));
    const otPay = Math.max(0, num(input.otPay));
    const rate = Math.max(0, num(input.hourlyRate));
    const otRate = rate * 1.5;
    const given = input.otHours !== '' && input.otHours != null && num(input.otHours) > 0;
    let hours = given ? num(input.otHours) : (otRate > 0 ? otPay / otRate : 0);
    const estimated = !given;
    const overHours = Math.max(0, hours - cap);
    // Pay attributable to hours over the cap. Uses the average OT dollars per hour actually paid.
    const perHour = hours > 0 ? otPay / hours : otRate;
    const excludedPay = Math.min(otPay, overHours * perHour);
    return {
      otPay, hours, estimated, otRate, cap, overHours, excludedPay,
      allowedPay: otPay - excludedPay, over: overHours > 0, canCheck: hours > 0 || otPay === 0,
    };
  }

  // ---------- pay from a pay stub (YTD column) ----------

  // input: { rate, otHours, gross, lines: { <code id>: amount }, extras: [{ code, amount, include }] }
  //   extras are stub lines the app did not recognize; only those with include=true are counted.
  function buildFromStub(input, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    const lines = input.lines || {};
    const rate = Math.max(0, num(input.rate));
    let subtotal = 0, incentiveTotal = 0, otPay = 0;
    const items = STUB_CODES.map(c => {
      const amount = Math.max(0, num(lines[c.id]));
      if (c.ot) otPay += amount;
      else if (c.group === 'inc') incentiveTotal += amount;
      subtotal += amount;
      return { id: c.id, code: c.code, label: c.label, group: c.group, amount };
    });
    let extrasTotal = 0;
    (input.extras || []).forEach(x => { if (x && x.include) extrasTotal += Math.max(0, num(x.amount)); });
    subtotal += extrasTotal;
    // CBA 29.5: incentives are part of the FLSA regular rate, so overtime is paid at 1.5x (base + incentives).
    // Stubs print an hourly rate on each incentive line; when we don't have it, spread the annual amount over shift hours.
    const incRate = num(input.incRate) > 0 ? num(input.incRate) : incentiveTotal / ANNUAL_HOURS.firefighter;
    const regularRate = rate > 0 ? rate + incRate : 0;
    const ot = otCapCheck({ otPay, otHours: input.otHours, hourlyRate: regularRate }, s);
    const total = subtotal - ot.excludedPay;
    const gross = Math.max(0, num(input.gross));
    return {
      rate, incRate, regularRate, items, subtotal, incentiveTotal, otPay, extrasTotal, ot, total,
      raisedPortion: total - incentiveTotal, flatPortion: incentiveTotal,
      gross, unaccounted: gross > 0 ? gross - subtotal : null,
    };
  }

  // ---------- pay stub PDF parsing ----------

  // rows: array of strings, one per visual line of the stub, words joined by spaces in left-to-right order.
  // Earnings lines read: CODE $rate(4 dp) hours(2 dp) $current $ytd, followed on the same visual row by a deduction.
  function parseStubRows(rows) {
    const money = '\\$\\s*([\\d,]+\\.\\d{2})';
    const earn = new RegExp('([A-Z][A-Z0-9 .\\/&-]*?)\\s*\\$\\s*([\\d,]+\\.\\d{4})\\s+(\\d[\\d,]*\\.\\d{2})\\s*' + money + '\\s*' + money, 'g');
    const out = { lines: {}, rate: '', incRate: 0, grossYtd: '', year: null, periodEnd: null, payDate: null, partialYear: false, matched: [], unmatched: [], excluded: [] };
    const incIds = STUB_CODES.filter(c => c.group === 'inc').map(c => c.id);
    const seen = {};
    (rows || []).forEach(raw => {
      const row = String(raw).replace(/\s+/g, ' ').trim();
      let m;
      earn.lastIndex = 0;
      while ((m = earn.exec(row)) !== null) {
        const code = m[1].trim().replace(/\s+/g, ' ').toUpperCase();
        if (!code || code === 'TOTAL' || seen[code]) continue;
        seen[code] = true;
        const rate = num(m[2]), ytd = num(m[5]);
        const id = STUB_ALIASES[code] || (/^(OT|OVERTIME)\b/.test(code) ? 'ot' : null);
        if (id) {
          out.lines[id] = (out.lines[id] || 0) + ytd;
          out.matched.push({ code, id, ytd, rate });
          if (id === 'regular' && rate > 0) out.rate = rate;
          if (incIds.indexOf(id) >= 0) out.incRate += rate;
        } else if (STUB_EXCLUDED.indexOf(code) >= 0) {
          out.excluded.push({ code, ytd });
        } else if (ytd > 0) {
          out.unmatched.push({ code, ytd });
        }
      }
      let g = /^GROSS PAY\s*\$\s*[\d,]+\.\d{2}\s*\$\s*([\d,]+\.\d{2})/i.exec(row);
      if (g) out.grossYtd = num(g[1]);
      if (!out.grossYtd) {
        g = /^TOTAL\s+\d[\d,]*\.\d{2}\s*\$\s*[\d,]+\.\d{2}\s*\$\s*([\d,]+\.\d{2})/.exec(row);
        if (g) out.grossYtd = num(g[1]);
      }
      const p = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(row);
      if (p && !out.periodEnd) {
        out.periodEnd = { month: +p[4], day: +p[5], year: +p[6] };
        const before = row.slice(0, p.index);
        const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(before.trim());
        if (d) out.payDate = { month: +d[1], day: +d[2], year: +d[3] };
      }
    });
    const ref = out.payDate || out.periodEnd;
    if (ref) { out.year = ref.year; out.partialYear = ref.month < 12; }
    return out;
  }

  // ---------- projection ----------

  // Grows a known year's pay forward.
  //  base: a number, or { raised, flat }. The raised portion (everything paid off the hourly rate:
  //  regular, leave, holiday, overtime, out of class) grows by the contract raise where the CBA sets one,
  //  otherwise by assumedPct. The flat portion (incentive pay) does not grow: CBA 29.5 says incentive
  //  pay is not subject to pay increases.
  function projectPay(base, fromYear, toYear, assumedPct) {
    const raised0 = typeof base === 'object' && base ? Math.max(0, num(base.raised)) : Math.max(0, num(base));
    const flat = typeof base === 'object' && base ? Math.max(0, num(base.flat)) : 0;
    let raised = raised0;
    const steps = [];
    for (let y = fromYear + 1; y <= toYear; y++) {
      const known = Object.prototype.hasOwnProperty.call(CONTRACT_RAISES, y);
      const pct = known ? CONTRACT_RAISES[y] : num(assumedPct);
      raised = raised * (1 + pct / 100);
      steps.push({ year: y, pct, source: known ? 'contract' : 'assumed', amount: raised + flat });
    }
    return { amount: raised + flat, raised, flat, steps };
  }

  // Plain-language description of the projection rules, shown in the app and the PDF.
  function projectionRulesText(assumedPct) {
    const known = Object.keys(CONTRACT_RAISES).map(y => y + ' +' + CONTRACT_RAISES[y] + '%').join(', ');
    return 'Projections grow pay that follows your hourly rate (regular, paid leave, holiday, overtime, working out of class) ' +
      'by the contract raises where the CBA sets them (' + known + '), then by ' + num(assumedPct) + '% a year after the contract ends. ' +
      'Incentive pay (paramedic, technical rescue, and so on) is held flat because the CBA says incentives do not receive pay increases. ' +
      'Overtime hours are assumed to repeat each year. Projections are estimates, not guarantees.';
  }

  // ---------- pay builder (CBA estimate) ----------

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
    const otPayFull = otHours * regularRate * 1.5;
    const ot = otCapCheck({ otPay: otPayFull, otHours, hourlyRate: regularRate }, s);
    const otPay = ot.allowedPay;
    const holidayPay = input.holiday ? HOLIDAYS_PER_YEAR * HOLIDAY_HOURS * regularRate : 0;
    const other = Math.max(0, num(input.other));
    const total = base + incentiveTotal + otPay + holidayPay + other;
    return {
      rank, hours, base, incentiveTotal, regularRate, otHours, otPay, otPayFull, ot, holidayPay, other, total,
      otOverCap: ot.over, otCapHours: s.otCapHours,
    };
  }

  return {
    DEFAULTS, ANNUAL_HOURS, RANKS, PAY_SCALES, INCENTIVES, HOLIDAYS_PER_YEAR, HOLIDAY_HOURS, STUB_CODES, STUB_EXCLUDED, STUB_ALIASES, CONTRACT_RAISES,
    num, parseDate, addMonths, monthLabel, monthsBetween, creditedService, splitYears,
    benefitPct, explainPct, yearsToCap, afc, topFiveIndexes, pension, dropSchedule, takeHomeBump, buildPay, otCapCheck, buildFromStub, parseStubRows, projectPay, projectionRulesText,
  };
});
