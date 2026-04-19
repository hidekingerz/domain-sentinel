export type CheckStatus = 'pass' | 'warn' | 'fail' | 'error';

export type FindingSeverity = 'info' | 'warn' | 'fail';

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  rfcRef?: string;
}

export type CheckKind = 'SPF' | 'DMARC' | 'MX' | 'DKIM';

export interface CheckResultValue {
  kind: CheckKind;
  selector?: string;
  status: CheckStatus;
  raw?: string;
  findings: Finding[];
  errorMessage?: string;
}

export interface CheckerContext {
  domain: string;
  selector?: string;
}

export interface RecordChecker {
  kind: CheckKind;
  check(ctx: CheckerContext): Promise<CheckResultValue>;
}
