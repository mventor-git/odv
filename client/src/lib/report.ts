// Print-ready HTML report generator (ticket 026) — opens in a new window,
// A4 with the project header; the user can print or save as PDF.
// Bilingual (ticket 087): lang='ar' renders Arabic RTL with Cairo font.

export interface ReportRow {
  label: string;
  value: number;
}

const AR = {
  generated: 'تم الإنشاء',
  by: 'بواسطة',
  item: 'البند',
  count: 'العدد',
  share: 'الحصة',
  top: 'الأعلى',
  ofTotal: 'من الإجمالي',
  footer: 'odv — إدارة المستندات وسجلات الموقع · تقرير سير العمل',
  popupBlocked: 'تم حظر النوافذ المنبثقة — اسمح بالنوافذ المنبثقة لإنشاء التقرير.',
};

export function openReport(opts: {
  title: string;
  subtitle: string;
  rows: ReportRow[];
  generatedBy?: string;
  lang?: 'en' | 'ar';
}): void {
  const { title, subtitle, rows, generatedBy, lang = 'en' } = opts;
  const ar = lang === 'ar';
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const now = new Date().toLocaleString(ar ? 'ar-EG' : 'en-GB');

  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${r.value}</td>
        <td class="bar"><div class="fill" style="width:${Math.round((r.value / max) * 100)}%"></div></td>
        <td class="num">${total > 0 ? ((r.value / total) * 100).toFixed(1) : '0.0'}%</td>
      </tr>`,
    )
    .join('');

  // Workflow summary: the top item and its share.
  const top = rows.length > 0 ? [...rows].sort((a, b) => b.value - a.value)[0] : null;
  const topHtml = top
    ? `<div class="summary">${ar ? AR.top : 'Top'}: <b>${escapeHtml(top.label)}</b> — ${top.value} (${total > 0 ? ((top.value / total) * 100).toFixed(1) : '0.0'}% ${ar ? AR.ofTotal : 'of the total'})</div>`
    : '';

  const html = `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — odv</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${ar ? '"Cairo", "Segoe UI", Tahoma, Arial' : '"Segoe UI", Tahoma, Arial'}, sans-serif; color: #2D2926; background: #F6F3EE; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C96D57; padding-bottom: 12px; margin-bottom: 24px; }
  .header .brand { font-size: 20px; font-weight: 700; color: #C96D57; }
  .header .meta { font-size: 12px; color: #6F6861; text-align: end; }
  h1 { font-size: 24px; margin-bottom: 4px; color: #2D2926; }
  .sub { color: #6F6861; font-size: 13px; margin-bottom: 8px; }
  .total { font-size: 40px; font-weight: 800; color: #C96D57; margin-bottom: 8px; }
  .summary { background: #FBF9F6; border: 1px solid #E3DDD5; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #6F6861; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: start; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6F6861; border-bottom: 2px solid #E3DDD5; padding: 8px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #E3DDD5; font-size: 13px; color: #2D2926; }
  td.num { text-align: end; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.bar { width: 30%; }
  .fill { height: 8px; border-radius: 4px; background: #C96D57; }
  .footer { margin-top: 24px; font-size: 11px; color: #958D84; text-align: center; }
  @media print { body { padding: 0; background: #FFFFFF; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">odv</div>
    <div class="meta">${ar ? AR.generated : 'Generated'}: ${escapeHtml(now)}${generatedBy ? `<br>${ar ? AR.by : 'By'}: ${escapeHtml(generatedBy)}` : ''}</div>
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">${escapeHtml(subtitle)}</div>
  <div class="total">${total}</div>
  ${topHtml}
  <table>
    <thead><tr><th>${ar ? AR.item : 'Item'}</th><th class="num">${ar ? AR.count : 'Count'}</th><th>${ar ? AR.share : 'Share'}</th><th class="num">%</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">${ar ? AR.footer : 'odv — document control & site logs · workflow check report'}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    window.alert(ar ? AR.popupBlocked : 'Pop-up blocked — allow pop-ups to create the report.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Total Requests — standalone fully functional HTML (no Node.js needed).
 * Shows cards for requests + a filters tab (multi-select checkboxes, date range,
 * search) with client-side filtering, warm Claude theme, and a top button
 * "FULL REQUESTS PANEL EXPORT" that packs the HTML + all PDFs into a .zip
 * (JSZip via CDN). All project metadata (company, custom metadata, zones,
 * categories+forks, scans folder, users, wall stats) is included.
 */
export async function openWallFullPanel(opts: {
  title: string;
  stats: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number>; byBucket: Record<string, number> };
  meta: { categories: Array<{ code: string; name: string }>; statuses: Array<{ code: string; slogan: string }>; zones: Array<{ code: string; name: string; nameAr?: string }>; floors: string[] };
  projectMeta?: { name?: string; projectName?: string; workingArea?: string; consultant?: string; owner?: string; ownerDelegate?: string; logoDataUrl?: string };
  lang?: 'en' | 'ar';
}): Promise<void> {
  const { lang = 'en' } = opts;
  const ar = lang === 'ar';
  const token = localStorage.getItem('odv_token') ?? '';
  const auth = { Authorization: `Bearer ${token}` };
  const esc = escapeHtml;

  // Fetch all records (paginated — the server caps a single page at 500).
  const fetchAll = async (): Promise<Array<Record<string, string>>> => {
    const out: Array<Record<string, string>> = [];
    const limit = 500;
    let offset = 0;
    for (;;) {
      const res = await fetch(`/api/records?limit=${limit}&offset=${offset}`, { headers: auth });
      if (!res.ok) break;
      const j = (await res.json()) as { total: number; items: Array<Record<string, unknown>> };
      for (const r of j.items ?? []) {
        out.push({
          id: String(r.id ?? ''),
          category: String(r.category ?? ''),
          requestNo: String(r.requestNo ?? r.request_no ?? ''),
          revisionNo: String(r.revisionNo ?? r.revision_no ?? ''),
          description: String(r.description ?? ''),
          zone: String(r.zone ?? ''),
          floor: String(r.floor ?? ''),
          engineer: String(r.engineer ?? ''),
          fork: String(r.fork ?? ''),
          status: String(r.status ?? ''),
          sentDate: String(r.sentDate ?? r.sent_date ?? ''),
          hyperlink: String(r.hyperlink ?? ''),
        });
      }
      if (out.length >= j.total || j.items.length === 0) break;
      offset += limit;
    }
    return out;
  };

  const safeFetch = async <T>(url: string): Promise<T | null> => {
    try {
      const res = await fetch(url, { headers: auth });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };

  const fetchLogo = async (): Promise<string> => {
    try {
      const res = await fetch('/api/settings/company/logo', { headers: auth });
      if (!res.ok) return '';
      const blob = await res.blob();
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ''));
        r.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const [records, metaRes, statsRes, companyRes, settingsMeta, usersRes, meRes] = await Promise.all([
    fetchAll(),
    safeFetch<{ categories: Array<{ code: string; name: string }>; statuses: Array<{ code: string; slogan: string }>; zones: Array<{ code: string; name: string; nameAr?: string }>; floors: string[] }>('/api/meta'),
    safeFetch<{ total: number; byStatus: Record<string, number>; byCategory: Record<string, number>; byBucket: Record<string, number> }>('/api/records/stats'),
    safeFetch<{ name: string; projectName: string; workingArea: string; consultant: string; owner: string; ownerDelegate: string; hasLogo: boolean }>('/api/settings/company'),
    safeFetch<{ custom_metadata: Array<{ key_en: string; key_ar: string; value_en: string; value_ar: string }>; scans_watch_dir: string }>('/api/settings/meta'),
    safeFetch<Array<{ username: string; firstName: string; secondName: string; role: string }>>('/api/auth/users?all=1'),
    safeFetch<{ username: string; firstName: string; secondName: string }>('/api/auth/me'),
  ]);

  const freshMeta = metaRes ?? opts.meta;
  const freshStats = statsRes ?? opts.stats;
  const company = companyRes ?? { name: '', projectName: '', workingArea: '', consultant: '', owner: '', ownerDelegate: '', hasLogo: false };
  const logoDataUrl = opts.projectMeta?.logoDataUrl ?? (company.hasLogo ? await fetchLogo() : '');
  const customMeta = settingsMeta?.custom_metadata ?? [];
  const scansDir = settingsMeta?.scans_watch_dir ?? '';
  const users = usersRes ?? [];
  const me = meRes ?? { username: '', firstName: '', secondName: '' };
  const generatedBy = me.firstName || me.secondName ? `${me.firstName} ${me.secondName}`.trim() : me.username || '—';
  const idLine = [company.name, company.projectName, company.workingArea].filter(Boolean).join(' · ') || 'odv';

  const S = {
    fullExport: 'FULL REQUESTS PANEL EXPORT (with PDFs)',
    print: ar ? 'طباعة' : 'Print',
    generated: ar ? 'تم الإنشاء' : 'Generated',
    by: ar ? 'بواسطة' : 'By',
    requests: ar ? 'طلبات' : 'requests',
    revisions: ar ? 'مراجعات' : 'revisions',
    cat: ar ? 'الفئة' : 'Category',
    stat: ar ? 'الحالة' : 'Status',
    zone: ar ? 'المنطقة' : 'Zone',
    floor: ar ? 'الطابق' : 'Floor',
    from: ar ? 'من' : 'From',
    to: ar ? 'إلى' : 'To',
    searchPh: ar ? 'ابحث في رقم الطلب / الوصف / المنطقة...' : 'Search requestNo / description / zone...',
    clearFilters: ar ? 'مسح التصفية' : 'Clear filters',
    showing: ar ? 'عرض {a} / {b}' : 'Showing {a} / {b}',
    project: ar ? 'المشروع' : 'Project',
    consultant: ar ? 'الاستشاري' : 'Consultant',
    owner: ar ? 'المالك' : 'Owner',
    delegate: ar ? 'من ينوب عن المالك' : 'Delegate',
    customMeta: ar ? 'بيانات مخصصة' : 'Custom Metadata',
    wallStats: ar ? 'إحصائيات الحائط' : 'Wall stats',
    total: ar ? 'الإجمالي' : 'Total',
    byStatus: ar ? 'حسب الحالة' : 'By status',
    byBucket: ar ? 'حسب المجموعة' : 'By bucket',
    zones: ar ? 'المناطق' : 'Zones',
    catsForks: ar ? 'الفئات والتخصصات' : 'Categories & Forks',
    scansFolder: ar ? 'مجلد المسح' : 'Scans folder',
    users: ar ? 'المستخدمون' : 'Users',
    openPdf: ar ? 'فتح PDF' : 'Open PDF',
    noPdf: ar ? '\u2014 لا ملف PDF \u2014' : '\u2014 no PDF \u2014',
    noMatches: ar ? 'لا توجد نتائج' : 'No matches',
    exportProgress: ar ? 'جارٍ التصدير\u2026 {done}/{total} PDF' : 'Exporting\u2026 {done}/{total} PDFs',
    exportComplete: ar ? 'اكتمل التصدير \u2014 {file}' : 'Export complete \u2014 {file}',
    exportFailed: ar ? 'فشل التصدير \u2014 {msg}' : 'Export failed \u2014 {msg}',
    openFailed: ar ? 'تعذر فتح الملف' : 'Failed to open file',
    top: ar ? 'الأعلى' : 'Top',
    footer: ar
      ? 'odv \u2014 لوحة طلبات مستقلة \u2014 بدون حاجة إلى Node.js'
      : 'odv \u2014 Standalone full panel \u2014 no Node.js needed',
    popupBlocked: ar ? 'تم حظر النوافذ المنبثقة — اسمح بالنوافذ المنبثقة لإنشاء التقرير.' : 'Pop-up blocked — allow pop-ups to create the report.',
  };

  const now = new Date().toLocaleString(ar ? 'ar-EG' : 'en-GB');
  const catOpts = freshMeta.categories
    .map((c) => `<label class="cb"><input type="checkbox" value="${esc(c.code)}" data-group="cat"> ${esc(c.code)} \u2014 ${esc(c.name)}</label>`)
    .join('');
  const statusOpts = freshMeta.statuses
    .map((s) => `<label class="cb"><input type="checkbox" value="${esc(s.code)}" data-group="status"> ${esc(s.code)} \u2014 ${esc(s.slogan)}</label>`)
    .join('');
  const zoneOpts = (freshMeta.zones || [])
    .map((z) => `<label class="cb"><input type="checkbox" value="${esc(z.code)}" data-group="zone"> ${esc(z.code)} \u2014 ${esc(z.name)}</label>`)
    .join('');
  const floorOpts = (freshMeta.floors || [])
    .map((f) => `<label class="cb"><input type="checkbox" value="${esc(f)}" data-group="floor"> ${esc(f)}</label>`)
    .join('');
  const dataJson = JSON.stringify(records).replace(/</g, '\\u003c');
  const metaJson = JSON.stringify({ categories: freshMeta.categories, statuses: freshMeta.statuses, zones: freshMeta.zones }).replace(/</g, '\\u003c');
  const sJson = JSON.stringify(S).replace(/</g, '\\u003c');

  const topStatus = Object.entries(freshStats.byStatus).sort((a, b) => b[1] - a[1])[0];
  const topHtml = topStatus
    ? `<div class="summary">${S.top}: <b>${esc(topStatus[0])}</b> \u2014 ${topStatus[1]} (${freshStats.total > 0 ? ((topStatus[1] / freshStats.total) * 100).toFixed(1) : '0.0'}%)</div>`
    : '';

  const customMetaHtml = customMeta.length > 0
    ? '<h3>' + esc(S.customMeta) + '</h3>' +
      customMeta.map((m) =>
        '<p style="font-size:11px;color:#6F6861;margin:2px 0">' +
        esc(m.key_en) + (m.key_ar ? ' / ' + esc(m.key_ar) : '') + ': <b>' +
        esc(m.value_en) + (m.value_ar ? ' / ' + esc(m.value_ar) : '') + '</b></p>',
      ).join('')
    : '';

  const usersHtml = users.length > 0
    ? users.slice(0, 15).map((u) => esc(u.firstName || u.secondName ? `${u.firstName} ${u.secondName}`.trim() : u.username)).join(', ') +
      (users.length > 15 ? ' +' + (users.length - 15) : '')
    : '\u2014';

  const byStatusHtml = Object.entries(freshStats.byStatus).map(([k, v]) => `${esc(k)}:${v}`).join(' ');
  const byBucketHtml = Object.entries(freshStats.byBucket).map(([k, v]) => `${esc(k)}:${v}`).join(' ');

  const html = `<!doctype html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${esc(opts.title)} \u2014 odv \u2014 Full Panel</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:${ar ? '"Cairo","Segoe UI",Tahoma,Arial' : '"Segoe UI",Tahoma,Arial'},sans-serif;color:#2D2926;background:#F6F3EE;padding:16px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #C96D57;padding-bottom:10px;margin-bottom:10px;gap:10px;flex-wrap:wrap}
.brand{font-size:16px;font-weight:700;color:#C96D57;display:flex;align-items:center;gap:6px}
.brand img{height:28px;width:56px;object-fit:contain}
.hmeta{font-size:11px;color:#6F6861;text-align:end}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.toolbar .panel-title{font-size:18px;font-weight:700;color:#2D2926}
.toolbar-btns{display:flex;gap:6px;flex-wrap:wrap}
.btn{border:0;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}
.btn-accent{background:#C96D57;color:#fff}
.btn-accent:hover{background:#B85C45}
.btn-ghost{background:transparent;border:1px solid #E3DDD5;color:#6F6861}
.btn-ghost:hover{background:#FBF9F6;color:#2D2926}
.summary{background:#FBF9F6;border:1px solid #E3DDD5;border-radius:8px;padding:8px 12px;font-size:12px;color:#6F6861;margin-bottom:10px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.meta-card{border:1px solid #E3DDD5;background:#FBF9F6;border-radius:8px;padding:8px 10px}
.meta-card h3{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6F6861;margin-bottom:4px}
.meta-card p{font-size:11px;color:#2D2926;margin:1px 0}
.meta-card .dim{font-size:10px;color:#958D84}
.chips{display:flex;flex-wrap:wrap;gap:3px}
.chips span{font-size:10px;background:#E3DDD5;padding:1px 4px;border-radius:3px;color:#2D2926}
.progress{background:#FBF9F6;border:1px solid #C96D57;border-radius:8px;padding:8px 12px;font-size:12px;color:#2D2926;margin-bottom:8px;text-align:center}
.filters{position:sticky;top:0;z-index:10;background:#F6F3EE;border:1px solid #E3DDD5;border-radius:10px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;margin-bottom:10px}
.fg{font-size:11px;border:1px solid #E3DDD5;border-radius:6px;background:#fff;padding:2px 6px}
.fg summary{cursor:pointer;font-weight:600;color:#2D2926;padding:2px 0}
.fg-opts{display:flex;flex-direction:column;gap:1px;margin-top:4px;max-height:180px;overflow-y:auto;padding:2px 0}
.cb{display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;white-space:nowrap;color:#2D2926;padding:1px 2px}
.cb input{accent-color:#C96D57}
.dr{display:flex;align-items:center;gap:3px;font-size:11px;color:#2D2926}
.dr input{height:28px;border:1px solid #E3DDD5;border-radius:6px;padding:0 6px;font-size:11px;width:120px}
.fQ{height:30px;border:1px solid #E3DDD5;border-radius:6px;padding:0 8px;font-size:11px;min-width:160px;flex:1}
.count{font-size:11px;color:#6F6861;padding:4px 0;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px}
.card{border:1px solid #E3DDD5;background:#FBF9F6;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:all .15s}
.card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.08);border-color:rgba(201,109,87,.3);cursor:pointer}
.card-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;background:rgba(0,0,0,.02);border-bottom:1px solid rgba(227,221,213,.5);padding:8px 10px;font-size:11px}
.req{font-family:Consolas,monospace;font-size:13px;font-weight:700;color:#2D2926}
.catname{font-size:10px;color:#6F6861;background:#E3DDD5;padding:1px 5px;border-radius:3px}
.revs{font-size:10px;color:#958D84}
.rev-rows{display:flex;flex-direction:column}
.rev{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:5px 10px;border-bottom:1px solid rgba(227,221,213,.3);font-size:11px}
.rev:last-child{border-bottom:0}
.revno{font-family:Consolas,monospace;font-size:10px;font-weight:600;color:#6F6861;min-width:28px}
.desc{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2D2926}
.rmeta{font-size:10px;color:#958D84;white-space:nowrap}
.rstatus{display:inline-flex;border-radius:4px;padding:1px 5px;font-size:10px;border:1px solid #E3DDD5;background:transparent;color:#2D2926}
.pdf{font-size:10px;color:#C96D57;text-decoration:none;white-space:nowrap}
.pdf:hover{text-decoration:underline}
.nopdf{font-size:10px;color:#958D84}
.modal{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3)}
.modal-box{background:#FBF9F6;border:1px solid #E3DDD5;border-radius:12px;padding:16px;max-width:640px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.15)}
.modal-box h2{font-size:16px;margin-bottom:6px}
.modal-box table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
.modal-box td{text-align:start;padding:4px 6px;border-bottom:1px solid #E3DDD5;color:#2D2926}
.modal-box th{text-align:start;font-size:10px;text-transform:uppercase;color:#958D84;padding:4px 6px;border-bottom:2px solid #E3DDD5}
.modal-close{float:right;border:0;background:transparent;font-size:18px;cursor:pointer;color:#958D84;padding:0 4px}
.modal-close:hover{color:#2D2926}
.footer{margin-top:12px;font-size:10px;color:#958D84;text-align:center;padding:8px 0}
@media print{.filters,.toolbar-btns,#exportProgress,.btn-accent{display:none!important}body{padding:0;background:#fff}.card{break-inside:avoid}.header{border-bottom-width:2px}}
</style>
</head>
<body>
<div class="header">
  <div class="brand">${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo">` : ''}${esc(idLine)}</div>
  <div class="hmeta">${S.generated}: ${esc(now)}<br>${S.by}: ${esc(generatedBy)}</div>
</div>
<div class="toolbar">
  <span class="panel-title">${esc(opts.title)}<span style="font-weight:400;font-size:14px;color:#6F6861"> \u2014 ${freshStats.total} ${S.requests}</span></span>
  <div class="toolbar-btns">
    <button class="btn btn-accent" onclick="__exportZip()">${S.fullExport}</button>
    <button class="btn btn-ghost" onclick="window.print()">${S.print}</button>
  </div>
</div>
<div id="exportProgress" class="progress" style="display:none"></div>
${topHtml}
<div class="meta-grid">
  <div class="meta-card">
    <h3>${S.project}</h3>
    <p>${esc(idLine)}</p>
    <p class="dim">${S.consultant}: ${esc(company.consultant || '\u2014')} \u00b7 ${S.owner}: ${esc(company.owner || '\u2014')} \u00b7 ${S.delegate}: ${esc(company.ownerDelegate || '\u2014')}</p>
    ${customMetaHtml}
  </div>
  <div class="meta-card">
    <h3>${S.wallStats}</h3>
    <p>${S.total}: ${freshStats.total}</p>
    <p class="dim">${S.byStatus}: ${byStatusHtml}</p>
    <p class="dim">${S.byBucket}: ${byBucketHtml}</p>
  </div>
  <div class="meta-card">
    <h3>${S.zones} (${freshMeta.zones.length})</h3>
    <div class="chips">${freshMeta.zones.map((z) => `<span>${esc(z.code)}</span>`).join('')}</div>
  </div>
  <div class="meta-card">
    <h3>${S.catsForks} (${freshMeta.categories.length})</h3>
    ${freshMeta.categories.slice(0, 8).map((c) => `<p style="font-size:10px">${esc(c.code)} \u2014 ${esc(c.name)}</p>`).join('')}
    ${freshMeta.categories.length > 8 ? `<p class="dim">+${freshMeta.categories.length - 8}</p>` : ''}
  </div>
  <div class="meta-card">
    <h3>${S.scansFolder}</h3>
    <p style="font-size:10px">${esc(scansDir || '\u2014')}</p>
    <h3 style="margin-top:4px">${S.users}</h3>
    <p style="font-size:10px">${usersHtml}</p>
  </div>
</div>
<div class="filters" id="filters">
  <details class="fg"><summary>${S.cat}</summary><div class="fg-opts" data-group="cat">${catOpts}</div></details>
  <details class="fg"><summary>${S.stat}</summary><div class="fg-opts" data-group="status">${statusOpts}</div></details>
  <details class="fg"><summary>${S.zone}</summary><div class="fg-opts" data-group="zone">${zoneOpts}</div></details>
  <details class="fg"><summary>${S.floor}</summary><div class="fg-opts" data-group="floor">${floorOpts}</div></details>
  <label class="dr">${S.from} <input type="date" id="fFrom"></label>
  <label class="dr">${S.to} <input type="date" id="fTo"></label>
  <input class="fQ" id="fQ" placeholder="${S.searchPh}">
  <button class="btn btn-ghost" id="clearFilters">${S.clearFilters}</button>
  <span class="count" id="count"></span>
</div>
<div class="grid" id="grid"></div>
<div id="modal" class="modal" style="display:none"><div class="modal-box" id="modalBox"><button class="modal-close" onclick="__closeModal()">&times;</button><div id="modalBody"></div></div></div>
<div class="footer">${S.footer}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
window.__WALL_DATA = ${dataJson};
window.__META = ${metaJson};
window.__TOKEN = (new URLSearchParams(location.search).get('token')) || (function(){try{return localStorage.getItem('odv_token')||''}catch(e){return ''}})();
window.__BASE = location.origin;
window.__S = ${sJson};
var S = window.__S;
var PDF_MODE = 'web';
var catNameMap = {};
var groups = [];

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'})}
function pad(s){return String(s).padStart(2,'0')}
function padReq(s){var m=String(s).match(/^(.*?)(\\d+)$/);return m?m[1]+m[2].padStart(4,'0'):s}
function num(s){return parseInt(s,10)||0}
function numStr(s){var m=String(s).match(/^(.*?)(\\d+)$/);return m?[m[1],num(m[2])]:[s,0]}
function badge(st){return '<span class="rstatus">'+esc(st)+'</span>'}
function pdfName(r){return esc(r.requestNo).replace(/[^a-zA-Z0-9._-]/g,'_')+'-'+pad(r.revisionNo)+'.pdf'}
function catName(c){return catNameMap[c]||c}

function buildGroups(){
  catNameMap={};
  (window.__META.categories||[]).forEach(function(c){catNameMap[c.code]=c.name});
  var map={};
  groups=[];
  window.__WALL_DATA.forEach(function(r){
    var key=r.category+'|'+r.requestNo;
    if(!map[key]){map[key]={category:r.category,requestNo:r.requestNo,revs:[],latestStatus:'',zone:'',floor:'',sentDate:''};groups.push(map[key])}
    map[key].revs.push(r);
  });
  groups.forEach(function(g){
    g.revs.sort(function(a,b){return num(a.revisionNo)-num(b.revisionNo)});
    g.latestStatus=g.revs[g.revs.length-1].status;
    g.zone=g.revs[0].zone;g.floor=g.revs[0].floor;g.sentDate=g.revs[0].sentDate;
  });
  groups.sort(function(a,b){
    if(a.category!==b.category)return a.category<b.category?-1:1;
    var sa=numStr(a.requestNo),sb=numStr(b.requestNo);
    return sa[0]!==sb[0]?(sa[0]<sb[0]?-1:1):sa[1]-sb[1];
  });
}

function renderAll(){
  var grid=document.getElementById('grid');
  var html='';
  groups.forEach(function(g,idx){
    var revsHtml='';
    g.revs.forEach(function(r){
      var pdfLink='';
      if(r.hyperlink){
        if(PDF_MODE==='zip'){pdfLink='<a class="pdf" href="PDFs/'+pdfName(r)+'" target="_blank">'+S.openPdf+'</a>'}
        else{pdfLink='<a class="pdf" href="#" data-rid="'+r.id+'" onclick="return __openPdf(this)">'+S.openPdf+'</a>'}
      }else{pdfLink='<span class="nopdf">'+S.noPdf+'</span>'}
      revsHtml+='<div class="rev">'
        +'<span class="revno">'+pad(r.revisionNo)+'</span>'
        +'<span class="desc" title="'+esc(r.description)+'">'+esc(r.description||'')+'</span>'
        +'<span class="rmeta">'+esc([r.zone,r.floor,r.engineer,r.sentDate].filter(Boolean).join(' \u00b7 '))+'</span>'
        +badge(r.status)
        +pdfLink
        +'</div>';
    });
    html+='<div class="card" data-key="'+idx+'" onclick="__openModal('+idx+')">'
      +'<div class="card-head">'
      +'<span class="req">'+padReq(g.requestNo)+'</span>'
      +'<span class="catname">'+esc(g.category)+' \u2014 '+esc(catName(g.category))+'</span>'
      +'<span class="revs">'+g.revs.length+' '+S.revisions+'</span>'
      +'<span style="margin-inline-start:auto">'+badge(g.latestStatus)+'</span>'
      +'</div>'
      +'<div class="rev-rows">'+revsHtml+'</div>'
      +'</div>';
  });
  grid.innerHTML=html||'<div style="grid-column:1/-1;text-align:center;padding:24px;color:#958D84">'+S.noMatches+'</div>';
  applyFilters();
}

function checkedSet(group){
  var s=new Set();
  document.querySelectorAll('.fg-opts[data-group="'+group+'"] input[type=checkbox]:checked').forEach(function(cb){s.add(cb.value)});
  return s;
}
function searchText(g){
  var txt=g.revs.map(function(r){return r.requestNo+' '+r.description+' '+r.zone+' '+r.floor+' '+r.engineer+' '+r.status+' '+r.category}).join(' ');
  return txt.toLowerCase();
}
function applyFilters(){
  var cats=checkedSet('cat'),statuses=checkedSet('status'),zones=checkedSet('zone'),floors=checkedSet('floor');
  var from=document.getElementById('fFrom').value,to=document.getElementById('fTo').value;
  var q=document.getElementById('fQ').value.trim().toLowerCase();
  var cards=document.querySelectorAll('.card');
  var shown=0;
  cards.forEach(function(card,i){
    if(i>=groups.length)return;
    var g=groups[i];var ok=true;
    if(cats.size&&!cats.has(g.category))ok=false;
    if(ok&&statuses.size&&!statuses.has(g.latestStatus))ok=false;
    if(ok&&zones.size&&!zones.has(g.zone)&&!Array.from(zones).some(function(z){return String(g.zone||'').split('&').map(function(x){return x.trim()}).indexOf(z)>=0}))ok=false;
    if(ok&&floors.size&&!floors.has(g.floor))ok=false;
    if(ok&&from&&String(g.sentDate||'')<from)ok=false;
    if(ok&&to&&String(g.sentDate||'')>to)ok=false;
    if(ok&&q&&searchText(g).indexOf(q)<0)ok=false;
    card.style.display=ok?'':'none';
    if(ok)shown++;
  });
  document.getElementById('count').textContent=S.showing.replace('{a}',shown).replace('{b}',groups.length);
}

function __openModal(idx){
  var g=groups[idx];
  if(!g)return;
  var html='<h2>'+padReq(g.requestNo)+' <span style="font-weight:400;font-size:13px;color:#6F6861">'+esc(g.category)+' \u2014 '+esc(catName(g.category))+'</span></h2>'
    +'<table><thead><tr><th>Rev</th><th>'+S.cat+'</th><th>'+S.zone+'</th><th>'+S.floor+'</th><th>'+S.users+'</th><th>'+S.from+'</th><th>'+S.stat+'</th><th>PDF</th></tr></thead><tbody>';
  g.revs.forEach(function(r){
    var pdfLink='';
    if(r.hyperlink){
      pdfLink=(PDF_MODE==='zip')?'<a href="PDFs/'+pdfName(r)+'" target="_blank" style="color:#C96D57">'+S.openPdf+'</a>'
        :'<a href="#" data-rid="'+r.id+'" onclick="return __openPdf(this)" style="color:#C96D57">'+S.openPdf+'</a>';
    }else{pdfLink='<span style="color:#958D84">\u2014</span>'}
    html+='<tr><td>'+pad(r.revisionNo)+'</td><td>'+esc(r.description||'')+'</td><td>'+esc(r.zone||'')+'</td><td>'+esc(r.floor||'')+'</td><td>'+esc(r.engineer||'')+'</td><td>'+esc(r.sentDate||'')+'</td><td>'+badge(r.status)+'</td><td>'+pdfLink+'</td></tr>';
  });
  html+='</tbody></table>';
  document.getElementById('modalBody').innerHTML=html;
  document.getElementById('modal').style.display='flex';
}
function __closeModal(){document.getElementById('modal').style.display='none'}
document.getElementById('modal').addEventListener('click',function(e){if(e.target===this)__closeModal()});

function __openPdf(el){
  var id=el.getAttribute('data-rid');
  if(!id)return false;
  fetch(window.__BASE+'/api/files/'+id,{headers:{Authorization:'Bearer '+window.__TOKEN}})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.blob()})
    .then(function(blob){var u=URL.createObjectURL(blob);window.open(u,'_blank');setTimeout(function(){URL.revokeObjectURL(u)},60000)})
    .catch(function(err){alert(S.openFailed+': '+(err.message||err))});
  return false;
}

document.getElementById('filters').addEventListener('change',function(e){
  if(e.target.matches('.fg-opts input[type=checkbox]'))applyFilters();
});
document.getElementById('filters').addEventListener('input',function(e){
  if(e.target.id==='fQ'||e.target.id==='fFrom'||e.target.id==='fTo')applyFilters();
});
document.getElementById('clearFilters').addEventListener('click',function(){
  document.querySelectorAll('.filters input[type=checkbox]').forEach(function(cb){cb.checked=false});
  document.getElementById('fFrom').value='';document.getElementById('fTo').value='';
  document.getElementById('fQ').value='';applyFilters();
});

function __loadJSZip(){
  return new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload=resolve;s.onerror=function(){reject(new Error('JSZip CDN unavailable'))};
    document.head.appendChild(s);
  });
}
function __exportZip(){
  var progress=document.getElementById('exportProgress');
  (async function(){
    try{
      if(typeof JSZip==='undefined')await __loadJSZip();
      if(typeof JSZip==='undefined')throw new Error('JSZip not available');
      var zip=new JSZip();
      PDF_MODE='zip';renderAll();__closeModal();
      zip.file('log.html','<!doctype html>\\n'+document.documentElement.outerHTML);
      PDF_MODE='web';renderAll();
      var withPdf=window.__WALL_DATA.filter(function(r){return r.hyperlink});
      progress.style.display='block';
      progress.textContent=S.exportProgress.replace('{done}','0').replace('{total}',String(withPdf.length));
      var done=0;
      for(var i=0;i<withPdf.length;i++){
        var r=withPdf[i];
        try{
          var res=await fetch(window.__BASE+'/api/files/'+r.id,{headers:{Authorization:'Bearer '+window.__TOKEN}});
          if(res.ok)zip.file('PDFs/'+pdfName(r),await res.blob());
        }catch(e){}
        done++;
        progress.textContent=S.exportProgress.replace('{done}',String(done)).replace('{total}',String(withPdf.length));
        if(done%20===0)await new Promise(function(r){setTimeout(r,0)});
      }
      var blob=await zip.generateAsync({type:'blob'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');a.href=url;a.download='odv-Export-'+(new Date().toISOString().slice(0,10))+'.zip';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},30000);
      progress.textContent=S.exportComplete.replace('{file}',a.download);
    }catch(err){
      progress.style.display='block';
      progress.textContent=S.exportFailed.replace('{msg}',err&&err.message?err.message:String(err));
    }
  })();
}

buildGroups();
renderAll();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(token ? `${url}?token=${encodeURIComponent(token)}` : url, '_blank');
  if (!win) {
    window.alert(S.popupBlocked);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
