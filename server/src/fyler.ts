// Shared fyler pipeline (tickets 059-061, 070) — category template specs,
// plan building, and the SUPER-SILENT Excel COM runner (PowerShell:
// $xl.Visible = $false, DisplayAlerts = $false — no Excel window flashes).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const VAULT_ROOT = path.join(process.cwd(), 'data', 'legacy');
export const TEMPLATE_DIR = path.join(VAULT_ROOT, 'templates');

export interface RangeTable {
  start: number;
  max: number;
  /** First row of the signature/notes block — never hidden. */
  keepFrom: number;
  /** Column to leave empty (الكود) — cleared even if the template pre-fills it. */
  kodCol: string;
  rows: Array<Record<string, string>>;
}

export interface FylerSpec {
  template: string;
  sheet: string;
  cells: Record<string, string>;
  table?: RangeTable;
}

/** Category → template file + cell map (from RequestCreator module.json). */
export const SPECS: Record<string, FylerSpec> = {
  IR: {
    template: 'IR_Template.xlsx',
    sheet: 'IR',
    cells: { A14: '', A15: '', A22: '', Q30: '' },
  },
  SD: {
    template: 'SD_Template.xlsx',
    sheet: 'SD',
    cells: { G1: '', B12: '', E11: '', E13: '', E14: '' },
    table: { start: 16, max: 7, keepFrom: 18, kodCol: 'I', rows: [] },
  },
  DS: {
    template: 'DS_Template.xlsx',
    sheet: 'DS-STR',
    cells: { G1: '', C11: '', E11: '', E13: '', E14: '' },
    table: { start: 16, max: 7, keepFrom: 19, kodCol: 'I', rows: [] },
  },
  DR: {
    template: 'DR_Template.xlsx',
    sheet: 'SRQ',
    cells: { A14: '', A15: '', A22: '', R30: '' },
  },
  MIR: {
    template: 'MIR_Template.xlsx',
    sheet: 'MIR',
    cells: { G1: '', A14: '', D14: '' },
    table: { start: 17, max: 7, keepFrom: 19, kodCol: 'H', rows: [] },
  },
  MS: {
    template: 'MS_Template.xlsx',
    sheet: 'MIR',
    cells: { G1: '', A14: '', D14: '' },
    table: { start: 16, max: 7, keepFrom: 24, kodCol: 'H', rows: [] },
  },
  QS: {
    template: 'QS_Template.xlsx',
    sheet: 'QS',
    cells: { H1: '', C11: '', F11: '', C13: '', F13: '' },
    table: { start: 16, max: 7, keepFrom: 22, kodCol: 'J', rows: [] },
  },
  RFI: {
    template: 'RFI_Template.xlsx',
    sheet: 'RFI',
    cells: { A12: '', A13: '', I18: '', R30: '' },
  },
};

export const CATEGORIES_WITHOUT_TEMPLATE = ['NCR', 'SO', 'QC', 'CBR'];

/** Active mapper shape stored in template_mappings.mapping_json (ticket 108).
 *  `cells` maps record fields → template cells; `table` configures the
 *  document mini-table (start/max/kodCol/keepFrom + per-column mappings). */
export interface MapperConfig {
  category: string;
  sheet?: string;
  template?: string;
  cells: Record<string, string>;
  table?: {
    start: number;
    max: number;
    keepFrom: number;
    kodCol: string;
    /** map of template column letter (A, B, C…) → doc field (no, doc, version, description, code). */
    columns: Record<string, string>;
  };
}

/** Look up the ACTIVE mapping for a category from the DB (ticket 108) —
 *  falls back to the hardcoded SPECS when no mapping has been published. */
export function getActiveMapping(db: unknown, category: string): MapperConfig | null {
  try {
    const row = (db as { prepare: (sql: string) => { get: (...a: unknown[]) => { mapping_json: string } | undefined } })
      .prepare('SELECT mapping_json FROM template_mappings WHERE category = ? AND is_active = 1 ORDER BY version_no DESC LIMIT 1')
      .get(category);
    if (row?.mapping_json) {
      const parsed = JSON.parse(row.mapping_json) as unknown;
      if (parsed && typeof parsed === 'object' && (parsed as MapperConfig).cells) {
        return parsed as MapperConfig;
      }
    }
  } catch {
    // no DB access / no mapping — fall back to SPECS
  }
  return null;
}

/** Resolve the fyler spec for a category: DB mapping first, SPECS fallback. */
export function resolveFylerSpec(
  category: string,
  data: Parameters<typeof buildFylerSpec>[1],
  activeMapping: MapperConfig | null,
): FylerSpec | null {
  if (activeMapping) {
    const code = [category, data.fork, data.requestNo].filter(Boolean).join('-');
    const rev = data.revisionNo || '00';
    const date = data.sentDate || '';
    const desc = data.description || '';
    const floor = data.floor || '';
    const status = data.status || 'P';
    // Resolve cells from the mapper — replace tokens the same way buildFylerSpec does.
    const cells: Record<string, string> = {};
    for (const [field, cell] of Object.entries(activeMapping.cells)) {
      let value = '';
      switch (field) {
        case 'code': value = code; break;
        case 'requestNo': value = String(data.requestNo ?? ''); break;
        case 'revisionNo': value = `REV ${rev}`; break;
        case 'description': value = desc; break;
        case 'sentDate': value = date; break;
        case 'zone': value = data.zone ?? ''; break;
        case 'floor': value = floor; break;
        case 'status': value = status; break;
        default: value = String((data as Record<string, unknown>)[field] ?? '');
      }
      if (cell) cells[cell] = value;
    }
    const spec: FylerSpec = {
      template: activeMapping.template ?? `${category}_Template.xlsx`,
      sheet: activeMapping.sheet ?? category,
      cells,
    };
    if (activeMapping.table) {
      const tbl = activeMapping.table;
      const rows = (data.documents ?? []).slice(0, tbl.max).map((d, i) => {
        const rowMap: Record<string, string> = {};
        for (const [colLetter, docField] of Object.entries(tbl.columns)) {
          rowMap[colLetter] = String((d as Record<string, unknown>)[docField] ?? '');
        }
        return { ...rowMap, A: String(i + 1) };
      });
      spec.table = {
        start: tbl.start,
        max: tbl.max,
        keepFrom: tbl.keepFrom,
        kodCol: tbl.kodCol,
        rows,
      };
    }
    return spec;
  }
  return buildFylerSpec(category, data);
}

/** Build a fyler spec from real record data (ticket 070). */
export function buildFylerSpec(
  category: string,
  data: {
    fork?: string;
    requestNo: string;
    revisionNo: string;
    description?: string;
    sentDate?: string;
    zone?: string;
    floor?: string;
    status?: string;
    documents?: Array<{ no?: number; doc?: string; version?: string }>;
  },
): FylerSpec | null {
  const base = SPECS[category];
  if (!base) return null;
  const code = [category, data.fork, data.requestNo].filter(Boolean).join('-');
  const rev = data.revisionNo || '00';
  const date = data.sentDate || '';
  const desc = data.description || '';
  const floor = data.floor || '';
  const status = data.status || 'P';
  const cells: Record<string, string> = { ...base.cells };
  const fill = (key: string, value: string): void => {
    if (key in cells) cells[key] = value;
  };
  switch (category) {
    case 'IR':
      fill('A14', code);
      fill('A15', `REV ${rev}`);
      fill('A22', desc);
      fill('Q30', date);
      break;
    case 'SD':
      fill('G1', date);
      fill('B12', code);
      fill('E11', `REV-${rev}`);
      fill('E13', status);
      fill('E14', floor);
      break;
    case 'DS':
      fill('G1', date);
      fill('C11', code);
      fill('E11', `REV-${rev}`);
      fill('E13', status);
      fill('E14', floor);
      break;
    case 'DR':
      fill('A14', code);
      fill('A15', `REV ${rev}`);
      fill('A22', desc);
      fill('R30', date);
      break;
    case 'MIR':
      fill('G1', date);
      fill('A14', code);
      fill('D14', `REV-${rev}`);
      break;
    case 'MS':
      fill('G1', date);
      fill('A14', code);
      fill('D14', `REV-${rev}`);
      break;
    case 'QS':
      fill('H1', date);
      fill('C11', code);
      fill('F11', `REV-${rev}`);
      fill('C13', desc);
      fill('F13', floor);
      break;
    case 'RFI':
      fill('A12', code);
      fill('A13', `REV-${rev}`);
      fill('I18', code);
      fill('R30', date);
      break;
    default:
      return null;
  }
  const spec: FylerSpec = { ...base, cells };
  if (base.table) {
    const rows = (data.documents ?? []).slice(0, base.table.max).map((d, i) => ({
      A: String(i + 1),
      B: String(i + 1),
      C: String(d.doc ?? ''),
      H: String(d.version ?? `REV-${rev}`),
    }));
    spec.table = { ...base.table, rows };
  }
  return spec;
}

export interface FylerPlanFile {
  xlsx: string;
  pdf: string;
  sheet: string;
  cells: Record<string, string>;
  table?: RangeTable;
}

/** Write the fill plan + the super-silent PowerShell helper, then run it.
 *  Async (ticket 123) — Excel COM runs off the event loop so the server stays
 *  responsive while the fyler is generated. */
export async function runFylerPlan(
  outDir: string,
  files: FylerPlanFile[],
): Promise<Array<{ file: string; ok: boolean; error?: string }>> {
  if (process.platform !== 'win32') {
    return files.map((f) => ({
      file: f.xlsx,
      ok: false,
      error: 'Excel COM automation requires Windows and Microsoft Excel. Use standard manual upload or headless template export.',
    }));
  }
  fs.mkdirSync(outDir, { recursive: true });
  const planPath = path.join(outDir, '_plan.json');
  fs.writeFileSync(planPath, JSON.stringify({ files }, null, 2), 'utf8');

  const resultsPath = path.join(outDir, '_results.json');
  // Guarantee _results.json always exists (even on catastrophic Excel COM /
  // PowerShell failure) so the route never reports a bare "no result".
  const writeResults = (results: Array<{ file: string; ok: boolean; error?: string }>): void => {
    try {
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
    } catch {
      /* best-effort */
    }
  };

  const psPath = path.join(outDir, '_fill.ps1');
  const ps = `$ErrorActionPreference = 'Stop'
$plan = Get-Content -LiteralPath '${planPath}' -Raw | ConvertFrom-Json
$results = @()
$fatal = ''
$xl = $null
try {
  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false
  $xl.DisplayAlerts = $false
  foreach ($f in $plan.files) {
    $item = [ordered]@{ file = (Split-Path $f.xlsx -Leaf); ok = $false; error = '' }
    $wb = $null
    try {
      if (-not (Test-Path $f.xlsx)) { throw "Template copy not found: $($f.xlsx)" }
      $wb = $xl.Workbooks.Open($f.xlsx)
      $ws = $null
      try { $ws = $wb.Sheets.Item($f.sheet) } catch { $ws = $wb.Sheets.Item(1) }
      if ($null -eq $ws) { throw "Sheet '$($f.sheet)' not found in template" }
      foreach ($prop in $f.cells.PSObject.Properties) {
        $ws.Range($prop.Name).Value2 = [string]$prop.Value
      }
      if ($f.table) {
        $start = [int]$f.table.start
        $rowIdx = 0
        foreach ($row in $f.table.rows) {
          $r = $start + $rowIdx
          if ($f.table.kodCol) {
            $kc = $ws.Range("$($f.table.kodCol)$r")
            if ($kc.MergeCells) { $kc = $kc.MergeArea.Cells.Item(1,1) }
            $kc.Value2 = ''
          }
          foreach ($tprop in $row.PSObject.Properties) {
            $cell = $ws.Range("$($tprop.Name)$r")
            if ($cell.MergeCells) { $cell = $cell.MergeArea.Cells.Item(1,1) }
            $cell.Value2 = [string]$tprop.Value
          }
          $rowIdx++
        }
        $keepFrom = [int]$f.table.keepFrom
        if ($f.table.kodCol) {
          for ($r2 = $start; $r2 -lt $keepFrom; $r2++) {
            $kc2 = $ws.Range("$($f.table.kodCol)$r2")
            if ($kc2.MergeCells) { $kc2 = $kc2.MergeArea.Cells.Item(1,1) }
            $kc2.Value2 = ''
          }
        }
        for ($h = $start + $rowIdx; $h -lt $keepFrom; $h++) {
          $ws.Rows($h).Hidden = $true
        }
      }
      $wb.Save()
      $dir = Split-Path $f.pdf -Parent
      if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
      $wb.ExportAsFixedFormat(0, $f.pdf)
      $wb.Close($false)
      $item.ok = $true
    } catch {
      $item.error = $_.Exception.Message
      if ($_.ScriptStackTrace) { $item.error += " | $($_.ScriptStackTrace)" }
    } finally {
      if ($wb) { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb); $wb = $null }
    }
    $results += $item
  }
} catch {
  $fatal = "FATAL: $($_.Exception.Message)"
  if ($_.ScriptStackTrace) { $fatal += " | $($_.ScriptStackTrace)" }
} finally {
  if ($xl) { try { $xl.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
}
if ($fatal) {
  $results += [ordered]@{ file = 'EXCEL_COM'; ok = $false; error = $fatal }
}
$results | ConvertTo-Json | Set-Content -LiteralPath '${resultsPath}' -Encoding UTF8
`;
  fs.writeFileSync(psPath, ps, 'utf8');

  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], {
      timeout: 300_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    console.error('Excel COM step failed (partial results may exist):', e instanceof Error ? e.message : e);
    // PowerShell process itself crashed before writing results — emit a record so the route sees a real error.
    const partial: Array<{ file: string; ok: boolean; error?: string }> = [];
    if (fs.existsSync(resultsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8').replace(/^\uFEFF/, '')) as Array<{ file: string; ok: boolean; error?: string }>;
        partial.push(...parsed);
      } catch { /* ignore */ }
    }
    if (partial.length === 0) {
      partial.push({ file: 'EXCEL_COM', ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    writeResults(partial);
    return partial;
  }

  if (!fs.existsSync(resultsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8').replace(/^\uFEFF/, '')) as Array<{
      file: string;
      ok: boolean;
      error?: string;
    }>;
  } catch {
    return [];
  }
}