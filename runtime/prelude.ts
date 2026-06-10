function __topaz_runtime_prelude_init(): void {
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

function __topaz_string_trim_start(s: string): string {
  let start: number = 0;
  while (start < s.length) {
    if (!__topaz_string_is_trim_start_code(s.charCodeAt(start))) break;
    start = start + 1;
  }
  return s.slice(start);
}
