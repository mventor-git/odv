import { type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  Archive,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Home,
  Layers,
  LayoutGrid,
  Plus,
  ScanLine,
  Settings,
  Table2,
  XCircle,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
  sub?: Array<{
    path: string;
    label: string;
    icon: ReactNode;
    match: (p: string) => boolean;
    group?: string;
  }>;
}

type TKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

/** Shared navigation config — used by both the desktop sidebar and the mobile drawer. */
export function buildNav(t: (key: TKey) => string): NavItem[] {
  return [
    {
      path: '/',
      label: t('nav.home'),
      icon: <Home className="size-4" />,
      match: (p) => p === '/',
    },
    {
      path: '/requests',
      label: t('nav.requests'),
      icon: <FileText className="size-4" />,
      match: (p) => p.startsWith('/requests'),
      sub: [
        {
          path: '/requests',
          label: t('nav.commandCenter'),
          icon: <LayoutGrid className="size-3.5" />,
          match: (p) => p === '/requests',
        },
        {
          path: '/requests/records',
          label: t('nav.logs'),
          icon: <Table2 className="size-3.5" />,
          match: (p) => p.startsWith('/requests/records'),
        },
        {
          path: '/requests/new',
          label: t('nav.create'),
          icon: <Plus className="size-3.5" />,
          match: (p) => p === '/requests/new' || /^\/requests\/\d+\/edit$/.test(p),
        },
        {
          path: '/requests/scan',
          label: t('nav.logScan'),
          icon: <ScanLine className="size-3.5" />,
          match: (p) => p.startsWith('/requests/scan'),
        },
        {
          path: '/requests/recorded/P',
          label: t('nav.recordedPending'),
          icon: <Clock className="size-3.5" />,
          match: (p) => p === '/requests/recorded/P',
          group: t('nav.recorded'),
        },
        {
          path: '/requests/recorded/SC',
          label: t('nav.recordedOnSchedule'),
          icon: <CalendarClock className="size-3.5" />,
          match: (p) => p === '/requests/recorded/SC',
        },
        {
          path: '/requests/recorded/SS',
          label: t('nav.recordedSuperSeeded'),
          icon: <Layers className="size-3.5" />,
          match: (p) => p === '/requests/recorded/SS',
        },
        {
          path: '/requests/recorded/PP',
          label: t('nav.recordedNoRecord'),
          icon: <Archive className="size-3.5" />,
          match: (p) => p === '/requests/recorded/PP',
        },
        {
          path: '/requests/recorded/A',
          label: t('nav.recordedApproved'),
          icon: <CheckCircle2 className="size-3.5" />,
          match: (p) => p === '/requests/recorded/A',
        },
        {
          path: '/requests/recorded/C',
          label: t('nav.recordedRejected'),
          icon: <XCircle className="size-3.5" />,
          match: (p) => p === '/requests/recorded/C',
        },
      ],
    },
    {
      path: '/checklist',
      label: t('nav.checklist'),
      icon: <ClipboardCheck className="size-4" />,
      match: (p) => p.startsWith('/checklist'),
    },
    {
      path: '/help',
      label: t('nav.help'),
      icon: <BookOpen className="size-4" />,
      match: (p) => p.startsWith('/help'),
    },
    {
      path: '/vault',
      label: t('nav.vault'),
      icon: <Bell className="size-4" />,
      match: (p) => p.startsWith('/vault'),
    },
    {
      path: '/cement',
      label: t('nav.cement'),
      icon: <Boxes className="size-4" />,
      match: (p) => p.startsWith('/cement'),
      sub: [
        {
          path: '/cement',
          label: t('nav.overview'),
          icon: <LayoutGrid className="size-3.5" />,
          match: (p) => p === '/cement',
        },
      ],
    },
  ];
}

export function buildSystemNav(t: (key: TKey) => string): NavItem[] {
  return [
    // /users was absorbed into Settings (ticket 098) — old links redirect.
    {
      path: '/legacy',
      label: t('nav.legacy'),
      icon: <Archive className="size-4" />,
      match: (p) => p.startsWith('/legacy'),
    },
    {
      path: '/settings',
      label: t('settings.title'),
      icon: <Settings className="size-4" />,
      match: (p) => p.startsWith('/settings'),
    },
  ];
}