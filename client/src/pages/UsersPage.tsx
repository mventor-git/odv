import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

/** Ticket 098 — the Users page is absorbed into the monolith Settings page.
 *  Old links redirect to the Accounts sub-page (My Account was merged in). */
export function UsersPage(): ReactNode {
  const target = '/settings?page=accounts';
  return <Navigate to={target} replace />;
}
