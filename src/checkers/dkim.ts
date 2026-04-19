import { flattenTxt, resolveTxt } from '../lib/dns.js';
import type { Finding, RecordChecker } from './types.js';

function parseDkimTags(record: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of record.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    const value = trimmed.slice(idx + 1).trim();
    tags[key] = value;
  }
  return tags;
}

export const dkimChecker: RecordChecker = {
  kind: 'DKIM',
  async check({ domain, selector }) {
    if (!selector) {
      return {
        kind: 'DKIM',
        status: 'error',
        findings: [
          {
            code: 'DKIM_NO_SELECTOR',
            severity: 'fail',
            message: 'DKIM selector not provided.',
          },
        ],
      };
    }
    const name = `${selector}._domainkey.${domain}`;
    try {
      const records = flattenTxt(await resolveTxt(name)).sort();
      const findings: Finding[] = [];
      if (records.length === 0) {
        findings.push({
          code: 'DKIM_MISSING',
          severity: 'fail',
          message: `No DKIM record at ${name}.`,
          rfcRef: 'RFC 6376',
        });
        return { kind: 'DKIM', selector, status: 'fail', findings };
      }
      const primary = records[0]!;
      const tags = parseDkimTags(primary);
      const hasV = (tags.v ?? 'DKIM1').toUpperCase() === 'DKIM1';
      if (!hasV) {
        findings.push({
          code: 'DKIM_VERSION',
          severity: 'warn',
          message: `Unexpected v= tag: ${tags.v}`,
        });
      }
      if (tags.p === undefined) {
        findings.push({
          code: 'DKIM_NO_KEY',
          severity: 'fail',
          message: 'DKIM record missing public key (p= tag).',
        });
      } else if (tags.p === '') {
        findings.push({
          code: 'DKIM_REVOKED',
          severity: 'fail',
          message: 'DKIM key is revoked (p= is empty).',
          rfcRef: 'RFC 6376 §3.6.1',
        });
      } else {
        findings.push({
          code: 'DKIM_PRESENT',
          severity: 'info',
          message: `DKIM key present (${tags.p.length} chars).`,
        });
      }

      const status = findings.some((f) => f.severity === 'fail')
        ? 'fail'
        : findings.some((f) => f.severity === 'warn')
          ? 'warn'
          : 'pass';
      return { kind: 'DKIM', selector, status, raw: primary, findings };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return {
        kind: 'DKIM',
        selector,
        status: 'error',
        findings: [
          {
            code: 'DNS_ERROR',
            severity: 'fail',
            message: `DNS lookup failed: ${e.code ?? e.message}`,
          },
        ],
        errorMessage: e.message,
      };
    }
  },
};
