export interface User {
  id: number;
  username: string;
  /** 'dev' = Dev (own tier, above admins), 'admin' = Document Controller/PM/TOE/EM, 'engineer' = rest. */
  role: 'dev' | 'admin' | 'engineer';
  jobRole?: string;
  firstName?: string;
  secondName?: string;
  firstNameAr?: string;
  secondNameAr?: string;
  createdAt: string;
  active?: boolean;
  passwordSet?: boolean;
}

export interface Category {
  code: string;
  name: string;
  description: string;
  forks: string[];
  columns: string[];
  hasTable?: boolean;
  hasChecklist?: boolean;
  hasCycle?: boolean;
  hasTemplate?: boolean;
  kind?: string;
}

export interface StatusDef {
  code: string;
  slogan: string;
  description: string;
  bucket: string;
}

export interface Zone {
  code: string;
  name: string;
  /** Arabic delegate (ticket 068) — shown when the site language is AR. */
  nameAr?: string;
  cluster?: string;
}

export interface BucketDef {
  name: string;
  statuses: string[];
}

export interface Meta {
  categories: Category[];
  statuses: StatusDef[];
  zones: Zone[];
  floors: string[];
  /** Arabic floor delegates (ticket 068) — keyed by floor name. */
  floorNamesAr?: Record<string, string>;
  buckets: Record<string, BucketDef>;
  /** Request cycles (ticket 071/072) — server-authoritative. */
  cycles?: CycleDef[];
}

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

export interface DcRecord {
  id: number;
  category: string;
  requestNo: string;
  revisionNo: string;
  description: string;
  zone: string;
  floor: string;
  engineer: string;
  fork: string;
  sentDate: string;
  sentByConsultantDate: string;
  replyDate: string;
  replyByContractorDate: string;
  status: string;
  hyperlink: string;
  dataHyperlink: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  dueDate: string;
}

export interface RecordsResponse {
  total: number;
  items: DcRecord[];
}

export interface LegacySourceInfo {
  key: string;
  kind: string;
  display: string;
  filePath: string;
  sheets: string;
  rows: number;
  note: string;
  sweptAt: string;
}

export interface LegacyRowInfo {
  id: number;
  sourceKey: string;
  sheet: string;
  rowNo: number;
  data: Record<string, string>;
}

export interface LegacyRowsResponse {
  total: number;
  items: LegacyRowInfo[];
}

export interface RecordsStats {
  total: number;
  byStatus: Record<string, number>;
  byBucket: Record<string, number>;
  byCategory: Record<string, number>;
  byZone: Record<string, number>;
  ncrUrgent: { pending: number; pp: number };
  reminders?: {
    overdue: Array<{ id: number; category: string; request_no: string; revision_no: string; description: string; due_date: string; status: string }>;
    dueSoon: Array<{ id: number; category: string; request_no: string; revision_no: string; description: string; due_date: string; status: string }>;
  };
}

export interface AppLog {
  id: number;
  actor: string;
  action: string;
  target: string;
  summary: string;
  createdAt: string;
}

export interface LogsResponse {
  total: number;
  items: AppLog[];
}
