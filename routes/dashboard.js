const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const [today, fleet, overdue, outstanding, recentBookings] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS n FROM vw_TodaysBookings'),
      db.query(`SELECT
                   COALESCE(SUM(TotalVehicles),0)::int AS total,
                   COALESCE(SUM(VehiclesRented),0)::int AS rented,
                   COALESCE(SUM(VehiclesAvailable),0)::int AS available,
                   COALESCE(SUM(VehiclesInMaintenance),0)::int AS maintenance
                 FROM vw_FleetUtilization`),
      db.query('SELECT COUNT(*)::int AS n FROM vw_OverdueReturns'),
      db.query('SELECT COALESCE(SUM(TotalOutstanding),0)::numeric AS total FROM vw_RevenueByVehicleType'),
      db.query(`SELECT BookingID, CustomerName, CategoryName, BranchName, PickupDate, ReturnDateExpected, BookingStatus
                 FROM vw_BookingsDetail ORDER BY BookingID DESC LIMIT 6`),
    ]);

    const f = fleet.rows[0];
    const utilization = f.total > 0 ? ((f.rented / f.total) * 100).toFixed(1) : '0.0';

    res.render('dashboard', {
      title: req.t('dashboard.title'),
      todayCount: today.rows[0].n,
      fleet: f,
      utilization,
      overdueCount: overdue.rows[0].n,
      outstanding: outstanding.rows[0].total,
      recentBookings: recentBookings.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
