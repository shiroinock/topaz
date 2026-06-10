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
