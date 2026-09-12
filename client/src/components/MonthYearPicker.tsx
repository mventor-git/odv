import { type ReactNode } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthYearPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/** Calendar module — months + years only (no days), value "YYYY-MM" (ticket 059). */
export function MonthYearPicker({ value, onChange, placeholder }: MonthYearPickerProps): ReactNode {
  const [m, y] = value ? value.split('-') : ['', ''];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => String(currentYear - 5 + i));

  const inputCls =
    'h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex gap-1.5">
      <select
        className={`${inputCls} flex-1`}
        value={m}
        aria-label="Month"
        onChange={(e) => onChange(e.target.value && y ? `${e.target.value}-${y}` : e.target.value)}
      >
        <option value="">{placeholder ?? '—'}</option>
        {MONTHS.map((mm, i) => (
          <option key={mm} value={String(i + 1).padStart(2, '0')}>
            {mm}
          </option>
        ))}
      </select>
      <select
        className={`${inputCls} flex-1`}
        value={y}
        aria-label="Year"
        onChange={(e) => onChange(m && e.target.value ? `${m}-${e.target.value}` : e.target.value)}
      >
        <option value="">—</option>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </select>
    </div>
  );
}