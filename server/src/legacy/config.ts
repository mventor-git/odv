// Legacy sweep source definitions — ACTIVE logs only (user-confirmed 2026-08-13).
// The monolith is READ-ONLY (ADR-007). Archived logs (Progress, Crushing) are excluded.

import path from 'node:path';
import type { Config } from '../config.ts';

export interface LegacySource {
  key: string;
  display: string;
  kind: 'xlsx' | 'sqlite';
  file: string;
  /** Sheet names to sweep; undefined = all sheets. */
  sheets?: string[];
  /** Generic header detection: first row (1..15) with >=3 non-empty cells. */
  detectHeader?: boolean;
}

/** The 22 real request-table sheets in cl12_requests_log.xlsm (monolith config.table_sheet_names). */
export const CL12_TABLE_SHEETS = [
  'QC', 'DR_STR', 'RFI', 'MS_ELEC', 'MS_MECH', 'MIR_STR', 'QS_Asbuilt_STR',
  'MIR_ELEC', 'QS_ARCH', 'QS_STR', 'DS_STR', 'SD_MECH_PLUMB', 'SD_ELEC',
  'SD_MECH_FIRE', 'SD_ARCH', 'SD_SUR', 'SD_STR', 'IR_ARCH', 'IR_STR',
  'IR_SUR', 'IR_CBR', 'IR_ELEC',
];

const BATCHING_DATA_SHEETS = [
  'Loose-Cement', 'AlMasa(StoneMix)', 'AlNooby', 'AbnaaSheeba', 'AlModather',
  'GoMix', 'AlSalam', 'RedSea',
];

export function buildSources(config: Config): LegacySource[] {
  const ml = config.monolithRoot;
  return [
    {
      key: 'requests',
      display: 'Requests Log (cl12)',
      kind: 'xlsx',
      file: path.join(ml, 'Logs', 'Requests Log', 'cl12_requests_log.xlsm'),
      sheets: CL12_TABLE_SHEETS,
      detectHeader: true,
    },
    {
      key: 'batching',
      display: 'Concrete — Batching Log',
      kind: 'xlsx',
      file: path.join(ml, 'Logs', 'Concrete Log', 'Batching_Log.xlsx'),
      sheets: BATCHING_DATA_SHEETS,
      detectHeader: true,
    },
    {
      key: 'packed_cement',
      display: 'Packed Cement (Black Cement / Masonry & Plastering)',
      kind: 'xlsx',
      file: path.join(ml, 'Logs', 'Concrete Log', 'Packed_Cement_Log_PLACEHOLDER.xlsx'),
      detectHeader: true,
    },
    {
      key: 'so_log',
      display: 'Site Orders Log',
      kind: 'xlsx',
      file: path.join(ml, 'Logs', 'Site Orders Log', 'SO_Log_PLACEHOLDER.xlsx'),
      detectHeader: true,
    },
    {
      key: 'ncr_log',
      display: 'NCR Log',
      kind: 'xlsx',
      file: path.join(ml, 'Logs', 'NCR Log', 'NCR_Log_PLACEHOLDER.xlsx'),
      detectHeader: true,
    },
    {
      key: 'labor',
      display: 'Labor-Report (DSAR)',
      kind: 'sqlite',
      file: path.join(config.laborRoot, 'database'),
    },
  ];
}
