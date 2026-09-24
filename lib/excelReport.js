// Builds the "Business Intelligence" Excel report: a dashboard sheet with KPI
// cards and native charts, followed by one formatted, filterable Excel table per
// report. KPI cells are live formulas pointing at the data sheets, so editing
// or filtering the data in Excel keeps the dashboard consistent.
const ExcelJS = require('exceljs');
const { addCharts } = require('./xlsxCharts');

const C = {
  navy: '1F3864', navyDark: '16294A', orange: 'C55A11', bg: 'F4F6F9',
  border: 'D9DEE7', text: '22283A', muted: '6B7280', green: '1E7E34', red: 'B02A2A', amber: 'B8860B',
  blue: '2E75B6', teal: '17A2B8',
};
const MONEY = '"N$" #,##0.00';
const MONEY0 = '"N$" #,##0';
const argb = (hex) => ({ argb: 'FF' + hex });
const solid = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: argb(hex) });
const num = (v) => Number(v) || 0;
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const q = (name) => `'${name.replace(/'/g, "''")}'`;

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
  lab.value = label.toUpperCase();
  lab.font = { name: 'Segoe UI', size: 8, bold: true, color: argb(C.muted) };
  lab.alignment = { vertical: 'bottom', indent: 1 };

  const val = ws.getCell(top + 1, col);
  val.value = formula ? { formula, result: value } : value;
  val.numFmt = numFmt || 'General';
  val.font = { name: 'Segoe UI', size: 20, bold: true, color: argb(color) };
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
        left: c === col ? { style: 'thick', color: argb(color) } : undefined,
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
      { key: 'due', header: t('reports.colReturnDue'), width: 16, value: (r) => (r.returndateexpected ? new Date(r.returndateexpected) : null), numFmt: 'dd/mm/yyyy', align: 'center' },
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
    caption: t('xlsx.kpiCollectionRate', { pct: (totRevenue ? (totCollected / totRevenue) * 100 : 0).toFixed(1) }),
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
    [t('reports.colRented'), `SUM(${fleet.range('rented')})`, fleetRented, C.orange],
    [t('reports.colAvailable'), `SUM(${fleet.range('avail')})`, fleetAvail, C.green],
    [t('reports.colMaintenance'), `SUM(${fleet.range('maint')})`, fleetMaint, C.muted],
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
      type: 'bar', anchor: [1, 10, 7, 26], dir: 'col', grouping: 'stacked',
      title: t('reports.revenueByCategory'), numFmt: MONEY0, labelFmt: '#,##0;-#,##0;;',
      categories: { ref: revenue.range('cat'), values: labels(data.revenue, 'categoryname') },
      series: [
        { name: t('reports.colCollected'), ref: revenue.range('col'), values: data.revenue.map((r) => num(r.totalcollected)), color: C.green },
        { name: t('reports.colOutstanding'), ref: revenue.range('out'), values: data.revenue.map((r) => num(r.totaloutstanding)), color: C.red },
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
      title: t('xlsx.chartUtilization'), numFmt: '0%', gapWidth: 50,
      categories: { ref: fleet.range('cat'), values: labels(data.fleet, 'categoryname') },
      series: [{ name: t('reports.colUtilization'), ref: fleet.range('util'), values: data.fleet.map((r) => num(r.utilizationpercent) / 100), color: C.orange }],
    });
  }
  if (data.byCategory.length) {
    charts.push({
      type: 'bar', anchor: [7, 27, 13, 43], dir: 'col', legend: false,
      title: t('reports.bookingsByCategory'), numFmt: '0', gapWidth: 50,
      categories: { ref: byCat.range('cat'), values: labels(data.byCategory, 'categoryname') },
      series: [{ name: t('reports.colTotalBookings'), ref: byCat.range('n'), values: data.byCategory.map((r) => num(r.totalbookings)), color: C.navy }],
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return addCharts(Buffer.from(buffer), names.dash, charts);
}

module.exports = { buildExcelReport };
