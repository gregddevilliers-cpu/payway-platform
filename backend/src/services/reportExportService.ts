import * as XLSX from 'xlsx';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}

// ── CSV ───────────────────────────────────────────────────────────────────────
export function exportToCsv(data: Record<string, unknown>[], columns: ExportColumn[]): string {
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map((c) => escape(c.header)).join(',');
  const rows = data.map((row) =>
    columns.map((c) => escape(row[c.key])).join(','),
  );
  return [header, ...rows].join('\n');
}

// ── Excel ─────────────────────────────────────────────────────────────────────
export function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName = 'Report',
): Buffer {
  const headers = columns.map((c) => c.header);
  const rows = data.map((row) => columns.map((c) => row[c.key] ?? ''));

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? Math.max(c.header.length + 2, 12) }));

  // Bold header row
  for (let i = 0; i < columns.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[cellRef]) {
      ws[cellRef].s = { font: { bold: true } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ── PDF (simple HTML-based) ───────────────────────────────────────────────────
export function exportToPdfHtml(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  title: string,
  filters: Record<string, string>,
): string {
  const filterStr = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');

  const headerRow = columns.map((c) => `<th style="background:#1e40af;color:#fff;padding:8px 12px;text-align:left;font-size:12px">${c.header}</th>`).join('');
  const dataRows = data.map((row, i) => {
    const cells = columns.map((c) => `<td style="padding:7px 12px;font-size:12px;border-bottom:1px solid #e5e7eb">${row[c.key] ?? ''}</td>`).join('');
    const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
    return `<tr style="background:${bg}">${cells}</tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; color: #1e40af; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  @page { size: A4 landscape; margin: 20mm; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="meta">
  ${filterStr ? `Filters: ${filterStr} &nbsp;·&nbsp;` : ''}
  Generated: ${new Date().toLocaleString('en-ZA')}
</div>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
<p style="font-size:11px;color:#9ca3af;margin-top:20px">Page 1 of 1 &nbsp;·&nbsp; Active Fleet</p>
</body>
</html>`;
}
