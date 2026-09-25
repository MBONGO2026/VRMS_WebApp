// Chart colors shared by the web page, the Excel and the PDF exports, so a
// series keeps the same color everywhere. Series colors come from a validated
// categorical palette (checked for lightness band, chroma, colorblind
// separation and contrast on a white chart surface). The brand navy/orange stay
// in the page chrome only: the navy is too dark and too gray to identify a series.
//
//   blue ↔ orange: colorblind ΔE 24.7 (target >= 8)  — the old green ↔ red pair
//   measured ΔE 2.1, i.e. identical for deuteranopes.
//   blue, orange, aqua (all pairs): worst ΔE 9.2; aqua is 2.8:1 on white, so any
//   chart using it must also show its values as text (labels or a table).

const SERIES = {
  blue: '#2A78D6', // slot 1: single-series charts, and the first of two series
  orange: '#EB6834', // slot 2
  aqua: '#1BAF7A', // slot 3
};

// Lighter step of the slot-1 ramp: the unfilled track of a meter.
const TRACK = '#CDE2FB';

// Chart ink: text never takes a series color.
const INK = {
  primary: '#22283A',
  secondary: '#52514E',
  muted: '#6B7280',
  grid: '#E1E0D9',
  axis: '#C3C2B7',
};

// Label color readable on top of each series fill (WCAG contrast measured).
const ON_SERIES = {
  [SERIES.blue]: '#FFFFFF', // 4.4:1
  [SERIES.orange]: '#0B0B0B', // 6.2:1
  [SERIES.aqua]: '#0B0B0B',
};

module.exports = { SERIES, TRACK, INK, ON_SERIES };
