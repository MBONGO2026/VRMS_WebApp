# SwiftDrive VRMS — Vehicle Rental Management System (Web App)

A bilingual (English / French) web front-end for the **SwiftDrive Vehicle Rentals** PostgreSQL database (`swiftdrive_vrms`), built for the *Database Development 2* course.

The application does **not** re-implement business logic. It connects to an existing PostgreSQL database and drives it through the database's own tables, views, triggers and stored procedures. Every business rule (no double-booking, mandatory deposit, automatic vehicle status updates, late-return penalties) is enforced by the database, and any violation is shown to the user with the exact PostgreSQL error message.

The full rental lifecycle has been tested end to end:
**customer → booking → vehicle assignment → return → invoice → payment**.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
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
| **Excel export** | One-click download of a BI workbook with KPI cards, native Excel charts, and filterable tables. |
| **Bilingual UI** | Switch between English and French at any time; the choice is remembered. |

## Tech stack

- **Runtime:** Node.js
- **Web framework:** Express 4
- **Templating:** EJS + `express-ejs-layouts`
- **Database driver:** `pg` (connection pool)
- **Excel generation:** `exceljs` + `jszip` (native chart injection)
- **Configuration:** `dotenv`

## Project structure

```
VRMS_WebApp/
├── server.js            # Express app setup, language middleware, error handlers
├── db.js                # Shared PostgreSQL connection pool
├── i18n.js              # English / French translation dictionary and helpers
├── lib/
│   ├── excelReport.js   # Builds the BI Excel workbook
│   └── xlsxCharts.js    # Injects native Excel charts into the workbook
├── routes/
│   ├── dashboard.js     # GET /
│   ├── customers.js     # /customers
│   ├── vehicles.js      # /vehicles
│   ├── bookings.js      # /bookings
│   ├── agreements.js    # /agreements (returns, invoices, payments)
│   └── reports.js       # /reports and Excel export
├── views/               # EJS templates (one folder per section + shared layout)
├── public/style.css     # Stylesheet
├── .env.example         # Configuration template
└── package.json
```

## Prerequisites

1. **Node.js** (LTS version recommended): <https://nodejs.org>
2. **PostgreSQL** with the `swiftdrive_vrms` database already created and the nine SQL scripts (`01_schema.sql` through `09_reports_and_queries.sql`) executed against it. The app uses this database as-is and does not create or migrate anything.

> The SQL scripts are part of the course submission and are not included in this repository.

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
6. **Review reports:** *Reports* shows the business reports, and *Export to Excel* downloads the BI workbook.

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

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `ECONNREFUSED` / "connection refused" | PostgreSQL is not running, or `PGHOST` / `PGPORT` in `.env` are wrong. |
| "password authentication failed" | `PGPASSWORD` does not match the password for `PGUSER`. |
| "database swiftdrive_vrms does not exist" | Create the database and run the nine SQL scripts first. |
| "relation vw_... does not exist" | Some SQL scripts (for example, the views in `04_views.sql`) were not executed. |
| A constraint error shown in a form (e.g. *violates check constraint*) | Not an app bug: the database is enforcing an integrity or business rule. Correct the input and try again. |
| Port 3000 already in use | Set a different `PORT` in `.env`. |
