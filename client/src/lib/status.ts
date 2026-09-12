/**
 * Single source for status display (warm muted Claude theme, no neon).
 * One map — all components import from here (display.ts / HomePage / StatusRing / ProgressBars).
 * Hardcoded only here; consumers are not hardcoded.
 */
export const STATUS_VARIANT: Record<string, 'success' | 'bGreen' | 'destructive' | 'warning' | 'muted' | 'accent'> = {
  A: 'success',
  B: 'bGreen',
  C: 'destructive',
  D: 'destructive',
  SS: 'muted',
  PP: 'muted',
  P: 'warning',
  SC: 'accent',
  Skipped: 'muted',
  Canceled: 'muted',
};

/** Full chip/border style for StatusBadge / tables — warm muted (B = yellowy green) */
export function statusChip(status: string): string {
  const v = STATUS_VARIANT[status] ?? 'muted';
  if (v === 'success') return 'bg-success/10 text-success border-success/30 dark:bg-success/15 dark:text-success dark:border-success/30';
  if (v === 'bGreen') return 'bg-[#E8F0D8]/80 text-[#5A7247] border-[#8FA968]/30 dark:bg-[#8FA968]/15 dark:text-[#A3B87A] dark:border-[#8FA968]/30';
  if (v === 'accent') return 'bg-accent/10 text-accent border-accent/30 dark:bg-accent/15 dark:text-accent dark:border-accent/30';
  if (v === 'destructive') return 'bg-destructive/10 text-destructive border-destructive/30 dark:bg-destructive/15 dark:text-destructive dark:border-destructive/30';
  if (v === 'warning') return 'bg-warning/10 text-warning border-warning/30 dark:bg-warning/15 dark:text-warning dark:border-warning/30';
  return 'bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border';
}

/** Progress bar fill — solid muted (B = yellowy green) */
export function statusBarFill(status: string): string {
  const v = STATUS_VARIANT[status] ?? 'muted';
  if (v === 'success') return 'bg-success';
  if (v === 'bGreen') return 'bg-[#8FA968]';
  if (v === 'accent') return 'bg-accent';
  if (v === 'destructive') return 'bg-destructive';
  if (v === 'warning') return 'bg-warning';
  return 'bg-muted-foreground';
}

/** Ring / gauge hex — warm muted (no neon) — B = yellowy green, warning = soft warm taupe */
export function statusHex(status: string): string {
  const v = STATUS_VARIANT[status] ?? 'muted';
  if (v === 'success') return '#547A61';
  if (v === 'bGreen') return '#8FA968';
  if (v === 'accent') return '#C96D57';
  if (v === 'destructive') return '#B64D48';
  if (v === 'warning') return '#A68A6A';
  return '#958D84';
}

/** Bucket style — warm muted, single source */
export function bucketChip(bucket: string): string {
  if (bucket === 'open') return 'border-success/30 bg-success/10 text-success';
  if (bucket === 'pending') return 'border-warning/30 bg-warning/10 text-warning';
  if (bucket === 'sc') return 'border-accent/30 bg-accent/10 text-accent';
  if (bucket === 'noRecord') return 'border-border bg-muted text-muted-foreground';
  if (bucket === 'superSeeded') return 'border-border bg-muted text-muted-foreground';
  return 'border-border bg-muted text-muted-foreground';
}
