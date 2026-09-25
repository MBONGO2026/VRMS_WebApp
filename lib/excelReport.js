// Builds the "Business Intelligence" Excel report: a dashboard sheet with KPI
// cards and native charts, followed by one formatted, filterable Excel table per
// report. KPI cells are live formulas pointing at the data sheets, so editing
// or filtering the data in Excel keeps the dashboard consistent.
const ExcelJS = require('exceljs');
const { addCharts } = require('./xlsxCharts');
const { statusLabel } = require('../i18n');
const palette = require('./chartPalette');

const C = {
  navy: '1F3864', navyDark: '16294A', orange: 'C55A11', bg: 'F4F6F9',
  border: 'D9DEE7', text: '22283A', muted: '6B7280', green: '1E7E34', red: 'B02A2A', amber: 'B8860B',
  blue: '2E75B6', teal: '17A2B8',
};
// Chart series colors from the validated palette, in Excel's RRGGBB form.
const hex = (h) => h.replace('#', '');
const SERIES_HEX = Object.fromEntries(Object.entries(palette.SERIES).map(([k, v]) => [k, hex(v)]));
const ON = (seriesHex) => hex(palette.ON_SERIES[`#${seriesHex}`]);
const MONEY = '"N$" #,##0.00';
const MONEY0 = '"N$" #,##0';
const argb = (hex) => ({ argb: 'FF' + hex });
const solid = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: argb(hex) });
const num = (v) => Number(v) || 0;
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const q = (name) => `'${name.replace(/'/g, "''")}'`;
// pg returns DATE/TIMESTAMP values at local time, but ExcelJS serialises Dates in
// UTC: re-anchor the local calendar date/time on UTC so Excel shows the same day
// as the web app whatever the server time zone.
const xlDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
};

// Whole-number axis step for small counts, so Excel does not show "0, 0, 1, 1".
const countStep = (rows, k) => (Math.max(0, ...rows.map((r) => num(r[k]))) <= 10 ? 1 : undefined);

const TABLE_HEADER_ROW = 4;

// Writes a titled data sheet with an Excel table. Returns range helpers used by
// the dashboard formulas and charts.
function addDataSheet(wb, { name, title, subtitle, tableName, columns, rows, emptyText, t }) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: argb(C.navy) },
    views: [{ state: 'frozen', ySplit: TABLE_HEADER_ROW, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const width = columns.length;

  ws.mergeCells(1, 1, 1, width);
  const t1 = ws.getCell(1, 1);
  t1.value = title;
  t1.font = { name: 'Segoe UI', size: 16, bold: true, color: argb('FFFFFF') };
  t1.fill = solid(C.navy);
  t1.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, width);
  const t2 = ws.getCell(2, 1);
  t2.value = subtitle;
  t2.font = { name: 'Segoe UI', size: 9, italic: true, color: argb(C.muted) };
  t2.alignment = { indent: 1 };

  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });

  const first = TABLE_HEADER_ROW + 1;
  const last = TABLE_HEADER_ROW + rows.length;

  if (rows.length) {
    ws.addTable({
      name: tableName,
      ref: `A${TABLE_HEADER_ROW}`,
      headerRow: true,
      totalsRow: columns.some((c) => c.total),
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: columns.map((c) => ({
        name: c.header,
        filterButton: true,
        totalsRowFunction: c.total || 'none',
        totalsRowLabel: columns.indexOf(c) === 0 ? t('xlsx.total') : undefined,
      })),
      rows: rows.map((r) => columns.map((c) => c.value(r))),
    });
    const lastBody = last + (columns.some((c) => c.total) ? 1 : 0);
    for (let r = first; r <= lastBody; r++) {
      columns.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1);
        if (c.numFmt) cell.numFmt = c.numFmt;
        if (c.align) cell.alignment = { horizontal: c.align };
      });
    }
    ws.getRow(TABLE_HEADER_ROW).height = 32;
    ws.getRow(TABLE_HEADER_ROW).font = { bold: true, color: argb('FFFFFF') };
    ws.getRow(TABLE_HEADER_ROW).alignment = { vertical: 'middle', wrapText: true };
    columns.forEach((c, i) => {
      if (!c.cf) return;
      const L = colLetter(i + 1);
      ws.addConditionalFormatting({ ref: `${L}${first}:${L}${last}`, rules: [c.cf] });
    });
  } else {
    ws.getCell(TABLE_HEADER_ROW, 1).value = emptyText;
    ws.getCell(TABLE_HEADER_ROW, 1).font = { italic: true, color: argb(C.muted) };
  }

  // Ranges always point to at least one row so formulas stay valid when empty.
  const range = (key) => {
    const i = columns.findIndex((c) => c.key === key) + 1;
    const L = colLetter(i);
    return `${q(name)}!$${L}$${first}:$${L}$${Math.max(last, first)}`;
  };
  return { ws, range, count: rows.length };
}

function kpiCard(ws, col, { label, value, formula, numFmt, caption, color }) {
  const top = 5;
  [[top, label], [top + 1, null], [top + 2, caption]].forEach(([r]) => ws.mergeCells(r, col, r, col + 1));
  const lab = ws.getCell(top, col);
  lab.value = label;
  lab.font = { name: 'Segoe UI', size: 8, bold: true, color: argb(C.muted) };
  lab.alignment = { vertical: 'bottom', indent: 1 };

  const val = ws.getCell(top + 1, col);
  val.value = formula ? { formula, result: value } : value;
  val.numFmt = numFmt || 'General';
  val.font = { name: 'Segoe UI', size: 20, bold: true, color: argb(C.text) };
  val.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cap = ws.getCell(top + 2, col);
  cap.value = caption;
  cap.font = { name: 'Segoe UI', size: 8, color: argb(C.muted) };
  cap.alignment = { vertical: 'top', indent: 1 };

  for (let r = top; r <= top + 2; r++) {
    for (let c = col; c <= col + 1; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = solid('FFFFFF');
      cell.border = {
        left: c === col ? { style: 'thick', color: argb(C.navy) } : undefined,
        right: c === col + 1 ? { style: 'thin', color: argb(C.border) } : undefined,
        top: r === top ? { style: 'thin', color: argb(C.border) } : undefined,
        bottom: r === top + 2 ? { style: 'thin', color: argb(C.border) } : undefined,
      };
    }
  }
}

function sectionTitle(ws, row, col, endCol, text) {
  ws.mergeCells(row, col, row, endCol);
  const c = ws.getCell(row, col);
  c.value = text;
  c.font = { name: 'Segoe UI', size: 11, bold: true, color: argb(C.navy) };
  c.border = { bottom: { style: 'medium', color: argb(C.orange) } };
}

async function buildExcelReport(data, { t, lang, generatedAt = new Date() }) {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SwiftDrive VRMS';
  wb.created = generatedAt;
  wb.calcProperties.fullCalcOnLoad = true;

  const stamp = t('xlsx.generatedAt', {
    date: generatedAt.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' }),
  });
  const names = {
    dash: t('xlsx.sheetDashboard'), fleet: t('xlsx.sheetFleet'), revenue: t('xlsx.sheetRevenue'),
    overdue: t('xlsx.sheetOverdue'), today: t('xlsx.sheetToday'), byCat: t('xlsx.sheetByCategory'),
    outstanding: t('xlsx.sheetOutstanding'),
  };

  // Dashboard first so it is the sheet Excel opens on; filled in after the data sheets exist.
  const dash = wb.addWorksheet(names.dash, {
    properties: { tabColor: argb(C.orange) },
    views: [{ showGridLines: false, zoomScale: 90 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
  });

  const moneyCf = (color) => ({ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: argb(color), gradient: false });

  const fleet = addDataSheet(wb, {
    name: names.fleet, t, tableName: 'tblFleet',
    title: t('reports.fleetUtilization'), subtitle: stamp, emptyText: t('xlsx.noData'),
    rows: data.fleet,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'total', header: t('reports.colTotal'), width: 12, value: (r) => num(r.totalvehicles), total: 'sum', align: 'center' },
      { key: 'rented', header: t('reports.colRented'), width: 12, value: (r) => num(r.vehiclesrented), total: 'sum', align: 'center' },
      { key: 'avail', header: t('reports.colAvailable'), width: 14, value: (r) => num(r.vehiclesavailable), total: 'sum', align: 'center' },
      { key: 'maint', header: t('reports.colMaintenance'), width: 14, value: (r) => num(r.vehiclesinmaintenance), total: 'sum', align: 'center' },
      { key: 'util', header: t('reports.colUtilization'), width: 16, value: (r) => num(r.utilizationpercent) / 100, numFmt: '0.0%',
        cf: { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: argb('F8CBAD'), gradient: false } },
    ],
  });

  const revenue = addDataSheet(wb, {
    name: names.revenue, t, tableName: 'tblRevenue',
    title: t('reports.revenueByCategory'), subtitle: stamp, emptyText: t('xlsx.noData'),
    rows: data.revenue,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'inv', header: t('reports.colInvoices'), width: 12, value: (r) => num(r.invoicesissued), total: 'sum', align: 'center' },
      { key: 'rev', header: t('reports.colTotalRevenue'), width: 18, value: (r) => num(r.totalrevenue), total: 'sum', numFmt: MONEY, cf: moneyCf('9DC3E6') },
      { key: 'col', header: t('reports.colCollected'), width: 18, value: (r) => num(r.totalcollected), total: 'sum', numFmt: MONEY },
      { key: 'out', header: t('reports.colOutstanding'), width: 18, value: (r) => num(r.totaloutstanding), total: 'sum', numFmt: MONEY },
      { key: 'rate', header: t('xlsx.colCollectionRate'), width: 16, numFmt: '0.0%',
        value: (r) => (num(r.totalrevenue) ? num(r.totalcollected) / num(r.totalrevenue) : null),
        cf: { type: 'colorScale', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.5 }, { type: 'num', value: 1 }],
          color: [argb('F8696B'), argb('FFEB84'), argb('63BE7B')] } },
    ],
  });

  const overdue = addDataSheet(wb, {
    name: names.overdue, t, tableName: 'tblOverdue',
    title: t('reports.overdueReturns'), subtitle: stamp, emptyText: t('reports.noOverdue'),
    rows: data.overdue,
    columns: [
      { key: 'ag', header: t('reports.colAgreement'), width: 12, value: (r) => num(r.agreementid), align: 'center' },
      { key: 'veh', header: t('reports.colVehicle'), width: 16, value: (r) => r.registrationnumber },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'due', header: t('reports.colReturnDue'), width: 16, value: (r) => xlDate(r.returndateexpected), numFmt: 'dd/mm/yyyy', align: 'center' },
      { key: 'days', header: t('xlsx.colDaysOverdue'), width: 14, value: (r) => num(r.daysoverdue), align: 'center',
        cf: { type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: [argb('FFEB84'), argb('F8696B')] } },
    ],
  });

  const today = addDataSheet(wb, {
    name: names.today, t, tableName: 'tblToday',
    title: t('reports.todaysBookings'), subtitle: stamp, emptyText: t('reports.noToday'),
    rows: data.today,
    columns: [
      { key: 'ref', header: t('col.ref'), width: 12, value: (r) => num(r.bookingid), align: 'center' },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'cat', header: t('col.category'), width: 22, value: (r) => r.categoryname },
      { key: 'branch', header: t('col.branch'), width: 24, value: (r) => r.branchname },
    ],
  });

  const byCat = addDataSheet(wb, {
    name: names.byCat, t, tableName: 'tblBookingsByCategory',
    title: t('reports.bookingsByCategory'), subtitle: stamp, emptyText: t('xlsx.noData'),
    rows: data.byCategory,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'n', header: t('reports.colTotalBookings'), width: 18, value: (r) => num(r.totalbookings), total: 'sum', align: 'center',
        cf: { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: argb('B4C6E7'), gradient: false } },
    ],
  });

  const outstanding = addDataSheet(wb, {
    name: names.outstanding, t, tableName: 'tblOutstanding',
    title: t('reports.outstandingBalances'), subtitle: stamp, emptyText: t('reports.noOutstanding'),
    rows: data.outstanding,
    columns: [
      { key: 'cust', header: t('col.customer'), width: 30, value: (r) => r.customername },
      { key: 'inv', header: t('reports.colInvoice'), width: 12, value: (r) => num(r.invoiceid), align: 'center' },
      { key: 'total', header: t('xlsx.colInvoiceTotal'), width: 18, value: (r) => num(r.totalamount), total: 'sum', numFmt: MONEY },
      { key: 'paid', header: t('xlsx.colPaid'), width: 18, value: (r) => num(r.amountpaid), total: 'sum', numFmt: MONEY },
      { key: 'bal', header: t('reports.colBalance'), width: 18, value: (r) => num(r.balance), total: 'sum', numFmt: MONEY, cf: moneyCf('F4B6B6') },
    ],
  });

  // ---------------- Dashboard ----------------
  const sum = (rows, k) => rows.reduce((a, r) => a + num(r[k]), 0);
  const totRevenue = sum(data.revenue, 'totalrevenue');
  const totCollected = sum(data.revenue, 'totalcollected');
  const totOutstanding = sum(data.revenue, 'totaloutstanding');
  const fleetTotal = sum(data.fleet, 'totalvehicles');
  const fleetRented = sum(data.fleet, 'vehiclesrented');
  const fleetAvail = sum(data.fleet, 'vehiclesavailable');
  const fleetMaint = sum(data.fleet, 'vehiclesinmaintenance');
  const utilization = fleetTotal ? fleetRented / fleetTotal : 0;

  dash.getColumn(1).width = 2;
  for (let c = 2; c <= 13; c++) dash.getColumn(c).width = 13.5;
  dash.getColumn(14).width = 2;
  for (let r = 1; r <= 60; r++) for (let c = 1; c <= 14; c++) dash.getCell(r, c).fill = solid(C.bg);

  dash.mergeCells('B1:M2');
  const banner = dash.getCell('B1');
  banner.value = t('xlsx.dashboardTitle');
  banner.font = { name: 'Segoe UI', size: 20, bold: true, color: argb('FFFFFF') };
  banner.fill = solid(C.navy);
  banner.alignment = { vertical: 'middle', indent: 1 };
  dash.getRow(1).height = 24; dash.getRow(2).height = 24;
  dash.mergeCells('B3:M3');
  const sub = dash.getCell('B3');
  sub.value = `${t('xlsx.dashboardSubtitle')}  •  ${stamp}`;
  sub.font = { name: 'Segoe UI', size: 9, color: argb('FFFFFF') };
  sub.fill = solid(C.navyDark);
  sub.alignment = { vertical: 'middle', indent: 1 };
  dash.getRow(3).height = 18;
  dash.getRow(4).height = 10;
  dash.getRow(5).height = 18; dash.getRow(6).height = 34; dash.getRow(7).height = 18;

  kpiCard(dash, 2, {
    label: t('reports.colTotalRevenue'), color: C.navy, numFmt: MONEY0,
    formula: `SUM(${revenue.range('rev')})`, value: totRevenue,
    caption: t('xlsx.kpiInvoices', { n: sum(data.revenue, 'invoicesissued') }),
  });
  kpiCard(dash, 4, {
    label: t('reports.colCollected'), color: C.green, numFmt: MONEY0,
    formula: `SUM(${revenue.range('col')})`, value: totCollected,
    caption: t('xlsx.kpiCollectionRate', { pct: (totRevenue ? (totCollected / totRevenue) * 100 : 0).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
  });
  kpiCard(dash, 6, {
    label: t('reports.colOutstanding'), color: C.red, numFmt: MONEY0,
    formula: `SUM(${revenue.range('out')})`, value: totOutstanding,
    caption: t('xlsx.kpiOpenInvoices', { n: data.outstanding.length }),
  });
  kpiCard(dash, 8, {
    label: t('reports.colUtilization'), color: C.orange, numFmt: '0.0%',
    formula: `IFERROR(SUM(${fleet.range('rented')})/SUM(${fleet.range('total')}),0)`, value: utilization,
    caption: t('xlsx.kpiFleet', { rented: fleetRented, total: fleetTotal }),
  });
  kpiCard(dash, 10, {
    label: t('dashboard.statOverdue'), color: data.overdue.length ? C.red : C.green, numFmt: '0',
    formula: `COUNTIF(${overdue.range('days')},">0")`, value: data.overdue.length,
    caption: data.overdue.length
      ? t('xlsx.kpiMaxOverdue', { n: Math.max(...data.overdue.map((o) => num(o.daysoverdue))) })
      : t('reports.noOverdue'),
  });
  kpiCard(dash, 12, {
    label: t('dashboard.statToday'), color: C.blue, numFmt: '0',
    formula: `COUNT(${today.range('ref')})`, value: data.today.length,
    caption: t('xlsx.kpiTotalBookings', { n: sum(data.byCategory, 'totalbookings') }),
  });

  // Chart grid: rows 9-24 and 26-41 (1-based), columns B-G and H-M.
  sectionTitle(dash, 9, 2, 13, t('xlsx.sectionCharts'));

  // Fleet status summary (feeds the doughnut) and top outstanding customers.
  const S = 44;
  sectionTitle(dash, S, 2, 7, t('xlsx.sectionFleetStatus'));
  sectionTitle(dash, S, 8, 13, t('xlsx.sectionTopOutstanding'));
  const statusRows = [
    [t('reports.colRented'), `SUM(${fleet.range('rented')})`, fleetRented, SERIES_HEX.blue],
    [t('reports.colAvailable'), `SUM(${fleet.range('avail')})`, fleetAvail, SERIES_HEX.orange],
    [t('reports.colMaintenance'), `SUM(${fleet.range('maint')})`, fleetMaint, SERIES_HEX.aqua],
  ];
  const headStyle = (cell, horizontal = 'left') => {
    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: argb('FFFFFF') };
    cell.fill = solid(C.navy);
    cell.alignment = { vertical: 'middle', horizontal, indent: horizontal === 'left' ? 1 : 0 };
  };
  const bodyStyle = (cell, zebra, horizontal = 'left') => {
    cell.font = { name: 'Segoe UI', size: 10, color: argb(C.text) };
    cell.fill = solid(zebra ? 'EEF1F6' : 'FFFFFF');
    cell.border = { bottom: { style: 'hair', color: argb(C.border) } };
    cell.alignment = { vertical: 'middle', horizontal, indent: horizontal === 'left' ? 1 : 0 };
  };
  dash.mergeCells(S + 1, 2, S + 1, 4); dash.mergeCells(S + 1, 5, S + 1, 6);
  dash.getCell(S + 1, 2).value = t('xlsx.colStatus'); headStyle(dash.getCell(S + 1, 2));
  dash.getCell(S + 1, 5).value = t('xlsx.colVehicles'); headStyle(dash.getCell(S + 1, 5), 'center');
  dash.getCell(S + 1, 7).value = t('xlsx.colShare'); headStyle(dash.getCell(S + 1, 7), 'center');
  statusRows.forEach(([label, formula, value], i) => {
    const r = S + 2 + i;
    dash.mergeCells(r, 2, r, 4); dash.mergeCells(r, 5, r, 6);
    dash.getCell(r, 2).value = label;
    dash.getCell(r, 5).value = { formula, result: value };
    dash.getCell(r, 7).value = { formula: `IFERROR(E${r}/SUM($E$${S + 2}:$E$${S + 4}),0)`, result: fleetTotal ? value / fleetTotal : 0 };
    dash.getCell(r, 7).numFmt = '0.0%';
    [2, 5, 7].forEach((c) => bodyStyle(dash.getCell(r, c), i % 2, c === 2 ? 'left' : 'center'));
  });

  const top = [...data.outstanding].sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 5);
  dash.mergeCells(S + 1, 8, S + 1, 10); dash.mergeCells(S + 1, 12, S + 1, 13);
  dash.getCell(S + 1, 8).value = t('col.customer'); headStyle(dash.getCell(S + 1, 8));
  dash.getCell(S + 1, 11).value = t('reports.colInvoice'); headStyle(dash.getCell(S + 1, 11), 'center');
  dash.getCell(S + 1, 12).value = t('reports.colBalance'); headStyle(dash.getCell(S + 1, 12), 'right');
  if (!top.length) {
    dash.mergeCells(S + 2, 8, S + 2, 13);
    dash.getCell(S + 2, 8).value = t('reports.noOutstanding');
    bodyStyle(dash.getCell(S + 2, 8), 0);
  }
  top.forEach((o, i) => {
    const r = S + 2 + i;
    dash.mergeCells(r, 8, r, 10); dash.mergeCells(r, 12, r, 13);
    dash.getCell(r, 8).value = o.customername;
    dash.getCell(r, 11).value = `#${o.invoiceid}`;
    dash.getCell(r, 12).value = num(o.balance);
    dash.getCell(r, 12).numFmt = MONEY;
    [8, 11, 12].forEach((c) => bodyStyle(dash.getCell(r, c), i % 2, { 8: 'left', 11: 'center', 12: 'right' }[c]));
    dash.getCell(r, 12).font = { name: 'Segoe UI', size: 10, bold: true, color: argb(C.red) };
    dash.getCell(r, 12).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  });

  dash.getCell(S + 9, 2).value = t('xlsx.footnote');
  dash.getCell(S + 9, 2).font = { name: 'Segoe UI', size: 8, italic: true, color: argb(C.muted) };

  // Keep the data-sheet tab hyperlinks handy under the banner-less area.
  const links = [names.fleet, names.revenue, names.overdue, names.today, names.byCat, names.outstanding];
  links.forEach((n, i) => {
    const cell = dash.getCell(S + 11, 2 + i * 2);
    cell.value = { text: `→ ${n}`, hyperlink: `#${q(n)}!A1` };
    cell.font = { name: 'Segoe UI', size: 9, underline: true, color: argb(C.blue) };
  });

  // ---------------- Charts ----------------
  const labels = (rows, k) => rows.map((r) => String(r[k] ?? ''));
  const charts = [];
  if (data.revenue.length) {
    charts.push({
      type: 'bar', anchor: [1, 10, 7, 26], dir: 'col', grouping: 'stacked', gapWidth: 150,
      title: t('reports.revenueByCategory'), numFmt: MONEY0, labelFmt: '#,##0;-#,##0;;',
      categories: { ref: revenue.range('cat'), values: labels(data.revenue, 'categoryname') },
      series: [
        { name: t('reports.colCollected'), ref: revenue.range('col'), values: data.revenue.map((r) => num(r.totalcollected)), color: SERIES_HEX.blue, labelColor: ON(SERIES_HEX.blue) },
        { name: t('reports.colOutstanding'), ref: revenue.range('out'), values: data.revenue.map((r) => num(r.totaloutstanding)), color: SERIES_HEX.orange, labelColor: ON(SERIES_HEX.orange) },
      ],
    });
  }
  if (fleetTotal) {
    charts.push({
      type: 'doughnut', anchor: [7, 10, 13, 26],
      title: t('xlsx.chartFleetStatus'),
      categories: { ref: `${q(names.dash)}!$B$${S + 2}:$B$${S + 4}`, values: statusRows.map((s) => s[0]) },
      series: { name: t('xlsx.colVehicles'), ref: `${q(names.dash)}!$E$${S + 2}:$E$${S + 4}`, values: statusRows.map((s) => s[2]) },
      colors: statusRows.map((s) => s[3]),
    });
  }
  if (data.fleet.length) {
    charts.push({
      type: 'bar', anchor: [1, 27, 7, 43], dir: 'bar', legend: false, max: 1,
      title: t('xlsx.chartUtilization'), numFmt: '0%', gapWidth: 120,
      categories: { ref: fleet.range('cat'), values: labels(data.fleet, 'categoryname') },
      series: [{ name: t('reports.colUtilization'), ref: fleet.range('util'), values: data.fleet.map((r) => num(r.utilizationpercent) / 100), color: SERIES_HEX.blue }],
    });
  }
  if (data.byCategory.length) {
    charts.push({
      type: 'bar', anchor: [7, 27, 13, 43], dir: 'col', legend: false,
      title: t('reports.bookingsByCategory'), numFmt: '0', gapWidth: 250,
      majorUnit: countStep(data.byCategory, 'totalbookings'),
      categories: { ref: byCat.range('cat'), values: labels(data.byCategory, 'categoryname') },
      series: [{ name: t('reports.colTotalBookings'), ref: byCat.range('n'), values: data.byCategory.map((r) => num(r.totalbookings)), color: SERIES_HEX.blue }],
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return addCharts(Buffer.from(buffer), names.dash, charts);
}

// Period report (daily / monthly / annual / custom): same look as the BI
// dashboard, but every figure is limited to the selected date range.
async function buildPeriodExcelReport(data, period, { t, lang, generatedAt = new Date() }) {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SwiftDrive VRMS';
  wb.created = generatedAt;
  wb.calcProperties.fullCalcOnLoad = true;

  const s = data.summary;
  const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' });
  let rangeText = period.label;
  if (period.type === 'custom') rangeText += `  (${t('period.days', { n: period.days })})`;
  else if (period.from !== period.to) rangeText += `  (${t('period.range', { from: fmtDay(period.from), to: fmtDay(period.to), n: period.days })})`;
  const stamp = t('xlsx.generatedAt', { date: generatedAt.toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' }) });
  const subtitle = `${rangeText}  •  ${stamp}`;
  const names = {
    dash: t('xlsx.sheetDashboard'), trend: t('period.sheetTrend'), revenue: t('xlsx.sheetRevenue'),
    util: t('period.sheetUtilization'), byCat: t('xlsx.sheetByCategory'), branches: t('period.sheetBranches'),
    bookings: t('period.sheetBookings'), invoices: t('period.sheetInvoices'), payments: t('period.sheetPayments'),
    returns: t('period.sheetReturns'),
  };

  const dash = wb.addWorksheet(names.dash, {
    properties: { tabColor: argb(C.orange) },
    views: [{ showGridLines: false, zoomScale: 90 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
  });
  const moneyBar = (color) => ({ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: argb(color), gradient: false });
  const DATE_FMT = 'dd/mm/yyyy';

  const bucketLabel = (d) => {
    const x = new Date(d);
    if (period.bucket === 'month') return x.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    return x.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  };
  const trend = data.trend.length ? addDataSheet(wb, {
    name: names.trend, t, tableName: 'tblTrend',
    title: t(period.bucket === 'month' ? 'period.trendMonthly' : 'period.trendDaily'), subtitle, emptyText: t('xlsx.noData'),
    rows: data.trend,
    columns: [
      { key: 'label', header: t(period.bucket === 'month' ? 'period.month' : 'period.day'), width: 16, value: (r) => bucketLabel(r.bucket) },
      { key: 'bk', header: t('period.kpiBookings'), width: 14, value: (r) => num(r.bookings), total: 'sum', align: 'center' },
      { key: 'inv', header: t('period.kpiInvoiced'), width: 18, value: (r) => num(r.invoiced), total: 'sum', numFmt: MONEY, cf: moneyBar('9DC3E6') },
      { key: 'rec', header: t('period.kpiReceived'), width: 18, value: (r) => num(r.received), total: 'sum', numFmt: MONEY, cf: moneyBar('A9D18E') },
    ],
  }) : null;

  const revenue = addDataSheet(wb, {
    name: names.revenue, t, tableName: 'tblPeriodRevenue',
    title: t('reports.revenueByCategory'), subtitle, emptyText: t('xlsx.noData'),
    rows: data.revenue,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'n', header: t('reports.colInvoices'), width: 12, value: (r) => num(r.invoices), total: 'sum', align: 'center' },
      { key: 'inv', header: t('period.kpiInvoiced'), width: 18, value: (r) => num(r.invoiced), total: 'sum', numFmt: MONEY, cf: moneyBar('9DC3E6') },
      { key: 'col', header: t('reports.colCollected'), width: 18, value: (r) => num(r.collected), total: 'sum', numFmt: MONEY },
      { key: 'out', header: t('reports.colOutstanding'), width: 18, value: (r) => num(r.outstanding), total: 'sum', numFmt: MONEY },
    ],
  });

  const util = addDataSheet(wb, {
    name: names.util, t, tableName: 'tblPeriodUtilization',
    title: t('period.utilizationByCategory'), subtitle, emptyText: t('xlsx.noData'),
    rows: data.utilization,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'veh', header: t('xlsx.colVehicles'), width: 12, value: (r) => num(r.vehicles), total: 'sum', align: 'center' },
      { key: 'days', header: t('period.colRentedDays'), width: 16, value: (r) => num(r.renteddays), total: 'sum', align: 'center' },
      { key: 'util', header: t('reports.colUtilization'), width: 16, value: (r) => r.utilization ?? 0, numFmt: '0.0%',
        cf: { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: argb('F8CBAD'), gradient: false } },
    ],
  });

  const byCat = addDataSheet(wb, {
    name: names.byCat, t, tableName: 'tblPeriodBookingsByCategory',
    title: t('reports.bookingsByCategory'), subtitle, emptyText: t('xlsx.noData'),
    rows: data.bookingsByCategory,
    columns: [
      { key: 'cat', header: t('col.category'), width: 24, value: (r) => r.categoryname },
      { key: 'n', header: t('period.kpiBookings'), width: 14, value: (r) => num(r.bookings), total: 'sum', align: 'center',
        cf: { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: argb('B4C6E7'), gradient: false } },
      { key: 'cx', header: t('period.colCancelled'), width: 14, value: (r) => num(r.cancelled), total: 'sum', align: 'center' },
    ],
  });

  const branches = addDataSheet(wb, {
    name: names.branches, t, tableName: 'tblPeriodBranches',
    title: t('period.byBranch'), subtitle, emptyText: t('xlsx.noData'),
    rows: data.branches,
    columns: [
      { key: 'br', header: t('col.branch'), width: 26, value: (r) => r.branchname },
      { key: 'n', header: t('period.kpiBookings'), width: 14, value: (r) => num(r.bookings), total: 'sum', align: 'center' },
      { key: 'inv', header: t('period.kpiInvoiced'), width: 18, value: (r) => num(r.invoiced), total: 'sum', numFmt: MONEY, cf: moneyBar('9DC3E6') },
    ],
  });

  const bookings = addDataSheet(wb, {
    name: names.bookings, t, tableName: 'tblPeriodBookings',
    title: t('period.bookingList'), subtitle, emptyText: t('period.noBookings'),
    rows: data.bookingList,
    columns: [
      { key: 'ref', header: t('col.ref'), width: 10, value: (r) => num(r.bookingid), align: 'center' },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'cat', header: t('col.category'), width: 14, value: (r) => r.categoryname },
      { key: 'br', header: t('col.branch'), width: 24, value: (r) => r.branchname },
      { key: 'pu', header: t('col.pickup'), width: 14, value: (r) => xlDate(r.pickupdate), numFmt: DATE_FMT, align: 'center' },
      { key: 'rt', header: t('col.returnExpected'), width: 14, value: (r) => xlDate(r.returndateexpected), numFmt: DATE_FMT, align: 'center' },
      { key: 'st', header: t('col.status'), width: 14, value: (r) => statusLabel(lang, 'booking', r.bookingstatus) },
    ],
  });

  const invoices = addDataSheet(wb, {
    name: names.invoices, t, tableName: 'tblPeriodInvoices',
    title: t('period.invoiceList'), subtitle, emptyText: t('period.noInvoices'),
    rows: data.invoiceList,
    columns: [
      { key: 'id', header: t('reports.colInvoice'), width: 12, value: (r) => num(r.invoiceid), align: 'center' },
      { key: 'date', header: t('period.colDate'), width: 14, value: (r) => xlDate(r.invoicedate), numFmt: DATE_FMT, align: 'center' },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'total', header: t('xlsx.colInvoiceTotal'), width: 18, value: (r) => num(r.totalamount), total: 'sum', numFmt: MONEY },
      { key: 'paid', header: t('xlsx.colPaid'), width: 18, value: (r) => num(r.amountpaid), total: 'sum', numFmt: MONEY },
      { key: 'bal', header: t('reports.colBalance'), width: 18, value: (r) => num(r.balance), total: 'sum', numFmt: MONEY, cf: moneyBar('F4B6B6') },
      { key: 'st', header: t('col.status'), width: 16, value: (r) => statusLabel(lang, 'invoice', r.invoicestatus) },
    ],
  });

  const payments = addDataSheet(wb, {
    name: names.payments, t, tableName: 'tblPeriodPayments',
    title: t('period.paymentList'), subtitle, emptyText: t('period.noPayments'),
    rows: data.paymentList,
    columns: [
      { key: 'date', header: t('period.colDate'), width: 18, value: (r) => xlDate(r.paymentdate), numFmt: 'dd/mm/yyyy hh:mm', align: 'center' },
      { key: 'ag', header: t('reports.colAgreement'), width: 12, value: (r) => num(r.agreementid), align: 'center' },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'type', header: t('period.colType'), width: 16, value: (r) => statusLabel(lang, 'paymenttype', r.paymenttype) },
      { key: 'meth', header: t('period.colMethod'), width: 12, value: (r) => r.paymentmethod },
      { key: 'amt', header: t('period.colAmount'), width: 18, value: (r) => num(r.amount), total: 'sum', numFmt: MONEY },
    ],
  });

  addDataSheet(wb, {
    name: names.returns, t, tableName: 'tblPeriodReturns',
    title: t('period.returnList'), subtitle, emptyText: t('period.noReturns'),
    rows: data.returnList,
    columns: [
      { key: 'ag', header: t('reports.colAgreement'), width: 12, value: (r) => num(r.agreementid), align: 'center' },
      { key: 'veh', header: t('reports.colVehicle'), width: 14, value: (r) => r.registrationnumber },
      { key: 'cust', header: t('col.customer'), width: 28, value: (r) => r.customername },
      { key: 'due', header: t('reports.colReturnDue'), width: 14, value: (r) => xlDate(r.returndateexpected), numFmt: DATE_FMT, align: 'center' },
      { key: 'ret', header: t('period.colReturned'), width: 14, value: (r) => xlDate(r.actualreturndate), numFmt: DATE_FMT, align: 'center' },
      { key: 'km', header: t('period.colDistance'), width: 14, value: (r) => (r.distance == null ? null : num(r.distance)), numFmt: '#,##0 "km"', total: 'sum' },
      { key: 'late', header: t('xlsx.colDaysOverdue'), width: 14, value: (r) => num(r.dayslate), align: 'center',
        cf: { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: argb(C.red), bold: true } } } },
    ],
  });

  // ---------------- Dashboard ----------------
  const hasTrend = Boolean(trend);
  const chartTop = 10;
  const rowsAfterTrend = hasTrend ? 17 : 0;
  const lastRow = chartTop + rowsAfterTrend + 34 + 4;

  dash.getColumn(1).width = 2;
  for (let c = 2; c <= 13; c++) dash.getColumn(c).width = 13.5;
  dash.getColumn(14).width = 2;
  for (let r = 1; r <= lastRow; r++) for (let c = 1; c <= 14; c++) dash.getCell(r, c).fill = solid(C.bg);

  dash.mergeCells('B1:M2');
  const banner = dash.getCell('B1');
  banner.value = t(`period.xlsxTitle.${period.type}`);
  banner.font = { name: 'Segoe UI', size: 20, bold: true, color: argb('FFFFFF') };
  banner.fill = solid(C.navy);
  banner.alignment = { vertical: 'middle', indent: 1 };
  dash.getRow(1).height = 24; dash.getRow(2).height = 24;
  dash.mergeCells('B3:M3');
  const sub = dash.getCell('B3');
  sub.value = subtitle;
  sub.font = { name: 'Segoe UI', size: 9, color: argb('FFFFFF') };
  sub.fill = solid(C.navyDark);
  sub.alignment = { vertical: 'middle', indent: 1 };
  dash.getRow(3).height = 18;
  dash.getRow(4).height = 10;
  dash.getRow(5).height = 18; dash.getRow(6).height = 34; dash.getRow(7).height = 18;

  kpiCard(dash, 2, {
    label: t('period.kpiBookings'), color: C.blue, numFmt: '0',
    formula: `COUNT(${bookings.range('ref')})`, value: s.bookings,
    caption: t('period.kpiCancelled', { n: s.cancelled }),
  });
  kpiCard(dash, 4, {
    label: t('period.kpiRentals'), color: C.teal, numFmt: '0', value: s.rentals,
    caption: t('period.kpiReturns', { n: s.returns, late: s.latereturns }),
  });
  kpiCard(dash, 6, {
    label: t('period.kpiUtilization'), color: C.orange, numFmt: '0.0%', value: s.utilization ?? 0,
    caption: t('period.kpiRentedDays', { n: s.renteddays }),
  });
  kpiCard(dash, 8, {
    label: t('period.kpiInvoiced'), color: C.navy, numFmt: MONEY0,
    formula: `SUM(${invoices.range('total')})`, value: num(s.invoiced),
    caption: t('xlsx.kpiInvoices', { n: s.invoices }),
  });
  kpiCard(dash, 10, {
    label: t('period.kpiReceived'), color: C.green, numFmt: MONEY0,
    formula: `SUM(${payments.range('amt')})`, value: num(s.received),
    caption: t('period.kpiReceivedHint', {
      deposits: `N$ ${num(s.deposits).toLocaleString(locale, { maximumFractionDigits: 0 })}`,
    }),
  });
  kpiCard(dash, 12, {
    label: t('period.kpiOutstanding'), color: C.red, numFmt: MONEY0,
    formula: `SUM(${invoices.range('bal')})`, value: num(s.outstanding),
    caption: t('period.kpiOutstandingHint'),
  });

  sectionTitle(dash, 9, 2, 13, t('xlsx.sectionCharts'));

  const links = [names.trend, names.revenue, names.util, names.byCat, names.branches, names.bookings, names.invoices, names.payments, names.returns]
    .filter((n) => n !== names.trend || hasTrend);
  links.forEach((n, i) => {
    const cell = dash.getCell(lastRow - 1 + Math.floor(i / 6), 2 + (i % 6) * 2);
    cell.value = { text: `→ ${n}`, hyperlink: `#${q(n)}!A1` };
    cell.font = { name: 'Segoe UI', size: 9, underline: true, color: argb(C.blue) };
  });

  // ---------------- Charts ----------------
  const labels = (rows, k) => rows.map((r) => String(r[k] ?? ''));
  const charts = [];
  const r0 = chartTop + rowsAfterTrend; // first row of the 2x2 chart grid
  if (hasTrend) {
    charts.push({
      type: 'bar', anchor: [1, chartTop, 13, chartTop + 16], dir: 'col', labels: false, gapWidth: 40,
      title: t(period.bucket === 'month' ? 'period.trendMonthly' : 'period.trendDaily'), numFmt: MONEY0,
      categories: { ref: trend.range('label'), values: data.trend.map((r) => bucketLabel(r.bucket)) },
      series: [
        { name: t('period.kpiInvoiced'), ref: trend.range('inv'), values: data.trend.map((r) => num(r.invoiced)), color: SERIES_HEX.orange },
        { name: t('period.kpiReceived'), ref: trend.range('rec'), values: data.trend.map((r) => num(r.received)), color: SERIES_HEX.blue },
      ],
    });
  }
  charts.push({
    type: 'bar', anchor: [1, r0, 7, r0 + 16], dir: 'col', grouping: 'stacked', gapWidth: 150,
    title: t('reports.revenueByCategory'), numFmt: MONEY0, labelFmt: '#,##0;-#,##0;;',
    categories: { ref: revenue.range('cat'), values: labels(data.revenue, 'categoryname') },
    series: [
      { name: t('reports.colCollected'), ref: revenue.range('col'), values: data.revenue.map((r) => num(r.collected)), color: SERIES_HEX.blue, labelColor: ON(SERIES_HEX.blue) },
      { name: t('reports.colOutstanding'), ref: revenue.range('out'), values: data.revenue.map((r) => num(r.outstanding)), color: SERIES_HEX.orange, labelColor: ON(SERIES_HEX.orange) },
    ],
  });
  charts.push({
    type: 'bar', anchor: [7, r0, 13, r0 + 16], dir: 'col', legend: false, gapWidth: 250, majorUnit: countStep(data.bookingsByCategory, 'bookings'),
    title: t('reports.bookingsByCategory'), numFmt: '0',
    categories: { ref: byCat.range('cat'), values: labels(data.bookingsByCategory, 'categoryname') },
    series: [{ name: t('period.kpiBookings'), ref: byCat.range('n'), values: data.bookingsByCategory.map((r) => num(r.bookings)), color: SERIES_HEX.blue }],
  });
  charts.push({
    type: 'bar', anchor: [1, r0 + 17, 7, r0 + 33], dir: 'bar', legend: false, max: 1, gapWidth: 120,
    title: t('period.utilizationByCategory'), numFmt: '0%',
    categories: { ref: util.range('cat'), values: labels(data.utilization, 'categoryname') },
    series: [{ name: t('reports.colUtilization'), ref: util.range('util'), values: data.utilization.map((r) => r.utilization ?? 0), color: SERIES_HEX.blue }],
  });
  charts.push({
    type: 'bar', anchor: [7, r0 + 17, 13, r0 + 33], dir: 'bar', legend: false, gapWidth: 120,
    title: t('period.byBranch'), numFmt: MONEY0,
    categories: { ref: branches.range('br'), values: labels(data.branches, 'branchname') },
    series: [{ name: t('period.kpiInvoiced'), ref: branches.range('inv'), values: data.branches.map((r) => num(r.invoiced)), color: SERIES_HEX.blue }],
  });

  const buffer = await wb.xlsx.writeBuffer();
  return addCharts(Buffer.from(buffer), names.dash, charts);
}

module.exports = { buildExcelReport, buildPeriodExcelReport };
