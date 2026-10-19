/** Normalise US/CA-style numbers to E.164. Returns null when it can't be made valid. */
export function toE164(input: string | null | undefined, defaultCountry = "1"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountry)) return `+${digits}`;
  return null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
