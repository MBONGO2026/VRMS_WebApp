const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT ra.AgreementID, ra.ActualPickupDate, ra.ActualReturnDate, ra.AgreementStatus,
             v.RegistrationNumber, bk.ReturnDateExpected,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName,
             i.InvoiceID, i.InvoiceStatus,
             (ra.AgreementStatus = 'Active' AND ra.ActualReturnDate IS NULL AND CURRENT_DATE > bk.ReturnDateExpected) AS IsOverdue
      FROM RentalAgreement ra
      JOIN Vehicle v ON v.VehicleID = ra.VehicleID
      JOIN Booking bk ON bk.BookingID = ra.BookingID
      JOIN Customer c ON c.CustomerID = bk.CustomerID
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      LEFT JOIN Invoice i ON i.AgreementID = ra.AgreementID
      ORDER BY ra.AgreementID DESC
    `);
    res.render('agreements/list', { title: req.t('agreements.list.title'), agreements: rows });
  } catch (err) { next(err); }
});

router.get('/:id/return', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT ra.*, v.RegistrationNumber, v.Odometer AS CurrentOdometer,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName
      FROM RentalAgreement ra
      JOIN Vehicle v ON v.VehicleID = ra.VehicleID
      JOIN Booking bk ON bk.BookingID = ra.BookingID
      JOIN Customer c ON c.CustomerID = bk.CustomerID
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      WHERE ra.AgreementID = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).render('404', { title: req.t('error.notFound') });
    res.render('agreements/return', { title: req.t('agreements.return.title'), agreement: rows[0], error: null });
  } catch (err) { next(err); }
});

router.post('/:id/return', async (req, res, next) => {
  const { odometerIn, returnDate, damageFound, conditionNotes } = req.body;
  try {
    await db.query(
      `CALL sp_process_return($1, $2, $3, $4, $5)`,
      [req.params.id, odometerIn, returnDate, damageFound === 'on', conditionNotes || null]
    );
    res.redirect(`/agreements?flash=${encodeURIComponent(req.t('agreements.list.flashReturned', { id: req.params.id }))}`);
  } catch (err) {
    try {
      const { rows } = await db.query(`
        SELECT ra.*, v.RegistrationNumber, v.Odometer AS CurrentOdometer,
               CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName
        FROM RentalAgreement ra JOIN Vehicle v ON v.VehicleID = ra.VehicleID
        JOIN Booking bk ON bk.BookingID = ra.BookingID JOIN Customer c ON c.CustomerID = bk.CustomerID
        LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
        LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
        WHERE ra.AgreementID = $1`, [req.params.id]);
      res.render('agreements/return', { title: req.t('agreements.return.title'), agreement: rows[0], error: err.message });
    } catch (innerErr) { next(innerErr); }
  }
});

router.get('/:id/invoice', async (req, res, next) => {
  try {
    const agreementRes = await db.query(`
      SELECT ra.*, v.RegistrationNumber,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName
      FROM RentalAgreement ra JOIN Vehicle v ON v.VehicleID = ra.VehicleID
      JOIN Booking bk ON bk.BookingID = ra.BookingID JOIN Customer c ON c.CustomerID = bk.CustomerID
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      WHERE ra.AgreementID = $1`, [req.params.id]);
    if (agreementRes.rows.length === 0) return res.status(404).render('404', { title: req.t('error.notFound') });
    const agreement = agreementRes.rows[0];

    const invoiceRes = await db.query(`SELECT * FROM Invoice WHERE AgreementID = $1`, [req.params.id]);
    let invoice = null, lines = [], payments = [];
    if (invoiceRes.rows.length > 0) {
      invoice = invoiceRes.rows[0];
      const [linesRes, paymentsRes] = await Promise.all([
        db.query(`SELECT * FROM InvoiceLine WHERE InvoiceID = $1 ORDER BY InvoiceLineID`, [invoice.invoiceid]),
        db.query(`SELECT * FROM Payment WHERE AgreementID = $1 ORDER BY PaymentDate`, [req.params.id]),
      ]);
      lines = linesRes.rows;
      payments = paymentsRes.rows;
    }

    res.render('agreements/invoice', {
      title: req.t('agreements.invoice.title', { id: agreement.agreementid }),
      agreement, invoice, lines, payments, error: null,
    });
  } catch (err) { next(err); }
});

router.post('/:id/invoice/generate', async (req, res, next) => {
  try {
    const result = await db.query(`CALL sp_generate_invoice($1, NULL)`, [req.params.id]);
    const invoiceId = result.rows[0].p_invoice_id;
    res.redirect(`/agreements/${req.params.id}/invoice?flash=${encodeURIComponent(req.t('agreements.invoice.flashGenerated', { id: invoiceId }))}`);
  } catch (err) {
    res.redirect(`/agreements/${req.params.id}/invoice?flash=${encodeURIComponent(err.message)}&flashType=error`);
  }
});

router.post('/:id/payment', async (req, res, next) => {
  const { amount, method, type } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO Payment (AgreementID, Amount, PaymentMethod, PaymentType) VALUES ($1,$2,$3,$4)`,
      [req.params.id, amount, method, type]
    );
    const invRes = await client.query(`SELECT * FROM Invoice WHERE AgreementID = $1`, [req.params.id]);
    if (invRes.rows.length > 0) {
      const invoice = invRes.rows[0];
      const paidRes = await client.query(`SELECT COALESCE(SUM(Amount),0) AS total FROM Payment WHERE AgreementID = $1`, [req.params.id]);
      const totalPaid = Math.min(Number(paidRes.rows[0].total), Number(invoice.totalamount));
      const status = totalPaid >= Number(invoice.totalamount) ? 'Paid' : (totalPaid > 0 ? 'PartiallyPaid' : 'Unpaid');
      await client.query(`UPDATE Invoice SET AmountPaid = $1, InvoiceStatus = $2 WHERE InvoiceID = $3`, [totalPaid, status, invoice.invoiceid]);
    }
    await client.query('COMMIT');
    res.redirect(`/agreements/${req.params.id}/invoice?flash=${encodeURIComponent(req.t('agreements.invoice.flashPayment', { amount }))}`);
  } catch (err) {
    await client.query('ROLLBACK');
    res.redirect(`/agreements/${req.params.id}/invoice?flash=${encodeURIComponent(err.message)}&flashType=error`);
  } finally {
    client.release();
  }
});

module.exports = router;
