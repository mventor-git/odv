// Smoke test — boots the app on an ephemeral port, exercises the API, exits.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { loadConfig } = await import('../src/config.ts');
const { openDb } = await import('../src/db.ts');
const { createApp } = await import('../src/app.ts');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'odv-smoke-'));
const config = loadConfig({ PORT: '0', DATA_DIR: tmp });
config.adminPassword = 'smoke-pass-123';
config.jwtSecret = 'smoke-secret';

const db = openDb(config);
const app = createApp(db, config);
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0;
const failures = [];
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('PASS', name); }
  else { failures.push(name); console.error('FAIL', name, extra ?? ''); }
};

// 1. login
const loginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: config.adminPassword }),
});
const login = await loginRes.json();
check('login admin', loginRes.status === 200 && !!login.token, login);
const headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };

// 2. unauthenticated -> 401
const unauth = await fetch(`${base}/api/meta`);
check('unauthenticated rejected (401)', unauth.status === 401, unauth.status);

// 3. meta: 12 categories, 10 statuses (incl. Canceled), 8 zones, 16 floors
const metaRes = await fetch(`${base}/api/meta`, { headers });
const meta = await metaRes.json();
check('meta: 12 categories', metaRes.status === 200 && meta.categories.length === 12, meta.categories?.length);
check('meta: 10 statuses', meta.statuses.length === 10, meta.statuses?.length);
check('meta: 8 zones', meta.zones.length === 8, meta.zones?.length);
check('meta: 16 floors', meta.floors.length === 16, meta.floors?.length);

// 3b. project members seeded at boot (ticket 097) — the canonical team
const engRes = await fetch(`${base}/api/ref/members`, { headers });
const eng = await engRes.json();
check('project members seeded (6 placeholders)', engRes.status === 200 && eng.length === 6 && eng.some((e) => e.name === 'Civil Lead'), eng.length);

// 4. create record
const recRes = await fetch(`${base}/api/records`, {
  method: 'POST', headers,
  body: JSON.stringify({ category: 'IR', requestNo: '0001', revisionNo: '00', description: 'Smoke IR', zone: 'A', floor: 'Ground', status: 'P' }),
});
const rec = await recRes.json();
check('create record', recRes.status === 201 && rec.id, rec);

// 5. list + filter
const listRes = await fetch(`${base}/api/records?category=IR`, { headers });
const list = await listRes.json();
check('list filtered (IR total=1)', listRes.status === 200 && list.total === 1, list);

// 6. duplicate -> 409
const dupRes = await fetch(`${base}/api/records`, {
  method: 'POST', headers,
  body: JSON.stringify({ category: 'IR', requestNo: '0001', revisionNo: '00', status: 'P' }),
});
check('duplicate rejected (409)', dupRes.status === 409, dupRes.status);

// 7. revision creation + status suggestion (P parent -> P)
const revRes = await fetch(`${base}/api/records/${rec.id}/revision`, { method: 'POST', headers });
const rev = await revRes.json();
check('create revision (new id)', revRes.status === 201 && rev.id && rev.id !== rec.id, rev);

// 8. C parent -> PP suggestion
const cRes = await fetch(`${base}/api/records`, {
  method: 'POST', headers,
  body: JSON.stringify({ category: 'IR', requestNo: '0002', revisionNo: '00', status: 'C' }),
});
const cRec = await cRes.json();
const revFromC = await fetch(`${base}/api/records/${cRec.id}/revision`, { method: 'POST', headers }).then((r) => r.json());
check('C parent suggests PP', revFromC.status === 'PP', revFromC);

// 9. patch record
const patchRes = await fetch(`${base}/api/records/${rec.id}`, {
  method: 'PATCH', headers,
  body: JSON.stringify({ status: 'B', description: 'Smoke IR updated' }),
});
const patched = await patchRes.json();
check('patch record', patchRes.status === 200 && patched.status === 'B', patched);

// 10. files: no hyperlink -> 404
const fileRes = await fetch(`${base}/api/files/${rec.id}`, { headers });
check('files 404 when no hyperlink', fileRes.status === 404, fileRes.status);

// 11. users: admin list + create engineer + forbidden delete
const usersRes = await fetch(`${base}/api/auth/users`, { headers });
const users = await usersRes.json();
check('users list (admin)', usersRes.status === 200 && Array.isArray(users), usersRes.status);
const newUserRes = await fetch(`${base}/api/auth/users`, {
  method: 'POST', headers,
  body: JSON.stringify({ username: 'eng1', password: 'pass1234', role: 'engineer' }),
});
check('create engineer user', newUserRes.status === 201, newUserRes.status);
const engLoginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'eng1', password: 'pass1234' }),
});
const engLogin = await engLoginRes.json();
const engHeaders = { authorization: `Bearer ${engLogin.token}`, 'content-type': 'application/json' };
const delAsEng = await fetch(`${base}/api/records/${rec.id}`, { method: 'DELETE', headers: engHeaders });
check('engineer cannot delete (403)', delAsEng.status === 403, delAsEng.status);
const delAsAdmin = await fetch(`${base}/api/records/${rec.id}`, { method: 'DELETE', headers });
check('admin can delete', delAsAdmin.status === 200, delAsAdmin.status);

// 12. wrong password -> 401
const badLogin = await fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'wrong' }),
});
check('wrong password rejected (401)', badLogin.status === 401, badLogin.status);

// 13. legacy: no legacy.db in temp dir -> 200 empty list; unknown key -> 404
const legacyRes = await fetch(`${base}/api/legacy`, { headers });
const legacyList = await legacyRes.json();
check('legacy sources list (200 array)', legacyRes.status === 200 && Array.isArray(legacyList), legacyRes.status);
const legacyBad = await fetch(`${base}/api/legacy/does-not-exist`, { headers });
check('legacy unknown source (404)', legacyBad.status === 404, legacyBad.status);

// 14. identifier engine — validation, parsing, cluster resolution
const valOk = await fetch(`${base}/api/identifier/validate?value=ARCH-IR-CL12-019`, { headers });
const valOkJ = await valOk.json();
check('identifier validate valid', valOk.status === 200 && valOkJ.ok === true, valOkJ);
const valBad = await fetch(`${base}/api/identifier/validate?value=NOT-A-CODE`, { headers });
const valBadJ = await valBad.json();
check('identifier validate invalid rejected', valBad.status === 200 && valBadJ.ok === false, valBadJ);
const parseRes = await fetch(`${base}/api/identifier/parse?value=ARCH-IR-CL12-019`, { headers });
const parseJ = await parseRes.json();
check('identifier parse components', parseJ.ok === true && parseJ.components?.category === 'ARCH' && parseJ.components?.fork === 'IR' && parseJ.components?.cluster === 'CL12' && parseJ.components?.requestNo === '019', parseJ);
const clusterRes = await fetch(`${base}/api/identifier/cluster?zone=C1`, { headers });
const clusterJ = await clusterRes.json();
check('identifier cluster resolves CL12', clusterJ.cluster === 'CL12', clusterJ);
const buildRes = await fetch(`${base}/api/identifier/build?category=IR&fork=ARCH&cluster=CL12&requestNo=019`, { headers });
const buildJ = await buildRes.json();
check('identifier build', buildJ.identifier === 'IR-ARCH-CL12-019', buildJ);

// 15. mapper resolve fallback (category-only)
const mapperResolve = await fetch(`${base}/api/mappers/resolve?category=IR`, { headers });
const mapperResolveJ = await mapperResolve.json();
check('mapper resolve returns ok', mapperResolve.status === 200 && mapperResolveJ.ok === true, mapperResolveJ);

// 15b. full-panel standalone HTML builder (ticket 132) — bilingual, cluster header
const { buildFullPanelHtml } = await import('../src/routes/reports.ts');
const panelHtml = buildFullPanelHtml({
  records: [{ category: 'IR', request_no: '0001', revision_no: '00', description: 'Smoke', zone: 'A', floor: 'Ground', engineer: '', fork: '', status: 'P', sent_date: '2026-01-01', hyperlink: '' }],
  meta: { name: 'Co', projectId: 'PRJ-01', projectName: 'Smoke Project', workingArea: 'Cluster 12', consultant: '', owner: '', ownerDelegate: '', logoDataUrl: '', consultantLogoDataUrl: '', ownerLogoDataUrl: '' },
  snap: { categories: [{ code: 'IR', name: 'IR' }], statuses: [{ code: 'P', slogan: 'Pending' }] },
  allForks: [], zones: [{ code: 'A', name: 'A' }], floors: [{ name: 'Ground' }],
  lang: 'en', cluster: 'CL12', includePdfs: false, generatedBy: 'admin', copied: 0, fontMode: 'inline', title: 'PRJ-01 CL12 Requests Log',
});
check('full-panel html builder (en)', panelHtml.includes('<!doctype html>') && panelHtml.includes('Smoke Project') && panelHtml.includes('0001') && panelHtml.includes('PRJ-01'), panelHtml.slice(0, 80));
const panelHtmlAr = buildFullPanelHtml({
  records: [{ category: 'IR', request_no: '0001', revision_no: '00', description: 'اختبار', zone: 'A', floor: 'Ground', engineer: '', fork: '', status: 'P', sent_date: '2026-01-01', hyperlink: '' }],
  meta: { name: 'ش', projectId: 'PRJ-01', projectName: 'مشروع تجريبي', workingArea: 'Cluster 12', consultant: '', owner: '', ownerDelegate: '', logoDataUrl: '', consultantLogoDataUrl: '', ownerLogoDataUrl: '' },
  snap: { categories: [{ code: 'IR', name: 'IR' }], statuses: [{ code: 'P', slogan: 'Pending' }] },
  allForks: [], zones: [{ code: 'A', name: 'A' }], floors: [{ name: 'Ground' }],
  lang: 'ar', cluster: 'CL12', includePdfs: false, generatedBy: 'admin', copied: 0, fontMode: 'deps', title: 'PRJ-01 CL12 Requests Log',
});
check('full-panel html builder (ar, rtl, pdf viewer + pdfjs)', panelHtmlAr.includes('dir="rtl"') && panelHtmlAr.includes("deps/cairo-arabic-wght-normal.woff2") && panelHtmlAr.includes('deps/pdf.min.js') && panelHtmlAr.includes('openRecord'), panelHtmlAr.slice(0, 80));

// 16. clusters (ticket 131) — tree + default seed + admin-only writes
const clRes = await fetch(`${base}/api/clusters`, { headers });
const clJ = await clRes.json();
check('clusters list returns CL12 default', clRes.status === 200 && clJ.clusters?.length >= 1, clJ);
const defaultCl = clJ.clusters?.find((c) => c.code === 'CL12');
check('CL12 is default with tree', defaultCl && defaultCl.is_default === 1 && Array.isArray(defaultCl.zones) && Array.isArray(defaultCl.floors), defaultCl);
check('CL12 tree populated', defaultCl && defaultCl.zones.length === 8 && defaultCl.floors.length >= 1, defaultCl && { z: defaultCl.zones.length, f: defaultCl.floors.length });
check('CL12 recordCount reflects cluster records', defaultCl && defaultCl.recordCount >= 0 && typeof defaultCl.recordCount === 'number', defaultCl?.recordCount);
const cl2Res = await fetch(`${base}/api/clusters`, {
  method: 'POST', headers,
  body: JSON.stringify({ code: 'CL13', name: 'Cluster 13', projectName: 'Test Project' }),
});
check('admin creates a cluster', cl2Res.status === 201, cl2Res.status);
const cl2BadRes = await fetch(`${base}/api/clusters`, {
  method: 'POST', headers,
  body: JSON.stringify({ code: 'CL12', name: 'Dup' }),
});
check('duplicate cluster rejected (409)', cl2BadRes.status === 409, cl2BadRes.status);
const engClRes = await fetch(`${base}/api/clusters`, {
  method: 'POST', headers: engHeaders,
  body: JSON.stringify({ code: 'CL14', name: 'Nope' }),
});
check('engineer cannot create cluster (403)', engClRes.status === 403, engClRes.status);

// --- Notify trash / restore / purge (ticket 134) ---
const ntCreate = await fetch(`${base}/api/notify`, {
  method: 'POST', headers,
  body: JSON.stringify({ title: 'Smoke notify', body: 'trash me', toUser: 'admin' }),
});
const nid = (await ntCreate.json()).id;
check('notify created', ntCreate.status === 201 && !!nid, nid);
const ntDeny = await fetch(`${base}/api/notify/${nid}`, { method: 'DELETE', headers: engHeaders });
check('engineer cannot trash others notify (403)', ntDeny.status === 403, ntDeny.status);
const ntTrash = await fetch(`${base}/api/notify/${nid}`, { method: 'DELETE', headers });
check('notify trashed (200)', ntTrash.status === 200, ntTrash.status);
const ntList = await fetch(`${base}/api/notify?scope=mine`, { headers });
const ntListJ = await ntList.json();
check('trashed notify excluded from active list', ntList.status === 200 && !ntListJ.items.some((n) => n.id === nid), ntListJ.items?.length);
const ntTrashList = await fetch(`${base}/api/notify/trash`, { headers });
const ntTrashJ = await ntTrashList.json();
check('trashed notify in trash list', ntTrashList.status === 200 && ntTrashJ.items.some((n) => n.id === nid), ntTrashJ.items?.length);
const ntRestore = await fetch(`${base}/api/notify/${nid}/restore`, { method: 'POST', headers });
check('notify restored (200)', ntRestore.status === 200, ntRestore.status);
const ntTrash2 = await fetch(`${base}/api/notify/${nid}`, { method: 'DELETE', headers });
check('notify re-trashed (200)', ntTrash2.status === 200, ntTrash2.status);
const ntPurge = await fetch(`${base}/api/notify/${nid}/purge`, { method: 'DELETE', headers });
const ntPurgeJ = await ntPurge.json();
check('notify purged + metadata file', ntPurge.status === 200 && typeof ntPurgeJ.metadataFile === 'string' && ntPurgeJ.metadataFile.includes('purged-notify'), ntPurgeJ);
const ntPurgeGone = await fetch(`${base}/api/notify/trash`, { headers });
const ntPurgeJ2 = await ntPurgeGone.json();
check('purged notify gone from trash', ntPurgeGone.status === 200 && !ntPurgeJ2.items.some((n) => n.id === nid), ntPurgeJ2.items?.length);

server.close();
db.close();
console.log(`\nSMOKE RESULT: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error('FAILURES:', failures.join(', ')); process.exit(1); }
