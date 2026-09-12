import type { DatabaseSync } from 'node:sqlite';
import type { CategoryDef, StatusDef, ZoneDef, CycleDef, CycleStep, BucketCode, StatusCode } from './domain.ts';

// Re-import the hardcoded constants ONLY as fallback for fresh DBs where
// the domain seed migration has not yet run. After V5-005, all normal
// runtime operations read from DB via DomainRegistry, not these constants.
import {
  CATEGORIES as FALLBACK_CATEGORIES,
  STATUSES as FALLBACK_STATUSES,
  BUCKETS as FALLBACK_BUCKETS,
  FORKS_ALL as FALLBACK_FORKS,
  CYCLES as FALLBACK_CYCLES,
  ZONES as FALLBACK_ZONES,
} from './domain.ts';
import { FLOOR_NAMES_AR as FALLBACK_FLOOR_NAMES_AR } from './domain.ts';

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export interface BucketSnapshot {
  code: string;
  name: string;
  nameAr: string;
  sortOrder: number;
}

export interface ForkSnapshot {
  code: string;
  name: string;
  nameAr: string;
  active: boolean;
  sortOrder: number;
}

export interface TransitionSnapshot {
  id: number;
  fromStatus: string;
  toStatus: string;
  categoryCode: string | null;
  allowed: boolean;
  requiresAdmin: boolean;
  createsRevision: boolean;
  createsPpPlaceholder: boolean;
  requiresDueDate: boolean;
}

export interface FieldSnapshot {
  id: number;
  categoryCode: string;
  fieldKey: string;
  labelEn: string;
  labelAr: string;
  sortOrder: number;
  active: boolean;
}

export interface CategorySnapshot extends CategoryDef {
  hasTable?: boolean;
  hasChecklist?: boolean;
  hasCycle?: boolean;
  hasTemplate?: boolean;
  kind?: string;
}

export interface DomainSnapshot {
  categories: CategorySnapshot[];
  statuses: StatusDef[];
  buckets: Record<string, { name: string; statuses: string[] }>;
  forks: ForkSnapshot[];
  cycles: CycleDef[];
  transitions: TransitionSnapshot[];
  fields: FieldSnapshot[];
}

// ---------------------------------------------------------------------------
// DomainRegistry
// ---------------------------------------------------------------------------

export class DomainRegistry {
  private db: DatabaseSync;
  private snapshot: DomainSnapshot | null = null;

  constructor(db: DatabaseSync) { this.db = db; }

  /** Load (or reload) the snapshot from DB. Uses fallback if tables are empty. */
  load(): DomainSnapshot {
    const snap = this.buildSnapshot();
    this.snapshot = snap;
    return snap;
  }

  /** Return the cached snapshot, loading it if needed. */
  getSnapshot(): DomainSnapshot {
    if (!this.snapshot) return this.load();
    return this.snapshot;
  }

  /** Invalidate the cache — call after any domain table mutation. */
  invalidate(): void {
    this.snapshot = null;
  }

  // --- Zones ---

  getZones(): ZoneDef[] {
    try {
      const rows = this.db
        .prepare('SELECT code, name, name_ar AS nameAr, cluster FROM zones ORDER BY code')
        .all() as Array<{ code: string; name: string; nameAr: string; cluster: string }>;
      if (rows.length > 0) {
        return rows.map((r) => ({ code: r.code, name: r.name, nameAr: r.nameAr, cluster: r.cluster }));
      }
    } catch {
      // fall through to fallback
    }
    return FALLBACK_ZONES;
  }

  getZone(code: string): ZoneDef | undefined {
    return this.getZones().find((z) => z.code === code);
  }

  // --- Category ---

  getCategories(): CategoryDef[] {
    return this.getSnapshot().categories;
  }

  getCategory(code: string): CategoryDef | undefined {
    return this.getSnapshot().categories.find((c) => c.code === code);
  }

  // --- Status ---

  getStatuses(): StatusDef[] {
    return this.getSnapshot().statuses;
  }

  getStatus(code: string): StatusDef | undefined {
    return this.getSnapshot().statuses.find((s) => s.code === code);
  }

  isStatusCode(code: string): code is StatusCode {
    return this.getSnapshot().statuses.some((s) => s.code === code);
  }

  getBucket(code: StatusCode): BucketCode {
    return (this.getStatus(code)?.bucket as BucketCode) ?? 'open';
  }

  // --- Buckets ---

  getBuckets(): Record<string, { name: string; statuses: string[] }> {
    return this.getSnapshot().buckets;
  }

  // --- Forks ---

  getForks(): ForkSnapshot[] {
    return this.getSnapshot().forks;
  }

  getForkCodes(): string[] {
    return this.getSnapshot().forks.map((f) => f.code);
  }

  // --- Cycles ---

  getCycles(): CycleDef[] {
    return this.getSnapshot().cycles;
  }

  getCycle(category: string): CycleDef | undefined {
    return this.getSnapshot().cycles.find((c) => c.category === category);
  }

  // --- Transitions ---

  getTransitions(): TransitionSnapshot[] {
    return this.getSnapshot().transitions;
  }

  getAllowedTransitions(fromStatus: string): string[] {
    return this.getSnapshot().transitions
      .filter((t) => t.fromStatus === fromStatus && t.allowed)
      .map((t) => t.toStatus);
  }

  // --- Fields ---

  getFields(category: string): FieldSnapshot[] {
    return this.getSnapshot().fields.filter((f) => f.categoryCode === category && f.active);
  }

  getFieldKeys(category: string): string[] {
    return this.getFields(category).map((f) => f.fieldKey);
  }

  // -------------------------------------------------------------------------
  // Private: build the snapshot
  // -------------------------------------------------------------------------

  private buildSnapshot(): DomainSnapshot {
    // Categories — include wizard flags (has_table etc.) for modular creation
    let categories: CategorySnapshot[];
    try {
      const rows = this.db
        .prepare('SELECT code, name_en AS name, description_en AS description, forks_json AS forksJson, columns_json AS columnsJson, has_table AS hasTable, has_checklist AS hasChecklist, has_cycle AS hasCycle, has_template AS hasTemplate, kind FROM domain_categories ORDER BY sort_order')
        .all() as Array<{ code: string; name: string; description: string; forksJson: string; columnsJson: string; hasTable: number; hasChecklist: number; hasCycle: number; hasTemplate: number; kind: string }>;
      if (rows.length > 0) {
        categories = rows.map((r) => ({
          code: r.code,
          name: r.name,
          description: r.description,
          forks: JSON.parse(r.forksJson) as string[],
          columns: JSON.parse(r.columnsJson) as string[],
          hasTable: !!r.hasTable,
          hasChecklist: !!r.hasChecklist,
          hasCycle: !!r.hasCycle,
          hasTemplate: !!r.hasTemplate,
          kind: r.kind,
        }));
      } else {
        categories = FALLBACK_CATEGORIES.map((c) => ({
          ...c,
          hasTable: ['SD', 'DS', 'MIR', 'MS', 'QS'].includes(c.code),
          hasChecklist: c.code !== 'SO',
          hasCycle: c.code !== 'SO',
          hasTemplate: !['NCR', 'SO', 'QC', 'CBR'].includes(c.code),
          kind: c.code === 'NCR' ? 'ncr' : c.code === 'SO' ? 'order_log' : 'request',
        }));
      }
    } catch {
      categories = FALLBACK_CATEGORIES.map((c) => ({
        ...c,
        hasTable: ['SD', 'DS', 'MIR', 'MS', 'QS'].includes(c.code),
        hasChecklist: c.code !== 'SO',
        hasCycle: c.code !== 'SO',
        hasTemplate: !['NCR', 'SO', 'QC', 'CBR'].includes(c.code),
        kind: c.code === 'NCR' ? 'ncr' : c.code === 'SO' ? 'order_log' : 'request',
      }));
    }

    // Statuses
    let statuses: StatusDef[];
    try {
      const rows = this.db
        .prepare('SELECT code, slogan_en AS slogan, description_en AS description, bucket FROM domain_statuses ORDER BY sort_order')
        .all() as Array<{ code: string; slogan: string; description: string; bucket: string }>;
      if (rows.length > 0) {
        statuses = rows.map((r) => ({
          code: r.code as StatusCode,
          slogan: r.slogan,
          description: r.description,
          bucket: r.bucket as BucketCode,
        }));
      } else {
        statuses = FALLBACK_STATUSES;
      }
    } catch {
      statuses = FALLBACK_STATUSES;
    }

    // Buckets — reconstructed from domain_buckets + domain_statuses grouping
    let buckets: Record<string, { name: string; statuses: string[] }>;
    try {
      const bucketRows = this.db
        .prepare('SELECT code, name_en AS name FROM domain_buckets ORDER BY sort_order')
        .all() as Array<{ code: string; name: string }>;
      const statusRows = this.db
        .prepare('SELECT code, bucket FROM domain_statuses ORDER BY sort_order')
        .all() as Array<{ code: string; bucket: string }>;
      if (bucketRows.length > 0) {
        buckets = {};
        for (const b of bucketRows) buckets[b.code] = { name: b.name, statuses: [] };
        for (const s of statusRows) {
          if (buckets[s.bucket]) buckets[s.bucket].statuses.push(s.code);
        }
      } else {
        buckets = Object.fromEntries(
          Object.entries(FALLBACK_BUCKETS).map(([k, v]) => [k, { name: v.name, statuses: [...v.statuses] }]),
        );
      }
    } catch {
      buckets = Object.fromEntries(
        Object.entries(FALLBACK_BUCKETS).map(([k, v]) => [k, { name: v.name, statuses: [...v.statuses] }]),
      );
    }

    // Forks
    let forks: ForkSnapshot[];
    try {
      const rows = this.db
        .prepare("SELECT code, name_en AS name, name_ar AS nameAr, active, sort_order AS sortOrder FROM domain_forks WHERE active = 1 ORDER BY sort_order")
        .all() as Array<{ code: string; name: string; nameAr: string; active: number; sortOrder: number }>;
      if (rows.length > 0) {
        forks = rows.map((r) => ({ code: r.code, name: r.name, nameAr: r.nameAr, active: !!r.active, sortOrder: r.sortOrder }));
      } else {
        forks = FALLBACK_FORKS.map((code, i) => ({ code, name: code, nameAr: '', active: true, sortOrder: i }));
      }
    } catch {
      forks = FALLBACK_FORKS.map((code, i) => ({ code, name: code, nameAr: '', active: true, sortOrder: i }));
    }

    // Cycles
    let cycles: CycleDef[];
    try {
      const cycleRows = this.db
        .prepare('SELECT category_code AS category, name_en AS name, name_ar AS nameAr FROM domain_cycles ORDER BY sort_order')
        .all() as Array<{ category: string; name: string; nameAr: string }>;
      const stepRows = this.db
        .prepare('SELECT cycle_category AS cycleCategory, step_order AS stepOrder, name_en AS name, name_ar AS nameAr, hint_en AS hint FROM domain_cycle_steps ORDER BY cycle_category, step_order')
        .all() as Array<{ cycleCategory: string; stepOrder: number; name: string; nameAr: string; hint: string }>;
      if (cycleRows.length > 0) {
        cycles = cycleRows.map((c) => ({
          category: c.category,
          name: c.name,
          nameAr: c.nameAr,
          steps: stepRows
            .filter((s) => s.cycleCategory === c.category)
            .map((s) => ({ name: s.name, nameAr: s.nameAr, hint: s.hint })),
        }));
      } else {
        cycles = FALLBACK_CYCLES;
      }
    } catch {
      cycles = FALLBACK_CYCLES;
    }

    // Transitions
    let transitions: TransitionSnapshot[];
    try {
      const rows = this.db
        .prepare('SELECT id, from_status AS fromStatus, to_status AS toStatus, category_code AS categoryCode, allowed, requires_admin AS requiresAdmin, creates_revision AS createsRevision, creates_pp_placeholder AS createsPpPlaceholder, requires_due_date AS requiresDueDate FROM domain_transitions')
        .all() as Array<{ id: number; fromStatus: string; toStatus: string; categoryCode: string | null; allowed: number; requiresAdmin: number; createsRevision: number; createsPpPlaceholder: number; requiresDueDate: number }>;
      if (rows.length > 0) {
        transitions = rows.map((r) => ({
          id: r.id,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          categoryCode: r.categoryCode,
          allowed: !!r.allowed,
          requiresAdmin: !!r.requiresAdmin,
          createsRevision: !!r.createsRevision,
          createsPpPlaceholder: !!r.createsPpPlaceholder,
          requiresDueDate: !!r.requiresDueDate,
        }));
      } else {
        // Hardcoded fallback from ALLOWED_TRANSITIONS
        transitions = this.fallbackTransitions();
      }
    } catch {
      transitions = this.fallbackTransitions();
    }

    // Fields
    let fields: FieldSnapshot[];
    try {
      const rows = this.db
        .prepare('SELECT id, category_code AS categoryCode, field_key AS fieldKey, label_en AS labelEn, label_ar AS labelAr, sort_order AS sortOrder, active FROM domain_fields ORDER BY category_code, sort_order')
        .all() as Array<{ id: number; categoryCode: string; fieldKey: string; labelEn: string; labelAr: string; sortOrder: number; active: number }>;
      fields = rows.map((r) => ({
        id: r.id, categoryCode: r.categoryCode, fieldKey: r.fieldKey,
        labelEn: r.labelEn, labelAr: r.labelAr, sortOrder: r.sortOrder, active: !!r.active,
      }));
      if (fields.length === 0) {
        // Derive from categories' column definitions
        fields = [];
        let fid = 1;
        for (const cat of categories) {
          let fIdx = 0;
          for (const col of cat.columns) {
            fields.push({ id: fid++, categoryCode: cat.code, fieldKey: col, labelEn: col, labelAr: '', sortOrder: fIdx++, active: true });
          }
        }
      }
    } catch {
      fields = [];
    }

    return { categories, statuses, buckets, forks, cycles, transitions, fields };
  }

  private fallbackTransitions(): TransitionSnapshot[] {
    // Mirrors ALLOWED_TRANSITIONS: PP→P|SC, P→A|B|C|D|Skipped, SC→P|PP
    const pairs: Array<[string, string]> = [
      ['PP', 'P'], ['PP', 'SC'],
      ['P', 'A'], ['P', 'B'], ['P', 'C'], ['P', 'D'], ['P', 'Skipped'],
      ['SC', 'P'], ['SC', 'PP'],
    ];
    return pairs.map(([from, to], i) => ({
      id: i + 1, fromStatus: from, toStatus: to, categoryCode: null,
      allowed: true, requiresAdmin: false, createsRevision: to === 'C', createsPpPlaceholder: to === 'C', requiresDueDate: false,
    }));
  }

  /** Expose the floor Arabic-name map (read from DB floors table). */
  getFloorNamesAr(): Record<string, string> {
    try {
      const rows = this.db.prepare('SELECT name, name_ar AS nameAr FROM floors').all() as unknown as Array<{ name: string; nameAr: string }>;
      const map: Record<string, string> = { ...FALLBACK_FLOOR_NAMES_AR };
      for (const r of rows) if (r.nameAr) map[r.name] = r.nameAr;
      return map;
    } catch {
      return { ...FALLBACK_FLOOR_NAMES_AR };
    }
  }
}
