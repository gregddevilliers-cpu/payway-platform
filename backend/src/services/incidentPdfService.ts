import PDFDocument from 'pdfkit';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IncidentData {
  incidentNumber: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  description: string;
  location: string | null;
  policeCaseNumber: string | null;
  insuranceClaimNumber: string | null;
  claimStatus: string | null;
  claimAmount: string | number | null;
  payoutAmount: string | number | null;
  costEstimate: string | number | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  downtimeDays: number | null;
  thirdPartyInvolved: boolean;
  thirdPartyDetails: string | null;
  notes: string | null;
  createdAt: string;
  vehicle: { registrationNumber: string; make: string; model: string };
  driver: { firstName: string; lastName: string; mobile?: string } | null;
  fleet: { name: string } | null;
}

// ─── Colours ─────────────────────────────────────────────────────────────────

const BLUE_HEADER = '#1e40af';
const BODY_TEXT = '#374151';
const LIGHT_BG = '#f3f4f6';
const BORDER = '#d1d5db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatZAR(val: string | number | null | undefined): string {
  if (val == null) return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function capitalize(val: string): string {
  return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Section helpers ─────────────────────────────────────────────────────────

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.8);
  doc
    .fillColor(BLUE_HEADER)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(title, { underline: false });

  // Underline
  const y = doc.y + 2;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(BLUE_HEADER)
    .lineWidth(0.5)
    .stroke();

  doc.moveDown(0.5);
}

function drawField(doc: PDFKit.PDFDocument, label: string, value: string, x: number, width: number): void {
  doc
    .fillColor('#6b7280')
    .fontSize(8)
    .font('Helvetica')
    .text(label.toUpperCase(), x, doc.y, { width, continued: false });

  doc
    .fillColor(BODY_TEXT)
    .fontSize(10)
    .font('Helvetica')
    .text(value || '—', x, doc.y, { width });

  doc.moveDown(0.3);
}

function drawTwoColumnRow(
  doc: PDFKit.PDFDocument,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
): void {
  const leftX = doc.page.margins.left;
  const midX = doc.page.width / 2 + 10;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;
  const startY = doc.y;

  // Left field
  doc
    .fillColor('#6b7280')
    .fontSize(8)
    .font('Helvetica')
    .text(leftLabel.toUpperCase(), leftX, startY, { width: colWidth });
  doc
    .fillColor(BODY_TEXT)
    .fontSize(10)
    .font('Helvetica')
    .text(leftValue || '—', leftX, doc.y, { width: colWidth });

  const afterLeftY = doc.y;

  // Right field
  doc
    .fillColor('#6b7280')
    .fontSize(8)
    .font('Helvetica')
    .text(rightLabel.toUpperCase(), midX, startY, { width: colWidth });
  doc
    .fillColor(BODY_TEXT)
    .fontSize(10)
    .font('Helvetica')
    .text(rightValue || '—', midX, doc.y, { width: colWidth });

  const afterRightY = doc.y;

  // Move to the lower of the two columns
  doc.y = Math.max(afterLeftY, afterRightY);
  doc.moveDown(0.3);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateIncidentPdf(incident: IncidentData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title: `Incident Report - ${incident.incidentNumber}`,
      Author: 'Active Fleet',
      Subject: 'Incident Report',
    },
  });

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;

  // ── Header ───────────────────────────────────────────────────────────────

  // Header background
  doc
    .rect(0, 0, pageWidth, 80)
    .fill(BLUE_HEADER);

  // Title
  doc
    .fillColor('#ffffff')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('INCIDENT REPORT', doc.page.margins.left, 22, { width: contentWidth / 2 });

  doc
    .fontSize(9)
    .font('Helvetica')
    .text('Active Fleet', doc.page.margins.left, 48, { width: contentWidth / 2 });

  // Incident number on the right
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(incident.incidentNumber, doc.page.margins.left, 22, {
      width: contentWidth,
      align: 'right',
    });

  doc
    .fontSize(9)
    .font('Helvetica')
    .text(formatDate(incident.incidentDate), doc.page.margins.left, 42, {
      width: contentWidth,
      align: 'right',
    });

  doc.y = 95;

  // ── Incident Info ────────────────────────────────────────────────────────

  drawSectionHeader(doc, 'Incident Information');

  drawTwoColumnRow(doc, 'Type', capitalize(incident.incidentType), 'Severity', capitalize(incident.severity));
  drawTwoColumnRow(doc, 'Status', capitalize(incident.status), 'Date', formatDateTime(incident.incidentDate));
  drawTwoColumnRow(doc, 'Location', incident.location || '—', 'Police case no.', incident.policeCaseNumber || '—');

  if (incident.downtimeDays != null) {
    drawTwoColumnRow(
      doc,
      'Downtime start',
      formatDate(incident.downtimeStart),
      'Downtime end',
      formatDate(incident.downtimeEnd),
    );
    drawField(doc, 'Downtime days', String(incident.downtimeDays), doc.page.margins.left, contentWidth);
  }

  // ── Vehicle & Driver ─────────────────────────────────────────────────────

  drawSectionHeader(doc, 'Vehicle & Driver');

  drawTwoColumnRow(
    doc,
    'Vehicle registration',
    incident.vehicle.registrationNumber,
    'Make / Model',
    `${incident.vehicle.make} ${incident.vehicle.model}`,
  );

  const driverName = incident.driver
    ? `${incident.driver.firstName} ${incident.driver.lastName}`
    : '—';
  const driverMobile = incident.driver?.mobile || '—';

  drawTwoColumnRow(doc, 'Driver', driverName, 'Driver mobile', driverMobile);

  if (incident.fleet) {
    drawField(doc, 'Fleet', incident.fleet.name, doc.page.margins.left, contentWidth);
  }

  // ── Description ──────────────────────────────────────────────────────────

  drawSectionHeader(doc, 'Description');

  doc
    .fillColor(BODY_TEXT)
    .fontSize(10)
    .font('Helvetica')
    .text(incident.description, doc.page.margins.left, doc.y, {
      width: contentWidth,
      lineGap: 3,
    });

  doc.moveDown(0.3);

  // ── Insurance ────────────────────────────────────────────────────────────

  const hasInsurance = incident.insuranceClaimNumber || incident.claimStatus || incident.claimAmount;
  if (hasInsurance) {
    drawSectionHeader(doc, 'Insurance & Claim');

    drawTwoColumnRow(
      doc,
      'Claim number',
      incident.insuranceClaimNumber || '—',
      'Claim status',
      incident.claimStatus ? capitalize(incident.claimStatus) : '—',
    );

    drawTwoColumnRow(
      doc,
      'Claim amount',
      formatZAR(incident.claimAmount),
      'Payout amount',
      formatZAR(incident.payoutAmount),
    );

    drawField(doc, 'Cost estimate', formatZAR(incident.costEstimate), doc.page.margins.left, contentWidth);
  }

  // ── Third Party ──────────────────────────────────────────────────────────

  if (incident.thirdPartyInvolved) {
    drawSectionHeader(doc, 'Third Party');

    doc
      .fillColor(BODY_TEXT)
      .fontSize(10)
      .font('Helvetica')
      .text(incident.thirdPartyDetails || 'Third party was involved. No further details recorded.', {
        width: contentWidth,
        lineGap: 3,
      });

    doc.moveDown(0.3);
  }

  // ── Notes ────────────────────────────────────────────────────────────────

  if (incident.notes) {
    drawSectionHeader(doc, 'Notes');

    doc
      .fillColor(BODY_TEXT)
      .fontSize(10)
      .font('Helvetica')
      .text(incident.notes, {
        width: contentWidth,
        lineGap: 3,
      });

    doc.moveDown(0.3);
  }

  // ── Footer (on every page) ───────────────────────────────────────────────

  const drawFooter = (page: number): void => {
    const bottom = doc.page.height - 35;

    doc
      .moveTo(doc.page.margins.left, bottom - 10)
      .lineTo(pageWidth - doc.page.margins.right, bottom - 10)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();

    doc
      .fillColor('#9ca3af')
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Generated by Active Fleet on ${new Date().toLocaleDateString('en-ZA')}`,
        doc.page.margins.left,
        bottom,
        { width: contentWidth / 2, align: 'left' },
      );

    doc
      .text(`Page ${page}`, doc.page.margins.left, bottom, {
        width: contentWidth,
        align: 'right',
      });
  };

  // Track page count and draw footer on each page
  let pageNumber = 1;
  drawFooter(pageNumber);

  doc.on('pageAdded', () => {
    pageNumber += 1;
    drawFooter(pageNumber);
  });

  doc.end();
  return doc;
}
