function __topaz_runtime_prelude_init(): void {
}

function __topaz_boolean_to_string(value: boolean): string {
  if (value) return "true";
  return "false";
}

function __topaz_string_eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let i: number = 0;
  while (i < a.length) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return false;
    i = i + 1;
  }
  return true;
}

function __topaz_bigint_clone(value: bigint): bigint {
  return __topaz_bigint_copy_with_sign(value, __topaz_bigint_sign(value));
}

function __topaz_bigint_copy_with_sign(value: bigint, sign: number): bigint {
  const len: number = __topaz_bigint_limb_len(value);
  if (len === 0 || sign === 0) return 0n;
  const buffer: BigIntBuffer = __topaz_bigint_buffer_new(len);
  let i: number = 0;
  while (i < len) {
    const limb: number = __topaz_bigint_limb(value, i);
    __topaz_bigint_buffer_set_limb(buffer, i, limb);
    if (__topaz_bigint_buffer_get_limb(buffer, i) !== limb) {
      __topaz_panic("topaz: bigint buffer limb mismatch");
      return 0n;
    }
    i = i + 1;
  }
  if (__topaz_bigint_buffer_len(buffer) !== len) {
    __topaz_panic("topaz: bigint buffer length mismatch");
    return 0n;
  }
  return __topaz_bigint_buffer_to_bigint(buffer, sign);
}

function __topaz_bigint_neg(value: bigint): bigint {
  const sign: number = __topaz_bigint_sign(value);
  if (sign === 0) return 0n;
  return __topaz_bigint_copy_with_sign(value, 0 - sign);
}

function __topaz_bigint_eq(a: bigint, b: bigint): boolean {
  const aSign: number = __topaz_bigint_sign(a);
  const bSign: number = __topaz_bigint_sign(b);
  if (aSign !== bSign) return false;
  if (aSign === 0) return true;

  const len: number = __topaz_bigint_limb_len(a);
  if (len !== __topaz_bigint_limb_len(b)) return false;
  let i: number = 0;
  while (i < len) {
    if (__topaz_bigint_limb(a, i) !== __topaz_bigint_limb(b, i)) return false;
    i = i + 1;
  }
  return true;
}

function __topaz_bigint_cmp_abs(a: bigint, b: bigint): number {
  const aLen: number = __topaz_bigint_limb_len(a);
  const bLen: number = __topaz_bigint_limb_len(b);
  if (aLen < bLen) return -1;
  if (aLen > bLen) return 1;

  let i: number = aLen;
  while (i > 0) {
    i = i - 1;
    const av: number = __topaz_bigint_limb(a, i);
    const bv: number = __topaz_bigint_limb(b, i);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function __topaz_bigint_cmp(a: bigint, b: bigint): number {
  const aSign: number = __topaz_bigint_sign(a);
  const bSign: number = __topaz_bigint_sign(b);
  if (aSign < bSign) return -1;
  if (aSign > bSign) return 1;
  if (aSign === 0) return 0;

  const cmp: number = __topaz_bigint_cmp_abs(a, b);
  if (aSign > 0) return cmp;
  return 0 - cmp;
}

function __topaz_bigint_add_abs(a: bigint, b: bigint, sign: number): bigint {
  const aLen: number = __topaz_bigint_limb_len(a);
  const bLen: number = __topaz_bigint_limb_len(b);
  const max: number = aLen > bLen ? aLen : bLen;
  const base: number = 4294967296;
  const buffer: BigIntBuffer = __topaz_bigint_buffer_new(max + 1);
  let carry: number = 0;
  let i: number = 0;
  while (i < max) {
    const av: number = i < aLen ? __topaz_bigint_limb(a, i) : 0;
    const bv: number = i < bLen ? __topaz_bigint_limb(b, i) : 0;
    const cur: number = av + bv + carry;
    const limb: number = cur % base;
    __topaz_bigint_buffer_set_limb(buffer, i, limb);
    carry = (cur - limb) / base;
    i = i + 1;
  }
  if (carry !== 0) {
    __topaz_bigint_buffer_set_limb(buffer, max, carry);
  }
  return __topaz_bigint_buffer_to_bigint(buffer, sign);
}

function __topaz_bigint_sub_abs(a: bigint, b: bigint, sign: number): bigint {
  const aLen: number = __topaz_bigint_limb_len(a);
  const bLen: number = __topaz_bigint_limb_len(b);
  const base: number = 4294967296;
  const buffer: BigIntBuffer = __topaz_bigint_buffer_new(aLen);
  let borrow: number = 0;
  let i: number = 0;
  while (i < aLen) {
    const av: number = __topaz_bigint_limb(a, i);
    const bv: number = i < bLen ? __topaz_bigint_limb(b, i) : 0;
    const need: number = bv + borrow;
    if (av < need) {
      __topaz_bigint_buffer_set_limb(buffer, i, base + av - need);
      borrow = 1;
    } else {
      __topaz_bigint_buffer_set_limb(buffer, i, av - need);
      borrow = 0;
    }
    i = i + 1;
  }
  return __topaz_bigint_buffer_to_bigint(buffer, sign);
}

function __topaz_bigint_add(a: bigint, b: bigint): bigint {
  const aSign: number = __topaz_bigint_sign(a);
  const bSign: number = __topaz_bigint_sign(b);
  if (aSign === 0) return __topaz_bigint_copy_with_sign(b, bSign);
  if (bSign === 0) return __topaz_bigint_copy_with_sign(a, aSign);
  if (aSign === bSign) return __topaz_bigint_add_abs(a, b, aSign);

  const cmp: number = __topaz_bigint_cmp_abs(a, b);
  if (cmp === 0) return 0n;
  if (cmp > 0) return __topaz_bigint_sub_abs(a, b, aSign);
  return __topaz_bigint_sub_abs(b, a, bSign);
}

function __topaz_bigint_sub(a: bigint, b: bigint): bigint {
  return __topaz_bigint_add(a, __topaz_bigint_neg(b));
}

function __topaz_bigint_buffer_mul_small(buffer: BigIntBuffer, factor: number): void {
  const base: number = 4294967296;
  let carry: number = 0;
  let i: number = 0;
  const len: number = __topaz_bigint_buffer_len(buffer);
  while (i < len) {
    const cur: number = __topaz_bigint_buffer_get_limb(buffer, i) * factor + carry;
    const limb: number = cur % base;
    __topaz_bigint_buffer_set_limb(buffer, i, limb);
    carry = (cur - limb) / base;
    i = i + 1;
  }
  if (carry !== 0) {
    __topaz_bigint_buffer_set_limb(buffer, len, carry);
  }
}

function __topaz_bigint_buffer_add_small(buffer: BigIntBuffer, value: number): void {
  if (value === 0) return;
  const base: number = 4294967296;
  let carry: number = value;
  let i: number = 0;
  while (carry !== 0) {
    if (i < __topaz_bigint_buffer_len(buffer)) {
      const cur: number = __topaz_bigint_buffer_get_limb(buffer, i) + carry;
      const limb: number = cur % base;
      __topaz_bigint_buffer_set_limb(buffer, i, limb);
      carry = (cur - limb) / base;
    } else {
      __topaz_bigint_buffer_set_limb(buffer, i, carry);
      carry = 0;
    }
    i = i + 1;
  }
}

function __topaz_bigint_from_decimal(digits: string): bigint {
  const buffer: BigIntBuffer = __topaz_bigint_buffer_new(digits.length + 1);
  let i: number = 0;
  while (i < digits.length) {
    const code: number = digits.charCodeAt(i);
    if (code < 48 || code > 57) {
      __topaz_panic("topaz: invalid bigint literal");
      return __topaz_bigint_buffer_to_bigint(buffer, 0);
    }
    __topaz_bigint_buffer_mul_small(buffer, 10);
    __topaz_bigint_buffer_add_small(buffer, code - 48);
    i = i + 1;
  }
  const sign: number = __topaz_bigint_buffer_len(buffer) === 0 ? 0 : 1;
  return __topaz_bigint_buffer_to_bigint(buffer, sign);
}

function __topaz_bigint_mul_add_limb(
  buffer: BigIntBuffer,
  index: number,
  a: number,
  b: number,
  carry: number,
): number {
  const base16: number = 65536;
  const a0: number = a % base16;
  const a1: number = (a - a0) / base16;
  const b0: number = b % base16;
  const b1: number = (b - b0) / base16;
  const out: number = __topaz_bigint_buffer_get_limb(buffer, index);
  const o0: number = out % base16;
  const o1: number = (out - o0) / base16;
  const c0: number = carry % base16;
  const c1: number = (carry - c0) / base16;

  const s0: number = a0 * b0 + o0 + c0;
  const r0: number = s0 % base16;
  const k0: number = (s0 - r0) / base16;

  const s1: number = a0 * b1 + a1 * b0 + o1 + c1 + k0;
  const r1: number = s1 % base16;
  const k1: number = (s1 - r1) / base16;

  __topaz_bigint_buffer_set_limb(buffer, index, r0 + r1 * base16);
  return a1 * b1 + k1;
}

function __topaz_bigint_mul(a: bigint, b: bigint): bigint {
  const aSign: number = __topaz_bigint_sign(a);
  const bSign: number = __topaz_bigint_sign(b);
  if (aSign === 0 || bSign === 0) return 0n;

  const aLen: number = __topaz_bigint_limb_len(a);
  const bLen: number = __topaz_bigint_limb_len(b);
  const outLen: number = aLen + bLen + 1;
  const base: number = 4294967296;
  const buffer: BigIntBuffer = __topaz_bigint_buffer_new(outLen);
  let init: number = 0;
  while (init < outLen) {
    __topaz_bigint_buffer_set_limb(buffer, init, 0);
    init = init + 1;
  }

  let i: number = 0;
  while (i < aLen) {
    let carry: number = 0;
    let j: number = 0;
    while (j < bLen) {
      carry = __topaz_bigint_mul_add_limb(
        buffer,
        i + j,
        __topaz_bigint_limb(a, i),
        __topaz_bigint_limb(b, j),
        carry,
      );
      j = j + 1;
    }
    let k: number = i + bLen;
    while (carry !== 0) {
      const existing: number = __topaz_bigint_buffer_get_limb(buffer, k);
      const cur: number = existing + carry;
      const limb: number = cur % base;
      __topaz_bigint_buffer_set_limb(buffer, k, limb);
      carry = (cur - limb) / base;
      k = k + 1;
    }
    i = i + 1;
  }

  const sign: number = aSign === bSign ? 1 : -1;
  return __topaz_bigint_buffer_to_bigint(buffer, sign);
}

function __topaz_string_from_char_code(n: number): string {
  if (n !== n || n < 0 || n >= 128) {
    __topaz_panic("topaz: String.fromCharCode argument out of ASCII range");
    return "";
  }
  const code: number = n - (n % 1);
  const buffer: StringBuffer = __topaz_string_buffer_new(1);
  __topaz_string_buffer_push_byte(buffer, code);
  return __topaz_string_buffer_to_string(buffer);
}

function __topaz_string_char_code_at(s: string, index: number): number {
  if (index !== index) return 0 / 0;
  if (index < 0) return 0 / 0;
  if (index >= s.length) return 0 / 0;
  const i: number = index - (index % 1);
  return __topaz_string_byte_at(s, i);
}

function __topaz_string_concat(a: string, b: string): string {
  const buffer: StringBuffer = __topaz_string_buffer_new(a.length + b.length);
  __topaz_string_buffer_append_string(buffer, a);
  __topaz_string_buffer_append_string(buffer, b);
  return __topaz_string_buffer_to_string(buffer);
}

function __topaz_string_repeat(s: string, count: number): string {
  if (count !== count || count - count !== 0 || count < 0) {
    __topaz_panic("topaz: String.repeat count out of range");
    return "";
  }
  const n: number = count - (count % 1);
  if (n === 0 || s.length === 0) return "";
  const maxBytes: number = 268435456;
  if (n > maxBytes / s.length) {
    __topaz_panic("topaz: String.repeat output too large");
    return "";
  }

  const buffer: StringBuffer = __topaz_string_buffer_new(s.length * n);
  let repeatIndex: number = 0;
  while (repeatIndex < n) {
    __topaz_string_buffer_append_string(buffer, s);
    repeatIndex = repeatIndex + 1;
  }
  return __topaz_string_buffer_to_string(buffer);
}

function __topaz_slice_normalize(n: number, len: number, def: number): number {
  if (n !== n) return def;
  let r: number = n;
  if (n < 0) r = len + n;
  if (r < 0) return 0;
  if (r > len) return len;
  return r - (r % 1);
}

function __topaz_string_slice(s: string, rawStart: number, rawEnd: number): string {
  let lo: number = 0;
  if (rawStart !== rawStart) {
    lo = 0;
  } else if (rawStart < 0) {
    lo = s.length + rawStart;
  } else {
    lo = rawStart;
  }
  if (lo < 0) lo = 0;
  if (lo > s.length) lo = s.length;
  lo = lo - (lo % 1);

  let hi: number = 0;
  if (rawEnd !== rawEnd) {
    hi = s.length;
  } else if (rawEnd < 0) {
    hi = s.length + rawEnd;
  } else {
    hi = rawEnd;
  }
  if (hi < 0) hi = 0;
  if (hi > s.length) hi = s.length;
  hi = hi - (hi % 1);
  if (hi < lo) hi = lo;

  const buffer: StringBuffer = __topaz_string_buffer_new(hi - lo);
  let i: number = lo;
  while (i < hi) {
    __topaz_string_buffer_push_byte(buffer, s.charCodeAt(i));
    i = i + 1;
  }
  return __topaz_string_buffer_to_string(buffer);
}

function __topaz_string_starts_with(s: string, search: string): boolean {
  if (search.length > s.length) return false;
  let i: number = 0;
  while (i < search.length) {
    if (s.charCodeAt(i) !== search.charCodeAt(i)) return false;
    i = i + 1;
  }
  return true;
}

function __topaz_string_ends_with(s: string, search: string): boolean {
  if (search.length > s.length) return false;
  let offset: number = s.length - search.length;
  let i: number = 0;
  while (i < search.length) {
    if (s.charCodeAt(offset + i) !== search.charCodeAt(i)) return false;
    i = i + 1;
  }
  return true;
}

function __topaz_string_is_trim_start_code(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
}

function __topaz_parse_int_digit_value(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 55;
  if (code >= 97 && code <= 122) return code - 87;
  return -1;
}

function __topaz_parse_int(s: string, radix: number): number {
  const truncatedRadix: number = radix - (radix % 1);
  if (truncatedRadix !== truncatedRadix) return 0 / 0;
  let base: number = truncatedRadix;
  if (base !== 0 && (base < 2 || base > 36)) return 0 / 0;

  let i: number = 0;
  while (i < s.length) {
    if (!__topaz_string_is_trim_start_code(s.charCodeAt(i))) break;
    i = i + 1;
  }

  let sign: number = 1;
  if (i < s.length) {
    const signCode: number = s.charCodeAt(i);
    if (signCode === 43) {
      i = i + 1;
    } else if (signCode === 45) {
      sign = -1;
      i = i + 1;
    }
  }

  if (base === 0) {
    if (
      i + 1 < s.length &&
      s.charCodeAt(i) === 48 &&
      (s.charCodeAt(i + 1) === 120 || s.charCodeAt(i + 1) === 88)
    ) {
      base = 16;
      i = i + 2;
    } else if (i < s.length && s.charCodeAt(i) === 48) {
      base = 8;
    } else {
      base = 10;
    }
  } else if (
    base === 16 &&
    i + 1 < s.length &&
    s.charCodeAt(i) === 48 &&
    (s.charCodeAt(i + 1) === 120 || s.charCodeAt(i + 1) === 88)
  ) {
    i = i + 2;
  }

  let consumed: boolean = false;
  let value: number = 0;
  while (i < s.length) {
    const digit: number = __topaz_parse_int_digit_value(s.charCodeAt(i));
    if (digit < 0 || digit >= base) break;
    consumed = true;
    value = value * base + digit;
    i = i + 1;
  }

  if (!consumed) return 0 / 0;
  return sign * value;
}

function __topaz_string_trim_start(s: string): string {
  let start: number = 0;
  while (start < s.length) {
    if (!__topaz_string_is_trim_start_code(s.charCodeAt(start))) break;
    start = start + 1;
  }
  return s.slice(start);
}

function __topaz_path_extname(path: string): string {
  let startDot: number = -1;
  let startPart: number = 0;
  let end: number = -1;
  let matchedSlash: boolean = true;
  let preDotState: number = 0;
  for (let i: number = path.length - 1; i >= 0; i = i - 1) {
    const code: number = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46) {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }
  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    return "";
  }
  return path.slice(startDot, end);
}

function __topaz_path_dirname(path: string): string {
  if (path.length === 0) return ".";
  const hasRoot: boolean = path.charCodeAt(0) === 47;
  let end: number = -1;
  let matchedSlash: boolean = true;
  for (let i: number = path.length - 1; i >= 1; i = i - 1) {
    if (path.charCodeAt(i) === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) {
    if (hasRoot) return "/";
    return ".";
  }
  if (hasRoot && end === 1) return "//";
  return path.slice(0, end);
}

function __topaz_path_basename(path: string): string {
  let start: number = 0;
  let end: number = -1;
  let matchedSlash: boolean = true;
  for (let i: number = path.length - 1; i >= 0; i = i - 1) {
    const code: number = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }
  if (end === -1) return "";
  return path.slice(start, end);
}

function __topaz_path_basename_ext(path: string, ext: string): string {
  if (ext.length === 0 || ext.length > path.length) return __topaz_path_basename(path);
  if (ext.length === path.length) {
    let same: boolean = true;
    let fullIndex: number = 0;
    while (fullIndex < path.length) {
      if (path.charCodeAt(fullIndex) !== ext.charCodeAt(fullIndex)) {
        same = false;
        break;
      }
      fullIndex = fullIndex + 1;
    }
    if (same) return "";
  }
  let start: number = 0;
  let end: number = -1;
  let firstNonSlashEnd: number = -1;
  let extIndex: number = ext.length - 1;
  let matchedSlash: boolean = true;
  for (let i: number = path.length - 1; i >= 0; i = i - 1) {
    const code: number = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else {
      if (firstNonSlashEnd === -1) {
        matchedSlash = false;
        firstNonSlashEnd = i + 1;
      }
      if (extIndex >= 0) {
        if (code === ext.charCodeAt(extIndex)) {
          extIndex = extIndex - 1;
          if (extIndex === -1) end = i;
        } else {
          extIndex = -1;
          end = firstNonSlashEnd;
        }
      }
    }
  }
  if (start === end) end = firstNonSlashEnd;
  else if (end === -1) end = path.length;
  if (end <= start) return "";
  return path.slice(start, end);
}

function __topaz_path_normalize_string(path: string, allowAboveRoot: boolean): string {
  let res: string = "";
  let lastSegmentLength: number = 0;
  let lastSlash: number = -1;
  let dots: number = 0;
  let code: number = 0;
  let i: number = 0;
  while (i <= path.length) {
    if (i < path.length) code = path.charCodeAt(i);
    else if (code === 47) break;
    else code = 47;

    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {
        // Empty segment or ".".
      } else if (dots === 2) {
        let handledParent: boolean = false;
        const resLen: number = res.length;
        if (
          resLen < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(resLen - 1) !== 46 ||
          res.charCodeAt(resLen - 2) !== 46
        ) {
          if (resLen > 2) {
            let lsi: number = -1;
            for (let k: number = resLen - 1; k >= 0; k = k - 1) {
              if (res.charCodeAt(k) === 47) {
                lsi = k;
                break;
              }
            }
            if (lsi === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lsi);
              let lsi2: number = -1;
              for (let k2: number = res.length - 1; k2 >= 0; k2 = k2 - 1) {
                if (res.charCodeAt(k2) === 47) {
                  lsi2 = k2;
                  break;
                }
              }
              lastSegmentLength = res.length - 1 - lsi2;
            }
            handledParent = true;
          } else if (resLen !== 0) {
            res = "";
            lastSegmentLength = 0;
            handledParent = true;
          }
        }
        if (!handledParent && allowAboveRoot) {
          if (res.length > 0) res = res + "/";
          res = res + "..";
          lastSegmentLength = 2;
        }
      } else {
        const segStart: number = lastSlash + 1;
        if (res.length > 0) res = res + "/";
        res = res + path.slice(segStart, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      dots = dots + 1;
    } else {
      dots = -1;
    }
    i = i + 1;
  }
  return res;
}

function __topaz_path_join_segments(segments: Array<string>): string {
  if (segments.length === 0) return ".";

  let joined: string = "";
  let nonempty: number = 0;
  for (let i: number = 0; i < segments.length; i = i + 1) {
    const segment: string = segments[i];
    if (segment.length === 0) continue;
    if (nonempty > 0) joined = joined + "/";
    joined = joined + segment;
    nonempty = nonempty + 1;
  }
  if (nonempty === 0) return ".";

  const absolute: boolean = joined.length > 0 && joined.charCodeAt(0) === 47;
  const trailing: boolean = joined.length > 0 && joined.charCodeAt(joined.length - 1) === 47;
  const norm: string = __topaz_path_normalize_string(joined, !absolute);
  if (norm.length === 0) {
    if (absolute) return "/";
    if (trailing) return "./";
    return ".";
  }

  let out: string = norm;
  if (absolute) out = "/" + out;
  if (trailing) out = out + "/";
  return out;
}

function __topaz_path_resolve_segments(segments: Array<string>, cwd: string): string {
  let resolved: string = "";
  let absolute: boolean = false;
  for (let i: number = segments.length - 1; i >= -1 && !absolute; i = i - 1) {
    const segment: string = i >= 0 ? segments[i] : cwd;
    if (segment.length === 0) continue;
    resolved = segment + "/" + resolved;
    absolute = segment.charCodeAt(0) === 47;
  }

  const norm: string = __topaz_path_normalize_string(resolved, !absolute);
  if (absolute) return "/" + norm;
  if (norm.length > 0) return norm;
  return ".";
}

function __topaz_url_hex_value(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 97 + 10;
  if (code >= 65 && code <= 70) return code - 65 + 10;
  return -1;
}

function __topaz_url_file_url_to_path(url: string): string {
  const prefix: string = "file://";
  if (!__topaz_string_starts_with(url, prefix)) {
    __topaz_panic("topaz: fileURLToPath: URL must start with 'file://'");
    return "";
  }

  let cur: number = prefix.length;
  if (cur < url.length && url.charCodeAt(cur) !== 47) {
    let hostEnd: number = cur;
    while (hostEnd < url.length && url.charCodeAt(hostEnd) !== 47) {
      hostEnd = hostEnd + 1;
    }
    const host: string = url.slice(cur, hostEnd);
    if (!__topaz_string_eq(host, "localhost")) {
      __topaz_panic("topaz: fileURLToPath: only empty / 'localhost' file URL hosts are supported");
      return "";
    }
    cur = hostEnd;
  }

  if (cur >= url.length || url.charCodeAt(cur) !== 47) {
    __topaz_panic("topaz: fileURLToPath: file URL path must be absolute");
    return "";
  }

  const buffer: StringBuffer = __topaz_string_buffer_new(url.length);
  while (cur < url.length) {
    const code: number = url.charCodeAt(cur);
    if (code === 37) {
      if (cur + 3 > url.length) {
        __topaz_panic("topaz: fileURLToPath: truncated percent-encoding");
        return "";
      }
      const high: number = __topaz_url_hex_value(url.charCodeAt(cur + 1));
      const low: number = __topaz_url_hex_value(url.charCodeAt(cur + 2));
      if (high < 0 || low < 0) {
        __topaz_panic("topaz: fileURLToPath: invalid percent-encoding");
        return "";
      }
      __topaz_string_buffer_push_byte(buffer, high * 16 + low);
      cur = cur + 3;
      continue;
    }
    __topaz_string_buffer_push_byte(buffer, code);
    cur = cur + 1;
  }
  return __topaz_string_buffer_to_string(buffer);
}
