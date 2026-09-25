// PDF versions of the reports (overview and daily / monthly / annual / custom
// periods), drawn with PDFKit so no headless browser is needed. The layout
// mirrors the Excel dashboards: banner, KPI cards, charts, then detail tables
// that continue across pages with their header repeated.
const PDFDocument = require('pdfkit');
const { statusLabel } = require('../i18n');

const C = {
  navy: '#1F3864', navyDark: '#16294A', orange: '#C55A11', bg: '#F4F6F9', border: '#D9DEE7',
  text: '#22283A', muted: '#6B7280', green: '#1E7E34', red: '#B02A2A', blue: '#2E75B6', teal: '#17A2B8',
  zebra: '#F4F6FA', grid: '#E6EAF0',
};
const MARGIN = 40;
const num = (v) => Number(v) || 0;
// The standard PDF fonts only cover WinAnsi: swap the few characters Intl or
// our labels produce that fall outside it.
const clean = (s) => String(s ?? '')
  .replace(/[  ]/g, ' ')
  .replace(/→/g, '->')
  .replace(/[⬇]/g, '');

function createLayout(doc) {
  const W = doc.page.width;
  const H = doc.page.height;
  const L = {
    doc, x: MARGIN, w: W - MARGIN * 2, y: MARGIN, bottom: H - MARGIN - 18,
    ensure(h) { if (L.y + h > L.bottom) L.newPage(); },
    newPage() { doc.addPage(); L.y = MARGIN; },
    text(s, x, y, opts = {}) {
      const { font = 'Helvetica', size = 9, color = C.text, ...rest } = opts;
      doc.font(font).fontSize(size).fillColor(color).text(clean(s), x, y, { lineBreak: false, ...rest });
    },
    // Truncates with an ellipsis so a cell never wraps or overflows its column.
    fit(s, width, font, size) {
      let str = clean(s);
      doc.font(font).fontSize(size);
      if (doc.widthOfString(str) <= width) return str;
      while (str.length > 1 && doc.widthOfString(`${str}...`) > width) str = str.slice(0, -1);
      return `${str}...`;
    },
  };
  return L;
}

function banner(L, title, subtitle) {
  const { doc } = L;
  doc.rect(0, 0, doc.page.width, 64).fill(C.navy);
  doc.rect(0, 64, doc.page.width, 20).fill(C.navyDark);
  L.text(title, MARGIN, 22, { font: 'Helvetica-Bold', size: 17, color: '#FFFFFF', width: L.w, ellipsis: true });
  L.text(subtitle, MARGIN, 70, { size: 8, color: '#FFFFFF', width: L.w, ellipsis: true });
  L.y = 100;
}

function sectionTitle(L, title) {
  L.ensure(40);
  L.y += 6;
  L.text(title, L.x, L.y, { font: 'Helvetica-Bold', size: 11.5, color: C.navy });
  L.doc.moveTo(L.x, L.y + 16).lineTo(L.x + L.w, L.y + 16).lineWidth(1.2).strokeColor(C.orange).stroke();
  L.y += 26;
}

function kpiCards(L, cards) {
  const gap = 8; const perRow = 3; const h = 58;
  const cw = (L.w - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < cards.length; i += perRow) {
    L.ensure(h + gap);
    cards.slice(i, i + perRow).forEach((c, j) => {
      const x = L.x + j * (cw + gap);
      L.doc.rect(x, L.y, cw, h).fillAndStroke('#FFFFFF', C.border);
      L.doc.rect(x, L.y, 3.5, h).fill(c.color);
      L.text(c.label.toUpperCase(), x + 12, L.y + 9, { font: 'Helvetica-Bold', size: 7, color: C.muted, width: cw - 18, ellipsis: true });
      L.text(c.value, x + 12, L.y + 20, { font: 'Helvetica-Bold', size: 16, color: c.color, width: cw - 18, ellipsis: true });
      L.text(c.caption || '', x + 12, L.y + 41, { size: 7, color: C.muted, width: cw - 18, ellipsis: true });
    });
    L.y += h + gap;
  }
  L.y += 4;
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

function chartFrame(L, x, y, w, h, title, series) {
  L.doc.rect(x, y, w, h).fillAndStroke('#FFFFFF', C.border);
  L.text(title, x, y + 9, { font: 'Helvetica-Bold', size: 9.5, color: C.navy, width: w, align: 'center' });
  if (series.length > 1) {
    let lx = x + 12;
    series.forEach((s) => {
      L.doc.rect(lx, y + 25, 7, 7).fill(s.color);
      L.text(s.name, lx + 10, y + 25, { size: 7, color: C.muted });
      lx += 18 + L.doc.widthOfString(clean(s.name));
    });
    return y + 38;
  }
  return y + 28;
}

// Vertical column chart: grouped (side by side) or stacked series.
function columnChart(L, x, y, w, h, { title, categories, series, stacked = false, fmt = (v) => v, integer = false }) {
  const { doc } = L;
  const plotTop = chartFrame(L, x, y, w, h, title, series);
  const axisW = 46; const bottomPad = 20;
  const px = x + axisW; const pw = w - axisW - 10;
  const py = plotTop + 6; const ph = y + h - bottomPad - py;
  const totals = categories.map((_, i) => (stacked
    ? series.reduce((a, s) => a + num(s.values[i]), 0)
    : Math.max(0, ...series.map((s) => num(s.values[i])))));
  const steps = 4;
  const top = Math.max(0, ...totals);
  // Counts get whole-number gridlines (a multiple of the step count).
  const max = integer || top === 0 ? Math.max(steps, Math.ceil(top / steps) * steps) : niceMax(top);
  for (let k = 0; k <= steps; k++) {
    const gy = py + ph - (ph * k) / steps;
    doc.moveTo(px, gy).lineTo(px + pw, gy).lineWidth(0.5).strokeColor(k === 0 ? '#BFC7D5' : C.grid).stroke();
    L.text(fmt((max * k) / steps), x + 4, gy - 3.5, { size: 6.5, color: C.muted, width: axisW - 8, align: 'right' });
  }
  const n = categories.length || 1;
  const gw = pw / n;
  const showValues = n <= 12;
  const labelEvery = Math.ceil(n / 16);
  categories.forEach((cat, i) => {
    const gx = px + i * gw;
    if (stacked) {
      const bw = Math.min(gw * 0.55, 34);
      let base = py + ph;
      series.forEach((s) => {
        const bh = (num(s.values[i]) / max) * ph;
        if (bh > 0) doc.rect(gx + (gw - bw) / 2, base - bh, bw, bh).fill(s.color);
        base -= bh;
      });
      if (showValues && totals[i] > 0) L.text(fmt(totals[i]), gx, base - 10, { size: 6.5, color: C.text, width: gw, align: 'center' });
    } else {
      const bw = Math.min((gw * 0.7) / series.length, 26);
      const start = gx + (gw - bw * series.length) / 2;
      series.forEach((s, j) => {
        const v = num(s.values[i]);
        const bh = (v / max) * ph;
        if (bh > 0) doc.rect(start + j * bw, py + ph - bh, bw - 1, bh).fill(s.color);
        if (showValues && series.length === 1) L.text(fmt(v), start + j * bw - 10, py + ph - bh - 10, { size: 6.5, color: C.text, width: bw + 20, align: 'center' });
      });
    }
    if (i % labelEvery === 0) {
      L.text(L.fit(cat, gw * labelEvery - 2, 'Helvetica', 6.5), gx, py + ph + 5, { size: 6.5, color: C.muted, width: gw * labelEvery, align: labelEvery > 1 ? 'left' : 'center' });
    }
  });
}

// Horizontal bars for ratios between 0 and 1 (utilization).
function ratioChart(L, x, y, w, h, { title, categories, values, color }) {
  const { doc } = L;
  const top = chartFrame(L, x, y, w, h, title, [{}]);
  const labelW = 70; const px = x + labelW; const pw = w - labelW - 44;
  const n = categories.length || 1;
  const rowH = Math.min(22, (y + h - 10 - top) / n);
  categories.forEach((cat, i) => {
    const ry = top + i * rowH;
    const v = Math.max(0, Math.min(1, num(values[i])));
    L.text(L.fit(cat, labelW - 8, 'Helvetica', 7.5), x + 6, ry + rowH / 2 - 4, { size: 7.5, width: labelW - 10, align: 'right' });
    doc.rect(px, ry + rowH * 0.2, pw, rowH * 0.6).fill(C.zebra);
    if (v > 0) doc.rect(px, ry + rowH * 0.2, pw * v, rowH * 0.6).fill(color);
    L.text(`${(num(values[i]) * 100).toFixed(1)}%`, px + pw + 5, ry + rowH / 2 - 4, { font: 'Helvetica-Bold', size: 7.5 });
  });
}

// Two charts side by side, or one full-width chart.
function chartRow(L, draws, h = 190) {
  L.ensure(h + 10);
  const gap = 10;
  const cw = (L.w - gap * (draws.length - 1)) / draws.length;
  draws.forEach((draw, i) => draw(L.x + i * (cw + gap), L.y, cw, h));
  L.y += h + 12;
}

function table(L, { title, columns, rows, emptyText, totals }) {
  const { doc } = L;
  const size = 7.5; const rowH = 16; const headH = 20;
  const totalWeight = columns.reduce((a, c) => a + (c.width || 1), 0);
  const cols = columns.map((c) => ({ ...c, w: ((c.width || 1) / totalWeight) * L.w }));
  if (title) sectionTitle(L, title);
  if (!rows.length) {
    L.ensure(24);
    L.text(emptyText, L.x, L.y + 2, { font: 'Helvetica-Oblique', size: 8.5, color: C.muted });
    L.y += 24;
    return;
  }
  const header = () => {
    doc.rect(L.x, L.y, L.w, headH).fill(C.navy);
    let cx = L.x;
    cols.forEach((c) => {
      L.text(L.fit(c.header.toUpperCase(), c.w - 10, 'Helvetica-Bold', 6.8), cx + 5, L.y + 7, { font: 'Helvetica-Bold', size: 6.8, color: '#FFFFFF', width: c.w - 10, align: c.align || 'left' });
      cx += c.w;
    });
    L.y += headH;
  };
  const line = (cells, { bold = false, fill = null } = {}) => {
    if (fill) doc.rect(L.x, L.y, L.w, rowH).fill(fill);
    let cx = L.x;
    cols.forEach((c, i) => {
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      const cell = cells[i];
      const color = (cell && cell.color) || C.text;
      const str = cell && typeof cell === 'object' ? cell.text : cell;
      L.text(L.fit(str, c.w - 10, font, size), cx + 5, L.y + 5, { font, size, color, width: c.w - 10, align: c.align || 'left' });
      cx += c.w;
    });
    doc.moveTo(L.x, L.y + rowH).lineTo(L.x + L.w, L.y + rowH).lineWidth(0.4).strokeColor(C.border).stroke();
    L.y += rowH;
  };
  L.ensure(headH + rowH * 2);
  header();
  rows.forEach((r, i) => {
    if (L.y + rowH > L.bottom) { L.newPage(); header(); }
    line(cols.map((c) => c.value(r)), { fill: i % 2 ? C.zebra : null });
  });
  if (totals) {
    if (L.y + rowH > L.bottom) { L.newPage(); header(); }
    line(totals, { bold: true, fill: '#E5EAF3' });
  }
  L.y += 12;
}

function pageFooters(doc, left, pageLabel) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN + 8;
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not open a new page
    doc.moveTo(MARGIN, y - 6).lineTo(doc.page.width - MARGIN, y - 6).lineWidth(0.4).strokeColor(C.border).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(C.muted)
      .text(clean(left), MARGIN, y, { lineBreak: false, width: doc.page.width - MARGIN * 2 - 80 })
      .text(clean(pageLabel(i + 1, range.count)), doc.page.width - MARGIN - 80, y, { lineBreak: false, width: 80, align: 'right' });
    doc.page.margins.bottom = saved;
  }
}

function render(title, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: clean(title), Author: 'SwiftDrive VRMS' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc, createLayout(doc));
      doc.end();
    } catch (err) { reject(err); }
  });
}

function formatters(lang) {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  return {
    locale,
    money: (v) => `N$ ${num(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    money0: (v) => `N$ ${Math.round(num(v)).toLocaleString(locale)}`,
    short: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k` : Math.round(v).toLocaleString(locale)),
    date: (v) => (v ? new Date(v).toLocaleDateString(locale) : ''),
    pct: (v) => (v == null ? '-' : `${(num(v) * 100).toFixed(1)}%`),
  };
}

// ---------------- Overview (current snapshot) ----------------
function buildOverviewPdf(data, { t, lang, generatedAt = new Date() }) {
  const f = formatters(lang);
  const stamp = t('xlsx.generatedAt', { date: generatedAt.toLocaleString(f.locale, { dateStyle: 'full', timeStyle: 'short' }) });
  const sum = (rows, k) => rows.reduce((a, r) => a + num(r[k]), 0);
  const title = t('xlsx.dashboardTitle');

  return render(title, (doc, L) => {
    banner(L, title, `${t('xlsx.dashboardSubtitle')}  •  ${stamp}`);
    const revenue = sum(data.revenue, 'totalrevenue');
    const collected = sum(data.revenue, 'totalcollected');
    const fleetTotal = sum(data.fleet, 'totalvehicles');
    const fleetRented = sum(data.fleet, 'vehiclesrented');
    kpiCards(L, [
      { label: t('reports.colTotalRevenue'), value: f.money0(revenue), caption: t('xlsx.kpiInvoices', { n: sum(data.revenue, 'invoicesissued') }), color: C.navy },
      { label: t('reports.colCollected'), value: f.money0(collected), caption: t('xlsx.kpiCollectionRate', { pct: (revenue ? (collected / revenue) * 100 : 0).toFixed(1) }), color: C.green },
      { label: t('reports.colOutstanding'), value: f.money0(sum(data.revenue, 'totaloutstanding')), caption: t('xlsx.kpiOpenInvoices', { n: data.outstanding.length }), color: C.red },
      { label: t('reports.colUtilization'), value: f.pct(fleetTotal ? fleetRented / fleetTotal : 0), caption: t('xlsx.kpiFleet', { rented: fleetRented, total: fleetTotal }), color: C.orange },
      { label: t('dashboard.statOverdue'), value: String(data.overdue.length), caption: data.overdue.length ? t('xlsx.kpiMaxOverdue', { n: Math.max(...data.overdue.map((o) => num(o.daysoverdue))) }) : t('reports.noOverdue'), color: data.overdue.length ? C.red : C.green },
      { label: t('dashboard.statToday'), value: String(data.today.length), caption: t('xlsx.kpiTotalBookings', { n: sum(data.byCategory, 'totalbookings') }), color: C.blue },
    ]);

    sectionTitle(L, t('xlsx.sectionCharts'));
    chartRow(L, [
      (x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t('reports.revenueByCategory'), stacked: true, fmt: f.short,
        categories: data.revenue.map((r) => r.categoryname),
        series: [
          { name: t('reports.colCollected'), values: data.revenue.map((r) => r.totalcollected), color: C.green },
          { name: t('reports.colOutstanding'), values: data.revenue.map((r) => r.totaloutstanding), color: C.red },
        ],
      }),
      (x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t('reports.bookingsByCategory'), integer: true, fmt: (v) => Math.round(v),
        categories: data.byCategory.map((r) => r.categoryname),
        series: [{ name: t('reports.colTotalBookings'), values: data.byCategory.map((r) => r.totalbookings), color: C.navy }],
      }),
    ]);
    chartRow(L, [
      (x, y, w, h) => ratioChart(L, x, y, w, h, {
        title: t('xlsx.chartUtilization'), color: C.orange,
        categories: data.fleet.map((r) => r.categoryname), values: data.fleet.map((r) => num(r.utilizationpercent) / 100),
      }),
    ], 150);

    table(L, {
      title: t('reports.fleetUtilization'), emptyText: t('xlsx.noData'), rows: data.fleet,
      columns: [
        { header: t('col.category'), width: 2, value: (r) => r.categoryname },
        { header: t('reports.colTotal'), align: 'center', value: (r) => r.totalvehicles },
        { header: t('reports.colRented'), align: 'center', value: (r) => r.vehiclesrented },
        { header: t('reports.colAvailable'), align: 'center', value: (r) => r.vehiclesavailable },
        { header: t('reports.colMaintenance'), align: 'center', value: (r) => r.vehiclesinmaintenance },
        { header: t('reports.colUtilization'), align: 'right', value: (r) => `${r.utilizationpercent ?? 0}%` },
      ],
    });
    table(L, {
      title: t('reports.revenueByCategory'), emptyText: t('xlsx.noData'), rows: data.revenue,
      columns: [
        { header: t('col.category'), width: 1.6, value: (r) => r.categoryname },
        { header: t('reports.colInvoices'), align: 'center', value: (r) => r.invoicesissued },
        { header: t('reports.colTotalRevenue'), width: 1.5, align: 'right', value: (r) => f.money(r.totalrevenue) },
        { header: t('reports.colCollected'), width: 1.5, align: 'right', value: (r) => f.money(r.totalcollected) },
        { header: t('reports.colOutstanding'), width: 1.5, align: 'right', value: (r) => f.money(r.totaloutstanding) },
      ],
      totals: [t('xlsx.total'), String(sum(data.revenue, 'invoicesissued')), f.money(revenue), f.money(collected), f.money(sum(data.revenue, 'totaloutstanding'))],
    });
    table(L, {
      title: t('reports.overdueReturns'), emptyText: t('reports.noOverdue'), rows: data.overdue,
      columns: [
        { header: t('reports.colAgreement'), value: (r) => `#${r.agreementid}` },
        { header: t('reports.colVehicle'), value: (r) => r.registrationnumber },
        { header: t('col.customer'), width: 2.5, value: (r) => r.customername },
        { header: t('reports.colReturnDue'), width: 1.3, value: (r) => f.date(r.returndateexpected) },
        { header: t('xlsx.colDaysOverdue'), align: 'right', value: (r) => ({ text: t('reports.overdueDays', { n: r.daysoverdue }), color: C.red }) },
      ],
    });
    table(L, {
      title: t('reports.todaysBookings'), emptyText: t('reports.noToday'), rows: data.today,
      columns: [
        { header: t('col.ref'), value: (r) => `#${r.bookingid}` },
        { header: t('col.customer'), width: 2.5, value: (r) => r.customername },
        { header: t('col.category'), width: 1.5, value: (r) => r.categoryname },
        { header: t('col.branch'), width: 2, value: (r) => r.branchname },
      ],
    });
    table(L, {
      title: t('reports.bookingsByCategory'), emptyText: t('xlsx.noData'), rows: data.byCategory,
      columns: [
        { header: t('col.category'), width: 2, value: (r) => r.categoryname },
        { header: t('reports.colTotalBookings'), align: 'right', value: (r) => r.totalbookings },
      ],
      totals: [t('xlsx.total'), String(sum(data.byCategory, 'totalbookings'))],
    });
    table(L, {
      title: t('reports.outstandingBalances'), emptyText: t('reports.noOutstanding'), rows: data.outstanding,
      columns: [
        { header: t('col.customer'), width: 2.5, value: (r) => r.customername },
        { header: t('reports.colInvoice'), value: (r) => `#${r.invoiceid}` },
        { header: t('xlsx.colInvoiceTotal'), width: 1.4, align: 'right', value: (r) => f.money(r.totalamount) },
        { header: t('xlsx.colPaid'), width: 1.4, align: 'right', value: (r) => f.money(r.amountpaid) },
        { header: t('reports.colBalance'), width: 1.4, align: 'right', value: (r) => ({ text: f.money(r.balance), color: C.red }) },
      ],
    });

    pageFooters(doc, `SwiftDrive VRMS  •  ${stamp}`, (n, total) => t('pdf.page', { n, total }));
  });
}

// ---------------- Period report ----------------
function buildPeriodPdf(data, period, { t, lang, generatedAt = new Date() }) {
  const f = formatters(lang);
  const s = data.summary;
  const stamp = t('xlsx.generatedAt', { date: generatedAt.toLocaleString(f.locale, { dateStyle: 'full', timeStyle: 'short' }) });
  const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(f.locale, { timeZone: 'UTC' });
  let rangeText = period.label;
  if (period.type === 'custom') rangeText += `  (${t('period.days', { n: period.days })})`;
  else if (period.from !== period.to) rangeText += `  (${t('period.range', { from: fmtDay(period.from), to: fmtDay(period.to), n: period.days })})`;
  const title = t(`period.xlsxTitle.${period.type}`);
  const sum = (rows, k) => rows.reduce((a, r) => a + num(r[k]), 0);
  const bucketLabel = (d) => {
    const x = new Date(d);
    if (period.bucket === 'month') return x.toLocaleDateString(f.locale, { month: 'short', year: '2-digit' });
    return x.toLocaleDateString(f.locale, period.type === 'monthly' ? { day: 'numeric' } : { day: '2-digit', month: '2-digit' });
  };

  return render(`${title} - ${period.label}`, (doc, L) => {
    banner(L, title, `${rangeText}  •  ${stamp}`);
    kpiCards(L, [
      { label: t('period.kpiBookings'), value: String(s.bookings), caption: t('period.kpiCancelled', { n: s.cancelled }), color: C.blue },
      { label: t('period.kpiRentals'), value: String(s.rentals), caption: t('period.kpiReturns', { n: s.returns, late: s.latereturns }), color: C.teal },
      { label: t('period.kpiUtilization'), value: f.pct(s.utilization), caption: t('period.kpiRentedDays', { n: s.renteddays }), color: C.orange },
      { label: t('period.kpiInvoiced'), value: f.money0(s.invoiced), caption: t('xlsx.kpiInvoices', { n: s.invoices }), color: C.navy },
      { label: t('period.kpiReceived'), value: f.money0(s.received), caption: t('period.kpiReceivedHint', { deposits: f.money0(s.deposits) }), color: C.green },
      { label: t('period.kpiOutstanding'), value: f.money0(s.outstanding), caption: t('period.kpiOutstandingHint'), color: C.red },
    ]);

    sectionTitle(L, t('xlsx.sectionCharts'));
    if (data.trend.length) {
      chartRow(L, [(x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t(period.bucket === 'month' ? 'period.trendMonthly' : 'period.trendDaily'), fmt: f.short,
        categories: data.trend.map((b) => bucketLabel(b.bucket)),
        series: [
          { name: t('period.kpiInvoiced'), values: data.trend.map((b) => b.invoiced), color: C.navy },
          { name: t('period.kpiReceived'), values: data.trend.map((b) => b.received), color: C.green },
        ],
      })], 150);
    }
    chartRow(L, [
      (x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t('reports.revenueByCategory'), stacked: true, fmt: f.short,
        categories: data.revenue.map((r) => r.categoryname),
        series: [
          { name: t('reports.colCollected'), values: data.revenue.map((r) => r.collected), color: C.green },
          { name: t('reports.colOutstanding'), values: data.revenue.map((r) => r.outstanding), color: C.red },
        ],
      }),
      (x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t('reports.bookingsByCategory'), integer: true, fmt: (v) => Math.round(v),
        categories: data.bookingsByCategory.map((r) => r.categoryname),
        series: [{ name: t('period.kpiBookings'), values: data.bookingsByCategory.map((r) => r.bookings), color: C.navy }],
      }),
    ], 170);
    chartRow(L, [
      (x, y, w, h) => ratioChart(L, x, y, w, h, {
        title: t('period.utilizationByCategory'), color: C.orange,
        categories: data.utilization.map((r) => r.categoryname), values: data.utilization.map((r) => r.utilization ?? 0),
      }),
      (x, y, w, h) => columnChart(L, x, y, w, h, {
        title: t('period.byBranch'), fmt: f.short,
        categories: data.branches.map((r) => r.branchname),
        series: [{ name: t('period.kpiInvoiced'), values: data.branches.map((r) => r.invoiced), color: C.blue }],
      }),
    ], 150);

    table(L, {
      title: t('reports.revenueByCategory'), emptyText: t('xlsx.noData'), rows: data.revenue,
      columns: [
        { header: t('col.category'), width: 1.6, value: (r) => r.categoryname },
        { header: t('reports.colInvoices'), align: 'center', value: (r) => r.invoices },
        { header: t('period.kpiInvoiced'), width: 1.5, align: 'right', value: (r) => f.money(r.invoiced) },
        { header: t('reports.colCollected'), width: 1.5, align: 'right', value: (r) => f.money(r.collected) },
        { header: t('reports.colOutstanding'), width: 1.5, align: 'right', value: (r) => f.money(r.outstanding) },
      ],
      totals: [t('xlsx.total'), String(sum(data.revenue, 'invoices')), f.money(sum(data.revenue, 'invoiced')), f.money(sum(data.revenue, 'collected')), f.money(sum(data.revenue, 'outstanding'))],
    });
    table(L, {
      title: t('period.utilizationByCategory'), emptyText: t('xlsx.noData'), rows: data.utilization,
      columns: [
        { header: t('col.category'), width: 2, value: (r) => r.categoryname },
        { header: t('xlsx.colVehicles'), align: 'center', value: (r) => r.vehicles },
        { header: t('period.colRentedDays'), align: 'center', value: (r) => r.renteddays },
        { header: t('reports.colUtilization'), align: 'right', value: (r) => f.pct(r.utilization) },
      ],
    });
    table(L, {
      title: t('period.byBranch'), emptyText: t('xlsx.noData'), rows: data.branches,
      columns: [
        { header: t('col.branch'), width: 2, value: (r) => r.branchname },
        { header: t('period.kpiBookings'), align: 'center', value: (r) => r.bookings },
        { header: t('period.kpiInvoiced'), width: 1.5, align: 'right', value: (r) => f.money(r.invoiced) },
      ],
    });
    table(L, {
      title: t('period.bookingList'), emptyText: t('period.noBookings'), rows: data.bookingList,
      columns: [
        { header: t('col.ref'), width: 0.7, value: (r) => `#${r.bookingid}` },
        { header: t('col.customer'), width: 2.2, value: (r) => r.customername },
        { header: t('col.category'), value: (r) => r.categoryname },
        { header: t('col.branch'), width: 1.8, value: (r) => r.branchname },
        { header: t('col.pickup'), value: (r) => f.date(r.pickupdate) },
        { header: t('col.returnExpected'), value: (r) => f.date(r.returndateexpected) },
        { header: t('col.status'), value: (r) => statusLabel(lang, 'booking', r.bookingstatus) },
      ],
    });
    table(L, {
      title: t('period.invoiceList'), emptyText: t('period.noInvoices'), rows: data.invoiceList,
      columns: [
        { header: t('reports.colInvoice'), value: (r) => `#${r.invoiceid}` },
        { header: t('period.colDate'), value: (r) => f.date(r.invoicedate) },
        { header: t('col.customer'), width: 2.2, value: (r) => r.customername },
        { header: t('xlsx.colInvoiceTotal'), width: 1.3, align: 'right', value: (r) => f.money(r.totalamount) },
        { header: t('xlsx.colPaid'), width: 1.3, align: 'right', value: (r) => f.money(r.amountpaid) },
        { header: t('reports.colBalance'), width: 1.3, align: 'right', value: (r) => ({ text: f.money(r.balance), color: num(r.balance) > 0 ? C.red : C.text }) },
      ],
      totals: [t('xlsx.total'), '', '', f.money(sum(data.invoiceList, 'totalamount')), f.money(sum(data.invoiceList, 'amountpaid')), f.money(sum(data.invoiceList, 'balance'))],
    });
    table(L, {
      title: t('period.paymentList'), emptyText: t('period.noPayments'), rows: data.paymentList,
      columns: [
        { header: t('period.colDate'), value: (r) => f.date(r.paymentdate) },
        { header: t('reports.colAgreement'), width: 0.8, value: (r) => `#${r.agreementid}` },
        { header: t('col.customer'), width: 2.2, value: (r) => r.customername },
        { header: t('period.colType'), value: (r) => statusLabel(lang, 'paymenttype', r.paymenttype) },
        { header: t('period.colMethod'), width: 0.8, value: (r) => r.paymentmethod },
        { header: t('period.colAmount'), width: 1.3, align: 'right', value: (r) => f.money(r.amount) },
      ],
      totals: [t('xlsx.total'), '', '', '', '', f.money(sum(data.paymentList, 'amount'))],
    });
    table(L, {
      title: t('period.returnList'), emptyText: t('period.noReturns'), rows: data.returnList,
      columns: [
        { header: t('reports.colAgreement'), width: 1.1, value: (r) => `#${r.agreementid}` },
        { header: t('reports.colVehicle'), width: 0.9, value: (r) => r.registrationnumber },
        { header: t('col.customer'), width: 2.2, value: (r) => r.customername },
        { header: t('reports.colReturnDue'), value: (r) => f.date(r.returndateexpected) },
        { header: t('period.colReturned'), value: (r) => f.date(r.actualreturndate) },
        { header: t('period.colDistance'), align: 'right', value: (r) => (r.distance == null ? '-' : `${num(r.distance).toLocaleString(f.locale)} km`) },
        { header: t('period.colLate'), align: 'right', value: (r) => (r.dayslate > 0
          ? { text: t('reports.overdueDays', { n: r.dayslate }), color: C.red }
          : { text: t('period.onTime'), color: C.green }) },
      ],
    });

    pageFooters(doc, `SwiftDrive VRMS  •  ${period.label}  •  ${stamp}`, (n, total) => t('pdf.page', { n, total }));
  });
}

module.exports = { buildOverviewPdf, buildPeriodPdf };
