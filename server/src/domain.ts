// Domain constants — single source of truth, mirrors F:\Tables.xlsx
// Sheet "ورقة1": zones, floors, categories, statuses, file buckets
// Sheet "Sheet1": per-category column templates
// Sheet "Sheet2": IR cycle map

export type StatusCode =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'SS'
  | 'PP'
  | 'P'
  | 'SC'
  | 'Skipped'
  | 'Canceled';

export type BucketCode = 'open' | 'pending' | 'sc' | 'noRecord' | 'superSeeded';

export interface CategoryDef {
  code: string;
  name: string;
  description: string;
  /** Discipline forks (empty = none, per Sheet1 "Forks" column) */
  forks: string[];
  /** Typical columns (Sheet "Sheet1") — field keys rendered in forms/tables */
  columns: string[];
}

export interface StatusDef {
  code: StatusCode;
  slogan: string;
  description: string;
  bucket: BucketCode;
}

export interface ZoneDef {
  code: string;
  name: string;
  /** Arabic delegate (ticket 068) — shown when the site language is AR. */
  nameAr: string;
  /** Cluster the zone belongs to — all zones refer to Cluster 12 (ticket 038). */
  cluster: string;
}

export const ZONES: ZoneDef[] = [
  { code: 'A', name: 'Building A', nameAr: 'A', cluster: 'CL12' },
  { code: 'A1', name: 'Building A1', nameAr: 'A1', cluster: 'CL12' },
  { code: 'B', name: 'Building B', nameAr: 'B', cluster: 'CL12' },
  { code: 'B1', name: 'Building B1', nameAr: 'B1', cluster: 'CL12' },
  { code: 'C', name: 'Building C', nameAr: 'C', cluster: 'CL12' },
  { code: 'C1', name: 'Building C1', nameAr: 'C\\', cluster: 'CL12' },
  { code: 'PLAZA', name: 'In-site PLAZA', nameAr: 'PLAZA', cluster: 'CL12' },
  { code: 'CL12', name: 'Cluster 12', nameAr: 'CL12', cluster: 'CL12' },
];

export const FLOORS: string[] = [
  'SOG',
  'Basement',
  'Ground',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  '"C, C1" Special',
  'Roof',
  'Upper Roof',
  'Elevation 01',
  'Elevation 02',
  'Elevation 03',
  'Elevation 04',
];

/** Arabic floor delegates (ticket 068) — First = الأول, Roof = الرووف, etc. */
export const FLOOR_NAMES_AR: Record<string, string> = {
  SOG: 'SOG',
  Basement: 'البدروم',
  Ground: 'الأرضي',
  First: 'الأول',
  Second: 'الثاني',
  Third: 'الثالث',
  Fourth: 'الرابع',
  Fifth: 'الخامس',
  Sixth: 'السادس',
  '"C, C1" Special': '"C, C1" خاص',
  Roof: 'الرووف',
  'Upper Roof': 'Upper Roof',
  'Elevation 01': 'Elevation 01',
  'Elevation 02': 'Elevation 02',
  'Elevation 03': 'Elevation 03',
  'Elevation 04': 'Elevation 04',
};

/**
 * Default roles (ticket 044 — user concept): fixed, no changes.
 * Members of REQUEST_ROLES (active only) can be added to request metadata;
 * Dev (its own tier above admins) and Document Controller (admin) are excluded from that
 * list — they are management roles, not request participants. Names are
 * stored bare (no Mr/Ms/Mrs/Eng prefix) per ticket 058.
 */
export const DEFAULT_ROLES: string[] = [
  'Project Manager',
  'Executive Manager',
  'Site Engineer',
  'Technical Office Engineer',
  'Electrician',
  'Site Manager',
  'Quality Engineer',
  'Document Controller',
  'Dev',
  'Warehouse Keeper',
  'Accountant',
];

export const REQUEST_ROLES: string[] = DEFAULT_ROLES.filter((r) => r !== 'Dev' && r !== 'Document Controller');

export const FORKS_ALL = ['SUR', 'STR', 'ARCH', 'ELEC', 'MECH-FIRE', 'MECH-PLUMB', 'LAND'];
const FORKS_ASBUILT = [
  'SUR', 'STR', 'ARCH', 'ELEC', 'MECH-FIRE', 'MECH-PLUMB', 'LAND',
  'Asbuilt-SUR', 'Asbuilt-STR', 'Asbuilt-ARCH', 'Asbuilt-ELEC',
  'Asbuilt-MECH-FIRE', 'Asbuilt-MECH-PLUMB',
];

const COLS_STD = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor', 'engineer',
  'sentDate', 'replyDate', 'status', 'hyperlink',
];
const COLS_DATA_LINK = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor', 'engineer',
  'sentDate', 'replyDate', 'status', 'hyperlink', 'dataHyperlink',
];
// Normal request WITH a fork (e.g. RFI): contractor sends (sentDate),
// consultant replies (replyDate) — NOT the NCR-inverted pair. (ticket 136)
export const COLS_RFI = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor', 'fork', 'engineer',
  'sentDate', 'replyDate',
  'status', 'hyperlink',
];
// NCR is inverted: consultant sends (sentByConsultantDate), contractor replies
// (replyByContractorDate). No sentDate/replyDate. (ticket 136)
export const COLS_NCR = [
  'requestNo', 'revisionNo', 'description', 'zone', 'floor', 'fork', 'engineer',
  'sentByConsultantDate', 'replyByContractorDate',
  'status', 'hyperlink',
];

export const CATEGORIES: CategoryDef[] = [
  { code: 'IR', name: 'Inspection Request', description: 'Inscpection Request', forks: FORKS_ALL, columns: COLS_STD },
  { code: 'SD', name: 'Shop Drawing', description: 'Shop Drawing', forks: FORKS_ALL, columns: COLS_DATA_LINK },
  { code: 'QS', name: 'Quantity Surveying', description: 'Quantity Surveying', forks: FORKS_ASBUILT, columns: COLS_DATA_LINK },
  { code: 'MIR', name: 'Material Inspection Request', description: 'Material Inscpection Request', forks: FORKS_ALL, columns: COLS_DATA_LINK },
  { code: 'MS', name: 'Material Quantity Survey', description: 'Material Quantity Survey', forks: FORKS_ALL, columns: COLS_DATA_LINK },
  { code: 'RFI', name: 'Request For Information', description: 'Request For Information', forks: FORKS_ALL, columns: COLS_RFI },
  { code: 'DR', name: 'Element Document Removal', description: 'Element Document Removal', forks: ['STR', 'ARCH'], columns: COLS_STD },
  { code: 'DS', name: 'Document Submission', description: 'Document Submission', forks: ['STR'], columns: COLS_STD },
  { code: 'NCR', name: 'Non-Confirmation Report', description: 'Non-Confirmation-Report', forks: ['STR', 'SUR', 'ARCH', 'ELEC', 'MECH-FIRE', 'MECH-PLUMB'], columns: COLS_NCR },
  { code: 'SO', name: 'Site Order', description: 'Site Order', forks: [], columns: ['orderNo', 'description', 'sentDate', 'hyperlink', 'status'] },
  { code: 'QC', name: 'Quality Control', description: 'Quality Control', forks: [], columns: COLS_STD },
  { code: 'CBR', name: 'Concrete Batching Request', description: 'Concrete Bacthing Request', forks: [], columns: COLS_STD },
];

export const STATUSES: StatusDef[] = [
  {
    code: 'A',
    slogan: 'Approved',
    description: "Asbuilt \"Special\" — Obtained after Revisioning the Latest Revision with B or Getting A from 1st Revision \"00\".",
    bucket: 'open',
  },
  {
    code: 'B',
    slogan: 'Approved with Notes',
    description: "Obtained after Revisioning the Latest Revision with C or Getting B from 1st Revision \"00\".",
    bucket: 'open',
  },
  {
    code: 'C',
    slogan: 'Rejected with Notes',
    description: "Obtained after Revisioning the Latest Revision with C or Getting C from 1st Revision \"00\" — The Next Revision is set to be PP unless the admin pass it to be SC or P.",
    bucket: 'open',
  },
  {
    code: 'D',
    slogan: 'Rejected & Canceled',
    description: 'This Recorded Request No. with its Revision No. are Canceled.',
    bucket: 'noRecord',
  },
  {
    code: 'SS',
    slogan: 'Super Seeded',
    description: 'This Recorded Revision No. for this Request No. is either lost or not made at the first place (old seeded data has a lot of this).',
    bucket: 'superSeeded',
  },
  {
    code: 'PP',
    slogan: 'Postponed',
    description: 'This Recorded Revision No. for this Request No. has a past Revision with C and the Next Revision to be PP.',
    bucket: 'noRecord',
  },
  {
    code: 'P',
    slogan: 'Pending',
    description: 'This means the request is Packed with its Attachements and Printed and sent to the Consultant for Review and give status.',
    bucket: 'pending',
  },
  {
    code: 'SC',
    slogan: 'Scheduled',
    description: 'This means the request is Packed with its Attachements and Prepared to sent in a the "Sent Date Specified for it by the user".',
    bucket: 'sc',
  },
  {
    code: 'Skipped',
    slogan: 'Skipped',
    description: 'This Recorded Request No. with its Revision No. 00 got Skipped (old Seeded data issue).',
    bucket: 'noRecord',
  },
  {
    code: 'Canceled',
    slogan: 'Canceled',
    description: 'This Recorded Request No. was canceled before any response.',
    bucket: 'noRecord',
  },
];

/** File buckets: name + statuses (Sheet1 "Files" table). */
export const BUCKETS: Record<BucketCode, { name: string; statuses: StatusCode[] }> = {
  open: { name: 'Open Files', statuses: ['A', 'B', 'C'] },
  pending: { name: 'Pending Files', statuses: ['P'] },
  sc: { name: 'SC Files', statuses: ['SC'] },
  noRecord: { name: '"No Record"', statuses: ['PP', 'Skipped', 'D', 'Canceled'] },
  superSeeded: { name: '"SuperSeeded"', statuses: ['SS'] },
};

// IR Cycle map (Sheet "Sheet2") is DISCARDED per user (2026-08-13): do not use.
// CBR is a separate category from IR (uses the IR template, tied to Concrete).

export function getCategory(code: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.code === code);
}

export function getStatus(code: string): StatusDef | undefined {
  return STATUSES.find((s) => s.code === code);
}

export function getBucket(code: StatusCode): BucketCode {
  return getStatus(code)?.bucket ?? 'open';
}

export function isStatusCode(code: string): code is StatusCode {
  return STATUSES.some((s) => s.code === code);
}

/**
 * Request cycles (ticket 071, v3.1 items 38-39) — every request type has a
 * cycle; SO has NO checklist (order log); NCR follows its own lifecycle.
 * Server-authoritative; the Help Docs tab (ticket 072) documents these.
 */
export interface CycleStep {
  name: string;
  nameAr: string;
  hint: string;
}

export interface CycleDef {
  category: string;
  name: string;
  nameAr: string;
  steps: CycleStep[];
}

const REQUEST_CYCLE: CycleStep[] = [
  { name: 'Create', nameAr: 'إنشاء', hint: 'Form → fyler PDF → record logged' },
  { name: 'Send', nameAr: 'إرسال', hint: 'Printed + sent to the consultant (status P)' },
  { name: 'Review', nameAr: 'مراجعة', hint: 'Consultant reviews the request' },
  { name: 'Grade', nameAr: 'تقييم', hint: 'A / B / C / D — C holds the next revision as PP' },
  { name: 'Close / Revise', nameAr: 'إغلاق / مراجعة', hint: 'A/B close; C → new revision (PP → P)' },
];

const NCR_CYCLE: CycleStep[] = [
  { name: 'Receive NCR', nameAr: 'استلام NCR', hint: 'Consultant issues the NCR' },
  { name: 'Scan + Log', nameAr: 'مسح + تسجيل', hint: 'Logged as NCR with status Pending' },
  { name: 'Informed', nameAr: 'إبلاغ', hint: 'Wall card — pending NCR is URGENT' },
  { name: 'Reply', nameAr: 'رد', hint: 'Reply printed with the NCR as attachment' },
  { name: 'Grade', nameAr: 'تقييم', hint: 'A/B/C/D — C → next 01 is PP (URGENT)' },
];

export const CYCLES: CycleDef[] = [
  { category: 'IR', name: 'Inspection Request Cycle', nameAr: 'دورة طلب الفحص', steps: REQUEST_CYCLE },
  { category: 'SD', name: 'Shop Drawing Cycle', nameAr: 'دورة المخططات التنفيذية', steps: REQUEST_CYCLE },
  { category: 'QS', name: 'Quantity Surveying Cycle', nameAr: 'دورة حصر الكميات', steps: REQUEST_CYCLE },
  { category: 'MIR', name: 'Material Inspection Cycle', nameAr: 'دورة فحص المواد', steps: REQUEST_CYCLE },
  { category: 'MS', name: 'Material Quantity Cycle', nameAr: 'دورة كميات المواد', steps: REQUEST_CYCLE },
  { category: 'RFI', name: 'Request For Information Cycle', nameAr: 'دورة طلب المعلومات', steps: REQUEST_CYCLE },
  { category: 'DR', name: 'Document Removal Cycle', nameAr: 'دورة إزالة المستندات', steps: REQUEST_CYCLE },
  { category: 'DS', name: 'Document Submission Cycle', nameAr: 'دورة تسليم المستندات', steps: REQUEST_CYCLE },
  { category: 'NCR', name: 'NCR Lifecycle', nameAr: 'دورة NCR', steps: NCR_CYCLE },
  { category: 'QC', name: 'Quality Control Cycle', nameAr: 'دورة مراقبة الجودة', steps: REQUEST_CYCLE },
  { category: 'CBR', name: 'Concrete Batching Cycle', nameAr: 'دورة الخرسانة', steps: REQUEST_CYCLE },
  // SO = order log — NO checklist, NO cycle (v3.1 item 38).
];

/**
 * Scan machine catalog (ticket 067) — series-based, per brand, with the
 * scanner + print driver metadata for each model. Xerox = the Network
 * Scanning Utility 3 family (researched from Xerox support docs 2026-08-18);
 * Kyocera/others = their standard TWAIN/WIA + PCL6 driver stacks.
 * Server-authoritative; the user can add custom printers (DB).
 */
export interface ScanModelDef {
  model: string;
  scannerDriver: string;
  printDriver: string;
}

export interface ScanSeriesDef {
  brand: string;
  series: string;
  models: ScanModelDef[];
}

const XEROX_SCAN = 'Xerox Network Scanning Utility 3 (TWAIN)';

export const SCAN_SERIES: ScanSeriesDef[] = [
  {
    brand: 'Xerox',
    series: '53XX',
    models: [
      { model: 'WorkCentre 5325', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 53XX PCL6' },
      { model: 'WorkCentre 5330', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 53XX PCL6' },
      { model: 'WorkCentre 5335', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 53XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '56XX',
    models: [
      { model: 'WorkCentre 5632', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5638', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5645', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5655', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5665', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5675', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
      { model: 'WorkCentre 5687', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 56XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '57XX',
    models: [
      { model: 'WorkCentre 5735', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5740', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5745', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5755', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5765', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5775', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
      { model: 'WorkCentre 5790', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 57XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '58XX',
    models: [
      { model: 'WorkCentre 5845', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 58XX PCL6' },
      { model: 'WorkCentre 5855', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 58XX PCL6' },
      { model: 'WorkCentre 5865', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 58XX PCL6' },
      { model: 'WorkCentre 5875', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 58XX PCL6' },
      { model: 'WorkCentre 5890', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 58XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '59XX',
    models: [
      { model: 'WorkCentre 5945', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 59XX PCL6' },
      { model: 'WorkCentre 5955', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 59XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '64XX',
    models: [
      { model: 'WorkCentre 6400', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 64XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '66XX',
    models: [
      { model: 'WorkCentre 6605', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 66XX PCL6' },
      { model: 'WorkCentre 6655', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 66XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '72XX',
    models: [
      { model: 'WorkCentre 7220', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7225', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7228', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7232', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7235', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7242', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
      { model: 'WorkCentre 7245', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 72XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '73XX',
    models: [
      { model: 'WorkCentre 7328', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 73XX PCL6' },
      { model: 'WorkCentre 7335', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 73XX PCL6' },
      { model: 'WorkCentre 7345', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 73XX PCL6' },
      { model: 'WorkCentre 7346', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 73XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '74XX',
    models: [
      { model: 'WorkCentre 7425', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 74XX PCL6' },
      { model: 'WorkCentre 7428', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 74XX PCL6' },
      { model: 'WorkCentre 7435', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 74XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '75XX',
    models: [
      { model: 'WorkCentre 7525', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 75XX PCL6' },
      { model: 'WorkCentre 7530', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 75XX PCL6' },
      { model: 'WorkCentre 7535', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 75XX PCL6' },
      { model: 'WorkCentre 7545', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 75XX PCL6' },
      { model: 'WorkCentre 7556', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 75XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '76XX',
    models: [
      { model: 'WorkCentre 7655', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 76XX PCL6' },
      { model: 'WorkCentre 7665', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 76XX PCL6' },
      { model: 'WorkCentre 7675', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 76XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '77XX',
    models: [
      { model: 'WorkCentre 7755', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 77XX PCL6' },
      { model: 'WorkCentre 7765', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 77XX PCL6' },
      { model: 'WorkCentre 7775', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 77XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '78XX',
    models: [
      { model: 'WorkCentre 7830', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 78XX PCL6' },
      { model: 'WorkCentre 7835', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 78XX PCL6' },
      { model: 'WorkCentre 7845', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 78XX PCL6' },
      { model: 'WorkCentre 7855', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 78XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: '79XX',
    models: [
      { model: 'WorkCentre 7970', scannerDriver: XEROX_SCAN, printDriver: 'Xerox WorkCentre 79XX PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: 'PrimeLink B9XXX',
    models: [
      { model: 'PrimeLink B9100', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink B9110', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink B9125', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink B9136', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
    ],
  },
  {
    brand: 'Xerox',
    series: 'PrimeLink C9XXX',
    models: [
      { model: 'PrimeLink C9065', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink C9070', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink C9075', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
      { model: 'PrimeLink C9080', scannerDriver: XEROX_SCAN, printDriver: 'Xerox PrimeLink PCL6' },
    ],
  },
  {
    brand: 'Kyocera',
    series: 'TASKalfa',
    models: [
      { model: 'TASKalfa 2320', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa 2321', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa 3010i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa 3551ci', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa 9003i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa MZ7500i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa MZ8500i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa MZ9500i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'TASKalfa MZ10500i', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
    ],
  },
  {
    brand: 'Kyocera',
    series: 'ECOSYS',
    models: [
      { model: 'ECOSYS MA2101cfx', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS MA2600cfx', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS MA3500cifx', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS MA4000cifx', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS M3145idn', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS M3655idn', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS FS-6525MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'ECOSYS FS-6530MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
    ],
  },
  {
    brand: 'Kyocera',
    series: 'FS',
    models: [
      { model: 'FS-1025MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-1120MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-1125MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-1135MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-C2626MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-C8520MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
      { model: 'FS-C8525MFP', scannerDriver: 'KYOCERA TWAIN/WIA driver', printDriver: 'KX driver (PCL6)' },
    ],
  },
  {
    brand: 'Canon',
    series: 'imageRUNNER',
    models: [
      { model: 'imageRUNNER 1730i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 2206i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 2600i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 2730i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 2925i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 3226i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 4525i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageRUNNER 4725i', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
    ],
  },
  {
    brand: 'Canon',
    series: 'imageCLASS',
    models: [
      { model: 'imageCLASS MF445dw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageCLASS MF453dw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageCLASS MF455dw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageCLASS MF515dw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageCLASS MF643Cdw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
      { model: 'imageCLASS MF753Cdw', scannerDriver: 'Canon ScanGear (TWAIN)', printDriver: 'Canon UFR II' },
    ],
  },
  {
    brand: 'HP',
    series: 'LaserJet MFP',
    models: [
      { model: 'LaserJet MFP M428fdw', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
      { model: 'LaserJet MFP M429fdw', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
      { model: 'LaserJet MFP M479fdw', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
      { model: 'LaserJet MFP M527dn', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
      { model: 'LaserJet MFP M636', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
      { model: 'LaserJet MFP M776', scannerDriver: 'HP Scan (WIA/TWAIN)', printDriver: 'HP PCL6' },
    ],
  },
  {
    brand: 'Ricoh',
    series: 'MP / IM',
    models: [
      { model: 'MP 2014', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'MP 301', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'MP 305', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'MP 4054', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'MP 5054', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'MP 6054', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'IM 2500', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
      { model: 'IM 3500', scannerDriver: 'Ricoh TWAIN', printDriver: 'Ricoh PCL6' },
    ],
  },
  {
    brand: 'Sharp',
    series: 'MX',
    models: [
      { model: 'MX-2640', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
      { model: 'MX-3040', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
      { model: 'MX-3540', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
      { model: 'MX-4070', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
      { model: 'MX-5070', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
      { model: 'MX-6070', scannerDriver: 'Sharpdesk (TWAIN)', printDriver: 'Sharp PCL6' },
    ],
  },
  {
    brand: 'Konica Minolta',
    series: 'bizhub',
    models: [
      { model: 'bizhub 215', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 227', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 287', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 367', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 450i', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 550i', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
      { model: 'bizhub 650i', scannerDriver: 'KM TWAIN', printDriver: 'KM PCL6' },
    ],
  },
  {
    brand: 'Toshiba',
    series: 'e-STUDIO',
    models: [
      { model: 'e-STUDIO 2303AM', scannerDriver: 'Toshiba TWAIN', printDriver: 'Toshiba PCL6' },
      { model: 'e-STUDIO 2508A', scannerDriver: 'Toshiba TWAIN', printDriver: 'Toshiba PCL6' },
      { model: 'e-STUDIO 3508A', scannerDriver: 'Toshiba TWAIN', printDriver: 'Toshiba PCL6' },
      { model: 'e-STUDIO 4508A', scannerDriver: 'Toshiba TWAIN', printDriver: 'Toshiba PCL6' },
      { model: 'e-STUDIO 5008A', scannerDriver: 'Toshiba TWAIN', printDriver: 'Toshiba PCL6' },
    ],
  },
  {
    brand: 'Brother',
    series: 'MFC',
    models: [
      { model: 'MFC-L2710DW', scannerDriver: 'Brother ControlCenter (TWAIN)', printDriver: 'Brother BR-Script' },
      { model: 'MFC-L2750DW', scannerDriver: 'Brother ControlCenter (TWAIN)', printDriver: 'Brother BR-Script' },
      { model: 'MFC-L3770CDW', scannerDriver: 'Brother ControlCenter (TWAIN)', printDriver: 'Brother BR-Script' },
      { model: 'MFC-J5330DW', scannerDriver: 'Brother ControlCenter (TWAIN)', printDriver: 'Brother BR-Script' },
      { model: 'MFC-J6930DW', scannerDriver: 'Brother ControlCenter (TWAIN)', printDriver: 'Brother BR-Script' },
    ],
  },
  {
    brand: 'Epson',
    series: 'WorkForce',
    models: [
      { model: 'WF-7310', scannerDriver: 'Epson Scan (TWAIN)', printDriver: 'Epson ESC/P-R' },
      { model: 'WF-7840', scannerDriver: 'Epson Scan (TWAIN)', printDriver: 'Epson ESC/P-R' },
      { model: 'WF-C5790', scannerDriver: 'Epson Scan (TWAIN)', printDriver: 'Epson ESC/P-R' },
      { model: 'WF-C8790', scannerDriver: 'Epson Scan (TWAIN)', printDriver: 'Epson ESC/P-R' },
    ],
  },
  {
    brand: 'Fujitsu',
    series: 'fi',
    models: [
      { model: 'fi-7160', scannerDriver: 'Fujitsu PaperStream (TWAIN)', printDriver: '—' },
      { model: 'fi-7260', scannerDriver: 'Fujitsu PaperStream (TWAIN)', printDriver: '—' },
      { model: 'fi-7460', scannerDriver: 'Fujitsu PaperStream (TWAIN)', printDriver: '—' },
      { model: 'fi-8170', scannerDriver: 'Fujitsu PaperStream (TWAIN)', printDriver: '—' },
    ],
  },
  {
    brand: 'Lexmark',
    series: 'MX',
    models: [
      { model: 'MX321', scannerDriver: 'Lexmark TWAIN', printDriver: 'Lexmark PCL6' },
      { model: 'MX421', scannerDriver: 'Lexmark TWAIN', printDriver: 'Lexmark PCL6' },
      { model: 'MX521', scannerDriver: 'Lexmark TWAIN', printDriver: 'Lexmark PCL6' },
      { model: 'MX622', scannerDriver: 'Lexmark TWAIN', printDriver: 'Lexmark PCL6' },
      { model: 'MX822', scannerDriver: 'Lexmark TWAIN', printDriver: 'Lexmark PCL6' },
    ],
  },
  {
    brand: 'OKI',
    series: 'MC',
    models: [
      { model: 'MC363', scannerDriver: 'OKI TWAIN', printDriver: 'OKI PCL6' },
      { model: 'MC573', scannerDriver: 'OKI TWAIN', printDriver: 'OKI PCL6' },
      { model: 'MC773', scannerDriver: 'OKI TWAIN', printDriver: 'OKI PCL6' },
    ],
  },
];
