import * as Lucide from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import React from 'react';

// Semantic icon map — centralizes size, stroke, and future replacement (V5-023).
// Use: <AppIcon name="home" /> instead of importing Lucide icons everywhere.
const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  home: Lucide.House,
  requests: Lucide.FileStack,
  records: Lucide.Table2,
  scan: Lucide.ScanLine,
  checklist: Lucide.ClipboardCheck,
  vault: Lucide.Vault,
  help: Lucide.CircleHelp,
  settings: Lucide.Settings,
  users: Lucide.Users,
  roles: Lucide.Shield,
  template: Lucide.FileCode2,
  mapper: Lucide.Map,
  backup: Lucide.HardDrive,
  edit: Lucide.Pencil,
  delete: Lucide.Trash2,
  add: Lucide.Plus,
  activity: Lucide.Activity,
  latest: Lucide.Clock,
  cement: Lucide.Building2,
  labor: Lucide.UsersRound,
  search: Lucide.Search,
  bell: Lucide.Bell,
  printer: Lucide.Printer,
  file: Lucide.FileScan,
  close: Lucide.X,
  chevronDown: Lucide.ChevronDown,
  menu: Lucide.Menu,
  logout: Lucide.LogOut,
  gripVertical: Lucide.GripVertical,
  loader: Lucide.Loader2,
  send: Lucide.Send,
};

export type AppIconName = keyof typeof ICON_MAP;

export function AppIcon({ name, className, size = 16, ...props }: { name: AppIconName; className?: string; size?: number } & LucideProps) {
  const Cmp = ICON_MAP[name] ?? Lucide.Circle;
  return <Cmp className={className} size={size} strokeWidth={1.75} {...props} />;
}
