const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM vw_VehicleAvailability ORDER BY CategoryName, BranchName, RegistrationNumber`);
    res.render('vehicles/list', { title: req.t('vehicles.list.title'), vehicles: rows });
  } catch (err) { next(err); }
});

module.exports = router;
