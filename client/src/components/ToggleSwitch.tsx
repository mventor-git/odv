import { type ReactNode } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  color?: 'success' | 'accent' | 'destructive';
}

/** Switch-style toggle button (ticket 073). */
export function ToggleSwitch({ checked, onChange, label, color = 'success' }: ToggleSwitchProps): ReactNode {
  const onColor =
    color === 'accent'
      ? 'border-accent/40 bg-accent/20'
      : color === 'destructive'
        ? 'border-destructive/40 bg-destructive/20'
        : 'border-success/40 bg-success/20';
  const knobColor =
    color === 'accent'
      ? 'bg-accent'
      : color === 'destructive'
        ? 'bg-destructive'
        : 'bg-success';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
        checked ? onColor : 'border-border bg-muted shadow-inner'
      }`}
      aria-label={label}
      title={label}
    >
      <span
        className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-md transition-all duration-200 ${
          checked ? `end-0.5 ${knobColor} text-white` : 'start-0.5 bg-foreground/70'
        }`}
      />
    </button>
  );
}