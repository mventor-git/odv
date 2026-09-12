import { type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  dark: boolean;
  onChange: (v: boolean) => void;
}

/** Glassy theme toggle — logical positioning flips correctly in RTL (ticket 064). */
export function ThemeToggle({ dark, onChange }: ThemeToggleProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Toggle theme"
      onClick={() => onChange(!dark)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
        dark
          ? 'border-accent/40 bg-accent/20 shadow-inner'
          : 'border-border bg-muted shadow-inner'
      }`}
    >
      <span
        className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-md transition-all duration-200 ${
          dark
            ? 'end-0.5 bg-accent text-accent-foreground'
            : 'start-0.5 bg-foreground text-background'
        }`}
      >
        {dark ? <Moon className="size-3" /> : <Sun className="size-3" />}
      </span>
    </button>
  );
}