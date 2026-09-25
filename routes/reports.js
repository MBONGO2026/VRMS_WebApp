const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildExcelReport, buildPeriodExcelReport } = require('../lib/excelReport');
const { buildOverviewPdf, buildPeriodPdf } = require('../lib/pdfReport');
const { resolvePeriod, submittedInput } = require('../lib/period');
const { loadPeriodData, firstActivityYear } = require('../lib/periodReport');

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

// Every report can be downloaded as Excel or PDF; both builders take the same data.
const EXPORTS = {
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    overview: buildExcelReport, period: buildPeriodExcelReport,
  },
  pdf: { contentType: 'application/pdf', overview: buildOverviewPdf, period: buildPeriodPdf },
};

function sendFile(res, format, fileBase, buffer) {
  res.setHeader('Content-Type', EXPORTS[format].contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.${format}"`);
  res.send(buffer);
}

router.get('/export.:format(xlsx|pdf)', async (req, res, next) => {
  try {
    const { format } = req.params;
    const data = await loadReportData();
    const now = new Date();
    const buffer = await EXPORTS[format].overview(data, { t: req.t, lang: req.lang, generatedAt: now });
    sendFile(res, format, `${req.t('xlsx.fileName')}_${now.toISOString().slice(0, 10)}`, buffer);
  } catch (err) { next(err); }
});

// ---------- Period reports: daily / monthly / annual / custom range ----------

router.get('/period', async (req, res, next) => {
  try {
    const firstYear = await firstActivityYear();
    const view = { title: req.t('period.title'), firstYear, period: null, data: null, error: null, type: req.query.type };
    try {
      view.period = resolvePeriod(req.query, res.locals.dateLocale);
    } catch (err) {
      if (!err.i18nKey) throw err;
      view.error = req.t(err.i18nKey);
      view.input = submittedInput(req.query);
      return res.status(400).render('reports/period', view);
    }
    view.type = view.period.type;
    view.input = view.period.input;
    view.data = await loadPeriodData(view.period);
    res.render('reports/period', view);
  } catch (err) { next(err); }
});

router.get('/period/export.:format(xlsx|pdf)', async (req, res, next) => {
  try {
    const { format } = req.params;
    let period;
    try {
      period = resolvePeriod(req.query, res.locals.dateLocale);
    } catch (err) {
      if (!err.i18nKey) throw err;
      return res.redirect(`/reports/period?${new URLSearchParams(req.query)}`);
    }
    const data = await loadPeriodData(period);
    const now = new Date();
    const buffer = await EXPORTS[format].period(data, period, { t: req.t, lang: req.lang, generatedAt: now });
    const suffix = {
      daily: period.from,
      monthly: period.from.slice(0, 7),
      annual: period.from.slice(0, 4),
      custom: `${period.from}_${period.to}`,
    }[period.type];
    sendFile(res, format, `${req.t(`period.fileName.${period.type}`)}_${suffix}`, buffer);
  } catch (err) { next(err); }
});

module.exports = router;
