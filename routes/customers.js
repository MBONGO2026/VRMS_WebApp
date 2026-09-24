const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.CustomerID, c.CustomerType, c.Email, c.Phone, c.DateRegistered, c.IsBlacklisted,
             CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS Name
      FROM Customer c
      LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
      LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
      ORDER BY c.CustomerID DESC
    `);
    res.render('customers/list', { title: req.t('customers.list.title'), customers: rows });
  } catch (err) { next(err); }
});

router.get('/new', (req, res) => {
  res.render('customers/new', { title: req.t('customers.new.title'), error: null, form: {} });
});

router.post('/', async (req, res, next) => {
  const b = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const custResult = await client.query(
      `INSERT INTO Customer (CustomerType, Email, Phone, AddressLine) VALUES ($1,$2,$3,$4) RETURNING CustomerID`,
      [b.customerType, b.email, b.phone, b.addressLine]
    );
    const customerId = custResult.rows[0].customerid;

    if (b.customerType === 'Individual') {
      await client.query(
        `INSERT INTO IndividualCustomer (CustomerID, FirstName, LastName, DriverLicenseNumber, LicenseExpiryDate, DateOfBirth)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [customerId, b.firstName, b.lastName, b.licenseNumber, b.licenseExpiry, b.dateOfBirth]
      );
    } else {
      await client.query(
        `INSERT INTO CorporateCustomer (CustomerID, CompanyName, CompanyRegNumber, ContactPersonName, CreditLimit)
         VALUES ($1,$2,$3,$4,$5)`,
        [customerId, b.companyName, b.companyRegNumber, b.contactPersonName, b.creditLimit || 0]
      );
    }

    await client.query('COMMIT');
    res.redirect(`/customers?flash=${encodeURIComponent(req.t('customers.new.flashSaved', { id: customerId }))}`);
  } catch (err) {
    await client.query('ROLLBACK');
    res.render('customers/new', {
      title: req.t('customers.new.title'),
      error: err.detail || err.message,
      form: b,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
