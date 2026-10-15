(function (root) {
  "use strict";
  // Use HMRC's published monthly NI thresholds, not annual values divided by 12.
  const common = {
    allowance: 12570,
    taperStart: 100000,
    niPrimary: 1048,
    niUpper: 4189,
    niSecondary: 417,
    pensionLower: 520,
    pensionUpper: 4189,
    bands: [
      [37700, 0.2],
      [125140, 0.4],
      [Infinity, 0.45],
    ],
  };
  const RULES = {
    2025: {
      ...common,
      minimumAdultRate: 12.21,
      scottishBands: [
        [2827, 0.19],
        [14921, 0.2],
        [31092, 0.21],
        [62430, 0.42],
        [125140, 0.45],
        [Infinity, 0.48],
      ],
    },
    2026: {
      ...common,
      minimumAdultRate: 12.71,
      scottishBands: [
        [3967, 0.19],
        [16956, 0.2],
        [31092, 0.21],
        [62430, 0.42],
        [125140, 0.45],
        [Infinity, 0.48],
      ],
    },
  };
  const REGIONS = ["england-and-wales", "scotland", "northern-ireland"];
  const round = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
  function number(value, label, min = 0, max = 1000000) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new Error(`${label} must be a number between ${min} and ${max}.`);
    return value;
  }
  function rulesFor(year) {
    if (!Object.hasOwn(RULES, year))
      throw new Error("This payroll year has no verified rates.");
    return RULES[year];
  }
  function defaultSettings(year) {
    return {
      rate: rulesFor(year).minimumAdultRate,
      region: "england-and-wales",
      schedule: [8, 8, 8, 8, 8, 0, 0],
      leaveHours: 224,
      bankPaid: true,
      bankInAllowance: true,
      niCategory: "A",
      pensionMethod: "relief-at-source",
      pensionBasis: "qualifying",
      employeePercent: 5,
      employerPercent: 3,
    };
  }
  function validateSettings(settings) {
    if (!settings || typeof settings !== "object")
      throw new Error("Missing employee settings.");
    if (!REGIONS.includes(settings.region))
      throw new Error("Unknown UK region.");
    if (!["A", "C", "M", "H"].includes(settings.niCategory))
      throw new Error("Unsupported NI category.");
    if (
      !["off", "net-pay", "relief-at-source", "salary-sacrifice"].includes(
        settings.pensionMethod,
      )
    )
      throw new Error("Unknown pension method.");
    if (!["qualifying", "all"].includes(settings.pensionBasis))
      throw new Error("Unknown pension basis.");
    if (!Array.isArray(settings.schedule) || settings.schedule.length !== 7)
      throw new Error("Set hours for all seven weekdays.");
    if (
      typeof settings.bankPaid !== "boolean" ||
      typeof settings.bankInAllowance !== "boolean"
    )
      throw new Error("Invalid bank holiday settings.");
    return {
      rate: number(settings.rate, "Hourly rate", 0, 10000),
      region: settings.region,
      schedule: settings.schedule.map((hours) =>
        number(hours, "Daily hours", 0, 24),
      ),
      leaveHours: number(settings.leaveHours, "Annual leave hours", 0, 8784),
      bankPaid: settings.bankPaid,
      bankInAllowance: settings.bankInAllowance,
      niCategory: settings.niCategory,
      pensionMethod: settings.pensionMethod,
      pensionBasis: settings.pensionBasis,
      employeePercent: number(
        settings.employeePercent,
        "Employee pension percentage",
        0,
        100,
      ),
      employerPercent: number(
        settings.employerPercent,
        "Employer pension percentage",
        0,
        100,
      ),
    };
  }
  function incomeTax(annualPay, year, region, adjustedIncome = annualPay) {
    const rules = rulesFor(year);
    const allowance = Math.max(
      0,
      rules.allowance - Math.max(0, adjustedIncome - rules.taperStart) / 2,
    );
    const taxable = Math.max(0, annualPay - allowance);
    let previous = 0,
      tax = 0;
    for (const [ceiling, rate] of region === "scotland"
      ? rules.scottishBands
      : rules.bands) {
      tax += Math.max(0, Math.min(taxable, ceiling) - previous) * rate;
      previous = ceiling;
    }
    return round(tax);
  }
  function calculatePay(gross, year, inputSettings) {
    number(gross, "Gross pay", 0, 100000000);
    const settings = validateSettings(inputSettings),
      rules = rulesFor(year);
    const pensionable =
      settings.pensionBasis === "qualifying"
        ? Math.max(0, Math.min(gross, rules.pensionUpper) - rules.pensionLower)
        : gross;
    const pensionGross =
      settings.pensionMethod === "off"
        ? 0
        : round((pensionable * settings.employeePercent) / 100);
    const employerPension =
      settings.pensionMethod === "off"
        ? 0
        : round((pensionable * settings.employerPercent) / 100);
    const sacrifice =
      settings.pensionMethod === "salary-sacrifice" ? pensionGross : 0;
    const cashGross = round(gross - sacrifice);
    const taxable =
      cashGross - (settings.pensionMethod === "net-pay" ? pensionGross : 0);
    const sourceRelief =
      settings.pensionMethod === "relief-at-source"
        ? round(pensionGross * 0.2)
        : 0;
    const pensionDeduction =
      settings.pensionMethod === "salary-sacrifice"
        ? 0
        : round(pensionGross - sourceRelief);
    // Annualise each month independently: this is a planning estimate, not cumulative PAYE.
    const adjustedIncome =
      taxable -
      (settings.pensionMethod === "relief-at-source" ? pensionGross : 0);
    const tax = round(
      incomeTax(taxable * 12, year, settings.region, adjustedIncome * 12) / 12,
    );
    const employeeNI =
      settings.niCategory === "C"
        ? 0
        : round(
            Math.max(0, Math.min(cashGross, rules.niUpper) - rules.niPrimary) *
              0.08 +
              Math.max(0, cashGross - rules.niUpper) * 0.02,
          );
    const secondary = ["M", "H"].includes(settings.niCategory)
      ? rules.niUpper
      : rules.niSecondary;
    const employerNI = round(Math.max(0, cashGross - secondary) * 0.15);
    return {
      gross: round(gross),
      cashGross,
      tax,
      employeeNI,
      employerNI,
      pensionGross,
      pensionDeduction,
      sourceRelief,
      sacrifice,
      employerPension,
      net: round(cashGross - tax - employeeNI - pensionDeduction),
      employerCost: round(cashGross + employerNI + employerPension + sacrifice),
    };
  }
  const dateKey = (date) => date.toISOString().slice(0, 10);
  function validateDay(day) {
    if (!day || typeof day !== "object") throw new Error("Invalid day entry.");
    const clean = {
      work: number(day.work, "Worked hours", 0, 24),
      leave: number(day.leave, "Annual leave hours", 0, 24),
      bank: number(day.bank, "Bank holiday hours", 0, 24),
    };
    if (clean.work + clean.leave + clean.bank > 24)
      throw new Error("A day cannot contain more than 24 paid hours.");
    return clean;
  }
  function dayFor(key, plan, holidayData) {
    if (Object.hasOwn(plan.days, key)) return plan.days[key];
    const date = new Date(`${key}T12:00:00Z`);
    const hours = plan.settings.schedule[(date.getUTCDay() + 6) % 7];
    const isHoliday = holidayData[plan.settings.region].some(
      (event) => event.date === key,
    );
    return isHoliday && plan.settings.bankPaid
      ? { work: 0, leave: 0, bank: hours }
      : { work: hours, leave: 0, bank: 0 };
  }
  function buildYear(year, plan, holidayData) {
    rulesFor(year);
    const months = [];
    for (let offset = 0; offset < 12; offset++) {
      const first = new Date(Date.UTC(Number(year), offset + 3, 1, 12)),
        cursor = new Date(first),
        days = [];
      while (cursor.getUTCMonth() === first.getUTCMonth()) {
        const key = dateKey(cursor);
        days.push({ key, ...dayFor(key, plan, holidayData) });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const total = (field) =>
        round(days.reduce((sum, day) => sum + day[field], 0));
      const work = total("work"),
        leave = total("leave"),
        bank = total("bank");
      months.push({
        key: dateKey(first).slice(0, 7),
        days,
        work,
        leave,
        bank,
        paid: round(work + leave + bank),
        pay: calculatePay(
          round((work + leave + bank) * plan.settings.rate),
          year,
          plan.settings,
        ),
      });
    }
    return months;
  }
  function leaveBalance(months, settings) {
    const booked = round(
      months.reduce(
        (sum, month) =>
          sum + month.leave + (settings.bankInAllowance ? month.bank : 0),
        0,
      ),
    );
    return { booked, remaining: round(settings.leaveHours - booked) };
  }
  function validateState(input) {
    if (
      !input ||
      input.version !== 2 ||
      !Array.isArray(input.employees) ||
      input.employees.length < 1 ||
      input.employees.length > 25
    )
      throw new Error(
        "Use a version 2 backup containing between 1 and 25 employees.",
      );
    rulesFor(input.year);
    const ids = new Set();
    const employees = input.employees.map((employee) => {
      if (
        typeof employee.id !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(employee.id) ||
        ids.has(employee.id)
      )
        throw new Error("Invalid or duplicate employee ID.");
      ids.add(employee.id);
      if (
        typeof employee.name !== "string" ||
        !employee.name.trim() ||
        employee.name.length > 80
      )
        throw new Error("Employee names must contain 1–80 characters.");
      if (!employee.years || typeof employee.years !== "object")
        throw new Error("Missing payroll years.");
      const years = {};
      for (const [year, plan] of Object.entries(employee.years)) {
        rulesFor(year);
        if (
          !plan ||
          !plan.days ||
          typeof plan.days !== "object" ||
          Array.isArray(plan.days)
        )
          throw new Error("Invalid calendar entries.");
        const settings = validateSettings(plan.settings),
          days = {};
        if (Object.keys(plan.days).length > 366)
          throw new Error("Too many calendar entries.");
        for (const [key, value] of Object.entries(plan.days)) {
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
            key < `${year}-04-01` ||
            key > `${Number(year) + 1}-03-31`
          )
            throw new Error("Day falls outside its payroll year.");
          const date = new Date(`${key}T12:00:00Z`);
          if (!Number.isFinite(date.getTime()) || dateKey(date) !== key)
            throw new Error("Invalid calendar date.");
          days[key] = validateDay(value);
        }
        years[year] = { settings, days };
      }
      return { id: employee.id, name: employee.name.trim(), years };
    });
    if (!ids.has(input.activeEmployeeId))
      throw new Error("Active employee is missing.");
    return {
      version: 2,
      year: Number(input.year),
      activeEmployeeId: input.activeEmployeeId,
      employees,
    };
  }
  const api = {
    RULES,
    REGIONS,
    round,
    defaultSettings,
    validateSettings,
    incomeTax,
    calculatePay,
    dateKey,
    validateDay,
    dayFor,
    buildYear,
    leaveBalance,
    validateState,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SalaryCalculator = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
