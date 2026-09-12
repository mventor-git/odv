// Checklist HTML generator (ticket 071) — A4 Landscape, company logo top-left,
// metadata header (Date + Created by AR/EN + "This is checklist" + triggerer),
// merged category cell, no-header columns (# / Code / Request No. /
// Description / Sent Date), per-category sections, print button + @page A4
// landscape. Opens in a new tab; the user prints from there.

export interface ChecklistRow {
  category: string;
  code: string;
  requestNo: string;
  description: string;
  sentDate: string;
  status: string;
}

export interface ChecklistSection {
  category: string;
  items: ChecklistRow[];
}

export function openChecklistHtml(opts: {
  date: string;
  sections: ChecklistSection[];
  total: number;
  /** Site identity (ticket 069) — logo data URL or '' */
  logoDataUrl?: string;
  siteName?: string;
  projectName?: string;
  workingArea?: string;
  /** Triggerer display name (AR or EN per site language). */
  createdBy: string;
  lang: 'en' | 'ar';
  /** i18n strings from the caller (ticket 087 — no hand-rolled text). */
  strings: {
    title: string;
    date: string;
    by: string;
    is: string;
    totalRequests: string;
    print: string;
    empty: string;
    popupBlocked: string;
  };
}): void {
  const { date, sections, total, logoDataUrl, siteName, projectName, workingArea, createdBy, lang, strings } = opts;
  const ar = lang === 'ar';
  const title = strings.title;
  const createdLabel = strings.date;
  const byLabel = strings.by;
  const isLabel = strings.is;

  const sectionsHtml = sections
    .map(
      (s) => `
      <div class="section">
        <div class="cat-cell">${escapeHtml(s.category)}</div>
        <table>
          <tbody>
            ${s.items
              .map(
                (row, i) => `<tr>
                  <td class="num">${i + 1}</td>
                  <td>${escapeHtml(row.code)}</td>
                  <td class="num">${escapeHtml(row.requestNo)}</td>
                  <td>${escapeHtml(row.description)}</td>
                  <td class="num">${escapeHtml(row.sentDate)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — ${escapeHtml(date)}</title>
<style>
  @page { size: A4 landscape; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${ar ? '"Cairo", "Segoe UI", Tahoma, Arial' : '"Segoe UI", Tahoma, Arial'}, sans-serif; color: #2D2926; background: #F6F3EE; padding: 8px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C96D57; padding-bottom: 5px; margin-bottom: 7px; }
  .header .brand { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #C96D57; }
  .header .brand img { height: 28px; width: 56px; object-fit: contain; }
  .header .meta { font-size: 9px; color: #6F6861; text-align: end; }
  h1 { font-size: 15px; margin-bottom: 1px; color: #2D2926; }
  .sub { color: #6F6861; font-size: 10px; margin-bottom: 5px; }
  .meta-line { display: flex; gap: 16px; font-size: 10px; color: #6F6861; margin-bottom: 6px; }
  .meta-line b { color: #2D2926; }
  .print-btn { position: fixed; top: 8px; inset-inline-end: 8px; padding: 6px 14px; border: 0; border-radius: 6px; background: #C96D57; color: #fff; font-size: 11px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(201,109,87,.25); }
  .print-btn:hover { background: #B85C45; }
  .section { margin-bottom: 7px; page-break-inside: avoid; }
  .cat-cell { background: #FBF9F6; border: 1px solid #E3DDD5; border-radius: 4px 4px 0 0; padding: 3px 8px; font-size: 11px; font-weight: 800; color: #2D2926; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #E3DDD5; padding: 2px 4px; font-size: 9px; color: #2D2926; }
  td.num { text-align: center; font-variant-numeric: tabular-nums; }
  td:first-child { width: 3%; }
  td:nth-child(2) { width: 22%; font-family: Consolas, monospace; }
  td:nth-child(3) { width: 8%; }
  td:nth-child(5) { width: 12%; }
  .footer { margin-top: 8px; font-size: 8px; color: #958D84; text-align: center; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">${escapeHtml(strings.print)}</button>
  <div class="header">
    <div class="brand">${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo">` : ''}${escapeHtml(siteName || 'odv')}</div>
    <div class="meta">${escapeHtml([projectName, workingArea].filter(Boolean).join(' · '))}</div>
  </div>
  <h1>${escapeHtml(title)} — ${escapeHtml(date)}</h1>
  <div class="sub">${escapeHtml(strings.totalRequests)}: ${total}</div>
  <div class="meta-line">
    <span>${createdLabel}: <b>${escapeHtml(date)}</b></span>
    <span>${byLabel}: <b>${escapeHtml(createdBy)}</b></span>
    <span>${isLabel}: <b>${escapeHtml(createdBy)}</b></span>
  </div>
  ${sectionsHtml || `<div style="color:#94a3b8;font-size:13px">${escapeHtml(strings.empty)}</div>`}
  <div class="footer">odv — ${escapeHtml(title)} · ${escapeHtml(date)}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    window.alert(strings.popupBlocked);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}