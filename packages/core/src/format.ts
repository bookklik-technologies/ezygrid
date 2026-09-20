/**
 * Number format engine (§23.3 prototype): a pragmatic mask subset.
 * Supported masks:
 *   #,##0            grouped integer
 *   #,##0.00         grouped with decimals
 *   0.00%            percent (value * 100)
 *   $#,##0.00        currency prefix
 *   yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy   Excel serial dates
 * Values are stored raw; formatting happens only at display time.
 */
export function formatValue(value: unknown, mask?: string): string {
  if (value === null || value === undefined) return '';
  if (mask === undefined || mask === '' || mask === 'General') {
    return typeof value === 'number' ? stripFloatNoise(value) : String(value);
  }
  if (typeof value === 'number' && isDateMask(mask)) return formatSerialDate(value, mask);
  // Booleans keep their text form (L6): TRUE with a numeric mask must not
  // render as "1.00" the way Number(true) would coerce it.
  if (typeof value === 'boolean') return String(value);

  if (typeof value !== 'number') {
    const n = Number(value);
    if (!Number.isNaN(n) && value !== '') {
      return applyNumericMask(n, mask);
    }
    return String(value);
  }
  return applyNumericMask(value, mask);
}

function stripFloatNoise(n: number): string {
  return String(Math.round(n * 1e10) / 1e10);
}

const DATE_MASK = /(y{2,4}|m{1,2}|d{1,2})/i;

function isDateMask(mask: string): boolean {
  return DATE_MASK.test(mask) && !mask.includes('%');
}

function formatSerialDate(serial: number, mask: string): string {
  // Excel's fake 1900-02-29 shifts the serial->epoch mapping (L6): serials
  // 1..59 are one day behind the 25569 offset used for serial >= 61, and
  // serial 60 (the phantom leap day) displays as 1900-02-28.
  const epoch = serial < 60 ? 25568 : 25569;
  const ms = Math.round((serial - epoch) * 86400000);
  const d = new Date(ms);
  const yyyy = String(d.getUTCFullYear()).padStart(4, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return mask
    .replace(/yyyy/gi, yyyy)
    .replace(/yy/gi, yyyy.slice(2))
    .replace(/mm/gi, mm)
    .replace(/dd/gi, dd)
    .replace(/\bm\b/gi, mm)
    .replace(/\bd\b/gi, dd);
}

function applyNumericMask(n: number, mask: string): string {
  const percent = mask.includes('%');
  const body = mask.replace(/%/g, '');
  const decimalMatch = /\.([0#]+)/.exec(body);
  const decimals = decimalMatch ? (decimalMatch[1]!.match(/0/g) ?? []).length : 0;
  const grouped = body.includes(',');
  const prefixMatch = /^[^#0.,]+/.exec(body);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const suffixMatch = /[^#0.,]+$/.exec(body);
  const suffix = percent ? `${suffixMatch ? suffixMatch[0] : ''}%` : suffixMatch ? suffixMatch[0] : '';

  const value = percent ? n * 100 : n;
  let text = value.toFixed(decimals);
  if (grouped) {
    const [intPart, fracPart] = text.split('.');
    const sign = intPart!.startsWith('-') ? '-' : '';
    const digits = sign ? intPart!.slice(1) : intPart!;
    text = `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fracPart ? `.${fracPart}` : ''}`;
  }
  return `${prefix}${text}${suffix}`;
}
