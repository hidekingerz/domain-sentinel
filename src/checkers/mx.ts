import { resolveMx } from '../lib/dns.js';
import type { Finding, RecordChecker } from './types.js';

export const mxChecker: RecordChecker = {
  kind: 'MX',
  async check({ domain }) {
    try {
      const records = await resolveMx(domain);
      const findings: Finding[] = [];
      if (records.length === 0) {
        findings.push({
          code: 'MX_MISSING',
          severity: 'fail',
          message: 'No MX records found.',
          rfcRef: 'RFC 5321',
        });
        return { kind: 'MX', status: 'fail', findings };
      }
      const sorted = [...records].sort((a, b) => a.priority - b.priority);
      findings.push({
        code: 'MX_PRESENT',
        severity: 'info',
        message: `${records.length} MX record(s). Top: ${sorted[0]!.exchange} (prio ${sorted[0]!.priority}).`,
      });
      return {
        kind: 'MX',
        status: 'pass',
        raw: sorted.map((r) => `${r.priority} ${r.exchange}`).join('\n'),
        findings,
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return {
        kind: 'MX',
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
