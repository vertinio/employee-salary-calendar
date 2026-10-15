const { test } = require("node:test");
const assert = require("node:assert/strict");
const calc = require("./calculator.js");
const holidays = require("./bank-holidays.js");
const settings = (overrides) => ({
  ...calc.defaultSettings(2026),
  pensionMethod: "off",
  ...overrides,
});
const plan = (overrides) => ({ settings: settings(overrides), days: {} });
const backup = () => ({
  version: 2,
  year: 2026,
  activeEmployeeId: "employee-1",
  employees: [
    { id: "employee-1", name: "Test employee", years: { 2026: plan() } },
  ],
});

test("standard income tax covers allowance, all bands and allowance taper", () => {
  for (const [income, expected] of [
    [0, 0],
    [12570, 0],
    [30000, 3486],
    [50270, 7540],
    [60000, 11432],
    [100000, 27432],
    [110000, 33432],
    [125140, 42516],
    [150000, 53703],
  ]) {
    assert.equal(
      calc.incomeTax(income, 2026, "england-and-wales"),
      expected,
      `annual income ${income}`,
    );
  }
});
test("Scottish bands change between verified years", () => {
  assert.equal(calc.incomeTax(30000, 2025, "scotland"), 3482.82);
  assert.equal(calc.incomeTax(30000, 2026, "scotland"), 3451.07);
  assert.equal(calc.incomeTax(150000, 2026, "scotland"), 59634.35);
});
test("standard monthly pay: independent £3,000 no-pension example", () => {
  const pay = calc.calculatePay(3000, 2026, settings());
  assert.equal(pay.tax, 390.5);
  assert.equal(pay.employeeNI, 156.16);
  assert.equal(pay.employerNI, 387.45);
  assert.equal(pay.net, 2453.34);
  assert.equal(pay.employerCost, 3387.45);
});
test("employee NI switches to 2% above the upper limit", () => {
  assert.equal(calc.calculatePay(5000, 2026, settings()).employeeNI, 267.5);
  assert.equal(calc.calculatePay(1048, 2026, settings()).employeeNI, 0);
  assert.equal(calc.calculatePay(4189, 2026, settings()).employeeNI, 251.28);
  assert.equal(calc.calculatePay(417, 2026, settings()).employerNI, 0);
});
test("NI exemptions: pension age, under-21 and apprentice", () => {
  assert.equal(
    calc.calculatePay(3000, 2026, settings({ niCategory: "C" })).employeeNI,
    0,
  );
  assert.equal(
    calc.calculatePay(3000, 2026, settings({ niCategory: "C" })).employerNI,
    387.45,
  );
  for (const niCategory of ["M", "H"]) {
    assert.equal(
      calc.calculatePay(3000, 2026, settings({ niCategory })).employerNI,
      0,
    );
    assert.equal(
      calc.calculatePay(5000, 2026, settings({ niCategory })).employerNI,
      121.65,
    );
  }
});
test("qualifying earnings pension applies both lower and upper limits", () => {
  const options = settings({ pensionMethod: "relief-at-source" });
  const pay = calc.calculatePay(3000, 2026, options);
  assert.equal(pay.pensionGross, 124);
  assert.equal(pay.pensionDeduction, 99.2);
  assert.equal(pay.sourceRelief, 24.8);
  assert.equal(pay.employerPension, 74.4);
  assert.equal(pay.net, 2354.14);
  assert.equal(pay.employerCost, 3461.85);
  assert.equal(calc.calculatePay(520, 2026, options).pensionGross, 0);
  assert.equal(calc.calculatePay(10000, 2026, options).pensionGross, 183.45);
});
test("net pay and salary sacrifice have distinct tax and NI treatment", () => {
  const netPay = calc.calculatePay(
    3000,
    2026,
    settings({ pensionMethod: "net-pay" }),
  );
  const sacrifice = calc.calculatePay(
    3000,
    2026,
    settings({ pensionMethod: "salary-sacrifice" }),
  );
  assert.equal(netPay.tax, 365.7);
  assert.equal(netPay.employeeNI, 156.16);
  assert.equal(netPay.net, 2354.14);
  assert.equal(sacrifice.cashGross, 2876);
  assert.equal(sacrifice.employeeNI, 146.24);
  assert.equal(sacrifice.employerNI, 368.85);
  assert.equal(sacrifice.net, 2364.06);
  assert.equal(sacrifice.employerCost, 3443.25);
});
test("all-pay pension basis is distinct from qualifying earnings", () => {
  assert.equal(
    calc.calculatePay(
      3000,
      2026,
      settings({ pensionMethod: "net-pay", pensionBasis: "all" }),
    ).pensionGross,
    150,
  );
});
test("zero pay produces zero deductions and cost", () => {
  for (const pensionMethod of [
    "off",
    "relief-at-source",
    "net-pay",
    "salary-sacrifice",
  ]) {
    for (const value of Object.values(
      calc.calculatePay(0, 2026, settings({ pensionMethod })),
    ))
      assert.equal(value, 0);
  }
});
test("calendar spans exactly April to March without timezone-dependent dates", () => {
  const months = calc.buildYear(2026, plan(), holidays);
  assert.equal(months.length, 12);
  const keys = months.flatMap((month) => month.days.map((day) => day.key));
  assert.equal(keys.length, 365);
  assert.equal(new Set(keys).size, 365);
  assert.equal(keys[0], "2026-04-01");
  assert.equal(keys.at(-1), "2027-03-31");
});
test("regional holidays and part-time schedules use actual scheduled hours", () => {
  const partTime = plan({ schedule: [0, 6, 6, 6, 0, 0, 0] });
  assert.deepEqual(calc.dayFor("2026-05-04", partTime, holidays), {
    work: 0,
    leave: 0,
    bank: 0,
  });
  const fullTime = plan();
  assert.deepEqual(calc.dayFor("2026-03-17", fullTime, holidays), {
    work: 8,
    leave: 0,
    bank: 0,
  });
  const northern = plan({ region: "northern-ireland" });
  assert.deepEqual(calc.dayFor("2026-03-17", northern, holidays), {
    work: 0,
    leave: 0,
    bank: 8,
  });
  assert.deepEqual(
    calc.dayFor("2026-05-04", plan({ bankPaid: false }), holidays),
    { work: 8, leave: 0, bank: 0 },
  );
});
test("half-day leave replaces work without changing gross and accumulates across months", () => {
  const current = plan({ bankInAllowance: false });
  const before = calc.buildYear(2026, current, holidays);
  current.days["2026-04-01"] = { work: 4, leave: 4, bank: 0 };
  current.days["2026-05-01"] = { work: 0, leave: 8, bank: 0 };
  const after = calc.buildYear(2026, current, holidays);
  assert.equal(before[0].pay.gross, after[0].pay.gross);
  assert.deepEqual(calc.leaveBalance(after, current.settings), {
    booked: 12,
    remaining: 212,
  });
});
test("bank holidays can be included in or excluded from the agreed leave budget", () => {
  const current = plan();
  const months = calc.buildYear(2026, current, holidays);
  const bankHours = months.reduce((sum, month) => sum + month.bank, 0);
  assert.ok(bankHours > 0);
  assert.equal(calc.leaveBalance(months, current.settings).booked, bankHours);
  assert.equal(
    calc.leaveBalance(months, { ...current.settings, bankInAllowance: false })
      .booked,
    0,
  );
});
test("overrides can make a scheduled day unpaid or pay a normally non-working day", () => {
  const current = plan();
  current.days["2026-04-01"] = { work: 0, leave: 0, bank: 0 };
  current.days["2026-04-04"] = { work: 3, leave: 0, bank: 0 };
  assert.deepEqual(calc.dayFor("2026-04-01", current, holidays), {
    work: 0,
    leave: 0,
    bank: 0,
  });
  assert.deepEqual(calc.dayFor("2026-04-04", current, holidays), {
    work: 3,
    leave: 0,
    bank: 0,
  });
});
test("backups round-trip profiles, years and edits independently", () => {
  const state = backup();
  state.employees[0].years[2025] = plan({ rate: 12.21 });
  state.employees[0].years[2026].days["2026-04-01"] = {
    work: 4,
    leave: 4,
    bank: 0,
  };
  state.employees.push({
    id: "employee-2",
    name: "<img src=x onerror=alert(1)>",
    years: { 2026: plan({ rate: 20 }) },
  });
  assert.deepEqual(
    calc.validateState(JSON.parse(JSON.stringify(state))),
    state,
  );
});
test("malformed backups reject impossible dates, unknown years and duplicate IDs", () => {
  for (const mutate of [
    (state) => {
      state.year = 2027;
    },
    (state) => {
      state.employees[0].years[2026].days["2027-02-30"] = {
        work: 8,
        leave: 0,
        bank: 0,
      };
    },
    (state) => {
      state.employees[0].years[2026].days["2026-03-31"] = {
        work: 8,
        leave: 0,
        bank: 0,
      };
    },
    (state) => {
      state.employees.push(structuredClone(state.employees[0]));
    },
    (state) => {
      state.employees[0].years[2026].settings.rate = "12.71";
    },
    (state) => {
      state.employees[0].years[2026].settings.schedule = [8];
    },
    (state) => {
      state.activeEmployeeId = "missing";
    },
  ]) {
    const state = backup();
    mutate(state);
    assert.throws(() => calc.validateState(state));
  }
});
test("unsafe input cannot create prototype properties", () => {
  const state = backup();
  state.employees[0].years = JSON.parse(
    '{"__proto__":{"days":{},"settings":{}}}',
  );
  assert.throws(() => calc.validateState(state));
  assert.equal({}.days, undefined);
});
test("invalid numeric inputs never silently produce NaN", () => {
  for (const gross of [-1, Infinity, NaN, "3000"])
    assert.throws(() => calc.calculatePay(gross, 2026, settings()));
  assert.throws(() => calc.validateDay({ work: 20, leave: 8, bank: 0 }));
  assert.throws(() => calc.validateSettings(settings({ employeePercent: -1 })));
  assert.throws(() => calc.calculatePay(3000, 2027, settings()));
});
