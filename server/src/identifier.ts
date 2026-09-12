import type { DomainRegistry } from './domain-registry.ts';

/** Components that make up a odv request identifier. */
export interface IdentifierComponents {
  category: string;
  fork: string;
  cluster: string; // e.g. 'CL12'
  requestNo: string; // e.g. '019'
}

/**
 * Resolve the cluster a zone belongs to, via the domain registry.
 * Returns the zone's cluster, or 'CL12' as a safe default when unknown.
 */
export function resolveCluster(zoneCode: string, registry: DomainRegistry): string {
  const zone = registry.getZone(zoneCode);
  if (zone && zone.cluster) return zone.cluster;
  return 'CL12';
}

/**
 * Build a request identifier from its components.
 * Empty (non-required) components are skipped, but category + requestNo
 * are always included. Example: `ARCH-IR-CL12-019`.
 */
export function buildIdentifier(c: IdentifierComponents, separator = '-'): string {
  const parts: string[] = [c.category];
  if (c.fork && c.fork.trim() !== '') parts.push(c.fork);
  if (c.cluster && c.cluster.trim() !== '') parts.push(c.cluster);
  parts.push(c.requestNo);
  return parts.filter((p) => p !== undefined && p !== null).join(separator);
}

/** A single configurable field rule used for validation feedback. */
export interface FieldRule {
  key: string; // e.g. 'requestIdentifier'
  label: string;
  regex?: string; // configurable pattern
  required?: boolean;
  message?: string; // validation message
}

/** A configurable identifier rule: a master pattern plus per-field rules. */
export interface IdentifierRule {
  pattern: string; // regex with named groups
  fields: FieldRule[];
}

/** Sensible default rule for this project's identifier scheme. */
export const DEFAULT_IDENTIFIER_RULE: IdentifierRule = {
  pattern:
    '^(?<category>[A-Z]{2,4})-(?<fork>[A-Z]{2,4})-(?<cluster>CL\\d{1,2})-(?<requestNo>[A-Z0-9]{1,4})$',
  fields: [
    { key: 'category', label: 'Category', regex: '[A-Z]{2,4}', required: true, message: 'Category must be 2-4 uppercase letters' },
    { key: 'fork', label: 'Fork', regex: '[A-Z]{2,4}', required: false, message: 'Fork must be 2-4 uppercase letters' },
    { key: 'cluster', label: 'Cluster', regex: 'CL\\d{1,2}', required: true, message: 'Cluster must be CL followed by 1-2 digits' },
    { key: 'requestNo', label: 'Request No', regex: '[A-Z0-9]{1,4}', required: true, message: 'Request No must be 1-4 digits or uppercase alphanumerics' },
  ],
};

function compileRule(rule: IdentifierRule): RegExp {
  return new RegExp(rule.pattern);
}

/**
 * Validate an identifier string against the rule.
 * Returns ok:false with the first failing field's message, or a generic one.
 */
export function validateIdentifier(
  id: string,
  rule: IdentifierRule = DEFAULT_IDENTIFIER_RULE,
): { ok: boolean; error?: string } {
  const re = compileRule(rule);
  if (!re.test(id)) {
    const failing = rule.fields.find((f) => {
      if (f.required === false) return false;
      if (!f.regex) return false;
      const group = matchGroup(id, rule, f.key);
      if (group === null || group === undefined) return true;
      return !new RegExp(`^${f.regex}$`).test(group);
    });
    return { ok: false, error: failing?.message ?? 'Invalid identifier format' };
  }
  return { ok: true };
}

function matchGroup(id: string, rule: IdentifierRule, key: string): string | null {
  const m = id.match(new RegExp(rule.pattern));
  if (!m || !m.groups) return null;
  return m.groups[key] ?? null;
}

/**
 * Parse an identifier into its named components.
 * Returns null if it does not match the rule's pattern.
 */
export function parseIdentifier(
  id: string,
  rule: IdentifierRule = DEFAULT_IDENTIFIER_RULE,
): IdentifierComponents | null {
  const m = id.match(new RegExp(rule.pattern));
  if (!m || !m.groups) return null;
  const g = m.groups;
  return {
    category: g.category ?? '',
    fork: g.fork ?? '',
    cluster: g.cluster ?? '',
    requestNo: g.requestNo ?? '',
  };
}
