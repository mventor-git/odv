import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Config } from './config.ts';
import { FLOORS, FLOOR_NAMES_AR, ZONES, FORKS_ALL, CATEGORIES, STATUSES, BUCKETS, CYCLES, COLS_RFI, COLS_NCR } from './domain.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('dev','admin','engineer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  token_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  request_no TEXT NOT NULL DEFAULT '',
  revision_no TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  engineer TEXT NOT NULL DEFAULT '',
  fork TEXT NOT NULL DEFAULT '',
  sent_date TEXT NOT NULL DEFAULT '',
  sent_by_consultant_date TEXT NOT NULL DEFAULT '',
  reply_date TEXT NOT NULL DEFAULT '',
  reply_by_contractor_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'P',
  hyperlink TEXT NOT NULL DEFAULT '',
  data_hyperlink TEXT NOT NULL DEFAULT '',
  parent_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT NOT NULL DEFAULT '',
  documents_json TEXT NOT NULL DEFAULT '[]',
  due_date TEXT NOT NULL DEFAULT ''
);

-- Uniqueness of category+request_no+revision_no applies to ACTIVE records only
-- (ticket 101): soft-deleted rows must not block re-creating the same number.
-- The old table-level UNIQUE spanned trashed rows too and crashed re-creation
-- with a 500. Existing databases are migrated by migrateRecordsActiveKeyUnique().
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_active_key
  ON records(category, request_no, revision_no) WHERE deleted_at = '';

CREATE INDEX IF NOT EXISTS idx_records_category ON records(category);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_zone ON records(zone);

-- Deleted rows are excluded from nearly every query. Composite indexes let
-- SQLite seek by the active filter + the common filter columns instead of
-- scanning the whole table (mventor-ticket-125).
CREATE INDEX IF NOT EXISTS idx_records_del_status ON records(deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_records_del_category ON records(deleted_at, category);
CREATE INDEX IF NOT EXISTS idx_records_del_zone ON records(deleted_at, zone);
CREATE INDEX IF NOT EXISTS idx_records_category_fork ON records(category, fork);

-- Arabic smart search (ticket 084): contentless FTS5 trigram index over the
-- searchable record fields. Trigram tokenizer gives Arabic + Latin substring
-- matching. Triggers keep it in sync with records; soft deletes (deleted_at)
-- stay searchable here but the outer query filters deleted_at = ''.
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
  category,
  request_no,
  revision_no,
  description,
  zone,
  floor,
  engineer,
  fork,
  status,
  hyperlink,
  content='',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS records_fts_ai AFTER INSERT ON records BEGIN
  INSERT INTO records_fts(rowid, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink)
  VALUES (new.id, new.category, new.request_no, new.revision_no, new.description, new.zone, new.floor, new.engineer, new.fork, new.status, new.hyperlink);
END;

CREATE TRIGGER IF NOT EXISTS records_fts_ad AFTER DELETE ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink)
  VALUES('delete', old.id, old.category, old.request_no, old.revision_no, old.description, old.zone, old.floor, old.engineer, old.fork, old.status, old.hyperlink);
END;

CREATE TRIGGER IF NOT EXISTS records_fts_au AFTER UPDATE OF category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink ON records BEGIN
  INSERT INTO records_fts(records_fts, rowid, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink)
  VALUES('delete', old.id, old.category, old.request_no, old.revision_no, old.description, old.zone, old.floor, old.engineer, old.fork, old.status, old.hyperlink);
  INSERT INTO records_fts(rowid, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink)
  VALUES (new.id, new.category, new.request_no, new.revision_no, new.description, new.zone, new.floor, new.engineer, new.fork, new.status, new.hyperlink);
END;

-- v2 schema (ticket 003): concrete/cement/SO/NCR engines. Excel is legacy/mirror.

CREATE TABLE IF NOT EXISTS concrete_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS concrete_loose (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station TEXT NOT NULL DEFAULT '',
  policy_no TEXT NOT NULL DEFAULT '',
  policy_date TEXT NOT NULL DEFAULT '',
  quantity_ton REAL NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT '',
  hyperlink TEXT NOT NULL DEFAULT '',
  canceled INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loose_station ON concrete_loose(station);

CREATE TABLE IF NOT EXISTS concrete_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station TEXT NOT NULL DEFAULT '',
  work_statement TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  quantity_m3 REAL NOT NULL DEFAULT 0,
  pour_date TEXT NOT NULL DEFAULT '',
  due_after_pour_qty REAL NOT NULL DEFAULT 0,
  due_after_pour_date TEXT NOT NULL DEFAULT '',
  due_1mo_qty REAL NOT NULL DEFAULT 0,
  due_1mo_date TEXT NOT NULL DEFAULT '',
  due_2mo_qty REAL NOT NULL DEFAULT 0,
  due_2mo_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  cbr_no TEXT NOT NULL DEFAULT '',
  mix_rate INTEGER NOT NULL DEFAULT 400,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_station ON concrete_batches(station);

CREATE TABLE IF NOT EXISTS packed_cement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS so_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL DEFAULT '',
  entry_date TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  hyperlink TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ncr_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ncr_no TEXT NOT NULL DEFAULT '',
  entry_date TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  hyperlink TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App activity log (ticket 009): every record write is logged for The Wall feed.
CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(id DESC);

-- Reference data lives in the DB (ticket 038/039 — no hardcoding): zones carry
-- their cluster; floors are the selectable list. Seeded once from domain.ts.
CREATE TABLE IF NOT EXISTS zones (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  cluster TEXT NOT NULL DEFAULT ''
);
-- Cluster = a project (ticket 131). Each cluster owns its project metadata and
-- a tree of zones + floors. Seeded once from the existing single-project state.
CREATE TABLE IF NOT EXISTS clusters (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  project_name_ar TEXT NOT NULL DEFAULT '',
  working_area TEXT NOT NULL DEFAULT '',
  consultant TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  owner_delegate TEXT NOT NULL DEFAULT '',
  logo_ext TEXT NOT NULL DEFAULT '',
  custom_metadata TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS floors (
  name TEXT PRIMARY KEY,
  cluster TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS engineers (
  name TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY
);

-- mventor-ticket-001: Org/Project foundation (additive; no route/seed/behavior change).
-- Organization = sovereignty boundary (owns people, policies, AI config).
-- Project = governed collaboration context (NOT owned by one org).
-- ScopeAssignment versions who-owns-what-slice over time; cluster_code stays
-- plain TEXT until the legacy clusters table is retired as source of truth.
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'contractor' CHECK (kind IN ('owner','consultant','contractor','external')),
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL DEFAULT 'contractor' CHECK (role IN ('owner','consultant','contractor','external')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, organization_id, role)
);
CREATE TABLE IF NOT EXISTS contract_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, code)
);
CREATE TABLE IF NOT EXISTS scope_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  contract_package_id INTEGER REFERENCES contract_packages(id),
  contractor_org_id INTEGER NOT NULL REFERENCES organizations(id),
  cluster_code TEXT NOT NULL DEFAULT '',
  discipline TEXT NOT NULL DEFAULT '',
  valid_from TEXT NOT NULL DEFAULT '',
  valid_to TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id INTEGER REFERENCES scope_assignments(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','handed_over')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scope_project ON scope_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_scope_contractor ON scope_assignments(contractor_org_id);

-- mventor-ticket-002: Requirement + ExecutionLot (additive; part 1 of the split).
-- Requirement = what must be accomplished per Protocol (Consultant-owned truth).
-- ExecutionLot = contractor-proposed partition of one requirement (e.g. 50
-- columns as 25+25); the number of lots/requests is an execution result, never
-- the baseline. Domain specifics live in payload_json — no construction nouns
-- in columns so the core stays reusable.
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  contract_package_id INTEGER REFERENCES contract_packages(id),
  scope_assignment_id INTEGER REFERENCES scope_assignments(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work','deliverable','inspection','test','document','other')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','closed','cancelled')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, code)
);
CREATE TABLE IF NOT EXISTS execution_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  proposed_by_org_id INTEGER NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  sequence INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','superseded','withdrawn')),
  supersedes_id INTEGER REFERENCES execution_lots(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (requirement_id, code)
);
CREATE INDEX IF NOT EXISTS idx_req_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_lot_requirement ON execution_lots(requirement_id);

-- mventor-ticket-003: Case + Task (additive; part 2a — internal-organization side).
-- Case = business context grouping tasks/requests/reviews/tests/evidence/decisions.
-- Task = instruction to an org (person-level assignment arrives with the identity
-- model). project_id is a direct anchor so work queues never need a case join;
-- case_id stays NULLABLE because dispatch may precede case formation.
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'work_package' CHECK (kind IN ('work_package','submittal_package','inspection_batch','exception','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','cancelled')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, code)
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  case_id INTEGER REFERENCES cases(id),
  requirement_id INTEGER REFERENCES requirements(id),
  execution_lot_id INTEGER REFERENCES execution_lots(id),
  assignee_org_id INTEGER REFERENCES organizations(id),
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','done','verified','cancelled')),
  due_date TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_project ON cases(project_id);
CREATE INDEX IF NOT EXISTS idx_task_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_case ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_org_id);

-- mventor-ticket-004: Submission + Evidence (additive; part 2b — cross-org side).
-- Submission = formal transaction to another party (future home of records rows;
-- cutover is a later ticket, never silent). type is deliberately unchecked TEXT:
-- request types become per-Protocol config (BACKLOG #3). status encodes the
-- generic machine; per-type transition rules come later.
-- Evidence = proof attachable to ANY object, hence polymorphic subject
-- (subject_type+subject_id) instead of N nullable FKs. hash/file_ref are
-- reserved for the content-ID vault (BACKLOG #6).
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  case_id INTEGER REFERENCES cases(id),
  task_id INTEGER REFERENCES tasks(id),
  execution_lot_id INTEGER REFERENCES execution_lots(id),
  submitted_by_org_id INTEGER NOT NULL REFERENCES organizations(id),
  submitted_to_org_id INTEGER REFERENCES organizations(id),
  type TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  revision_no TEXT NOT NULL DEFAULT '00',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','approved_as_noted','revise_resubmit','rejected','partially_accepted','split_required','closed','superseded','withdrawn')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, type, number, revision_no)
);
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  subject_type TEXT NOT NULL DEFAULT '',
  subject_id INTEGER NOT NULL DEFAULT 0,
  captured_by_org_id INTEGER REFERENCES organizations(id),
  kind TEXT NOT NULL DEFAULT 'document' CHECK (kind IN ('photo','document','test_result','measurement','delivery_note','certificate','drawing','other')),
  hash TEXT NOT NULL DEFAULT '',
  file_ref TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_sub_lot ON submissions(execution_lot_id);
CREATE INDEX IF NOT EXISTS idx_ev_subject ON evidence(subject_type, subject_id);

-- mventor-ticket-007: Identity model (additive; GAP-IDENT foundation half).
-- Person ≠ job title ≠ project role. persons = bare identity (no PII, no org FK).
-- Authority flows: membership (employment fact) → role_assignment (project authority
-- in a scope/time window) → delegation (time-boxed transfer with reason).
-- Expiry is DERIVED from valid_to in queries — never by rewriting history rows.
-- Assignment scope stays TEXT until structured scope objects land (same precedent
-- as scope_assignment.cluster_code). Support-mode actor fields arrive with
-- GAP-SUPPORT, not here.
CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS org_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  job_title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (person_id, organization_id)
);
CREATE TABLE IF NOT EXISTS project_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, code)
);
CREATE TABLE IF NOT EXISTS role_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  project_role_id INTEGER NOT NULL REFERENCES project_roles(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  scope TEXT NOT NULL DEFAULT '',
  valid_from TEXT NOT NULL DEFAULT '',
  valid_to TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS delegations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_assignment_id INTEGER NOT NULL REFERENCES role_assignments(id),
  to_person_id INTEGER NOT NULL REFERENCES persons(id),
  reason TEXT NOT NULL DEFAULT '',
  valid_from TEXT NOT NULL DEFAULT '',
  valid_to TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assign_person ON role_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_assign_role ON role_assignments(project_role_id);
CREATE INDEX IF NOT EXISTS idx_deleg_from ON delegations(from_assignment_id);

-- mventor-ticket-008: Append-only audit trail (additive; GAP-AUDIT foundation half).
-- Every important action is a fact row: who (person/org/role-context; NULL person =
-- system actor) × where (project) × what (polymorphic subject) × action × why.
-- Rows are facts, never state — no status column. Corrections are compensating
-- rows, never rewrites: the triggers below ABORT any UPDATE/DELETE at the DB
-- level (same trigger mechanism as records_fts_*, opposite intent).
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER REFERENCES persons(id),
  organization_id INTEGER REFERENCES organizations(id),
  role_context TEXT NOT NULL DEFAULT '',
  project_id INTEGER REFERENCES projects(id),
  subject_type TEXT NOT NULL DEFAULT '',
  subject_id INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id);

-- mventor-ticket-009: Material/resource domain (additive; GAP-MAT domain half).
-- Materials are execution resources, not stock numbers: definition (what it is,
-- project catalog) → lot (which batch/delivery, whose supply) → events (where
-- it moved / how it was consumed). Inspection is NOT an event kind — it lives
-- in submissions (MIR) + evidence, linked via material_events.evidence_id.
-- No balances, no prices, no GL: ODV answers "what evidence supports this
-- quantity", never accounting. Consumption→execution linkage stays in payload
-- until the enforcement API types it.
CREATE TABLE IF NOT EXISTS material_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, code)
);
CREATE TABLE IF NOT EXISTS material_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  def_id INTEGER NOT NULL REFERENCES material_defs(id),
  code TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  source_kind TEXT NOT NULL DEFAULT 'contractor_supplied' CHECK (source_kind IN ('contractor_supplied','owner_supplied')),
  supplier_org_id INTEGER REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','received','accepted','rejected','consumed','returned','wasted')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (def_id, code)
);
CREATE TABLE IF NOT EXISTS material_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL REFERENCES material_lots(id),
  kind TEXT NOT NULL DEFAULT 'receipt' CHECK (kind IN ('purchase','receipt','storage_transfer','consumption','return','waste')),
  quantity REAL NOT NULL DEFAULT 0,
  from_ref TEXT NOT NULL DEFAULT '',
  to_ref TEXT NOT NULL DEFAULT '',
  evidence_id INTEGER REFERENCES evidence(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lot_def ON material_lots(def_id);
CREATE INDEX IF NOT EXISTS idx_evt_lot ON material_events(lot_id);

-- User-added scan machines (ticket 067) — the built-in catalog lives in
-- domain.ts (SCAN_SERIES); admins can add custom printers here.
CREATE TABLE IF NOT EXISTS scan_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  scanner_driver TEXT NOT NULL DEFAULT '',
  print_driver TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App settings (ticket 069) — site identity and other key/value settings.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Help Docs notes (ticket 072) — users keep date-based notes about the program.
CREATE TABLE IF NOT EXISTS app_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Help Docs content (ticket 093) — editable structured doc: sections (Big
-- Headers) → headers → bullets. Admin edits; engineers read.
CREATE TABLE IF NOT EXISTS help_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'bullet',
  en TEXT NOT NULL DEFAULT '',
  ar TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Vault notifications (ticket 073) — notes that notify users, attachable to
-- any element, with a date; notified/responded labels; logs for admins.
CREATE TABLE IF NOT EXISTS app_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    notify_date TEXT NOT NULL DEFAULT '',
    to_user TEXT NOT NULL DEFAULT '',
    from_user TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    response TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    notified_at TEXT NOT NULL DEFAULT '',
    responded_at TEXT NOT NULL DEFAULT '',
    table_json TEXT NOT NULL DEFAULT '',
    deleted_at TEXT NOT NULL DEFAULT ''
  );

-- V5-002: artifact tracking — every generated fyler/report/checklist is
-- registered here with an ID, version linkage, and file metadata.
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_type TEXT NOT NULL DEFAULT 'fyler',
  record_id INTEGER,
  category TEXT NOT NULL DEFAULT '',
  template_version_id INTEGER,
  mapping_version_id INTEGER,
  file_path TEXT NOT NULL DEFAULT '',
  file_sha256 TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- V5-003: explicit migration tracking — each numbered migration runs at most once.
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- V5-004: domain registry tables — owner-configurable business rules.
-- These replace hardcoded domain.ts constants as the runtime source of truth.

CREATE TABLE IF NOT EXISTS domain_categories (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  forks_json TEXT NOT NULL DEFAULT '[]',
  columns_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL DEFAULT 'request',
  has_checklist INTEGER NOT NULL DEFAULT 1,
  has_cycle INTEGER NOT NULL DEFAULT 1,
  has_template INTEGER NOT NULL DEFAULT 1,
  has_table INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS domain_statuses (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  slogan_en TEXT NOT NULL DEFAULT '',
  slogan_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  bucket TEXT NOT NULL DEFAULT 'open',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS domain_buckets (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domain_forks (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domain_cycles (
  category_code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domain_cycle_steps (
  cycle_category TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  hint_en TEXT NOT NULL DEFAULT '',
  hint_ar TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cycle_category, step_order)
);

CREATE TABLE IF NOT EXISTS domain_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  category_code TEXT,
  allowed INTEGER NOT NULL DEFAULT 1,
  requires_admin INTEGER NOT NULL DEFAULT 0,
  creates_revision INTEGER NOT NULL DEFAULT 0,
  creates_pp_placeholder INTEGER NOT NULL DEFAULT 0,
  requires_due_date INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domain_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_code TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label_en TEXT NOT NULL DEFAULT '',
  label_ar TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- V5-008..015: template/mapper/artifact engine
CREATE TABLE IF NOT EXISTS template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  filename TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL DEFAULT '',
  file_sha256 TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  source_name TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_version_id INTEGER,
  category TEXT NOT NULL,
  fork TEXT NOT NULL DEFAULT '',
  mapping_json TEXT NOT NULL DEFAULT '{}',
  version_no INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS template_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  effective_to TEXT
);

CREATE TABLE IF NOT EXISTS artifact_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER,
  category TEXT NOT NULL DEFAULT '',
  template_version_id INTEGER,
  mapping_version_id INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  file_sha256 TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  worker_heartbeat TEXT
);

-- V5-016..018: permissions
CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- V5-026: cement extensions (Amendment 4)
CREATE TABLE IF NOT EXISTS concrete_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER,
  station TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  quantity_ton REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT '',
  received_qty REAL NOT NULL DEFAULT 0,
  received_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS concrete_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  attachment_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- V5-027: labor (Phase1 import)
CREATE TABLE IF NOT EXISTS labor_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  row_count INTEGER NOT NULL DEFAULT 0,
  file_sha256 TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS labor_workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS labor_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER,
  work_date TEXT NOT NULL DEFAULT '',
  hours REAL NOT NULL DEFAULT 0,
  zone TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  activity TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_row INTEGER,
  import_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Migration (ticket 101): replace the records table-level UNIQUE(category,
 *  request_no, revision_no) with a partial unique index over ACTIVE rows only
 *  (deleted_at = ''). Soft-deleted (trashed) rows must not block re-creating
 *  the same record number. SQLite cannot drop a table constraint in place, so
 *  the table is rebuilt: rename old -> recreate from SCHEMA -> copy by column
 *  name -> drop old. The FTS virtual table is dropped and rebuilt through the
 *  re-created insert trigger during the copy, guaranteeing a consistent index.
 *  Runs before db.exec(SCHEMA) in ensureSchema; boot backups cover the risk. */
function migrateRecordsActiveKeyUnique(db: DatabaseSync): void {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='records'").get();
  if (!exists) return; // fresh database — SCHEMA creates the correct shape
  const idxList = db.prepare('PRAGMA index_list(records)').all() as unknown as Array<{
    name: string;
    origin: string;
  }>;
  if (!idxList.some((i) => i.origin === 'u')) return; // already migrated
  console.log('[odv] Migrating records: table UNIQUE -> partial unique index (active rows only)...');
  const oldCols = (
    db.prepare('PRAGMA table_info(records)').all() as unknown as Array<{ name: string }>
  ).map((c) => `"${c.name}"`);
  db.exec('BEGIN');
  try {
    db.exec('DROP TRIGGER IF EXISTS records_fts_ai');
    db.exec('DROP TRIGGER IF EXISTS records_fts_ad');
    db.exec('DROP TRIGGER IF EXISTS records_fts_au');
    db.exec('DROP TABLE IF EXISTS records_fts');
    db.exec('ALTER TABLE records RENAME TO records_old_keymig');
    db.exec(SCHEMA); // recreates records (no table UNIQUE), indexes, empty FTS, triggers
    // Copy by the columns present in BOTH tables — a column that only exists
    // on the old table (e.g. added by an earlier ALTER migration) is re-added
    // with its default by ensureSchema's own ALTER checks right after this.
    const newCols = new Set(
      (db.prepare('PRAGMA table_info(records)').all() as unknown as Array<{ name: string }>).map(
        (c) => `"${c.name}"`,
      ),
    );
    const colList = oldCols.filter((c) => newCols.has(c)).join(', ');
    db.exec(
      `INSERT INTO records (${colList}) SELECT ${colList} FROM records_old_keymig`,
    ); // insert trigger repopulates the FTS index exactly once per row
    db.exec('DROP TABLE records_old_keymig');
    db.exec('COMMIT');
    console.log('[odv] Records uniqueness migration complete.');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** V5-003: Current migration level. New databases start here — they get all
 *  tables created by SCHEMA and skip the numbered migrations below. */
const CURRENT_VERSION = 34;

/** V5-003: Named migration list. Each entry runs at most once, tracked in
 *  schema_version. Order matters — later migrations may depend on earlier ones. */
const MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  { version: 1, name: 'records-deleted_at', sql: "ALTER TABLE records ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''" },
  { version: 2, name: 'records-documents_json', sql: "ALTER TABLE records ADD COLUMN documents_json TEXT NOT NULL DEFAULT '[]'" },
  { version: 3, name: 'zones-name_ar', sql: "ALTER TABLE zones ADD COLUMN name_ar TEXT NOT NULL DEFAULT ''" },
  { version: 4, name: 'floors-name_ar', sql: "ALTER TABLE floors ADD COLUMN name_ar TEXT NOT NULL DEFAULT ''" },
  { version: 5, name: 'users-password_set', sql: 'ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 1' },
  { version: 6, name: 'users-job_role', sql: "ALTER TABLE users ADD COLUMN job_role TEXT NOT NULL DEFAULT ''" },
  { version: 7, name: 'users-first_name', sql: "ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''" },
  { version: 8, name: 'users-second_name', sql: "ALTER TABLE users ADD COLUMN second_name TEXT NOT NULL DEFAULT ''" },
  { version: 9, name: 'users-first_name_ar', sql: "ALTER TABLE users ADD COLUMN first_name_ar TEXT NOT NULL DEFAULT ''" },
  { version: 10, name: 'users-second_name_ar', sql: "ALTER TABLE users ADD COLUMN second_name_ar TEXT NOT NULL DEFAULT ''" },
  { version: 11, name: 'users-active', sql: 'ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1' },
  { version: 12, name: 'engineers-metadata', sql: `ALTER TABLE engineers ADD COLUMN role TEXT NOT NULL DEFAULT ''; ALTER TABLE engineers ADD COLUMN specialty TEXT NOT NULL DEFAULT ''; ALTER TABLE engineers ADD COLUMN specialty2 TEXT NOT NULL DEFAULT ''; ALTER TABLE engineers ADD COLUMN period_from TEXT NOT NULL DEFAULT ''; ALTER TABLE engineers ADD COLUMN period_to TEXT NOT NULL DEFAULT ''; ALTER TABLE engineers ADD COLUMN active INTEGER NOT NULL DEFAULT 1` },
  { version: 13, name: 'engineers-title', sql: "ALTER TABLE engineers ADD COLUMN title TEXT NOT NULL DEFAULT 'Mr'" },
  { version: 14, name: 'engineers-executive', sql: 'ALTER TABLE engineers ADD COLUMN executive INTEGER NOT NULL DEFAULT 0' },
  { version: 15, name: 'roles-bilingual-star', sql: "ALTER TABLE roles ADD COLUMN name_ar TEXT NOT NULL DEFAULT ''; ALTER TABLE roles ADD COLUMN star TEXT NOT NULL DEFAULT ''" },
  { version: 16, name: 'roles-alignment', sql: "UPDATE engineers SET role = 'Technical Office Engineer' WHERE role = 'Technical Office'" },
  { version: 17, name: 'strip-name-prefixes', sql: '' }, // handled programmatically below
  { version: 18, name: 'notify-table_json', sql: "ALTER TABLE app_notifications ADD COLUMN table_json TEXT NOT NULL DEFAULT ''" },
  { version: 19, name: 'records-due_date', sql: "ALTER TABLE records ADD COLUMN due_date TEXT NOT NULL DEFAULT ''" },
  { version: 20, name: 'domain-registry-seed', sql: '' }, // handled programmatically below
  { version: 21, name: 'template_mappings-fork', sql: "ALTER TABLE template_mappings ADD COLUMN fork TEXT NOT NULL DEFAULT ''" },
  { version: 22, name: 'add-dev-super-role', sql: '' }, // handled programmatically below
  { version: 23, name: 'clusters-table', sql: '' }, // handled programmatically (seed CL12)
  { version: 24, name: 'floors-cluster', sql: '' }, // handled programmatically (ALTER + backfill)
  { version: 25, name: 'project-id-identity', sql: '' }, // handled programmatically (project_id + logo ext keys)
  { version: 26, name: 'app_notifications-deleted_at', sql: "ALTER TABLE app_notifications ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''" },
  { version: 27, name: 'rfi-ncr-correct-columns', sql: '' }, // handled programmatically (RFI normal / NCR inverted)
  // mventor-ticket-001: Org/Project foundation for existing DBs (fresh DBs get
  // these from SCHEMA; CREATE IF NOT EXISTS keeps this idempotent either way).
  { version: 28, name: 'org-project-foundation', sql: `CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'contractor' CHECK (kind IN ('owner','consultant','contractor','external')), name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS project_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), organization_id INTEGER NOT NULL REFERENCES organizations(id), role TEXT NOT NULL DEFAULT 'contractor' CHECK (role IN ('owner','consultant','contractor','external')), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, organization_id, role)); CREATE TABLE IF NOT EXISTS contract_packages (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, code)); CREATE TABLE IF NOT EXISTS scope_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), contract_package_id INTEGER REFERENCES contract_packages(id), contractor_org_id INTEGER NOT NULL REFERENCES organizations(id), cluster_code TEXT NOT NULL DEFAULT '', discipline TEXT NOT NULL DEFAULT '', valid_from TEXT NOT NULL DEFAULT '', valid_to TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, supersedes_id INTEGER REFERENCES scope_assignments(id), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','handed_over')), created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_scope_project ON scope_assignments(project_id); CREATE INDEX IF NOT EXISTS idx_scope_contractor ON scope_assignments(contractor_org_id)` },
  // mventor-ticket-002: Requirement + ExecutionLot for existing DBs (fresh DBs
  // get these from SCHEMA; CREATE IF NOT EXISTS keeps this idempotent).
  { version: 29, name: 'requirement-lot-foundation', sql: `CREATE TABLE IF NOT EXISTS requirements (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), contract_package_id INTEGER REFERENCES contract_packages(id), scope_assignment_id INTEGER REFERENCES scope_assignments(id), code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work','deliverable','inspection','test','document','other')), status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','closed','cancelled')), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, code)); CREATE TABLE IF NOT EXISTS execution_lots (id INTEGER PRIMARY KEY AUTOINCREMENT, requirement_id INTEGER NOT NULL REFERENCES requirements(id), proposed_by_org_id INTEGER NOT NULL REFERENCES organizations(id), code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', sequence INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','superseded','withdrawn')), supersedes_id INTEGER REFERENCES execution_lots(id), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (requirement_id, code)); CREATE INDEX IF NOT EXISTS idx_req_project ON requirements(project_id); CREATE INDEX IF NOT EXISTS idx_lot_requirement ON execution_lots(requirement_id)` },
  // mventor-ticket-003: Case + Task for existing DBs (fresh DBs get these from
  // SCHEMA; CREATE IF NOT EXISTS keeps this idempotent).
  { version: 30, name: 'case-task-foundation', sql: `CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'work_package' CHECK (kind IN ('work_package','submittal_package','inspection_batch','exception','other')), status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','cancelled')), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, code)); CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), case_id INTEGER REFERENCES cases(id), requirement_id INTEGER REFERENCES requirements(id), execution_lot_id INTEGER REFERENCES execution_lots(id), assignee_org_id INTEGER REFERENCES organizations(id), title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','done','verified','cancelled')), due_date TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_case_project ON cases(project_id); CREATE INDEX IF NOT EXISTS idx_task_project ON tasks(project_id); CREATE INDEX IF NOT EXISTS idx_task_case ON tasks(case_id); CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_org_id)` },
  // mventor-ticket-004: Submission + Evidence for existing DBs (fresh DBs get
  // these from SCHEMA; CREATE IF NOT EXISTS keeps this idempotent).
  { version: 31, name: 'submission-evidence-foundation', sql: `CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), case_id INTEGER REFERENCES cases(id), task_id INTEGER REFERENCES tasks(id), execution_lot_id INTEGER REFERENCES execution_lots(id), submitted_by_org_id INTEGER NOT NULL REFERENCES organizations(id), submitted_to_org_id INTEGER REFERENCES organizations(id), type TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', revision_no TEXT NOT NULL DEFAULT '00', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','approved_as_noted','revise_resubmit','rejected','partially_accepted','split_required','closed','superseded','withdrawn')), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, type, number, revision_no)); CREATE TABLE IF NOT EXISTS evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), subject_type TEXT NOT NULL DEFAULT '', subject_id INTEGER NOT NULL DEFAULT 0, captured_by_org_id INTEGER REFERENCES organizations(id), kind TEXT NOT NULL DEFAULT 'document' CHECK (kind IN ('photo','document','test_result','measurement','delivery_note','certificate','drawing','other')), hash TEXT NOT NULL DEFAULT '', file_ref TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_sub_project ON submissions(project_id); CREATE INDEX IF NOT EXISTS idx_sub_lot ON submissions(execution_lot_id); CREATE INDEX IF NOT EXISTS idx_ev_subject ON evidence(subject_type, subject_id)` },
  // mventor-ticket-007: Identity model for existing DBs (fresh DBs get these
  // from SCHEMA; CREATE IF NOT EXISTS keeps this idempotent).
  { version: 32, name: 'identity-foundation', sql: `CREATE TABLE IF NOT EXISTS persons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS org_memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL REFERENCES persons(id), organization_id INTEGER NOT NULL REFERENCES organizations(id), job_title TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (person_id, organization_id)); CREATE TABLE IF NOT EXISTS project_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, code)); CREATE TABLE IF NOT EXISTS role_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL REFERENCES persons(id), project_role_id INTEGER NOT NULL REFERENCES project_roles(id), organization_id INTEGER NOT NULL REFERENCES organizations(id), scope TEXT NOT NULL DEFAULT '', valid_from TEXT NOT NULL DEFAULT '', valid_to TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')), created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS delegations (id INTEGER PRIMARY KEY AUTOINCREMENT, from_assignment_id INTEGER NOT NULL REFERENCES role_assignments(id), to_person_id INTEGER NOT NULL REFERENCES persons(id), reason TEXT NOT NULL DEFAULT '', valid_from TEXT NOT NULL DEFAULT '', valid_to TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')), created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_assign_person ON role_assignments(person_id); CREATE INDEX IF NOT EXISTS idx_assign_role ON role_assignments(project_role_id); CREATE INDEX IF NOT EXISTS idx_deleg_from ON delegations(from_assignment_id)` },
  // mventor-ticket-008: programmatic — trigger bodies contain semicolons so this
  // cannot go through the naive ';' splitter (see applyMigration).
  { version: 33, name: 'audit-trail', sql: '' },
  // mventor-ticket-009: material domain for existing DBs (fresh DBs get these
  // from SCHEMA; no semicolon-bearing bodies here so inline SQL is safe).
  { version: 34, name: 'material-foundation', sql: `CREATE TABLE IF NOT EXISTS material_defs (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, code)); CREATE TABLE IF NOT EXISTS material_lots (id INTEGER PRIMARY KEY AUTOINCREMENT, def_id INTEGER NOT NULL REFERENCES material_defs(id), code TEXT NOT NULL DEFAULT '', quantity REAL NOT NULL DEFAULT 0, source_kind TEXT NOT NULL DEFAULT 'contractor_supplied' CHECK (source_kind IN ('contractor_supplied','owner_supplied')), supplier_org_id INTEGER REFERENCES organizations(id), status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','received','accepted','rejected','consumed','returned','wasted')), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (def_id, code)); CREATE TABLE IF NOT EXISTS material_events (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES material_lots(id), kind TEXT NOT NULL DEFAULT 'receipt' CHECK (kind IN ('purchase','receipt','storage_transfer','consumption','return','waste')), quantity REAL NOT NULL DEFAULT 0, from_ref TEXT NOT NULL DEFAULT '', to_ref TEXT NOT NULL DEFAULT '', evidence_id INTEGER REFERENCES evidence(id), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_lot_def ON material_lots(def_id); CREATE INDEX IF NOT EXISTS idx_evt_lot ON material_events(lot_id)` },
];

/** V5-003: Get the current max version from schema_version. */
function getCurrentVersion(db: DatabaseSync): number {
  try {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0; // table doesn't exist yet
  }
}

/** V5-003: Apply a single migration, wrapping multi-statement SQL in a transaction.
 *  ALTER TABLE failures for "duplicate column" are expected on fresh databases
 *  (SCHEMA already creates the columns) — these are silently skipped. */
function applyMigration(db: DatabaseSync, migration: { version: number; name: string; sql: string }): void {
  // Version 17: programmatic prefix strip; Version 20: programmatic domain seed
  if (migration.version === 17) { applyPrefixStrip(db); return; }
  if (migration.version === 20) { seedDomainRegistry(db); return; }
  if (migration.version === 22) { addDevSuperRole(db); return; }
  if (migration.version === 23) { seedClusters(db); return; }
  if (migration.version === 24) { addFloorsCluster(db); return; }
  if (migration.version === 25) { seedProjectIdentity(db); return; }
  if (migration.version === 27) { fixRfiNcrColumns(db); return; }
  if (migration.version === 33) { applyAuditTrail(db); return; }
  if (!migration.sql) return;

  db.exec('BEGIN');
  try {
    const stmts = migration.sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      try {
        db.exec(stmt);
      } catch (err: unknown) {
        // Ignore "duplicate column name" — SCHEMA already created the column on fresh DBs
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate column')) continue;
        throw err; // re-throw real errors
      }
    }
    db.exec(`INSERT INTO schema_version (version, name) VALUES (${migration.version}, '${migration.name}')`);
    db.exec('COMMIT');
    console.log(`[odv] Migration ${migration.version} (${migration.name}) applied.`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** V5-ticket-117: Programmatic migration — ADD the "Dev" role as its own
 *  tier (above admins) alongside the existing "Document Controller" admin
 *  role (ticket 116 had intended a destructive rename; this corrects it to
 *  an additive change).
 *
 *  Model (confirmed against the live DB):
 *    - Document Controller = admin tier (same as Project Manager, Technical
 *      Office Engineer, Executive Manager)
 *    - Dev = its own tier, above all admins
  *    - Dev accounts are role-driven from the database (no hardcoded names).
  *
 *  Idempotent: if the "Dev" role already exists, it is a no-op beyond
 *  recording the migration version. */
const DEV_USERS: string[] = [];
const DEV_MEMBERS: string[] = [];

function addDevSuperRole(db: DatabaseSync): void {
  const hasDev = db.prepare("SELECT 1 AS x FROM roles WHERE name = 'Dev' LIMIT 1").get() as { x: number } | undefined;
  if (hasDev) {
    // Already reconciled (or fresh DB seeded by ROLE_SEED) — just record it.
    db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (22, 'add-dev-super-role')`);
    return;
  }
  db.exec('BEGIN');
  try {
    // 1) Insert the Dev role row (bilingual label + star).
    db.prepare("INSERT OR IGNORE INTO roles (name, name_ar, star) VALUES (?, ?, ?)").run('Dev', 'مطور', '');
    // 2) Grant Dev every existing permission (mirror of the admin grant).
    const perms = db.prepare('SELECT key FROM permissions').all() as Array<{ key: string }>;
    const insRp = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
    for (const p of perms) insRp.run('Dev', p.key);
    // 3) Widen the users.role CHECK constraint to accept 'dev'. SQLite cannot
    //    ALTER a column's CHECK in place, so drop + re-add the column, then
    //    restore every existing role and promote the two Dev accounts.
    const priorRoles = db.prepare('SELECT id, role FROM users').all() as Array<{ id: number; role: string }>;
    db.exec('ALTER TABLE users DROP COLUMN role');
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('dev','admin','engineer'))");
    const restoreRole = db.prepare('UPDATE users SET role = ? WHERE id = ?');
    for (const r of priorRoles) restoreRole.run(r.role, r.id);
    const updUserRole = db.prepare("UPDATE users SET role = 'dev', job_role = 'Dev' WHERE username = ?");
    let promotedUsers = 0;
    for (const u of DEV_USERS) promotedUsers += Number(updUserRole.run(u).changes);
    // 4) Promote the linked engineer member rows to Dev (bare-name rows).
    const updEng = db.prepare("UPDATE engineers SET role = 'Dev' WHERE name = ?");
    let promotedMembers = 0;
    for (const m of DEV_MEMBERS) promotedMembers += Number(updEng.run(m).changes);
    // 5) Reword the help_docs bullet (kept Document Controllers, add Dev).
    db.prepare("UPDATE help_docs SET en = 'Document Controllers, Dev and project members are managed here.' WHERE en LIKE '%Document Controllers%' OR en LIKE '%are managed here%'").run();
    db.prepare("UPDATE help_docs SET ar = 'مراقبو المستندات والمطورون وأعضاء المشروع يُدارون من هنا.' WHERE ar LIKE '%مراقبو المستندات%' OR ar LIKE '%?????? ?????????%'").run();
    db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (22, 'add-dev-super-role')`);
    db.exec('COMMIT');
    console.log(`[odv] Migration 22 (add-dev-super-role): added Dev tier; promoted ${promotedUsers} user(s) + ${promotedMembers} member(s).`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Ticket 133: Idempotent migration — ensure the Project Identity keys exist.
  *  Seeds the short project id (`project_id` = PRJ-01, editable in the UI) and the
 *  logo extension keys for the consultant + owner logos (empty = none uploaded). */
function seedProjectIdentity(db: DatabaseSync): void {
  const setIfAbsent = (key: string, value: string): void => {
    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
    ).run(key, value);
  };
  setIfAbsent('project_id', 'PRJ-01');
  setIfAbsent('consultant_logo_ext', '');
  setIfAbsent('owner_logo_ext', '');
  db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (25, 'project-id-identity')`);
  console.log(`[odv] Migration 25 (project-id-identity): ensured project_id + logo ext keys.`);
}

/** mventor-ticket-008: Programmatic migration — create audit_events plus its
 *  append-only triggers (trigger bodies contain semicolons, so they cannot go
 *  through the ';' splitter). Idempotent via IF NOT EXISTS + version record. */
function applyAuditTrail(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER REFERENCES persons(id),
    organization_id INTEGER REFERENCES organizations(id),
    role_context TEXT NOT NULL DEFAULT '',
    project_id INTEGER REFERENCES projects(id),
    subject_type TEXT NOT NULL DEFAULT '',
    subject_id INTEGER NOT NULL DEFAULT 0,
    action TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events BEGIN
    SELECT RAISE(ABORT, 'audit_events is append-only');
  END`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events BEGIN
    SELECT RAISE(ABORT, 'audit_events is append-only');
  END`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events(subject_type, subject_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id)');
  db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (33, 'audit-trail')`);
  console.log('[odv] Migration 33 (audit-trail): ensured audit_events + append-only triggers.');
}

/** Ticket 136: RFI is a normal request (contractor sends sentDate, consultant
 *  replies replyDate); NCR is inverted (consultant sends sentByConsultantDate,
 *  contractor replies replyByContractorDate). Patch the live
 *  domain_categories.columns_json for existing DBs (the /api/meta source of
 *  truth). Idempotent. */function fixRfiNcrColumns(db: DatabaseSync): void {
  db.prepare('UPDATE domain_categories SET columns_json = ? WHERE code = ?').run(
    JSON.stringify(COLS_RFI),
    'RFI',
  );
  db.prepare('UPDATE domain_categories SET columns_json = ? WHERE code = ?').run(
    JSON.stringify(COLS_NCR),
    'NCR',
  );
  db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (27, 'rfi-ncr-correct-columns')`);
  console.log(`[odv] Migration 27 (rfi-ncr-correct-columns): RFI -> normal cols, NCR -> inverted cols.`);
}

/** Ticket 131: Programmatic migration — create the clusters table (in case a
 *  live DB predates SCHEMA) and seed the default cluster (CL12) from the current
 *  single-project state in app_settings. Idempotent. */
function seedClusters(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS clusters (code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', project_name TEXT NOT NULL DEFAULT \'\', project_name_ar TEXT NOT NULL DEFAULT \'\', working_area TEXT NOT NULL DEFAULT \'\', consultant TEXT NOT NULL DEFAULT \'\', owner TEXT NOT NULL DEFAULT \'\', owner_delegate TEXT NOT NULL DEFAULT \'\', logo_ext TEXT NOT NULL DEFAULT \'\', custom_metadata TEXT NOT NULL DEFAULT \'[]\', is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const get = (key: string): string => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? '';
  };
  const code = 'CL12';
  const exists = db.prepare('SELECT 1 AS x FROM clusters WHERE code = ?').get(code) as { x: number } | undefined;
  if (!exists) {
    const cust = get('custom_metadata');
    db.prepare(
      `INSERT INTO clusters (code, name, project_name, project_name_ar, working_area, consultant, owner, owner_delegate, logo_ext, custom_metadata, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      code,
      get('workingArea') || 'Cluster 12',
      get('projectName') || 'Demo Project',
      'DEMO PROJECT',
      get('workingArea') || 'Cluster 12',
      get('consultant'),
      get('owner'),
      get('ownerDelegate'),
      get('logo_ext'),
      cust || '[]',
    );
  } else {
    db.prepare('UPDATE clusters SET is_default = 1 WHERE code = ?').run(code);
  }
  db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (23, 'clusters-table')`);
  console.log(`[odv] Migration 23 (clusters-table): ensured clusters table + seeded default cluster ${code}.`);
}

/** Ticket 131: Programmatic migration — ensure floors.cluster exists and backfill
 *  existing floors to the default cluster (CL12). Idempotent. */
function addFloorsCluster(db: DatabaseSync): void {
  try {
    db.exec("ALTER TABLE floors ADD COLUMN cluster TEXT NOT NULL DEFAULT ''");
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.includes('duplicate column')) throw e;
  }
  db.exec("UPDATE floors SET cluster = 'CL12' WHERE cluster = ''");
  db.exec(`INSERT OR IGNORE INTO schema_version (version, name) VALUES (24, 'floors-cluster')`);
  console.log('[odv] Migration 24 (floors-cluster): ensured floors.cluster + backfilled to CL12.');
}

/** V5-003: Programmatic migration — strip Mr/Ms/Mrs/Eng/Engineer prefixes from
 *  engineers.name and records.engineer (ticket 058). */
function applyPrefixStrip(db: DatabaseSync): void {
  const PREFIX_RE = /^(Mr|Ms|Mrs|Eng|Engineer)\s+/i;
  const engRows = db.prepare('SELECT name FROM engineers').all() as unknown as Array<{ name: string }>;
  const renameEng = db.prepare("UPDATE engineers SET name = ?, title = '' WHERE name = ?");
  let engChanges = 0;
  for (const row of engRows) {
    const bare = String(row.name).replace(PREFIX_RE, '').trim();
    if (bare !== row.name) { renameEng.run(bare, row.name); engChanges++; }
  }
  const recRows = db.prepare("SELECT id, engineer FROM records WHERE engineer != ''").all() as unknown as Array<{ id: number; engineer: string }>;
  const renameRec = db.prepare('UPDATE records SET engineer = ? WHERE id = ?');
  let recChanges = 0;
  for (const row of recRows) {
    const bare = String(row.engineer).replace(PREFIX_RE, '').trim();
    if (bare !== row.engineer) { renameRec.run(bare, row.id); recChanges++; }
  }
  db.exec(`INSERT INTO schema_version (version, name) VALUES (17, 'strip-name-prefixes')`);
  if (engChanges + recChanges > 0) {
    console.log(`[odv] Migration 17 (strip-name-prefixes): stripped ${engChanges} engineer + ${recChanges} record prefixes.`);
  }
}

/** V5-004: Seed the domain registry tables from domain.ts constants.
 *  This is the bridge between hardcoded domain.ts and the DB-owned domain registry.
 *  After this migration, domain tables contain the exact owner vocabulary.
 *  domain.ts constants remain imported by routes until V5-005 replaces them. */
function seedDomainRegistry(db: DatabaseSync): void {
  db.exec('BEGIN');
  try {
    // --- Categories ---
    const insCat = db.prepare(
      `INSERT OR REPLACE INTO domain_categories (code, name_en, name_ar, description_en, description_ar, forks_json, columns_json, kind, has_checklist, has_cycle, has_template, has_table, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const catKind = (code: string): string => {
      if (code === 'NCR') return 'ncr';
      if (code === 'SO') return 'order_log';
      return 'request';
    };
    const catFlags = (code: string): { hasChecklist: number; hasCycle: number; hasTemplate: number; hasTable: number } => ({
      hasChecklist: code === 'SO' ? 0 : 1,
      hasCycle: code === 'SO' ? 0 : 1,
      hasTemplate: ['NCR', 'SO', 'QC', 'CBR'].includes(code) ? 0 : 1,
      hasTable: ['SD', 'DS', 'MIR', 'MS', 'QS'].includes(code) ? 1 : 0,
    });
    let catIdx = 0;
    for (const cat of CATEGORIES) {
      const flags = catFlags(cat.code);
      insCat.run(
        cat.code, cat.name, '', cat.description, '',
        JSON.stringify(cat.forks), JSON.stringify(cat.columns),
        catKind(cat.code), flags.hasChecklist, flags.hasCycle, flags.hasTemplate, flags.hasTable,
        catIdx++,
      );
    }
    // Backfill has_table for existing DBs that were seeded before this column existed
    db.prepare(`UPDATE domain_categories SET has_table = 1 WHERE code IN ('SD','DS','MIR','MS','QS')`).run();
    db.prepare(`UPDATE domain_categories SET has_table = 0 WHERE code NOT IN ('SD','DS','MIR','MS','QS')`).run();
    console.log(`[odv] Domain: seeded ${CATEGORIES.length} categories.`);

    // --- Statuses ---
    const insStatus = db.prepare(
      `INSERT OR REPLACE INTO domain_statuses (code, name_en, name_ar, slogan_en, slogan_ar, description_en, description_ar, bucket, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    let stIdx = 0;
    for (const st of STATUSES) {
      insStatus.run(st.code, st.code, st.slogan, '', '', st.description, '', st.bucket, stIdx++);
    }
    console.log(`[odv] Domain: seeded ${STATUSES.length} statuses.`);

    // --- Buckets ---
    const insBucket = db.prepare(
      'INSERT OR REPLACE INTO domain_buckets (code, name_en, name_ar, sort_order) VALUES (?, ?, ?, ?)',
    );
    let bkIdx = 0;
    for (const [code, bucket] of Object.entries(BUCKETS)) {
      insBucket.run(code, bucket.name, '', bkIdx++);
    }
    console.log(`[odv] Domain: seeded ${Object.keys(BUCKETS).length} buckets.`);

    // --- Forks ---
    const insFork = db.prepare(
      'INSERT OR REPLACE INTO domain_forks (code, name_en, name_ar, active, sort_order) VALUES (?, ?, ?, 1, ?)',
    );
    let fkIdx = 0;
    for (const fork of FORKS_ALL) {
      insFork.run(fork, fork, '', fkIdx++);
    }
    console.log(`[odv] Domain: seeded ${FORKS_ALL.length} forks.`);

    // --- Cycles + Steps ---
    const insCycle = db.prepare(
      'INSERT OR REPLACE INTO domain_cycles (category_code, name_en, name_ar, active, sort_order) VALUES (?, ?, ?, 1, ?)',
    );
    const insStep = db.prepare(
      'INSERT OR REPLACE INTO domain_cycle_steps (cycle_category, step_order, name_en, name_ar, hint_en, hint_ar) VALUES (?, ?, ?, ?, ?, ?)',
    );
    let cycIdx = 0;
    for (const cycle of CYCLES) {
      insCycle.run(cycle.category, cycle.name, cycle.nameAr, cycIdx++);
      let stepIdx = 0;
      for (const step of cycle.steps) {
        insStep.run(cycle.category, stepIdx++, step.name, step.nameAr, step.hint, '');
      }
    }
    console.log(`[odv] Domain: seeded ${CYCLES.length} cycles with steps.`);

    // --- Transitions (from ALLOWED_TRANSITIONS in routes/records.ts) ---
    const insTrans = db.prepare(
      `INSERT OR IGNORE INTO domain_transitions (from_status, to_status, category_code, allowed, requires_admin, creates_revision, creates_pp_placeholder, requires_due_date)
       VALUES (?, ?, NULL, 1, 0, ?, ?, 0)`,
    );
    const transitions: Array<[string, string, number, number]> = [
      ['PP', 'P', 1, 0],
      ['PP', 'SC', 1, 0],
      ['P', 'A', 1, 0],
      ['P', 'B', 1, 0],
      ['P', 'C', 1, 1],   // C → next revision is PP (creates_placeholder=1)
      ['P', 'D', 1, 0],
      ['P', 'Skipped', 1, 0],
      ['SC', 'P', 1, 0],
      ['SC', 'PP', 1, 0],
    ];
    for (const [from, to, rev, pp] of transitions) {
      insTrans.run(from, to, rev, pp);
    }
    console.log(`[odv] Domain: seeded ${transitions.length} transition rules.`);

    // --- Fields (from CATEGORIES[].columns) ---
    const insField = db.prepare(
      'INSERT OR IGNORE INTO domain_fields (category_code, field_key, label_en, label_ar, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)',
    );
    const FIELD_LABELS: Record<string, string> = {
      requestNo: 'Request No.', revisionNo: 'Revision', description: 'Description',
      zone: 'Zone', floor: 'Floor', engineer: 'Project Member', fork: 'Fork',
      sentDate: 'Sent Date', sentByConsultantDate: 'Sent by Consultant',
      replyDate: 'Reply Date', replyByContractorDate: 'Reply by Contractor',
      status: 'Status', hyperlink: 'File', dataHyperlink: 'Data File',
      orderNo: 'Order No.',
    };
    let fieldIdx = 0;
    for (const cat of CATEGORIES) {
      let colIdx = 0;
      for (const col of cat.columns) {
        insField.run(cat.code, col, FIELD_LABELS[col] ?? col, '', colIdx++);
      }
    }
    console.log(`[odv] Domain: seeded field definitions for ${CATEGORIES.length} categories.`);

    // Record the migration
    db.exec("INSERT INTO schema_version (version, name) VALUES (20, 'domain-registry-seed')");
    db.exec('COMMIT');
    console.log('[odv] Migration 20 (domain-registry-seed) applied.');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** V5-003: Backfill FTS index for existing records (ticket 084). */
function backfillFtsIfNeeded(db: DatabaseSync): void {
  const ftsCount = (db.prepare('SELECT COUNT(*) AS n FROM records_fts').get() as { n: number }).n;
  if (ftsCount === 0 && (db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n > 0) {
    db.exec(`INSERT INTO records_fts(rowid, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink)
             SELECT id, category, request_no, revision_no, description, zone, floor, engineer, fork, status, hyperlink FROM records`);
    console.log('[odv] FTS index backfilled for existing records.');
  }
}

export function ensureSchema(db: DatabaseSync): void {
  // Pre-framework migration: records uniqueness rebuild (ticket 101).
  // Runs before SCHEMA because it renames/recreates the entire table.
  migrateRecordsActiveKeyUnique(db);

  // Create all tables (IF NOT EXISTS — safe for fresh + existing DBs)
  db.exec(SCHEMA);
  // Backfill token_version for existing DBs (V5-033)
  try { db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'); } catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); if (!m.includes('duplicate column')) throw e; }
  // Backfill has_table for existing DBs (modular wizard)
  try { db.exec('ALTER TABLE domain_categories ADD COLUMN has_table INTEGER NOT NULL DEFAULT 0'); } catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); if (!m.includes('duplicate column')) throw e; }
  // Backfill template_mappings.fork for DBs created before migration 21.
  // A DB that already reached schema_version 22 would skip migration 21, so a
  // scalar ALTER here guarantees the column exists regardless (ticket 120 fix).
  try { db.exec("ALTER TABLE template_mappings ADD COLUMN fork TEXT NOT NULL DEFAULT ''"); } catch (e: unknown) { const m = e instanceof Error ? e.message : String(e); if (!m.includes('duplicate column')) throw e; }

  // V5-003: versioned migration runner
  const currentVersion = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length > 0) {
    console.log(`[odv] Running ${pending.length} pending migration(s) (from v${currentVersion})...`);
    for (const migration of pending) {
      applyMigration(db, migration);
    }
    console.log(`[odv] Migrations complete. Schema at v${CURRENT_VERSION}.`);
  }

  // FTS backfill — runs once, then stays in sync via triggers
  backfillFtsIfNeeded(db);
}

export function openDb(config: Config): DatabaseSync {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, 'odv.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  ensureSchema(db);
  seedReferenceData(db);
  seedAdminIfNeeded(db, config);
  return db;
}

/** One-time seed of reference data (zones/floors/members) from domain.ts and
 *  the records themselves — after this the DB tables are the living source of
 *  truth (tickets 038-040). */
function seedReferenceData(db: DatabaseSync): void {
  const zoneCount = (db.prepare('SELECT COUNT(*) AS n FROM zones').get() as { n: number }).n;
  if (zoneCount === 0) {
    const ins = db.prepare('INSERT INTO zones (code, name, name_ar, cluster) VALUES (?, ?, ?, ?)');
    for (const z of ZONES) ins.run(z.code, z.name, z.nameAr, z.cluster);
    console.log(`[odv] Seeded ${ZONES.length} zones into the database.`);
  } else {
    // Backfill (ticket 068): Arabic delegates for existing zones where empty.
    const upd = db.prepare("UPDATE zones SET name_ar = ? WHERE code = ? AND name_ar = ''");
    for (const z of ZONES) upd.run(z.nameAr, z.code);
  }
  const floorCount = (db.prepare('SELECT COUNT(*) AS n FROM floors').get() as { n: number }).n;
  if (floorCount === 0) {
    const ins = db.prepare('INSERT INTO floors (name, name_ar, cluster) VALUES (?, ?, ?)');
    for (const f of FLOORS) ins.run(f, FLOOR_NAMES_AR[f] ?? '', 'CL12');
    console.log(`[odv] Seeded ${FLOORS.length} floors into the database.`);
  } else {
    // Backfill (ticket 068): Arabic delegates for existing floors where empty.
    const upd = db.prepare("UPDATE floors SET name_ar = ? WHERE name = ? AND name_ar = ''");
    for (const f of FLOORS) upd.run(FLOOR_NAMES_AR[f] ?? '', f);
  }
  // Project members: neutral placeholders for testing/showing (no real names).
  // The Setup Wizard / admin UI replaces these on first run.
  const MEMBER_SEED: Array<[string, string, string, string, string, number, number]> = [
    ['Civil Lead', 'Project Manager', '', '01-2024', '', 1, 1],
    ['Site Eng Architecture', 'Site Engineer', 'Architecture', '', '', 1, 1],
    ['Site Eng Structure', 'Site Engineer', 'Structure', '', '', 1, 1],
    ['Technical Office Eng', 'Technical Office Engineer', '', '', '', 1, 1],
    ['QA/QC Inspector', 'Site Engineer', '', '', '', 1, 1],
    ['Document Controller', 'Document Controller', '', '', '', 1, 0],
  ];
  const memberCount = (db.prepare('SELECT COUNT(*) AS n FROM engineers').get() as { n: number }).n;
  if (memberCount === 0) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO engineers (name, role, specialty, period_from, period_to, active, executive) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    let seeded = 0;
    for (const [name, role, specialty, from, to, active, executive] of MEMBER_SEED) {
      seeded += Number(ins.run(name, role, specialty, from, to, active, executive).changes);
    }
    // Legacy supplement: members referenced by records but not in the seed.
    const rows = db
      .prepare("SELECT DISTINCT engineer AS name FROM records WHERE engineer != '' ORDER BY engineer")
      .all() as unknown as Array<{ name: string }>;
    const insName = db.prepare('INSERT OR IGNORE INTO engineers (name) VALUES (?)');
    for (const r of rows) seeded += Number(insName.run(r.name).changes);
    console.log(`[odv] Seeded ${seeded} project members into the database.`);
  }
  // Roles (ticket 097): bilingual seed + backfill — the seed list is the
  // canonical set; existing DBs get missing roles added (INSERT OR IGNORE)
  // and star/name_ar values refreshed for known roles.
  const ROLE_SEED: Array<[string, string, string]> = [
    ['Project Manager', 'مدير مشروع', 'gold'],
    ['Executive Manager', 'مدير تنفيذي', 'white'],
    ['Site Engineer', 'مهندس موقع', ''],
    ['Technical Office Engineer', 'مهندس مكتب فني', ''],
    ['Quality Engineer', 'مهندس جودة', ''],
    ['Document Controller', 'مراقب مستندات', ''],
    ['Dev', 'مطور', ''],
    ['Warehouse Keeper', 'أمين مخازن', ''],
    ['Site Manager', 'مدير موقع', ''],
    ['Accountant', 'محاسب', ''],
    ['Electrician', 'كهربائي', ''],
  ];
  const roleCount = (db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }).n;
  const insRole = db.prepare('INSERT OR IGNORE INTO roles (name, name_ar, star) VALUES (?, ?, ?)');
  const updRole = db.prepare('UPDATE roles SET name_ar = ?, star = ? WHERE name = ?');
  let addedRoles = 0;
  for (const [name, nameAr, star] of ROLE_SEED) {
    addedRoles += Number(insRole.run(name, nameAr, star).changes);
    updRole.run(nameAr, star, name);
  }
  if (roleCount === 0) {
    console.log(`[odv] Seeded ${ROLE_SEED.length} roles into the database.`);
  } else if (addedRoles > 0) {
    console.log(`[odv] Backfilled ${addedRoles} missing roles into the database.`);
  }
  // Permissions (V5-016/017): action-based seeds, assigned to admin role by default
  const PERM_SEED: Array<[string, string]> = [
    ['requests.view','View requests'], ['requests.create','Create requests'], ['requests.edit','Edit requests'], ['requests.delete','Delete requests'], ['requests.transition','Transition requests'], ['requests.revise','Revise requests'],
    ['checklist.view','View checklist'], ['cement.view','View cement'], ['scan.view','View scans'], ['scan.route','Route scans'],
    ['vault.view','View vault'], ['vault.create','Create vault notes'], ['vault.respond','Respond vault'],
    ['members.view','View members'], ['members.manage','Manage members'], ['accounts.view','View accounts'], ['accounts.manage','Manage accounts'],
    ['roles.view','View roles'], ['roles.manage','Manage roles'], ['domain.view','View domain rules'], ['domain.manage','Manage domain rules'],
    ['templates.view','View templates'], ['templates.manage','Manage templates'], ['templates.publish','Publish templates'],
    ['mappers.view','View mappers'], ['mappers.manage','Manage mappers'], ['mappers.publish','Publish mappers'],
    ['backups.view','View backups'], ['backups.run','Run backups'],
  ];
  const permCount = (db.prepare('SELECT COUNT(*) AS n FROM permissions').get() as { n: number }).n;
  if (permCount === 0) {
    const insPerm = db.prepare('INSERT INTO permissions (key, name_en) VALUES (?, ?)');
    for (const [k, n] of PERM_SEED) insPerm.run(k, n);
    // Grant all permissions to the admin-tier roles + Dev (super) on fresh seed.
    const insRp = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
    const ADMIN_ROLES = ['Project Manager', 'Executive Manager', 'Document Controller', 'Technical Office Engineer', 'Dev'];
    for (const [k] of PERM_SEED) for (const r of ADMIN_ROLES) insRp.run(r, k);
    console.log(`[odv] Seeded ${PERM_SEED.length} permissions.`);
  }
  // Help Docs content (ticket 093): seed the default guide so it is editable.
  const helpCount = (db.prepare('SELECT COUNT(*) AS n FROM help_docs').get() as { n: number }).n;
  if (helpCount === 0) {
    const insHelp = db.prepare('INSERT INTO help_docs (parent_id, kind, en, ar, sort_order) VALUES (?, ?, ?, ?, ?)');
    const HELP_SEED: Array<[number, string, string, string]> = [
      [0, 'section', 'Basics', 'الأساسيات'],
      [0, 'section', 'Workflow', 'سير العمل'],
      [0, 'section', 'Admin', 'المدير'],
      [1, 'header', 'Login', 'تسجيل الدخول'],
      [1, 'header', 'Create a request', 'إنشاء طلب'],
      [1, 'header', 'Statuses', 'الحالات'],
      [1, 'header', 'Files', 'الملفات'],
      [1, 'header', 'Language', 'اللغة'],
      [2, 'header', 'The Wall', 'الجدار'],
      [2, 'header', 'Request Dashboard', 'لوحة الطلبات'],
      [2, 'header', 'Checklist', 'قائمة التحقق'],
      [2, 'header', 'Scans', 'المسح الضوئي'],
      [2, 'header', 'Reports', 'التقارير'],
      [3, 'header', 'Settings', 'الإعدادات'],
      [3, 'header', 'Users', 'المستخدمون'],
      [3, 'header', 'Trash', 'المهملات'],
      [3, 'header', 'Project Identity', 'هوية المشروع'],
      [4, 'bullet', 'Sign in with your user ID, then your password.', 'سجّل الدخول بمعرف المستخدم ثم كلمة المرور.'],
      [5, 'bullet', 'Pick a category, then a fork if needed, fill the fields and save.', 'اختر الفئة ثم التخصص إن لزم، املأ الحقول واحفظ.'],
      [6, 'bullet', 'A approved · B approved with notes · C rejected with notes · D rejected & canceled · SS superseded · PP postponed · P pending · SC scheduled.', 'A موافق · B موافق مع ملاحظات · C مرفوض مع ملاحظات · D مرفوض وملغى · SS مستبدلة · PP مؤجل · P قيد الانتظار · SC مجدول.'],
      [7, 'bullet', 'PDFs open inside the app — no file explorer needed.', 'ملفات PDF تُفتح داخل التطبيق — لا حاجة لمستكشف الملفات.'],
      [8, 'bullet', 'Switch between English and Arabic anytime; the layout flips automatically.', 'بدّل بين الإنجليزية والعربية في أي وقت؛ تنقلب الواجهة تلقائياً.'],
      [9, 'bullet', 'The Wall shows the site performance at a glance.', 'الجدار يعرض أداء الموقع في نظرة واحدة.'],
      [10, 'bullet', 'The visual home of the Request Area — hover and click to explore.', 'الواجهة المرئية لمنطقة الطلبات — مرّر وانقر للاستكشاف.'],
      [11, 'bullet', 'Pick a date and open the day checklist as a compact A4 landscape.', 'اختر تاريخاً وافتح قائمة تحقق اليوم بصيغة A4 أفقي مضغوطة.'],
      [12, 'bullet', 'Scans land in the watch folder — view, add metadata, log.', 'تصل المسوحات إلى مجلد المراقبة — اعرض، أضف البيانات، سجّل.'],
      [13, 'bullet', 'Create print-ready reports from the Wall and the dashboard.', 'أنشئ تقارير جاهزة للطباعة من الجدار ولوحة الطلبات.'],
      [14, 'bullet', 'Project identity, default request, zones, floors, roles, display, sounds.', 'هوية المشروع، الطلب الافتراضي، المناطق، الطوابق، الوظائف، العرض، الأصوات.'],
      [15, 'bullet', 'Dev and project members are managed here.', 'مطورو وأعضاء المشروع يُدارون من هنا.'],
      [16, 'bullet', 'Deleted records go to the trash — restore or purge.', 'السجلات المحذوفة تذهب إلى المهملات — استرجاع أو حذف نهائي.'],
      [17, 'bullet', 'Reports carry the project identity — keep the logo and project info up to date.', 'التقارير تحمل هوية المشروع — حافظ على تحديث الشعار ومعلومات المشروع.'],
    ];
    for (const [parent, kind, en, ar] of HELP_SEED) insHelp.run(parent, kind, en, ar, 0);
    console.log(`[odv] Seeded ${HELP_SEED.length} help docs into the database.`);
  }
}

function seedAdminIfNeeded(db: DatabaseSync, config: Config): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return;

  const password = config.adminPassword || randomBytes(6).toString('hex');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    'admin',
    hash,
    'admin',
  );

  const noteFile = path.join(config.dataDir, 'initial-admin.txt');
  fs.writeFileSync(
    noteFile,
    `Initial odv admin account (created ${new Date().toISOString()})\nusername: admin\npassword: ${password}\n\nChange it immediately after first login.\n`,
    'utf8',
  );
  console.log(`[odv] Seeded admin account -> ${noteFile}`);
}
