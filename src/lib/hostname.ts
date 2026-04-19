// Loose RFC 1035 host validation: labels of [A-Za-z0-9-], not starting/ending
// with a hyphen, each 1–63 chars, total <= 253 chars, at least two labels.
const LABEL = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;

export function isValidDomainName(raw: string): boolean {
  if (!raw) return false;
  const name = raw.trim().toLowerCase();
  if (name.length > 253) return false;
  const labels = name.split('.');
  if (labels.length < 2) return false;
  return labels.every((l) => LABEL.test(l));
}

export function normalizeDomainName(raw: string): string {
  return raw.trim().toLowerCase();
}

// DKIM selector: dot-separated label tokens (same character set as hostnames).
export function isValidDkimSelector(raw: string): boolean {
  if (!raw) return false;
  const value = raw.trim();
  if (value.length > 253) return false;
  const parts = value.split('.');
  return parts.every((p) => LABEL.test(p));
}
