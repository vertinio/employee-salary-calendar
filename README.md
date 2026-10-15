# UK Salary & Work Planner

A static, dependency-free planning tool for UK hourly employees paid monthly. Open `index.html` in a modern browser, or use the [published GitHub Pages app](https://vertinio.github.io/employee-salary-calendar/).

## Run locally

No installation or build step is required. For a stable browser storage origin:

```sh
npm start
```

Open <http://127.0.0.1:8080>. This command uses Python 3's local HTTP server. Alternatively, open `index.html` directly; local-file storage behaviour depends on your browser. Use the same URL each time to retrieve saved plans.

## Plan pay and leave

1. Add an employee, then select the payroll year.
2. Set the hourly rate, normal hours for each weekday, region and NI category. Set the agreed April–March leave budget in **hours** and decide whether paid bank holidays count towards it. The default 224 hours is a starting example for a five-day, 40-hour working week; adjust it for the contract and working pattern.
3. Select pension treatment and earnings basis, then save settings.
4. Select a calendar day to change worked, annual leave and bank holiday hours. For a half-day holiday, enter both work and leave hours. All zeroes means an unpaid day. Overtime hours use the same hourly rate.
5. Review monthly and annual estimated gross pay, take-home pay and employer cost. Annual leave totals include all planned dates in the leave year.
6. Export a JSON backup to keep or transfer **all employees, years, settings and day edits**. Import replaces the current data after validation and confirmation. CSV exports the selected employee's monthly summary; it cannot restore the calendar.

Each employee and year has independent settings and day overrides. Changing a weekly pattern does not erase overrides or recalculate the agreed leave budget. Reset Month only clears overrides in that month; Use Normal Pattern clears one day. Up to 25 employees can be stored; totals are per employee, not a combined payroll report.

## Calculation scope

Rates last checked **15 October 2026**. Only verified **2025/26** and **2026/27** datasets are selectable. Adding later years requires a source review and tests; the app does not fetch new tax rules automatically.

- Calendar months run April to March. Work performed in a month is assumed paid in that month; April payments are assumed on or after 6 April. The leave year is explicitly 1 April–31 March, separate from the 6 April–5 April tax year.
- Income tax annualises each month's taxable pay, applies the standard personal allowance and taper, then divides by 12. England/Wales/Northern Ireland and Scottish bands are supported. This is **not cumulative PAYE**. Uneven monthly earnings can produce different actual tax. Annual totals sum monthly estimates; they are not an annual tax reconciliation.
- NI uses published **monthly** thresholds. Supported categories: A, C, M and H. Categories M and H assume eligibility throughout the selected year; no automatic birthday/category transition is modelled.
- Pension participation is selected manually. Qualifying earnings use the published monthly lower/upper band; all-pay basis is also available. Employee percentages are gross contributions including basic relief where applicable. Net-pay contributions reduce taxable pay; relief-at-source contributions receive the 20% provider top-up; salary sacrifice reduces cash gross for tax/NI, and the sacrificed contribution goes into pension through the employer. Employer cost does not double count it. The contribution basis is pre-sacrifice pay. Additional higher/Scottish-rate relief and any sharing of employer NI savings are excluded.
- Bank holidays are a bundled GOV.UK snapshot for the supported dates and regions. A bank holiday only replaces scheduled work with paid bank hours if that weekday is normally worked and automatic bank holiday pay is enabled. Contractual and local arrangements can be entered as day overrides.
- Excludes student loans, non-standard tax codes, other income, directors' NI, statutory sick/family pay, enhanced overtime rates, Employment Allowance and other employer reliefs. This is a cost planner, not a statutory payroll or holiday-pay engine. It does not file with HMRC. Salary sacrifice must be checked against minimum-wage and scheme rules.

## Data and recovery

Data stays in `localStorage` under `uk-salary-planner-v2`, on the current browser and origin. No login, tracking, server database or cloud sync is used. Clearing browser data removes plans. Use JSON backups regularly and store salary data appropriately. A malformed stored plan is preserved instead of silently overwritten, and a visible recovery message is shown. Storage failures and changes in another tab are reported. Old app versions did not save day data, so there is no saved legacy calendar to migrate.

## Validation

Requires Node.js 24; no npm dependencies:

```sh
npm run check
npm test
```

The Node test suite covers tax bands and taper, Scottish year changes, monthly NI boundaries and exemptions, pension methods/bases, zero pay, calendar boundaries, part-time regional holidays, leave across months, independent profile/year backups, malformed input and unsafe keys. GitHub Actions runs these checks on pushes and pull requests.

Browser QA uses a separate scratch Playwright script, outside the repository: edit and reload, reset isolation, invalid daily hours, profile/year isolation, regional bank holidays, JSON round-trip and malformed imports, CSV export, preservation of damaged storage, desktop and mobile layouts, and keyboard dismissal of the day dialog. Re-run browser QA after UI changes; unit tests alone do not verify rendered behaviour.

## Files

- `index.html`, `styles.css`, `app.js`: accessible static interface and local data handling.
- `calculator.js`: independently testable pay, calendar and validation functions.
- `bank-holidays.js`: official date snapshot, kept local for offline operation.
- `calculator.test.js`: calculation and data regression tests.

## Primary sources

- [HMRC rates and thresholds 2026/27](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027)
- [HMRC rates and thresholds 2025/26](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026)
- [The Pensions Regulator: automatic enrolment earnings thresholds](https://www.thepensionsregulator.gov.uk/en/business-advisers/automatic-enrolment-guide-for-business-advisers/automatic-enrolment-earnings-threshold)
- [GOV.UK: workplace pension tax relief](https://www.gov.uk/workplace-pensions/managing-your-pension)
- [GOV.UK bank holiday data](https://www.gov.uk/bank-holidays.json)
- [GOV.UK: holiday entitlement](https://www.gov.uk/holiday-entitlement-rights)

When updating rates, add the verified year, review every tax/NI/pension threshold and regional holiday range, update default-year selection and source date, and add independent expected-value tests. Never carry forward an unverified year's rates automatically.
