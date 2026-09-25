// Native Excel charts for workbooks produced by ExcelJS.
// ExcelJS cannot create charts, so after it has written the .xlsx we open the
// zip package with JSZip and add the DrawingML chart parts ourselves. The
// charts reference real cell ranges (so they update when the data changes in
// Excel) and also carry cached values so they render immediately.
const JSZip = require('jszip');

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fill = (rgb) => `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill>`;

function richText(text, size, bold, color) {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}">${fill(color)}</a:defRPr></a:pPr>`
    + `<a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}">${fill(color)}</a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function txPr(size, color, rot) {
  const bodyPr = rot ? `<a:bodyPr rot="${rot}" vert="horz"/>` : '<a:bodyPr/>';
  return `<c:txPr>${bodyPr}<a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}">${fill(color)}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
}

function strRef(ref, values) {
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('');
  return `<c:strRef><c:f>${esc(ref)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache></c:strRef>`;
}

function numRef(ref, values, formatCode) {
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('');
  return `<c:numRef><c:f>${esc(ref)}</c:f><c:numCache><c:formatCode>${esc(formatCode || 'General')}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache></c:numRef>`;
}

function dataLabels({ show, numFmt, position, color = '404040', percent = false }) {
  if (!show) return '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
  return '<c:dLbls>'
    + (numFmt ? `<c:numFmt formatCode="${esc(numFmt)}" sourceLinked="0"/>` : '')
    + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>'
    + txPr(900, color)
    + (position ? `<c:dLblPos val="${position}"/>` : '')
    + `<c:showLegendKey val="0"/><c:showVal val="${percent ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${percent ? 1 : 0}"/><c:showBubbleSize val="0"/>`
    + (percent ? '<c:showLeaderLines val="1"/>' : '')
    + '</c:dLbls>';
}

function wrapChartSpace(title, plotArea, legend) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>`
    + '<c:chart>'
    + `<c:title>${richText(title, 1200, true, '4A3223')}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    + plotArea
    + (legend ? `<c:legend><c:legendPos val="${legend}"/><c:overlay val="0"/>${txPr(900, '404040')}</c:legend>` : '')
    + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
    + `<c:spPr>${fill('FFFFFF')}<a:ln w="9525">${fill('E6DDD3')}</a:ln></c:spPr>`
    + `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:latin typeface="Segoe UI"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
    + '</c:chartSpace>';
}

// Column / bar chart. spec: { title, dir: 'col'|'bar', grouping: 'clustered'|'stacked',
//   categories: { ref, values }, series: [{ name, ref, values, color, labelColor }], numFmt, labels, legend, majorUnit }
function barChartXml(spec) {
  const stacked = spec.grouping === 'stacked';
  const sers = spec.series.map((s, i) => '<c:ser>'
    + `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>`
    + `<c:spPr>${fill(s.color)}</c:spPr><c:invertIfNegative val="0"/>`
    + dataLabels({
      show: spec.labels !== false,
      numFmt: spec.labelFmt || spec.numFmt,
      position: stacked ? 'ctr' : 'outEnd',
      // Inside a fill the label color is picked per series for contrast;
      // outside a bar it uses the neutral ink, never the series color.
      color: stacked ? (s.labelColor || 'FFFFFF') : '404040',
    })
    + `<c:cat>${strRef(spec.categories.ref, spec.categories.values)}</c:cat>`
    + `<c:val>${numRef(s.ref, s.values, spec.numFmt)}</c:val>`
    + '</c:ser>').join('');

  const catPos = spec.dir === 'bar' ? 'l' : 'b';
  const valPos = spec.dir === 'bar' ? 'b' : 'l';
  const plot = '<c:plotArea><c:layout/>'
    + `<c:barChart><c:barDir val="${spec.dir || 'col'}"/><c:grouping val="${stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>`
    + sers
    // Stacked segments share one bar; side-by-side series keep a thin gap between them.
    + `<c:gapWidth val="${spec.gapWidth || 60}"/><c:overlap val="${stacked ? 100 : (spec.series.length > 1 ? -8 : 0)}"/>`
    + '<c:axId val="50010001"/><c:axId val="50010002"/></c:barChart>'
    + '<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="' + (spec.dir === 'bar' ? 'maxMin' : 'minMax') + '"/></c:scaling>'
    + `<c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="0"/>`
    + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>'
    + `<c:spPr><a:ln w="9525">${fill('C8BCB0')}</a:ln></c:spPr>${txPr(900, '404040')}`
    + '<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
    + '<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/>'
    + (spec.max != null ? `<c:max val="${spec.max}"/>` : '') + '<c:min val="0"/></c:scaling>'
    + `<c:delete val="0"/><c:axPos val="${valPos}"/>`
    + `<c:majorGridlines><c:spPr><a:ln w="6350">${fill('E9E2DA')}</a:ln></c:spPr></c:majorGridlines>`
    + `<c:numFmt formatCode="${esc(spec.numFmt || 'General')}" sourceLinked="0"/>`
    + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>'
    + `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800, '6B7280')}`
    + '<c:crossAx val="50010001"/><c:crosses val="' + (spec.dir === 'bar' ? 'max' : 'autoZero') + '"/><c:crossBetween val="between"/>'
    + (spec.majorUnit ? `<c:majorUnit val="${spec.majorUnit}"/>` : '') + '</c:valAx>'
    + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>';

  return wrapChartSpace(spec.title, plot, spec.legend === false ? null : (spec.legend || 'b'));
}

// Doughnut chart. spec: { title, categories: { ref, values }, series: { name, ref, values }, colors: [] }
function doughnutChartXml(spec) {
  const s = spec.series;
  const pts = spec.categories.values.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>`
    + `<c:spPr>${fill(spec.colors[i % spec.colors.length])}<a:ln w="19050">${fill('FFFFFF')}</a:ln></c:spPr></c:dPt>`).join('');
  const plot = '<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>'
    + `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${pts}`
    // Dark labels stay readable on every slot of the categorical palette.
    + dataLabels({ show: true, percent: true, color: '0B0B0B', numFmt: '0%' })
    + `<c:cat>${strRef(spec.categories.ref, spec.categories.values)}</c:cat>`
    + `<c:val>${numRef(s.ref, s.values, 'General')}</c:val></c:ser>`
    + '<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>'
    + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>';
  return wrapChartSpace(spec.title, plot, 'r');
}

function anchorXml(chart, i) {
  const [c1, r1, c2, r2] = chart.anchor; // zero-based col/row, exclusive end
  return '<xdr:twoCellAnchor editAs="oneCell">'
    + `<xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
    + `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic>`
    + '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
}

// Resolve "xl/worksheets/sheetN.xml" for a sheet name via workbook.xml + its rels.
async function sheetPath(zip, sheetName) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetRe = /<sheet\b[^>]*>/g;
  let m;
  while ((m = sheetRe.exec(wb))) {
    const name = /name="([^"]*)"/.exec(m[0])[1];
    if (name === esc(sheetName)) {
      const rid = /r:id="([^"]*)"/.exec(m[0])[1];
      const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels)[0];
      const target = /Target="([^"]*)"/.exec(rel)[1].replace(/^\/?xl\//, '');
      return 'xl/' + target;
    }
  }
  throw new Error(`Sheet not found in workbook: ${sheetName}`);
}

// charts: [{ type: 'bar'|'doughnut', anchor: [c1, r1, c2, r2], ...spec }]
async function addCharts(buffer, sheetName, charts) {
  if (!charts.length) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  const sheetFile = await sheetPath(zip, sheetName);
  const sheetBase = sheetFile.split('/').pop();
  const sheetRelsFile = `xl/worksheets/_rels/${sheetBase}.rels`;

  let n = 1;
  while (zip.file(`xl/drawings/drawing${n}.xml`)) n++;
  const drawingName = `drawing${n}.xml`;
  let chartNo = 1;
  while (zip.file(`xl/charts/chart${chartNo}.xml`)) chartNo++;

  let ct = await zip.file('[Content_Types].xml').async('string');
  const drawingRels = [];
  charts.forEach((chart, i) => {
    const file = `chart${chartNo + i}.xml`;
    const xml = chart.type === 'doughnut' ? doughnutChartXml(chart) : barChartXml(chart);
    zip.file(`xl/charts/${file}`, xml);
    drawingRels.push(`<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/${file}"/>`);
    ct = ct.replace('</Types>', `<Override PartName="/xl/charts/${file}" ContentType="${CT_CHART}"/></Types>`);
  });
  ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/${drawingName}" ContentType="${CT_DRAWING}"/></Types>`);
  zip.file('[Content_Types].xml', ct);

  zip.file(`xl/drawings/${drawingName}`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${charts.map(anchorXml).join('')}</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/${drawingName}.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`);

  // Link the drawing from the worksheet.
  const drawingRid = 'rIdVrmsDrawing1';
  const relEntry = `<Relationship Id="${drawingRid}" Type="${REL_DRAWING}" Target="../drawings/${drawingName}"/>`;
  if (zip.file(sheetRelsFile)) {
    const rels = await zip.file(sheetRelsFile).async('string');
    zip.file(sheetRelsFile, rels.replace('</Relationships>', relEntry + '</Relationships>'));
  } else {
    zip.file(sheetRelsFile, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEntry}</Relationships>`);
  }

  let sheetXml = await zip.file(sheetFile).async('string');
  if (!/<worksheet\b[^>]*xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace('<worksheet', `<worksheet xmlns:r="${NS_R}"`);
  }
  // <drawing> must precede these elements in CT_Worksheet.
  const after = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];
  const pos = Math.min(...after.map((tag) => sheetXml.indexOf(tag)).filter((p) => p >= 0));
  sheetXml = sheetXml.slice(0, pos) + `<drawing r:id="${drawingRid}"/>` + sheetXml.slice(pos);
  zip.file(sheetFile, sheetXml);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { addCharts };
