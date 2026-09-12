import { type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface MultiChipSelectProps {
  options: Array<{ value: string; label: string }>;
  /** &-joined selection, e.g. "A&A1" (ticket 039 — zone/floor combinations). */
  value: string;
  onChange: (next: string) => void;
  max?: number;
  /** Render as a multi-select list box instead of chips (ticket 069). */
  listBox?: boolean;
}

/** Toggle-chip multi-select — values join with "&" (A&A1, Ground&First). */
export function MultiChipSelect({ options, value, onChange, max = 8, listBox = false }: MultiChipSelectProps): ReactNode {
  const selected = value ? value.split('&').filter(Boolean) : [];

  const toggle = (v: string): void => {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v).join('&'));
    } else if (selected.length < max) {
      onChange([...selected, v].join('&'));
    }
  };

  if (listBox) {
    return (
      <div className="max-h-44 overflow-y-auto rounded-xl border border-border/60 bg-card/70 p-1.5 shadow-sm">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-150 active:scale-[0.98] ${
                on
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
                }`}
              >
                {on && <Check className="size-3" />}
              </span>
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
              on
                ? 'border-primary/50 bg-primary/15 text-primary shadow-sm'
                : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}