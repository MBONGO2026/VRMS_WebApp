// Loads every figure of a period report (daily / monthly / annual / custom).
// Each table is filtered on the date that matters for it, so figures never
// double count across periods:
//   bookings  -> Booking.PickupDate        (same rule as vw_TodaysBookings)
//   rentals   -> RentalAgreement.ActualPickupDate
//   returns   -> RentalAgreement.ActualReturnDate
//   invoices  -> Invoice.InvoiceDate       (revenue, same joins as vw_RevenueByVehicleType)
//   payments  -> Payment.PaymentDate       (cash actually received, refunds deducted)
// Utilization = vehicle-days rented / vehicle-days available, counted only up to
// today so a period that is still running is not diluted by future days.
const db = require('../db');

const CUSTOMER_NAME = `CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END`;
const CUSTOMER_JOINS = `
  JOIN Customer c ON c.CustomerID = bk.CustomerID
  LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
  LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID`;

// Rented days of one agreement that fall inside [$1, effective end]; an active
// agreement counts as rented up to today.
const RENTED_DAYS = `GREATEST(0,
  LEAST(COALESCE(ra.ActualReturnDate, CURRENT_DATE), LEAST($2::date, CURRENT_DATE))
  - GREATEST(ra.ActualPickupDate, $1::date) + 1)`;
// Days of the period that have already happened (0 if it lies in the future).
const ELAPSED_DAYS = `GREATEST(0, LEAST($2::date, CURRENT_DATE) - $1::date + 1)`;

async function loadPeriodData(period) {
  const p = [period.from, period.to];
  const step = period.bucket === 'month' ? '1 month' : '1 day';
  const trunc = period.bucket === 'month' ? 'month' : 'day';

  const queries = {
    summary: db.query(`
      SELECT
        (SELECT COUNT(*) FROM Booking WHERE PickupDate BETWEEN $1 AND $2)::int AS bookings,
        (SELECT COUNT(*) FROM Booking WHERE PickupDate BETWEEN $1 AND $2 AND BookingStatus = 'Cancelled')::int AS cancelled,
        (SELECT COUNT(*) FROM RentalAgreement WHERE ActualPickupDate BETWEEN $1 AND $2)::int AS rentals,
        (SELECT COUNT(*) FROM RentalAgreement WHERE ActualReturnDate BETWEEN $1 AND $2)::int AS returns,
        (SELECT COUNT(*) FROM RentalAgreement ra JOIN Booking bk ON bk.BookingID = ra.BookingID
          WHERE ra.ActualReturnDate BETWEEN $1 AND $2 AND ra.ActualReturnDate > bk.ReturnDateExpected)::int AS lateReturns,
        (SELECT COUNT(*) FROM Invoice WHERE InvoiceDate BETWEEN $1 AND $2)::int AS invoices,
        (SELECT COALESCE(SUM(TotalAmount), 0) FROM Invoice WHERE InvoiceDate BETWEEN $1 AND $2) AS invoiced,
        (SELECT COALESCE(SUM(TotalAmount - AmountPaid), 0) FROM Invoice WHERE InvoiceDate BETWEEN $1 AND $2) AS outstanding,
        (SELECT COALESCE(SUM(CASE WHEN PaymentType = 'Refund' THEN -Amount ELSE Amount END), 0)
          FROM Payment WHERE PaymentDate::date BETWEEN $1 AND $2) AS received,
        (SELECT COALESCE(SUM(Amount), 0) FROM Payment
          WHERE PaymentType = 'Deposit' AND PaymentDate::date BETWEEN $1 AND $2) AS deposits,
        (SELECT COUNT(*) FROM Vehicle)::int AS fleetSize,
        (SELECT COALESCE(SUM(${RENTED_DAYS}), 0) FROM RentalAgreement ra)::int AS rentedDays,
        ${ELAPSED_DAYS}::int AS elapsedDays`, p),

    trend: period.bucket ? db.query(`
      SELECT b.bucket::date AS bucket,
        (SELECT COUNT(*) FROM Booking WHERE date_trunc('${trunc}', PickupDate) = b.bucket)::int AS bookings,
        (SELECT COALESCE(SUM(TotalAmount), 0) FROM Invoice WHERE date_trunc('${trunc}', InvoiceDate) = b.bucket) AS invoiced,
        (SELECT COALESCE(SUM(CASE WHEN PaymentType = 'Refund' THEN -Amount ELSE Amount END), 0)
          FROM Payment WHERE date_trunc('${trunc}', PaymentDate) = b.bucket) AS received
      FROM generate_series(date_trunc('${trunc}', $1::date), $2::date, '${step}') AS b(bucket)
      ORDER BY b.bucket`, p) : Promise.resolve({ rows: [] }),

    revenue: db.query(`
      SELECT vc.CategoryName,
        COUNT(i.InvoiceID)::int AS invoices,
        COALESCE(SUM(i.TotalAmount), 0) AS invoiced,
        COALESCE(SUM(i.AmountPaid), 0) AS collected,
        COALESCE(SUM(i.TotalAmount - i.AmountPaid), 0) AS outstanding
      FROM VehicleCategory vc
      LEFT JOIN Vehicle v ON v.CategoryID = vc.CategoryID
      LEFT JOIN RentalAgreement ra ON ra.VehicleID = v.VehicleID
      LEFT JOIN Invoice i ON i.AgreementID = ra.AgreementID AND i.InvoiceDate BETWEEN $1 AND $2
      GROUP BY vc.CategoryName
      ORDER BY invoiced DESC, vc.CategoryName`, p),

    utilization: db.query(`
      SELECT vc.CategoryName,
        (SELECT COUNT(*) FROM Vehicle v WHERE v.CategoryID = vc.CategoryID)::int AS vehicles,
        (SELECT COALESCE(SUM(${RENTED_DAYS}), 0) FROM RentalAgreement ra JOIN Vehicle v ON v.VehicleID = ra.VehicleID
          WHERE v.CategoryID = vc.CategoryID)::int AS rentedDays,
        ${ELAPSED_DAYS}::int AS elapsedDays
      FROM VehicleCategory vc
      ORDER BY vc.CategoryName`, p),

    bookingsByCategory: db.query(`
      SELECT vc.CategoryName,
        COUNT(bk.BookingID)::int AS bookings,
        COUNT(bk.BookingID) FILTER (WHERE bk.BookingStatus = 'Cancelled')::int AS cancelled
      FROM VehicleCategory vc
      LEFT JOIN Booking bk ON bk.CategoryID = vc.CategoryID AND bk.PickupDate BETWEEN $1 AND $2
      GROUP BY vc.CategoryName
      ORDER BY bookings DESC, vc.CategoryName`, p),

    branches: db.query(`
      SELECT br.BranchName,
        (SELECT COUNT(*) FROM Booking bk WHERE bk.BranchID = br.BranchID AND bk.PickupDate BETWEEN $1 AND $2)::int AS bookings,
        (SELECT COALESCE(SUM(i.TotalAmount), 0) FROM Invoice i
          JOIN RentalAgreement ra ON ra.AgreementID = i.AgreementID
          JOIN Booking bk ON bk.BookingID = ra.BookingID
          WHERE bk.BranchID = br.BranchID AND i.InvoiceDate BETWEEN $1 AND $2) AS invoiced
      FROM Branch br
      ORDER BY invoiced DESC, br.BranchName`, p),

    bookingList: db.query(`
      SELECT bk.BookingID, bk.PickupDate, bk.ReturnDateExpected, bk.BookingStatus,
        br.BranchName, vc.CategoryName, ${CUSTOMER_NAME} AS CustomerName
      FROM Booking bk
      JOIN Branch br ON br.BranchID = bk.BranchID
      JOIN VehicleCategory vc ON vc.CategoryID = bk.CategoryID
      ${CUSTOMER_JOINS}
      WHERE bk.PickupDate BETWEEN $1 AND $2
      ORDER BY bk.PickupDate, bk.BookingID`, p),

    invoiceList: db.query(`
      SELECT i.InvoiceID, i.InvoiceDate, i.TotalAmount, i.AmountPaid, (i.TotalAmount - i.AmountPaid) AS Balance,
        i.InvoiceStatus, ra.AgreementID, ${CUSTOMER_NAME} AS CustomerName
      FROM Invoice i
      JOIN RentalAgreement ra ON ra.AgreementID = i.AgreementID
      JOIN Booking bk ON bk.BookingID = ra.BookingID
      ${CUSTOMER_JOINS}
      WHERE i.InvoiceDate BETWEEN $1 AND $2
      ORDER BY i.InvoiceDate, i.InvoiceID`, p),

    paymentList: db.query(`
      SELECT py.PaymentID, py.PaymentDate, py.AgreementID, py.PaymentType, py.PaymentMethod,
        CASE WHEN py.PaymentType = 'Refund' THEN -py.Amount ELSE py.Amount END AS Amount,
        ${CUSTOMER_NAME} AS CustomerName
      FROM Payment py
      JOIN RentalAgreement ra ON ra.AgreementID = py.AgreementID
      JOIN Booking bk ON bk.BookingID = ra.BookingID
      ${CUSTOMER_JOINS}
      WHERE py.PaymentDate::date BETWEEN $1 AND $2
      ORDER BY py.PaymentDate, py.PaymentID`, p),

    returnList: db.query(`
      SELECT ra.AgreementID, v.RegistrationNumber, ra.ActualReturnDate, bk.ReturnDateExpected,
        GREATEST(ra.ActualReturnDate - bk.ReturnDateExpected, 0)::int AS DaysLate,
        (ra.OdometerIn - ra.OdometerOut)::int AS Distance,
        ${CUSTOMER_NAME} AS CustomerName
      FROM RentalAgreement ra
      JOIN Vehicle v ON v.VehicleID = ra.VehicleID
      JOIN Booking bk ON bk.BookingID = ra.BookingID
      ${CUSTOMER_JOINS}
      WHERE ra.ActualReturnDate BETWEEN $1 AND $2
      ORDER BY ra.ActualReturnDate, ra.AgreementID`, p),
  };

  const keys = Object.keys(queries);
  const results = await Promise.all(keys.map((k) => queries[k]));
  const data = {};
  keys.forEach((k, i) => { data[k] = results[i].rows; });
  data.summary = data.summary[0];

  const ratio = (rented, vehicles, days) => (vehicles * days > 0 ? rented / (vehicles * days) : null);
  data.summary.utilization = ratio(data.summary.renteddays, data.summary.fleetsize, data.summary.elapseddays);
  data.utilization.forEach((u) => { u.utilization = ratio(u.renteddays, u.vehicles, u.elapseddays); });
  return data;
}

// Earliest year that has activity, so the year pickers offer a sensible range.
async function firstActivityYear() {
  const { rows } = await db.query(`
    SELECT EXTRACT(YEAR FROM LEAST(
      (SELECT MIN(PickupDate) FROM Booking),
      (SELECT MIN(InvoiceDate) FROM Invoice),
      (SELECT MIN(PaymentDate)::date FROM Payment),
      CURRENT_DATE))::int AS y`);
  return rows[0].y;
}

module.exports = { loadPeriodData, firstActivityYear };
