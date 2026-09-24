const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT bk.BookingID, bk.PickupDate, bk.ReturnDateExpected, bk.BookingStatus,
             br.BranchName, vc.CategoryName,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName
      FROM Booking bk
      JOIN Branch br ON br.BranchID = bk.BranchID
      JOIN VehicleCategory vc ON vc.CategoryID = bk.CategoryID
      JOIN Customer c ON c.CustomerID = bk.CustomerID
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      ORDER BY bk.BookingID DESC
    `);
    res.render('bookings/list', { title: req.t('bookings.list.title'), bookings: rows });
  } catch (err) { next(err); }
});

router.get('/new', async (req, res, next) => {
  try {
    const [customers, categories, branches] = await Promise.all([
      db.query(`SELECT c.CustomerID, CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS Name
                 FROM Customer c
                 LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
                 LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
                 WHERE c.IsBlacklisted = FALSE ORDER BY Name`),
      db.query(`SELECT CategoryID, CategoryName, DailyRate, DepositAmount FROM VehicleCategory ORDER BY CategoryName`),
      db.query(`SELECT BranchID, BranchName FROM Branch ORDER BY BranchName`),
    ]);
    res.render('bookings/new', {
      title: req.t('bookings.new.title'), error: null, form: {},
      customers: customers.rows, categories: categories.rows, branches: branches.rows,
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const b = req.body;
  try {
    const result = await db.query(
      `INSERT INTO Booking (BookingID, CustomerID, CategoryID, BranchID, PickupDate, ReturnDateExpected)
       VALUES (NEXTVAL('booking_ref_seq'), $1, $2, $3, $4, $5) RETURNING BookingID`,
      [b.customerId, b.categoryId, b.branchId, b.pickupDate, b.returnDate]
    );
    const bookingId = result.rows[0].bookingid;
    res.redirect(`/bookings?flash=${encodeURIComponent(req.t('bookings.new.flashCreated', { id: bookingId }))}`);
  } catch (err) {
    try {
      const [customers, categories, branches] = await Promise.all([
        db.query(`SELECT c.CustomerID, CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS Name
                   FROM Customer c LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
                   LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID WHERE c.IsBlacklisted = FALSE ORDER BY Name`),
        db.query(`SELECT CategoryID, CategoryName, DailyRate, DepositAmount FROM VehicleCategory ORDER BY CategoryName`),
        db.query(`SELECT BranchID, BranchName FROM Branch ORDER BY BranchName`),
      ]);
      res.render('bookings/new', {
        title: req.t('bookings.new.title'), error: err.detail || err.message, form: b,
        customers: customers.rows, categories: categories.rows, branches: branches.rows,
      });
    } catch (innerErr) { next(innerErr); }
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    await db.query(`UPDATE Booking SET BookingStatus = 'Cancelled' WHERE BookingID = $1 AND BookingStatus = 'Requested'`, [req.params.id]);
    res.redirect(`/bookings?flash=${encodeURIComponent(req.t('bookings.list.flashCancelled', { id: req.params.id }))}`);
  } catch (err) { next(err); }
});

router.get('/:id/confirm', async (req, res, next) => {
  try {
    const bookingRes = await db.query(`
      SELECT bk.*, vc.CategoryName, vc.DailyRate, vc.DepositAmount, br.BranchName,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName,
             (SELECT COUNT(*) FROM RentalAgreement ra2 JOIN Booking bk2 ON bk2.BookingID = ra2.BookingID
                WHERE bk2.CustomerID = bk.CustomerID AND ra2.AgreementStatus = 'Closed') AS PriorCompletedRentals
      FROM Booking bk
      JOIN VehicleCategory vc ON vc.CategoryID = bk.CategoryID
      JOIN Branch br ON br.BranchID = bk.BranchID
      JOIN Customer c ON c.CustomerID = bk.CustomerID
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      WHERE bk.BookingID = $1
    `, [req.params.id]);

    if (bookingRes.rows.length === 0) return res.status(404).render('404', { title: req.t('error.notFound') });
    const booking = bookingRes.rows[0];

    const [vehicles, staff] = await Promise.all([
      db.query(`SELECT VehicleID, RegistrationNumber, Make, Model, BranchID FROM Vehicle
                 WHERE CategoryID = $1 AND Status = 'Available' ORDER BY (BranchID = $2) DESC, RegistrationNumber`,
                [booking.categoryid, booking.branchid]),
      db.query(`SELECT StaffID, FullName, JobRole FROM Staff ORDER BY FullName`),
    ]);

    res.render('bookings/confirm', {
      title: req.t('bookings.confirm.title', { id: booking.bookingid }),
      booking, vehicles: vehicles.rows, staff: staff.rows, error: null,
    });
  } catch (err) { next(err); }
});

router.post('/:id/confirm', async (req, res, next) => {
  const { vehicleId, staffId, deposit } = req.body;
  try {
    const result = await db.query(
      `CALL sp_confirm_booking($1, $2, $3, $4, NULL)`,
      [req.params.id, vehicleId, staffId, deposit || 0]
    );
    const agreementId = result.rows[0].p_agreement_id;
    res.redirect(`/agreements?flash=${encodeURIComponent(req.t('bookings.confirm.flashCreated', { id: agreementId }))}`);
  } catch (err) {
    // Re-render the confirm form with the database's own error message
    // (this is where trg_01_prevent_double_booking / trg_02_require_deposit surface to staff).
    try {
      const bookingRes = await db.query(`
        SELECT bk.*, vc.CategoryName, vc.DailyRate, vc.DepositAmount, br.BranchName,
               CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName,
               (SELECT COUNT(*) FROM RentalAgreement ra2 JOIN Booking bk2 ON bk2.BookingID = ra2.BookingID
                  WHERE bk2.CustomerID = bk.CustomerID AND ra2.AgreementStatus = 'Closed') AS PriorCompletedRentals
        FROM Booking bk
        JOIN VehicleCategory vc ON vc.CategoryID = bk.CategoryID
        JOIN Branch br ON br.BranchID = bk.BranchID
        JOIN Customer c ON c.CustomerID = bk.CustomerID
        LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
        LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
        WHERE bk.BookingID = $1`, [req.params.id]);
      const booking = bookingRes.rows[0];
      const [vehicles, staff] = await Promise.all([
        db.query(`SELECT VehicleID, RegistrationNumber, Make, Model, BranchID FROM Vehicle
                   WHERE CategoryID = $1 AND Status = 'Available' ORDER BY (BranchID = $2) DESC, RegistrationNumber`,
                  [booking.categoryid, booking.branchid]),
        db.query(`SELECT StaffID, FullName, JobRole FROM Staff ORDER BY FullName`),
      ]);
      res.render('bookings/confirm', {
        title: req.t('bookings.confirm.title', { id: booking.bookingid }),
        booking, vehicles: vehicles.rows, staff: staff.rows,
        error: err.message,
      });
    } catch (innerErr) { next(innerErr); }
  }
});

module.exports = router;
