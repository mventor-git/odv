import { getToken } from './api';

/** Fetch a record's file with the JWT (browser navigation can't carry the token). */
export async function fetchFileBlob(recordId: number): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/files/${recordId}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  });
  if (!res.ok) throw new Error(`File request failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename="?([^";]+)"?/.exec(cd);
  const filename = m ? m[1] : `record-${recordId}.pdf`;
  return { blob, filename };
}

/** Open the file in a new tab (blob URL — works with auth). */
export async function openFileInTab(recordId: number): Promise<void> {
  const { blob } = await fetchFileBlob(recordId);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download the file with its real name. */
export async function downloadFile(recordId: number): Promise<void> {
  const { blob, filename } = await fetchFileBlob(recordId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}