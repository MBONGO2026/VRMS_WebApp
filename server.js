require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const { translate, statusLabel, SUPPORTED } = require('./i18n');

const dashboardRoutes = require('./routes/dashboard');
const customerRoutes = require('./routes/customers');
const vehicleRoutes = require('./routes/vehicles');
const bookingRoutes = require('./routes/bookings');
const agreementRoutes = require('./routes/agreements');
const reportRoutes = require('./routes/reports');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Bilingual (FR/EN) support ---------------------------------------------
// No cookie-parser dependency needed: we only ever read our own single cookie,
// so a tiny manual parse is enough.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return null;
}

app.use((req, res, next) => {
  // Make the current path available to every view (used to highlight the active nav link)
  res.locals.currentPath = req.path;
  res.locals.flash = req.query.flash || null;
  res.locals.flashType = req.query.flashType || 'success';

  // Language: ?lang=en|fr overrides and is remembered in a cookie; otherwise
  // fall back to the cookie, then default to French.
  let lang = req.query.lang || readCookie(req, 'vrms_lang') || 'fr';
  if (!SUPPORTED.includes(lang)) lang = 'fr';
  if (req.query.lang) {
    res.cookie('vrms_lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  }

  const t = (key, vars) => translate(lang, key, vars);
  req.lang = lang;
  req.t = t;
  res.locals.lang = lang;
  res.locals.t = t;
  res.locals.statusLabel = (group, value) => statusLabel(lang, group, value);
  res.locals.dateLocale = lang === 'en' ? 'en-US' : 'fr-FR';
  // Language links keep the rest of the query string (e.g. the selected report period).
  res.locals.langHref = (target) => {
    const params = new URLSearchParams(req.query);
    params.delete('flash'); params.delete('flashType');
    params.set('lang', target);
    return '?' + params.toString();
  };

  next();
});

app.use('/', dashboardRoutes);
app.use('/customers', customerRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/agreements', agreementRoutes);
app.use('/reports', reportRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: req.t('404.title') });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: req.t('error.title'),
    message: err.message || req.t('error.default'),
    detail: err.detail || null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VRMS web app running: http://localhost:${PORT}`);
});
