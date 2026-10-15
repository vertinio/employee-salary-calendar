(() => {
  "use strict";
  const calc = window.SalaryCalculator;
  const holidays = window.BankHolidays;
  const STORAGE_KEY = "uk-salary-planner-v2";
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const money = (value) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(value);
  const hours = (value) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
  const byId = (id) => document.getElementById(id);
  const monthName = (key) =>
    new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  let selectedMonth = 0;
  let selectedDay = null;
  let months = [];
  let storageBlocked = false;

  function notify(message) {
    byId("message").textContent = message;
    byId("message").hidden = !message;
  }
  function newState() {
    const year = 2026;
    const id = crypto.randomUUID();
    return {
      version: 2,
      year,
      activeEmployeeId: id,
      employees: [
        {
          id,
          name: "Employee 1",
          years: { [year]: { settings: calc.defaultSettings(year), days: {} } },
        },
      ],
    };
  }
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? calc.validateState(JSON.parse(saved)) : newState();
    } catch (error) {
      // Do not overwrite a damaged backup or a future schema automatically.
      storageBlocked = true;
      notify(
        `Saved data could not be loaded: ${error.message} Original browser data has been kept. Export your working session before closing this page.`,
      );
      return newState();
    }
  }
  let state = loadState();
  function employee() {
    return state.employees.find((item) => item.id === state.activeEmployeeId);
  }
  function plan() {
    const person = employee();
    if (!Object.hasOwn(person.years, state.year))
      person.years[state.year] = {
        settings: calc.defaultSettings(state.year),
        days: {},
      };
    return person.years[state.year];
  }
  function persist() {
    if (storageBlocked) {
      byId("storage-status").textContent =
        "Not saved to this browser. Export a backup before closing.";
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      byId("storage-status").textContent = settingsDirty
        ? "Settings have unsaved changes. Save settings before reviewing estimates or exporting."
        : "Saved in this browser · Export a backup to keep a separate copy. No cloud sync.";
    } catch (error) {
      byId("storage-status").textContent =
        "Changes are not saved. Export a backup before closing.";
      notify(`Browser storage is unavailable: ${error.message}`);
    }
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function option(value, label) {
    const node = element("option", label);
    node.value = value;
    return node;
  }
  function fillSettings() {
    const settings = plan().settings;
    byId("name").value = employee().name;
    for (const [key, value] of Object.entries(settings)) {
      if (key === "schedule")
        value.forEach((dailyHours, index) => {
          byId(`schedule-${index}`).value = dailyHours;
        });
      else if (typeof value === "boolean") byId(key).checked = value;
      else byId(key).value = value;
    }
    byId("delete-employee").disabled = state.employees.length === 1;
    byId("add-employee").disabled = state.employees.length >= 25;
  }
  function metric(label, value, note, negative = false) {
    const card = element(
      "div",
      undefined,
      negative ? "metric negative" : "metric",
    );
    card.append(element("p", label), element("strong", value));
    if (note) card.append(element("small", note));
    return card;
  }
  function renderYear() {
    const settings = plan().settings;
    months = calc.buildYear(state.year, plan(), holidays);
    const total = (field) =>
      calc.round(months.reduce((sum, month) => sum + month.pay[field], 0));
    const leave = calc.leaveBalance(months, settings);
    byId("year-summary").replaceChildren(
      metric(
        "Annual gross pay",
        money(total("gross")),
        "Planned paid hours × hourly rate",
      ),
      metric(
        "Estimated take-home",
        money(total("net")),
        "Sum of monthly estimates",
      ),
      metric(
        "Total employer cost",
        money(total("employerCost")),
        "Pay + employer NI + pension",
      ),
      metric(
        "Leave budget remaining",
        `${hours(leave.remaining)} h`,
        `${hours(leave.booked)} h planned / ${hours(settings.leaveHours)} h budget`,
        leave.remaining < 0,
      ),
    );
    const warnings = [];
    if (leave.remaining < 0)
      warnings.push("Planned leave exceeds this year’s budget.");
    if (settings.rate < calc.RULES[state.year].minimumAdultRate)
      warnings.push(
        `Rate is below the £${calc.RULES[state.year].minimumAdultRate.toFixed(2)} minimum for age 21+; younger workers have different rates.`,
      );
    if (settings.pensionMethod === "salary-sacrifice")
      warnings.push(
        "Check that salary sacrifice does not reduce cash pay below the applicable minimum wage.",
      );
    byId("plan-warnings").textContent = warnings.join(" ");
    byId("employee-heading").textContent =
      `${employee().name} · ${state.year}/${String(state.year + 1).slice(-2)}`;
    byId("month").replaceChildren(
      ...months.map((month, index) => option(index, monthName(month.key))),
    );
    byId("month").value = selectedMonth;
    byId("annual-rows").replaceChildren(
      ...months.map((month, index) => {
        const row = element("tr");
        const labelCell = element("td");
        const button = element("button", monthName(month.key), "table-month");
        button.type = "button";
        button.addEventListener("click", () => {
          selectedMonth = index;
          renderMonth();
          byId("calendar-title").scrollIntoView({
            block: "start",
            behavior: "smooth",
          });
        });
        labelCell.append(button);
        row.append(
          labelCell,
          ...[
            hours(month.paid),
            money(month.pay.gross),
            money(month.pay.net),
            money(month.pay.employerCost),
          ].map((text) => element("td", text)),
        );
        return row;
      }),
    );
    renderMonth();
  }
  function renderMonth() {
    const month = months[selectedMonth];
    byId("month").value = selectedMonth;
    byId("calendar-title").textContent = monthName(month.key);
    byId("previous-month").disabled = selectedMonth === 0;
    byId("next-month").disabled = selectedMonth === 11;
    const calendar = byId("calendar");
    calendar.replaceChildren(
      ...weekdayNames.map((name) => element("div", name, "weekday")),
    );
    const first = new Date(`${month.key}-01T12:00:00Z`);
    for (let index = 0; index < (first.getUTCDay() + 6) % 7; index++)
      calendar.append(element("div"));
    for (const day of month.days) {
      const button = element("button", undefined, "day");
      button.type = "button";
      const holiday = holidays[plan().settings.region].find(
        (event) => event.date === day.key,
      );
      if (day.bank) button.classList.add("bank");
      else if (day.leave) button.classList.add("leave");
      else if (day.work) button.classList.add("work");
      if (Object.hasOwn(plan().days, day.key)) button.classList.add("edited");
      button.dataset.date = day.key;
      button.append(
        element("span", String(Number(day.key.slice(-2))), "day-number"),
      );
      const parts = [];
      for (const [field, label] of [
        ["work", "Work"],
        ["leave", "Leave"],
        ["bank", "Bank"],
      ]) {
        if (day[field]) {
          button.append(
            element("small", `${hours(day[field])}h ${label.toLowerCase()}`),
          );
          parts.push(`${label} ${hours(day[field])} hours`);
        }
      }
      if (!parts.length) button.append(element("small", "Off"));
      const accessibleDate = new Date(
        `${day.key}T12:00:00Z`,
      ).toLocaleDateString("en-GB", { dateStyle: "full", timeZone: "UTC" });
      button.setAttribute(
        "aria-label",
        `${accessibleDate}. ${parts.join(", ") || "No paid hours"}${holiday ? `. ${holiday.title}` : ""}`,
      );
      if (holiday) button.title = holiday.title;
      button.addEventListener("click", () => openDay(day.key));
      calendar.append(button);
    }
    byId("month-hours").textContent =
      `${hours(month.work)}h work · ${hours(month.leave)}h annual leave · ${hours(month.bank)}h paid bank holidays`;
    const pay = month.pay;
    const values = [
      ["Gross pay", pay.gross],
      ["Est. take-home", pay.net],
      ["Income tax estimate", pay.tax],
      ["Employee NI", pay.employeeNI],
      ["Employee pension deducted", pay.pensionDeduction],
      ["Pension tax relief (provider)", pay.sourceRelief],
      ["Salary sacrifice", pay.sacrifice],
      ["Employer NI", pay.employerNI],
      ["Employer pension", pay.employerPension],
      ["Total employer cost", pay.employerCost],
    ];
    byId("month-summary").replaceChildren(
      ...values.map(([label, value]) => {
        const card = element("div");
        card.append(element("p", label), element("strong", money(value)));
        return card;
      }),
    );
  }
  function renderAll() {
    plan();
    byId("employee").replaceChildren(
      ...state.employees.map((person) => option(person.id, person.name)),
    );
    byId("employee").value = state.activeEmployeeId;
    byId("year").value = state.year;
    fillSettings();
    renderYear();
    persist();
  }
  function openDay(key) {
    selectedDay = key;
    const day = calc.dayFor(key, plan(), holidays);
    byId("day-title").textContent = new Date(
      `${key}T12:00:00Z`,
    ).toLocaleDateString("en-GB", { dateStyle: "full", timeZone: "UTC" });
    byId("day-holiday").textContent =
      holidays[plan().settings.region].find((event) => event.date === key)
        ?.title || "Adjust paid hours for this date only.";
    for (const field of ["work", "leave", "bank"])
      byId(`day-${field}`).value = day[field];
    byId("day-error").textContent = "";
    byId("day-dialog").showModal();
  }
  function closeDay() {
    byId("day-dialog").close();
    selectedDay = null;
  }
  function download(contents, name, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  weekdayNames.forEach((name, index) => {
    const label = element("label", name),
      input = document.createElement("input");
    input.id = `schedule-${index}`;
    input.type = "number";
    input.min = "0";
    input.max = "24";
    input.step = "0.25";
    input.required = true;
    label.append(input);
    byId("schedule").append(label);
  });
  byId("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const settings = {};
      for (const key of Object.keys(calc.defaultSettings(state.year))) {
        if (key === "schedule")
          settings.schedule = weekdayNames.map(
            (_, index) => byId(`schedule-${index}`).valueAsNumber,
          );
        else if (["bankPaid", "bankInAllowance"].includes(key))
          settings[key] = byId(key).checked;
        else if (
          ["rate", "leaveHours", "employeePercent", "employerPercent"].includes(
            key,
          )
        )
          settings[key] = byId(key).valueAsNumber;
        else settings[key] = byId(key).value;
      }
      const clean = calc.validateSettings(settings),
        name = byId("name").value.trim();
      if (!name) throw new Error("Enter an employee name.");
      plan().settings = clean;
      employee().name = name;
      settingsDirty = false;
      notify("");
      renderAll();
    } catch (error) {
      notify(error.message);
    }
  });
  function confirmUnsavedSettings() {
    return (
      !settingsDirty ||
      confirm("Discard the unsaved changes in employee settings?")
    );
  }
  let settingsDirty = false;
  byId("settings-form").addEventListener("input", () => {
    settingsDirty = true;
    byId("storage-status").textContent =
      "Settings have unsaved changes. Save settings before reviewing estimates or exporting.";
  });
  byId("employee").addEventListener("change", (event) => {
    if (!confirmUnsavedSettings()) {
      event.target.value = state.activeEmployeeId;
      return;
    }
    settingsDirty = false;
    state.activeEmployeeId = event.target.value;
    renderAll();
  });
  byId("year").addEventListener("change", (event) => {
    if (!confirmUnsavedSettings()) {
      event.target.value = state.year;
      return;
    }
    settingsDirty = false;
    state.year = Number(event.target.value);
    renderAll();
  });
  byId("add-employee").addEventListener("click", () => {
    if (state.employees.length >= 25 || !confirmUnsavedSettings()) return;
    const name = prompt("Employee name");
    if (name === null) return;
    if (!name.trim() || name.trim().length > 80) {
      notify("Employee names must contain 1–80 characters.");
      return;
    }
    const id = crypto.randomUUID();
    state.employees.push({ id, name: name.trim(), years: {} });
    state.activeEmployeeId = id;
    settingsDirty = false;
    notify("");
    renderAll();
  });
  byId("delete-employee").addEventListener("click", () => {
    if (
      state.employees.length === 1 ||
      !confirm(
        `Remove ${employee().name} and all of their saved years? Export a backup first if needed.`,
      )
    )
      return;
    state.employees = state.employees.filter(
      (person) => person.id !== state.activeEmployeeId,
    );
    state.activeEmployeeId = state.employees[0].id;
    settingsDirty = false;
    renderAll();
  });
  byId("month").addEventListener("change", (event) => {
    selectedMonth = Number(event.target.value);
    renderMonth();
  });
  byId("previous-month").addEventListener("click", () => {
    if (selectedMonth > 0) {
      selectedMonth--;
      renderMonth();
    }
  });
  byId("next-month").addEventListener("click", () => {
    if (selectedMonth < 11) {
      selectedMonth++;
      renderMonth();
    }
  });
  byId("day-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const day = calc.validateDay(
        Object.fromEntries(
          ["work", "leave", "bank"].map((field) => [
            field,
            byId(`day-${field}`).valueAsNumber,
          ]),
        ),
      );
      plan().days[selectedDay] = day;
      closeDay();
      renderYear();
      persist();
    } catch (error) {
      byId("day-error").textContent = error.message;
    }
  });
  byId("restore-day").addEventListener("click", () => {
    delete plan().days[selectedDay];
    closeDay();
    renderYear();
    persist();
  });
  byId("cancel-day").addEventListener("click", closeDay);
  byId("reset-month").addEventListener("click", () => {
    const month = months[selectedMonth];
    if (
      !confirm(
        `Clear all day overrides in ${monthName(month.key)} for ${employee().name}? Other months will stay as they are.`,
      )
    )
      return;
    for (const key of Object.keys(plan().days))
      if (key.startsWith(month.key)) delete plan().days[key];
    renderYear();
    persist();
  });
  byId("export").addEventListener("click", () =>
    download(
      JSON.stringify(state, null, 2),
      `salary-planner-backup-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
    ),
  );
  byId("import").addEventListener("click", () => byId("import-file").click());
  byId("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1000000)
        throw new Error("Backup is too large (maximum 1 MB).");
      const imported = calc.validateState(JSON.parse(await file.text()));
      if (
        !confirm(
          "Replace all current employees and calendars with this backup? Export your current data first if needed.",
        )
      )
        return;
      state = imported;
      selectedMonth = 0;
      settingsDirty = false;
      storageBlocked = false;
      notify("");
      renderAll();
    } catch (error) {
      notify(`Backup was not imported: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
  byId("export-csv").addEventListener("click", () => {
    const fields = [
      "gross",
      "net",
      "tax",
      "employeeNI",
      "pensionDeduction",
      "sourceRelief",
      "sacrifice",
      "employerNI",
      "employerPension",
      "employerCost",
    ];
    const rows = [
      [
        "Month",
        "Work hours",
        "Annual leave hours",
        "Bank holiday hours",
        "Paid hours",
        "Gross GBP",
        "Estimated net GBP",
        "Estimated tax GBP",
        "Employee NI GBP",
        "Employee pension deducted GBP",
        "Provider tax relief GBP",
        "Salary sacrifice GBP",
        "Employer NI GBP",
        "Employer pension GBP",
        "Employer cost GBP",
      ],
      ...months.map((month) => [
        month.key,
        month.work,
        month.leave,
        month.bank,
        month.paid,
        ...fields.map((field) => month.pay[field]),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    download(
      csv,
      `salary-planner-${state.year}-${employee().id}.csv`,
      "text/csv;charset=utf-8",
    );
  });
  window.addEventListener("beforeunload", (event) => {
    if (settingsDirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      storageBlocked = true;
      notify(
        "This plan changed in another tab. Export any unsaved work, then reload to use the other tab’s version.",
      );
      persist();
    }
  });
  renderAll();
})();
