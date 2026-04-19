import { flattenTxt, resolveTxt } from '../lib/dns.js';
import type { Finding, RecordChecker } from './types.js';

// Matches the trailing "all" mechanism with an optional qualifier.
// Bare "all" defaults to "+all" per RFC 7208 §4.6.2.
const ALL_RE = /(?:^|\s)([+\-~?])?all\b\s*$/i;

export const spfChecker: RecordChecker = {
  kind: 'SPF',
  async check({ domain }) {
    try {
      const records = flattenTxt(await resolveTxt(domain)).sort();
      const spfRecords = records.filter((r) => /^v=spf1\b/i.test(r));
      const findings: Finding[] = [];

      if (spfRecords.length === 0) {
        findings.push({
          code: 'SPF_MISSING',
          severity: 'fail',
          message: 'No SPF (v=spf1) TXT record found.',
          rfcRef: 'RFC 7208',
        });
        return { kind: 'SPF', status: 'fail', raw: records.join('\n'), findings };
      }

      if (spfRecords.length > 1) {
        findings.push({
          code: 'SPF_MULTIPLE',
          severity: 'fail',
          message: `Multiple SPF records found (${spfRecords.length}). Only one is allowed.`,
          rfcRef: 'RFC 7208 §3.2',
        });
      }

      const primary = spfRecords[0]!;
      const allMatch = primary.match(ALL_RE);
      // "redirect=" modifier replaces the record entirely; in that case
      // "all" must NOT appear (RFC 7208 §6.1). Suppress SPF_NO_ALL.
      const hasRedirect = /(?:^|\s)redirect=\S+/i.test(primary);
      if (!allMatch) {
        if (hasRedirect) {
          findings.push({
            code: 'SPF_REDIRECT',
            severity: 'info',
            message: 'SPF uses redirect= modifier (policy inherited from target).',
            rfcRef: 'RFC 7208 §6.1',
          });
        } else {
          findings.push({
            code: 'SPF_NO_ALL',
            severity: 'warn',
            message: 'SPF record does not end with an "all" mechanism.',
            rfcRef: 'RFC 7208 §5.1',
          });
        }
      } else {
        if (hasRedirect) {
          findings.push({
            code: 'SPF_REDIRECT_AND_ALL',
            severity: 'warn',
            message: '"all" mechanism is ignored when "redirect=" is present.',
            rfcRef: 'RFC 7208 §6.1',
          });
        }
        const qualifier = allMatch[1] ?? '+';
        if (qualifier === '+') {
          findings.push({
            code: 'SPF_ALL_PASS',
            severity: 'fail',
            message: `"${allMatch[1] ?? ''}all" permits any sender. Use "-all" or "~all".`,
          });
        } else if (qualifier === '?') {
          findings.push({
            code: 'SPF_ALL_NEUTRAL',
            severity: 'warn',
            message: '"?all" is neutral and provides no protection.',
          });
        } else {
          findings.push({
            code: 'SPF_PRESENT',
            severity: 'info',
            message: `SPF ends with "${qualifier}all".`,
          });
        }
      }

      const status = findings.some((f) => f.severity === 'fail')
        ? 'fail'
        : findings.some((f) => f.severity === 'warn')
          ? 'warn'
          : 'pass';

      return { kind: 'SPF', status, raw: primary, findings };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return {
        kind: 'SPF',
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
