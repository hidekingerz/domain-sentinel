import { flattenTxt, resolveTxt } from '../lib/dns.js';
import type { Finding, RecordChecker } from './types.js';

function parseDmarcTags(record: string): Record<string, string> {
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

export const dmarcChecker: RecordChecker = {
  kind: 'DMARC',
  async check({ domain }) {
    const name = `_dmarc.${domain}`;
    try {
      const records = flattenTxt(await resolveTxt(name)).sort();
      const dmarc = records.filter((r) => /^v=DMARC1\b/i.test(r));
      const findings: Finding[] = [];

      if (dmarc.length === 0) {
        findings.push({
          code: 'DMARC_MISSING',
          severity: 'fail',
          message: 'No DMARC record found at _dmarc subdomain.',
          rfcRef: 'RFC 7489',
        });
        return { kind: 'DMARC', status: 'fail', raw: records.join('\n'), findings };
      }
      if (dmarc.length > 1) {
        findings.push({
          code: 'DMARC_MULTIPLE',
          severity: 'fail',
          message: `Multiple DMARC records found (${dmarc.length}).`,
          rfcRef: 'RFC 7489 §6.6.3',
        });
      }

      const primary = dmarc[0]!;
      const tags = parseDmarcTags(primary);
      const policy = tags.p?.toLowerCase();

      if (!policy) {
        findings.push({
          code: 'DMARC_NO_POLICY',
          severity: 'fail',
          message: 'DMARC record missing required "p=" tag.',
          rfcRef: 'RFC 7489 §6.3',
        });
      } else if (policy === 'none') {
        findings.push({
          code: 'DMARC_POLICY_NONE',
          severity: 'warn',
          message: 'p=none: monitoring only, no enforcement.',
        });
      } else if (policy === 'quarantine' || policy === 'reject') {
        findings.push({
          code: 'DMARC_POLICY_ENFORCED',
          severity: 'info',
          message: `Enforcement policy: p=${policy}.`,
        });
      } else {
        findings.push({
          code: 'DMARC_POLICY_UNKNOWN',
          severity: 'fail',
          message: `Unknown policy value: ${policy}`,
        });
      }

      // Subdomain policy (sp=) — optional; inherits p= when absent.
      const sp = tags.sp?.toLowerCase();
      if (sp && sp !== 'none' && sp !== 'quarantine' && sp !== 'reject') {
        findings.push({
          code: 'DMARC_SP_UNKNOWN',
          severity: 'fail',
          message: `Unknown sp= value: ${sp}`,
        });
      } else if (sp === 'none' && policy !== 'none') {
        findings.push({
          code: 'DMARC_SP_WEAKER',
          severity: 'warn',
          message: 'sp=none weakens enforcement for subdomains.',
        });
      }

      // Percentage (pct=) — optional; default 100. Low values reduce coverage.
      if (tags.pct !== undefined) {
        const pct = Number(tags.pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          findings.push({
            code: 'DMARC_PCT_INVALID',
            severity: 'fail',
            message: `Invalid pct= value: ${tags.pct}`,
          });
        } else if (pct < 100 && (policy === 'quarantine' || policy === 'reject')) {
          findings.push({
            code: 'DMARC_PCT_PARTIAL',
            severity: 'warn',
            message: `pct=${pct}: policy applied to only ${pct}% of mail.`,
          });
        }
      }

      const status = findings.some((f) => f.severity === 'fail')
        ? 'fail'
        : findings.some((f) => f.severity === 'warn')
          ? 'warn'
          : 'pass';
      return { kind: 'DMARC', status, raw: primary, findings };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return {
        kind: 'DMARC',
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
