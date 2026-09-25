# SwiftDrive VRMS — Vehicle Rental Management System (Web App)

A bilingual (English / French) web front-end for the **SwiftDrive Vehicle Rentals** PostgreSQL database (`swiftdrive_vrms`), built for the *Database Development 2* course.

The application does **not** re-implement business logic. It connects to an existing PostgreSQL database and drives it through the database's own tables, views, triggers and stored procedures. Every business rule (no double-booking, mandatory deposit, automatic vehicle status updates, late-return penalties) is enforced by the database, and any violation is shown to the user with the exact PostgreSQL error message.

The full rental lifecycle has been tested end to end:
**customer → booking → vehicle assignment → return → invoice → payment**.

![Dashboard](docs/app/dashboard.png)

---

## Table of contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Database setup](#database-setup)
  - [Entity-relationship diagram](#entity-relationship-diagram)
  - [Execution screenshots](#execution-screenshots)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the app](#running-the-app)
- [Usage walkthrough](#usage-walkthrough)
- [Routes](#routes)
- [Database objects used](#database-objects-used)
- [Internationalisation (EN / FR)](#internationalisation-en--fr)
- [Excel BI export](#excel-bi-export)
- [Troubleshooting](#troubleshooting)

---

## Screenshots

| | |
|---|---|
| **Bookings:** full list with status and actions<br>![Bookings](docs/app/bookings.png) | **Confirm a booking:** assign a vehicle and staff member (`sp_confirm_booking`)<br>![Confirm booking](docs/app/booking_confirm.png) |
| **Process a return:** odometer and damage inspection (`sp_process_return`)<br>![Process return](docs/app/agreement_return.png) | **Invoice:** rental fee, late-return penalty and payments (`sp_generate_invoice`)<br>![Invoice](docs/app/invoice.png) |
| **Customers:** individual and corporate accounts<br>![Customers](docs/app/customers.png) | **New customer:** registration form<br>![New customer](docs/app/customer_new.png) |
| **Vehicles:** real-time availability by branch<br>![Vehicles](docs/app/vehicles.png) | **Agreements:** active, overdue and closed rentals<br>![Agreements](docs/app/agreements.png) |
| **New booking**<br>![New booking](docs/app/booking_new.png) | **French interface:** the whole UI switches with one click<br>![Dashboard in French](docs/app/dashboard_fr.png) |

**Excel BI export:** one click on the Reports page generates a workbook with KPI cards and native Excel charts

![Excel BI dashboard](docs/app/excel_dashboard.png)

**Period reports:** daily, monthly, annual or custom date range (from dd/mm/yyyy to dd/mm/yyyy), each exportable to Excel and PDF

![Period report](docs/app/period_report.png)

<details>
<summary><b>Excel export of a monthly report</b> (KPIs, day-by-day trend, revenue, utilisation, branches)</summary>

![Excel monthly report](docs/app/excel_period_report.png)

</details>

<details>
<summary><b>PDF export of a monthly report</b> (A4, first page)</summary>

![PDF monthly report](docs/app/pdf_period_report.png)

</details>

<details>
<summary><b>Reports page</b> (fleet utilisation, revenue, overdue returns, outstanding balances)</summary>

![Reports](docs/app/reports.png)

</details>

---

## Features

| Section | What it does |
|---|---|
| **Dashboard** | Today's bookings, fleet utilisation (rented / available / in maintenance), overdue returns, total outstanding balance, and the most recent bookings. |
| **Customers** | List all customers; register a new **individual** (driver's licence, date of birth) or **corporate** customer in a single transaction. |
| **Vehicles** | Real-time availability by category and branch. |
| **Bookings** | Create and cancel bookings; confirm a booking by assigning an available vehicle and an employee, which opens a rental agreement. |
| **Agreements** | List rental agreements (overdue ones are flagged); process a vehicle return (return date, odometer, fuel level, condition). |
| **Invoices & payments** | Generate the invoice for a completed agreement, view its details, and record payments until the balance is settled. |
| **Reports** | Fleet utilisation, revenue by vehicle type, overdue returns, today's bookings, bookings per category, and outstanding customer balances. |
| **Period reports** | **Daily**, **monthly**, **annual** or **custom-range** reports: bookings, rentals, returns, invoiced vs. received revenue, fleet utilisation, per-category and per-branch performance, with a trend chart and previous/next navigation. |
| **Excel export** | One-click download of a BI workbook with KPI cards, native Excel charts, and filterable tables, for the overview and for every period report. |
| **PDF export** | The same reports as a print-ready A4 PDF: KPI cards, charts, and detail tables with page numbers. |
| **Bilingual UI** | Switch between English and French at any time; the choice is remembered. |

## Tech stack

- **Runtime:** Node.js
- **Web framework:** Express 4
- **Templating:** EJS + `express-ejs-layouts`
- **Database driver:** `pg` (connection pool)
- **Excel generation:** `exceljs` + `jszip` (native chart injection)
- **PDF generation:** `pdfkit` (server-side, no headless browser needed)
- **Configuration:** `dotenv`

## Project structure

```
VRMS_WebApp/
├── server.js            # Express app setup, language middleware, error handlers
├── db.js                # Shared PostgreSQL connection pool
├── i18n.js              # English / French translation dictionary and helpers
├── lib/
│   ├── excelReport.js   # Builds the BI Excel workbooks (overview + period reports)
│   ├── pdfReport.js     # Builds the PDF reports (overview + period reports)
│   ├── xlsxCharts.js    # Injects native Excel charts into the workbook
│   ├── period.js        # Parses daily / monthly / annual / custom periods into a date range
│   └── periodReport.js  # SQL queries behind the period reports
├── routes/
│   ├── dashboard.js     # GET /
│   ├── customers.js     # /customers
│   ├── vehicles.js      # /vehicles
│   ├── bookings.js      # /bookings
│   ├── agreements.js    # /agreements (returns, invoices, payments)
│   └── reports.js       # /reports, /reports/period and Excel exports
├── views/               # EJS templates (one folder per section + shared layout)
├── public/style.css     # Stylesheet
├── sql/                 # Database scripts (schema, triggers, views, sample data, demos)
├── docs/
│   ├── app/             # Web app screenshots
│   ├── diagrams/        # ERD (PNG + Mermaid source)
│   └── screenshots/     # pgAdmin execution screenshots for each SQL script
├── .env.example         # Configuration template
└── package.json
```

## Prerequisites

1. **Node.js** (LTS version recommended): <https://nodejs.org>
2. **PostgreSQL** (with pgAdmin or the `psql` command-line client).

## Database setup

The app uses the `swiftdrive_vrms` database as-is and does not create or migrate anything, so the database must be set up first with the scripts in [`sql/`](sql/). Run them **in order**:

| Script | Contents |
|---|---|
| `01_schema.sql` | Tables, primary/foreign keys and CHECK constraints |
| `02_sequences.sql` | Sequences (e.g. booking reference numbers) |
| `03_functions_triggers.sql` | Functions, triggers and the stored procedures `sp_confirm_booking`, `sp_process_return`, `sp_generate_invoice` |
| `04_views.sql` | Reporting views and role-based access control (GRANT / REVOKE) |
| `05_sample_data.sql` | Fictional sample data: branches, fleet, customers, staff and rental scenarios |
| `06_business_rule_demo.sql` | Demonstrates each business rule being enforced |
| `07_transactions_acid_demo.sql` | Transaction / ACID demonstrations |
| `08_data_quality_checks.sql` | Data quality checks |
| `09_reports_and_queries.sql` | Report queries |

Scripts `01`–`05` are required for the app to work. Scripts `06`–`09` are demonstrations and checks and are optional.

**Using `psql`:**

```bash
createdb -U postgres swiftdrive_vrms
psql -U postgres -d swiftdrive_vrms -f sql/01_schema.sql
psql -U postgres -d swiftdrive_vrms -f sql/02_sequences.sql
psql -U postgres -d swiftdrive_vrms -f sql/03_functions_triggers.sql
psql -U postgres -d swiftdrive_vrms -f sql/04_views.sql
psql -U postgres -d swiftdrive_vrms -f sql/05_sample_data.sql
```

**Using pgAdmin:** create a database named `swiftdrive_vrms`, open the *Query Tool* on it, then open and execute each script in order.

> Sample-data dates are relative to `CURRENT_DATE`, so the reports stay meaningful whenever the scripts are run.

### Entity-relationship diagram

![SwiftDrive VRMS entity-relationship diagram](docs/diagrams/erd.png)

The Mermaid source is in [`docs/diagrams/erd.mmd`](docs/diagrams/erd.mmd) and can be edited at <https://mermaid.live>.

### Execution screenshots

Each script was executed in pgAdmin 4 against PostgreSQL 14:

| Script | Result |
|---|---|
| `01_schema.sql` | [Tables, keys and indexes created](docs/screenshots/01_schema.png) |
| `02_sequences.sql` | [Sequences created (booking references start at 5000)](docs/screenshots/02_sequences.png) |
| `03_functions_triggers.sql` | [Triggers and stored procedures created](docs/screenshots/03_functions_triggers.png) |
| `04_views.sql` | [Views and role grants created](docs/screenshots/04_views.png) |
| `05_sample_data.sql` | [Full rental lifecycle: bookings confirmed, returns, invoices with late fees](docs/screenshots/05_sample_data.png) |
| `06_business_rule_demo.sql` | [Every business rule rejects invalid operations](docs/screenshots/06_business_rule_demo.png) |
| `07_transactions_acid_demo.sql` | [Invalid payment rejected by a CHECK constraint](docs/screenshots/07_transactions_acid_demo.png) and [payment count checked afterwards](docs/screenshots/07_transaction_rollback_check.png) |
| `08_data_quality_checks.sql` | [Data quality audit queries](docs/screenshots/08_data_quality_checks.png) |
| `09_reports_and_queries.sql` | [Outstanding balances report](docs/screenshots/09_reports_and_queries.png) |

<details>
<summary>Business rule enforcement (06_business_rule_demo.sql)</summary>

![Business rule demo output](docs/screenshots/06_business_rule_demo.png)

</details>

## Installation

```bash
git clone https://github.com/MBONGO2026/VRMS_WebApp.git
cd VRMS_WebApp
npm install
```

## Configuration

Copy the example configuration file and fill in your own database credentials:

```bash
cp .env.example .env        # macOS / Linux / Git Bash
copy .env.example .env      # Windows CMD
```

| Variable | Default | Description |
|---|---|---|
| `PGHOST` | `localhost` | PostgreSQL server host |
| `PGPORT` | `5432` | PostgreSQL server port |
| `PGDATABASE` | `swiftdrive_vrms` | Database name |
| `PGUSER` | `postgres` | Database user |
| `PGPASSWORD` | *(empty)* | Password for `PGUSER` (the one you use in pgAdmin) |
| `PORT` | `3000` | Port the web app listens on |

> `.env` contains your password and is excluded from Git via `.gitignore`. Never commit it.

## Running the app

```bash
npm start
```

Then open **<http://localhost:3000>** in your browser. Stop the server with `Ctrl+C`.

## Usage walkthrough

A typical rental goes through these steps:

1. **Register a customer:** *Customers → New customer*. Choose *Individual* or *Corporate* and fill in the form.
2. **Create a booking:** *Bookings → New booking*. Select the customer, vehicle category, branch, and pickup / return dates.
3. **Confirm the booking:** from the booking list, click *Confirm*, then pick an available vehicle and the employee handling the rental. This calls `sp_confirm_booking`, which rejects double-bookings and checks the deposit, then opens a rental agreement.
4. **Process the return:** *Agreements → Return*. Enter the return date, odometer reading, fuel level and condition. `sp_process_return` closes the agreement and updates the vehicle and booking statuses.
5. **Invoice and payment:** *Agreements → Invoice → Generate invoice* (`sp_generate_invoice`, including any late penalty), then record one or more payments until the invoice is paid.
6. **Review reports:** *Reports* shows the current business overview, and *Export to Excel* downloads the BI workbook. The *Daily*, *Monthly*, *Annual* and *Custom range* tabs produce a report for any period; use ← / → to move to the previous or next period, and *Export this report to Excel* to download it.

## Routes

| Method | Path | Description |
|---|---|---|
| GET | `/` | Dashboard |
| GET | `/customers` | Customer list |
| GET | `/customers/new` | New customer form |
| POST | `/customers` | Create a customer (individual or corporate, transactional) |
| GET | `/vehicles` | Vehicle availability |
| GET | `/bookings` | Booking list |
| GET | `/bookings/new` | New booking form |
| POST | `/bookings` | Create a booking |
| POST | `/bookings/:id/cancel` | Cancel a booking |
| GET | `/bookings/:id/confirm` | Vehicle / employee assignment form |
| POST | `/bookings/:id/confirm` | Confirm the booking (`sp_confirm_booking`) |
| GET | `/agreements` | Rental agreement list |
| GET | `/agreements/:id/return` | Return form |
| POST | `/agreements/:id/return` | Process the return (`sp_process_return`) |
| GET | `/agreements/:id/invoice` | Invoice details |
| POST | `/agreements/:id/invoice/generate` | Generate the invoice (`sp_generate_invoice`) |
| POST | `/agreements/:id/payment` | Record a payment |
| GET | `/reports` | Reports page |
| GET | `/reports/export.xlsx` | Download the Excel BI workbook |
| GET | `/reports/export.pdf` | Download the overview as PDF |
| GET | `/reports/period` | Period report (see parameters below) |
| GET | `/reports/period/export.xlsx` | Download a period report as Excel (same parameters) |
| GET | `/reports/period/export.pdf` | Download a period report as PDF (same parameters) |

Period report parameters:

| Report | Query string example |
|---|---|
| Daily | `?type=daily&date=2026-09-21` |
| Monthly | `?type=monthly&month=9&year=2026` |
| Annual | `?type=annual&year=2026` |
| Custom range | `?type=custom&from=2026-09-01&to=2026-09-25` |

Add `?lang=en` or `?lang=fr` to any URL to switch the interface language.

## Database objects used

**Tables:** `Customer`, `IndividualCustomer`, `CorporateCustomer`, `Branch`, `VehicleCategory`, `Vehicle`, `Booking`, `RentalAgreement`, `Invoice`, `Payment` (plus the `booking_ref_seq` sequence).

**Views:** `vw_TodaysBookings`, `vw_FleetUtilization`, `vw_OverdueReturns`, `vw_RevenueByVehicleType`, `vw_BookingsDetail`, `vw_VehicleAvailability`, and the other reporting views from `04_views.sql`.

**Stored procedures:**

| Procedure | Purpose |
|---|---|
| `sp_confirm_booking` | Assigns a vehicle and employee to a booking and opens a rental agreement. Enforces no double-booking and the mandatory deposit. |
| `sp_process_return` | Records a vehicle return and updates the agreement, vehicle and booking statuses. |
| `sp_generate_invoice` | Computes the invoice for an agreement, including late-return penalties. |

Triggers defined in the database (such as automatic vehicle status updates) fire automatically when the app writes to these tables.

## Internationalisation (EN / FR)

The **EN / FR** buttons in the top-right corner switch the whole interface (menus, forms, statuses, dates, and currency formatting). The selected language is stored in a `vrms_lang` cookie for one year. French is the default.

All strings live in [`i18n.js`](i18n.js). To add or change a label, edit both the `en` and `fr` entries for its key.

## Excel BI export

The **Export to Excel** button on the Reports page (`/reports/export.xlsx`) generates a workbook with:

- a **Dashboard** sheet with KPI cards and four native Excel charts;
- one sheet per report, each formatted as a filterable Excel table.

It uses the same queries as the Reports page, so the figures always match what you see on screen.

![Excel BI dashboard sheet](docs/app/excel_dashboard.png)

### PDF export

Next to each Excel button, **Export to PDF** (`/reports/export.pdf`, `/reports/period/export.pdf`) downloads the same report as an A4 PDF: banner, KPI cards, charts, then every detail table. Long tables continue on the next page with their header repeated, and each page has a footer with the period, the generation time and the page number. PDFs are drawn server-side with PDFKit, so no browser or extra software is needed on the server.

### Period reports

Each period report (`/reports/period/export.xlsx`) has its own workbook: a dashboard with six KPIs and up to five native charts (trend, revenue by vehicle type, bookings by category, utilisation, performance by branch), followed by detail sheets for bookings, invoices, payments and returns.

Each figure is filtered on the date that matters for it, so nothing is counted twice across periods:

| Figure | Filtered on |
|---|---|
| Bookings | Pickup date (same rule as *Today's bookings*) |
| Rentals started / returns | Actual pickup date / actual return date |
| Invoiced, still outstanding | Invoice date |
| Received | Payment date (all payments, including deposits, net of refunds) |
| Fleet utilisation | Vehicle-days rented ÷ vehicle-days available, counted up to today |

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `ECONNREFUSED` / "connection refused" | PostgreSQL is not running, or `PGHOST` / `PGPORT` in `.env` are wrong. |
| "password authentication failed" | `PGPASSWORD` does not match the password for `PGUSER`. |
| "database swiftdrive_vrms does not exist" | Create the database and run the SQL scripts first (see [Database setup](#database-setup)). |
| "relation vw_... does not exist" | Some SQL scripts (for example, the views in `sql/04_views.sql`) were not executed. |
| A constraint error shown in a form (e.g. *violates check constraint*) | Not an app bug: the database is enforcing an integrity or business rule. Correct the input and try again. |
| Port 3000 already in use | Set a different `PORT` in `.env`. |
