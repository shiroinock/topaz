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
