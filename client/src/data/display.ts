// Display-only constants. Real lists come from /api/meta (server-authoritative).

// Re-export single source — no duplicated hardcoding (display.ts is alias)
export { statusChip as STATUS_STYLES_FN, bucketChip as BUCKET_STYLES_FN } from '@/lib/status';
import { statusChip, bucketChip } from '@/lib/status';

export const STATUS_STYLES: Record<string, string> = {
  A: statusChip('A'),
  B: statusChip('B'),
  C: statusChip('C'),
  D: statusChip('D'),
  SS: statusChip('SS'),
  PP: statusChip('PP'),
  P: statusChip('P'),
  SC: statusChip('SC'),
  Skipped: statusChip('Skipped'),
};

export const BUCKET_STYLES: Record<string, string> = {
  open: bucketChip('open'),
  pending: bucketChip('pending'),
  sc: bucketChip('sc'),
  noRecord: bucketChip('noRecord'),
  superSeeded: bucketChip('superSeeded'),
};

export const FIELD_LABEL_KEYS: Record<string, string> = {
  requestNo: 'field.requestNo',
  orderNo: 'field.orderNo',
  revisionNo: 'field.revisionNo',
  description: 'field.description',
  zone: 'field.zone',
  floor: 'field.floor',
  engineer: 'field.member',
  fork: 'field.fork',
  sentDate: 'field.sentDate',
  sentByConsultantDate: 'field.sentByConsultantDate',
  replyDate: 'field.replyDate',
  replyByContractorDate: 'field.replyByContractorDate',
  status: 'field.status',
  hyperlink: 'field.hyperlink',
  dataHyperlink: 'field.dataHyperlink',
};

/** Default empty values for a record's editable fields. */
export const DEFAULT_VALUES: Record<string, string> = {
  requestNo: '',
  orderNo: '',
  revisionNo: '',
  description: '',
  zone: '',
  floor: '',
  engineer: '',
  fork: '',
  sentDate: '',
  sentByConsultantDate: '',
  replyDate: '',
  replyByContractorDate: '',
  status: 'P',
  hyperlink: '',
  dataHyperlink: '',
};
