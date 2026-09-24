const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildExcelReport } = require('../lib/excelReport');

// Shared by the HTML page and the Excel BI export so both show the same figures.
async function loadReportData() {
  const [fleet, revenue, overdue, today, byCategory, outstanding] = await Promise.all([
    db.query('SELECT * FROM vw_FleetUtilization ORDER BY UtilizationPercent DESC'),
    db.query('SELECT * FROM vw_RevenueByVehicleType ORDER BY TotalRevenue DESC'),
    db.query('SELECT * FROM vw_OverdueReturns ORDER BY DaysOverdue DESC'),
    db.query('SELECT * FROM vw_TodaysBookings ORDER BY BookingID'),
    db.query(`SELECT vc.CategoryName, COUNT(bk.BookingID)::int AS TotalBookings
               FROM VehicleCategory vc LEFT JOIN Booking bk ON bk.CategoryID = vc.CategoryID
               GROUP BY vc.CategoryName ORDER BY TotalBookings DESC`),
    db.query(`SELECT
                CASE c.CustomerType WHEN 'Individual' THEN ic.FirstName || ' ' || ic.LastName ELSE cc.CompanyName END AS CustomerName,
                i.InvoiceID, i.TotalAmount, i.AmountPaid, (i.TotalAmount - i.AmountPaid) AS Balance
              FROM Invoice i
              JOIN RentalAgreement ra ON ra.AgreementID = i.AgreementID
              JOIN Booking bk ON bk.BookingID = ra.BookingID
              JOIN Customer c ON c.CustomerID = bk.CustomerID
              LEFT JOIN IndividualCustomer ic ON ic.CustomerID = c.CustomerID
              LEFT JOIN CorporateCustomer cc ON cc.CustomerID = c.CustomerID
              WHERE i.TotalAmount > i.AmountPaid ORDER BY Balance DESC`),
  ]);
  return {
    fleet: fleet.rows, revenue: revenue.rows, overdue: overdue.rows,
    today: today.rows, byCategory: byCategory.rows, outstanding: outstanding.rows,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const data = await loadReportData();
    res.render('reports/index', { title: req.t('reports.title'), ...data });
  } catch (err) { next(err); }
});

router.get('/export.xlsx', async (req, res, next) => {
  try {
    const data = await loadReportData();
    const now = new Date();
    const buffer = await buildExcelReport(data, { t: req.t, lang: req.lang, generatedAt: now });
    const fileName = `${req.t('xlsx.fileName')}_${now.toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;
