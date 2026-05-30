#ifndef TOPAZ_RUNTIME_H
#define TOPAZ_RUNTIME_H

#include <errno.h>
#include <math.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#if defined(__APPLE__)
#include <mach-o/dyld.h>
#endif

typedef double topaz_number;
typedef bool topaz_boolean;

// Phase 1.5-4: per-process arena. "1 process = 1 compilation", so a global
// bump allocator with no per-allocation free is enough — process exit reclaims
// everything. Chunks are 64KB minimum, larger when a single allocation exceeds
// that. Payload alignment is 16 bytes, matching max_align_t on x86_64/arm64;
// the chunk header is padded to 32 bytes so `(char *)(chunk + 1)` is also
// 16-byte aligned. realloc just allocates a new block and memcpys — Array's
// doubling strategy keeps amortized cost O(1), and the old block lives until
// process exit.
typedef struct topaz_arena_chunk {
  struct topaz_arena_chunk *next;
  size_t cap;
  size_t used;
  size_t _pad;
} topaz_arena_chunk;

static topaz_arena_chunk *topaz_arena_head = NULL;

static void *topaz_arena_alloc(size_t size) {
  size_t aligned = (size + 15u) & ~(size_t)15u;
  if (aligned == 0) aligned = 16;
  if (!topaz_arena_head || topaz_arena_head->used + aligned > topaz_arena_head->cap) {
    size_t cap = aligned > (size_t)(64 * 1024) ? aligned : (size_t)(64 * 1024);
    topaz_arena_chunk *c = (topaz_arena_chunk *)malloc(sizeof(*c) + cap);
    if (!c) {
      fputs("topaz: out of memory\n", stderr);
      abort();
    }
    c->next = topaz_arena_head;
    c->cap = cap;
    c->used = 0;
    topaz_arena_head = c;
  }
  void *p = (char *)(topaz_arena_head + 1) + topaz_arena_head->used;
  topaz_arena_head->used += aligned;
  return p;
}

static void *topaz_arena_calloc(size_t n, size_t size) {
  size_t total = n * size;
  void *p = topaz_arena_alloc(total);
  if (total) memset(p, 0, total);
  return p;
}

static void *topaz_arena_realloc(void *old_ptr, size_t old_size, size_t new_size) {
  void *p = topaz_arena_alloc(new_size);
  if (old_ptr && old_size) memcpy(p, old_ptr, old_size);
  return p;
}

// Phase 1.2: immutable byte string. ASCII-only for now — JS .length is in
// UTF-16 code units, but we store UTF-8, so non-ASCII would diverge.
// `data` is either a literal (static lifetime) or arena-allocated by concat
// (released at process exit, see topaz_arena_alloc above).
typedef struct {
  const char *data;
  size_t len;
} topaz_string;

// Phase 1.5-3c: sentinel-struct optionals for scalar `T | undefined`. Reference
// and interface T | undefined collapse to T's own C representation (NULL ptr /
// .data == NULL), so only scalars need a struct. `_wrap_*` builds a present
// optional from a value; `_absent_*` is the missing sentinel. `_passthrough`
// is the identity wrapper used by class/interface Map values where the
// optional shares the underlying C type.
typedef struct { topaz_boolean present; topaz_number  value; } topaz_opt_number;
typedef struct { topaz_boolean present; topaz_boolean value; } topaz_opt_boolean;
typedef struct { topaz_boolean present; topaz_string  value; } topaz_opt_string;

#define topaz_opt_wrap_number(v)  ((topaz_opt_number){  true,  (v) })
#define topaz_opt_wrap_boolean(v) ((topaz_opt_boolean){ true,  (v) })
#define topaz_opt_wrap_string(v)  ((topaz_opt_string){  true,  (v) })

#define topaz_opt_absent_number  ((topaz_opt_number){  false, 0 })
#define topaz_opt_absent_boolean ((topaz_opt_boolean){ false, false })
#define topaz_opt_absent_string  ((topaz_opt_string){  false, { NULL, 0 } })

#define topaz_opt_passthrough(v) (v)

static inline topaz_string topaz_string_concat(topaz_string a, topaz_string b) {
  size_t total = a.len + b.len;
  char *buf = (char *)topaz_arena_alloc(total + 1);
  if (a.len) memcpy(buf, a.data, a.len);
  if (b.len) memcpy(buf + a.len, b.data, b.len);
  buf[total] = '\0';
  topaz_string r = { buf, total };
  return r;
}

static inline topaz_boolean topaz_string_eq(topaz_string a, topaz_string b) {
  if (a.len != b.len) return false;
  return memcmp(a.data, b.data, a.len) == 0;
}

// Phase 1.5-6 prep #10: ASCII-only String.prototype.charCodeAt. JS spec
// integer-truncates the index and returns NaN for out-of-range / NaN input.
// Negative indices return NaN (no JS-style wrap-around — they treat as OOB).
static inline topaz_number topaz_string_char_code_at(topaz_string s, topaz_number i) {
  if (isnan(i)) return (topaz_number)NAN;
  if (i < 0 || i >= (topaz_number)s.len) return (topaz_number)NAN;
  size_t idx = (size_t)i;
  return (topaz_number)(unsigned char)s.data[idx];
}

static inline void topaz_console_log_string(topaz_string s) {
  if (s.len) fwrite(s.data, 1, s.len, stdout);
  putchar('\n');
}

// JS `%` is IEEE-754 remainder with truncated quotient = fmod.
// C's `%` is integer-only, so all topaz_number `%` lowers to this helper.
static inline topaz_number topaz_fmod(topaz_number a, topaz_number b) {
  return fmod(a, b);
}

// Phase 1.5-3.5f-slice: index normalization for Array.prototype.slice
// (and future .indexOf / .lastIndexOf fromIndex). NaN sentinel encodes the
// `undefined` default (caller passes 0/0 when the argument was omitted in
// source). Negative inputs offset from len; out-of-range clamps to [0, len].
static inline size_t topaz_slice_normalize(double n, size_t len, size_t def) {
  if (isnan(n)) return def;  // `undefined` default sentinel
  double r = n < 0 ? (double)len + n : n;
  if (r < 0) return 0;
  if (r > (double)len) return len;
  return (size_t)r;
}

// Phase 1.5-6 prep #10: String.prototype.slice. Reuses topaz_slice_normalize
// (NaN sentinel encodes the `undefined` default — caller passes NaN for
// omitted args). Always copies into a fresh arena buffer; substring sharing
// would couple lifetimes for a marginal saving in ASCII-only Topaz.
static inline topaz_string topaz_string_slice(topaz_string s, double raw_start, double raw_end) {
  size_t lo = topaz_slice_normalize(raw_start, s.len, 0);
  size_t hi = topaz_slice_normalize(raw_end, s.len, s.len);
  if (hi < lo) hi = lo;
  size_t out_len = hi - lo;
  if (out_len == 0) {
    topaz_string r = { "", 0 };
    return r;
  }
  char *buf = (char *)topaz_arena_alloc(out_len + 1);
  memcpy(buf, s.data + lo, out_len);
  buf[out_len] = '\0';
  topaz_string r = { buf, out_len };
  return r;
}

// Phase 1.5-6 prep #12: String.fromCharCode. ASCII-only Topaz, so accept
// [0, 127] integers only and abort on NaN / negative / >= 128. JS truncates
// the argument and applies ToUint16; Topaz refuses anything that would
// escape ASCII because topaz_string assumes ASCII bytes throughout.
static inline topaz_string topaz_string_from_char_code(topaz_number n) {
  if (isnan(n) || n < 0 || n >= 128) {
    fputs("topaz: String.fromCharCode argument out of ASCII range\n", stderr);
    abort();
  }
  unsigned char code = (unsigned char)(size_t)n;
  char *buf = (char *)topaz_arena_alloc(2);
  buf[0] = (char)code;
  buf[1] = '\0';
  topaz_string r = { buf, 1 };
  return r;
}

// Phase 1.5-6 prep #13: node:fs.readFileSync(path, "utf8") -> topaz_string.
// fopen + ftell + fread; the buffer lives in the arena and is reclaimed at
// process exit. Topaz strings are ASCII-only, so a UTF-8 file with any
// non-ASCII byte will load successfully but break the moment downstream code
// indexes / slices by character count — same divergence as string literals.
static inline topaz_string topaz_fs_read_text_file(topaz_string path) {
  char *cpath = (char *)topaz_arena_alloc(path.len + 1);
  memcpy(cpath, path.data, path.len);
  cpath[path.len] = '\0';
  FILE *fp = fopen(cpath, "rb");
  if (!fp) {
    fputs("topaz: readFileSync failed to open '", stderr);
    fwrite(path.data, 1, path.len, stderr);
    fputs("'\n", stderr);
    abort();
  }
  if (fseek(fp, 0, SEEK_END) != 0) {
    fclose(fp);
    fputs("topaz: readFileSync fseek failed\n", stderr);
    abort();
  }
  long size = ftell(fp);
  if (size < 0) {
    fclose(fp);
    fputs("topaz: readFileSync ftell failed\n", stderr);
    abort();
  }
  rewind(fp);
  char *buf = (char *)topaz_arena_alloc((size_t)size + 1);
  size_t got = fread(buf, 1, (size_t)size, fp);
  fclose(fp);
  if (got != (size_t)size) {
    fputs("topaz: readFileSync short read\n", stderr);
    abort();
  }
  buf[size] = '\0';
  topaz_string r = { buf, (size_t)size };
  return r;
}

// Phase 1.5-6 prep #17: node:fs.existsSync(path) -> bool. access(F_OK) probe;
// returns true for files and directories alike (matches Node existsSync). The
// path is copied into the arena to NUL-terminate (topaz_string is not).
static inline bool topaz_fs_exists(topaz_string path) {
  char *cpath = (char *)topaz_arena_alloc(path.len + 1);
  memcpy(cpath, path.data, path.len);
  cpath[path.len] = '\0';
  return access(cpath, F_OK) == 0;
}

// Phase 1.5-6 prep #19: node:fs.writeFileSync(path, content) -> void. fopen
// "wb" + fwrite; truncates existing files (matches Node's default behaviour).
// Encoding is implicitly utf8 — topaz_string bytes are written verbatim. The
// path is copied into the arena to NUL-terminate (topaz_string is not).
static inline void topaz_fs_write_text_file(topaz_string path, topaz_string content) {
  char *cpath = (char *)topaz_arena_alloc(path.len + 1);
  memcpy(cpath, path.data, path.len);
  cpath[path.len] = '\0';
  FILE *fp = fopen(cpath, "wb");
  if (!fp) {
    fputs("topaz: writeFileSync failed to open '", stderr);
    fwrite(path.data, 1, path.len, stderr);
    fputs("'\n", stderr);
    abort();
  }
  size_t put = content.len > 0 ? fwrite(content.data, 1, content.len, fp) : 0;
  fclose(fp);
  if (put != content.len) {
    fputs("topaz: writeFileSync short write\n", stderr);
    abort();
  }
}

// Phase 1.5-6 prep #20: node:fs.mkdirSync(path, { recursive: true }) -> void.
// Walks the path segments left-to-right and mkdir(0777)'s each prefix; EEXIST
// is ignored (matches Node's recursive mode). A non-EEXIST failure aborts with
// the offending segment for debuggability. Empty path is a no-op (Node throws
// ENOENT; we keep it quiet to match the spirit of "ensure dir exists"). The
// codegen side accepts only the `{ recursive: true }` options literal, so this
// function does not need a non-recursive code path.
static inline void topaz_fs_mkdir_p(topaz_string path) {
  if (path.len == 0) return;
  char *buf = (char *)topaz_arena_alloc(path.len + 1);
  memcpy(buf, path.data, path.len);
  buf[path.len] = '\0';
  size_t i = 0;
  // skip leading '/' so the first separator does not produce an empty prefix.
  while (i < path.len && buf[i] == '/') i++;
  while (i < path.len) {
    while (i < path.len && buf[i] != '/') i++;
    char saved = buf[i];
    buf[i] = '\0';
    if (mkdir(buf, 0777) != 0 && errno != EEXIST) {
      fputs("topaz: mkdirSync failed to create '", stderr);
      fputs(buf, stderr);
      fputs("'\n", stderr);
      abort();
    }
    buf[i] = saved;
    while (i < path.len && buf[i] == '/') i++;
  }
  // tail prefix (no trailing slash): mkdir the full path. Trailing slash case
  // already mkdir'd everything in the loop above, so buf is already complete.
  if (buf[0] != '\0' && mkdir(buf, 0777) != 0 && errno != EEXIST) {
    fputs("topaz: mkdirSync failed to create '", stderr);
    fputs(buf, stderr);
    fputs("'\n", stderr);
    abort();
  }
}

// Phase 1.5-6 prep #18: node:path.dirname / resolve (POSIX). Ports of Node's
// path.posix algorithms so the self-hosted loader resolves module specifiers
// identically. Topaz targets Unix only, so the Windows path handling is
// dropped. Results live in the arena (released at process exit).

// path.posix.dirname(p): directory portion. Strips a trailing slash run, then
// returns everything up to the last separator; "." when there is none, "/" for
// an absolute path with no other separator. Mirrors Node's posixDirname.
static inline topaz_string topaz_path_dirname(topaz_string p) {
  if (p.len == 0) { topaz_string dot = { ".", 1 }; return dot; }
  bool has_root = p.data[0] == '/';
  long end = -1;
  bool matched_slash = true;
  for (long i = (long)p.len - 1; i >= 1; --i) {
    if (p.data[i] == '/') {
      if (!matched_slash) { end = i; break; }
    } else {
      matched_slash = false;
    }
  }
  if (end == -1) {
    topaz_string r = has_root ? (topaz_string){ "/", 1 } : (topaz_string){ ".", 1 };
    return r;
  }
  if (has_root && end == 1) { topaz_string r = { "//", 2 }; return r; }
  char *buf = (char *)topaz_arena_alloc((size_t)end + 1);
  memcpy(buf, p.data, (size_t)end);
  buf[end] = '\0';
  topaz_string r = { buf, (size_t)end };
  return r;
}

// Port of Node's normalizeString for POSIX: collapses "." / ".." / repeated and
// trailing separators against [path, len]. allow_above_root keeps leading ".."
// (used when the accumulated path is not yet absolute). Output is never longer
// than the input, so a len+1 arena buffer is sufficient.
static inline topaz_string topaz_path_normalize_string(
    const char *path, size_t len, bool allow_above_root) {
  char *res = (char *)topaz_arena_alloc(len + 1);
  size_t res_len = 0;
  size_t last_segment_length = 0;
  long last_slash = -1;
  int dots = 0;
  char code = 0;
  for (size_t i = 0; i <= len; ++i) {
    if (i < len) code = path[i];
    else if (code == '/') break;
    else code = '/';

    if (code == '/') {
      if (last_slash == (long)i - 1 || dots == 1) {
        // NOOP: empty segment or "."
      } else if (dots == 2) {
        if (res_len < 2 || last_segment_length != 2 ||
            res[res_len - 1] != '.' || res[res_len - 2] != '.') {
          if (res_len > 2) {
            long lsi = -1;
            for (long k = (long)res_len - 1; k >= 0; --k) {
              if (res[k] == '/') { lsi = k; break; }
            }
            if (lsi == -1) {
              res_len = 0;
              last_segment_length = 0;
            } else {
              res_len = (size_t)lsi;
              long lsi2 = -1;
              for (long k = (long)res_len - 1; k >= 0; --k) {
                if (res[k] == '/') { lsi2 = k; break; }
              }
              last_segment_length = res_len - 1 - (size_t)lsi2;
            }
            last_slash = (long)i;
            dots = 0;
            continue;
          } else if (res_len != 0) {
            res_len = 0;
            last_segment_length = 0;
            last_slash = (long)i;
            dots = 0;
            continue;
          }
        }
        if (allow_above_root) {
          if (res_len > 0) { res[res_len++] = '/'; }
          res[res_len++] = '.';
          res[res_len++] = '.';
          last_segment_length = 2;
        }
      } else {
        size_t seg_start = (size_t)(last_slash + 1);
        size_t seg_len = i - seg_start;
        if (res_len > 0) { res[res_len++] = '/'; }
        memcpy(res + res_len, path + seg_start, seg_len);
        res_len += seg_len;
        last_segment_length = i - (size_t)last_slash - 1;
      }
      last_slash = (long)i;
      dots = 0;
    } else if (code == '.' && dots != -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  res[res_len] = '\0';
  topaz_string r = { res, res_len };
  return r;
}

// path.posix.resolve(...segments): build an absolute, normalized path. Segments
// are joined right-to-left until an absolute one is seen; getcwd() is the final
// fallback. Variadic args are topaz_string (passed by value through varargs).
static inline topaz_string topaz_path_resolve(int n, ...) {
  topaz_string *args =
      (topaz_string *)topaz_arena_alloc(sizeof(topaz_string) * (n > 0 ? n : 1));
  va_list ap;
  va_start(ap, n);
  for (int i = 0; i < n; ++i) args[i] = va_arg(ap, topaz_string);
  va_end(ap);

  char *resolved = (char *)topaz_arena_alloc(1);
  resolved[0] = '\0';
  size_t resolved_len = 0;
  bool absolute = false;
  char cwd[4096];

  for (int i = n - 1; i >= -1 && !absolute; --i) {
    const char *seg;
    size_t seg_len;
    if (i >= 0) {
      seg = args[i].data;
      seg_len = args[i].len;
    } else {
      if (!getcwd(cwd, sizeof(cwd))) {
        fputs("topaz: path.resolve getcwd failed\n", stderr);
        abort();
      }
      seg = cwd;
      seg_len = strlen(cwd);
    }
    if (seg_len == 0) continue;
    size_t new_len = seg_len + 1 + resolved_len;
    char *nb = (char *)topaz_arena_alloc(new_len + 1);
    memcpy(nb, seg, seg_len);
    nb[seg_len] = '/';
    memcpy(nb + seg_len + 1, resolved, resolved_len);
    nb[new_len] = '\0';
    resolved = nb;
    resolved_len = new_len;
    absolute = seg[0] == '/';
  }

  topaz_string norm = topaz_path_normalize_string(resolved, resolved_len, !absolute);
  if (absolute) {
    char *out = (char *)topaz_arena_alloc(norm.len + 2);
    out[0] = '/';
    memcpy(out + 1, norm.data, norm.len);
    out[norm.len + 1] = '\0';
    topaz_string r = { out, norm.len + 1 };
    return r;
  }
  if (norm.len > 0) return norm;
  topaz_string dot = { ".", 1 };
  return dot;
}

// Phase 1.5-6 prep #21: node:path.basename(p) — last segment after stripping
// trailing slashes. Empty / all-slashes input yields "". Mirrors Node's
// path.posix.basename(path).
static inline topaz_string topaz_path_basename(topaz_string p) {
  long start = 0;
  long end = -1;
  bool matched_slash = true;
  for (long i = (long)p.len - 1; i >= 0; --i) {
    if (p.data[i] == '/') {
      if (!matched_slash) { start = i + 1; break; }
    } else if (end == -1) {
      matched_slash = false;
      end = i + 1;
    }
  }
  if (end == -1) { topaz_string r = { "", 0 }; return r; }
  size_t out_len = (size_t)(end - start);
  char *buf = (char *)topaz_arena_alloc(out_len + 1);
  if (out_len) memcpy(buf, p.data + start, out_len);
  buf[out_len] = '\0';
  topaz_string r = { buf, out_len };
  return r;
}

// Phase 1.5-6 prep #21: node:path.basename(p, ext). Strips a matching `ext`
// suffix from the last segment if one is present. Port of Node's path.posix
// `basename` with the suffix-matching branch (RTL scan with ext index).
static inline topaz_string topaz_path_basename_ext(
    topaz_string p, topaz_string ext) {
  if (ext.len == 0 || ext.len > p.len) return topaz_path_basename(p);
  if (ext.len == p.len && memcmp(ext.data, p.data, ext.len) == 0) {
    topaz_string r = { "", 0 };
    return r;
  }
  long start = 0;
  long end = -1;
  long first_non_slash_end = -1;
  long ext_idx = (long)ext.len - 1;
  bool matched_slash = true;
  for (long i = (long)p.len - 1; i >= 0; --i) {
    char code = p.data[i];
    if (code == '/') {
      if (!matched_slash) { start = i + 1; break; }
    } else {
      if (first_non_slash_end == -1) {
        matched_slash = false;
        first_non_slash_end = i + 1;
      }
      if (ext_idx >= 0) {
        if (code == ext.data[ext_idx]) {
          if (--ext_idx == -1) end = i;
        } else {
          ext_idx = -1;
          end = first_non_slash_end;
        }
      }
    }
  }
  if (start == end) end = first_non_slash_end;
  else if (end == -1) end = (long)p.len;
  if (end <= start) { topaz_string r = { "", 0 }; return r; }
  size_t out_len = (size_t)(end - start);
  char *buf = (char *)topaz_arena_alloc(out_len + 1);
  memcpy(buf, p.data + start, out_len);
  buf[out_len] = '\0';
  topaz_string r = { buf, out_len };
  return r;
}

// Phase 1.5-6 prep #22: node:path.extname(p) — extension of the last path
// segment, including the leading dot. Mirrors Node's path.posix.extname:
// returns "" when the last segment has no dot, is exactly "." / "..", or
// starts with a single leading dot and has no other dot (`.bashrc` -> "").
// RTL scan tracks (start_dot, end, start_part, pre_dot_state) jointly so the
// "leading-dot-only" edge case can be ruled out in one pass.
static inline topaz_string topaz_path_extname(topaz_string p) {
  long start_dot = -1;
  long start_part = 0;
  long end = -1;
  bool matched_slash = true;
  int pre_dot_state = 0;
  for (long i = (long)p.len - 1; i >= 0; --i) {
    char code = p.data[i];
    if (code == '/') {
      if (!matched_slash) { start_part = i + 1; break; }
      continue;
    }
    if (end == -1) {
      matched_slash = false;
      end = i + 1;
    }
    if (code == '.') {
      if (start_dot == -1) start_dot = i;
      else if (pre_dot_state != 1) pre_dot_state = 1;
    } else if (start_dot != -1) {
      pre_dot_state = -1;
    }
  }
  if (start_dot == -1 || end == -1 || pre_dot_state == 0 ||
      (pre_dot_state == 1 && start_dot == end - 1 &&
       start_dot == start_part + 1)) {
    topaz_string r = { "", 0 };
    return r;
  }
  size_t out_len = (size_t)(end - start_dot);
  char *buf = (char *)topaz_arena_alloc(out_len + 1);
  memcpy(buf, p.data + start_dot, out_len);
  buf[out_len] = '\0';
  topaz_string r = { buf, out_len };
  return r;
}

// Phase 1.5-6 prep #23: node:path.join(...segments) — concatenate non-empty
// segments with "/" then run posix.normalize. Mirrors Node's path.posix.join:
// zero args / all-empty args yield ".", a leading "/" is preserved, a trailing
// "/" is preserved when the normalized middle is non-empty, "/" alone collapses
// to "/", and a relative join of only "..." segments keeps leading ".." via
// allow_above_root. Variadic args are topaz_string passed through varargs.
static inline topaz_string topaz_path_join(int n, ...) {
  if (n == 0) { topaz_string dot = { ".", 1 }; return dot; }

  topaz_string *args =
      (topaz_string *)topaz_arena_alloc(sizeof(topaz_string) * n);
  va_list ap;
  va_start(ap, n);
  for (int i = 0; i < n; ++i) args[i] = va_arg(ap, topaz_string);
  va_end(ap);

  size_t total = 0;
  int nonempty = 0;
  for (int i = 0; i < n; ++i) {
    if (args[i].len > 0) {
      if (nonempty > 0) total += 1; // "/" separator
      total += args[i].len;
      ++nonempty;
    }
  }
  if (nonempty == 0) { topaz_string dot = { ".", 1 }; return dot; }

  char *joined = (char *)topaz_arena_alloc(total + 1);
  size_t pos = 0;
  bool first = true;
  for (int i = 0; i < n; ++i) {
    if (args[i].len == 0) continue;
    if (!first) joined[pos++] = '/';
    memcpy(joined + pos, args[i].data, args[i].len);
    pos += args[i].len;
    first = false;
  }
  joined[pos] = '\0';

  bool absolute = pos > 0 && joined[0] == '/';
  bool trailing = pos > 0 && joined[pos - 1] == '/';

  topaz_string norm = topaz_path_normalize_string(joined, pos, !absolute);

  if (norm.len == 0) {
    if (absolute) { topaz_string r = { "/", 1 }; return r; }
    if (trailing) { topaz_string r = { "./", 2 }; return r; }
    topaz_string dot = { ".", 1 };
    return dot;
  }

  size_t out_len = norm.len + (absolute ? 1u : 0u) + (trailing ? 1u : 0u);
  char *out = (char *)topaz_arena_alloc(out_len + 1);
  size_t op = 0;
  if (absolute) out[op++] = '/';
  memcpy(out + op, norm.data, norm.len);
  op += norm.len;
  if (trailing) out[op++] = '/';
  out[op] = '\0';
  topaz_string r = { out, out_len };
  return r;
}

// Phase 1.5-6 prep #16: global parseInt(s, radix) / parseFloat(s) for the
// self-hosted number-literal parser. The codegen requires an explicit radix
// for parseInt (1-arg auto-radix is a footgun, unused in src/). Both copy into
// an arena buffer to guarantee a NUL terminator for strtoll/strtod (a
// topaz_string is not contractually NUL-terminated past .len). Divergences
// from JS: a bad radix (not 0 and outside [2,36]) and a string whose prefix has
// no valid digits both yield NaN rather than JS's NaN-on-empty / clamped
// behaviour; otherwise strtoll/strtod's prefix parse stops at the first invalid
// char (same as JS parseInt/parseFloat). Result is widened to f64.
static inline topaz_number topaz_parse_int(topaz_string s, topaz_number radix) {
  int base = (int)radix;
  if (base != 0 && (base < 2 || base > 36)) return (topaz_number)NAN;
  char *buf = (char *)topaz_arena_alloc(s.len + 1);
  if (s.len) memcpy(buf, s.data, s.len);
  buf[s.len] = '\0';
  char *end = buf;
  long long v = strtoll(buf, &end, base);
  if (end == buf) return (topaz_number)NAN;
  return (topaz_number)v;
}

static inline topaz_number topaz_parse_float(topaz_string s) {
  char *buf = (char *)topaz_arena_alloc(s.len + 1);
  if (s.len) memcpy(buf, s.data, s.len);
  buf[s.len] = '\0';
  char *end = buf;
  double v = strtod(buf, &end);
  if (end == buf) return (topaz_number)NAN;
  return v;
}

static inline void topaz_console_log_boolean(topaz_boolean b) {
  fputs(b ? "true\n" : "false\n", stdout);
}

// Phase 1.5-3.5: boolean → string. Returns a `topaz_string` pointing into a
// `static const` literal; no arena alloc, immutable byte string.
static inline topaz_string topaz_boolean_to_string(topaz_boolean b) {
  static const char true_str[]  = "true";
  static const char false_str[] = "false";
  topaz_string r;
  if (b) { r.data = true_str;  r.len = 4; }
  else   { r.data = false_str; r.len = 5; }
  return r;
}

// Phase 1.2 / 1.5-3.5: ECMA-262 ToString(Number). Shortest round-trip via
// snprintf(%.*e) + strtod precision search, then ECMA-262 formatting written
// into an arena-allocated buffer. The returned `topaz_string` is owned by the
// arena (released at process exit). `topaz_console_log_number` reuses this
// function and appends '\n'. Phase 2 may swap the precision-search core for a
// real Ryu port; correctness here rests on libc's correctly-rounded strtod.
static inline topaz_string topaz_number_to_string(topaz_number n) {
  if (isnan(n)) {
    topaz_string r = { "NaN", 3 };
    return r;
  }
  if (isinf(n)) {
    topaz_string r;
    if (n > 0) { r.data = "Infinity";  r.len = 8; }
    else       { r.data = "-Infinity"; r.len = 9; }
    return r;
  }
  if (n == 0.0) {
    topaz_string r = { "0", 1 };
    return r;
  }
  if (n == (topaz_number)(int64_t)n &&
      n >= -9007199254740992.0 && n <= 9007199254740992.0) {
    char *buf = (char *)topaz_arena_alloc(24);
    int written = snprintf(buf, 24, "%lld", (long long)(int64_t)n);
    topaz_string r = { buf, (size_t)written };
    return r;
  }

  char ebuf[32];
  int p;
  for (p = 1; p <= 17; p++) {
    snprintf(ebuf, sizeof(ebuf), "%.*e", p - 1, n);
    if (strtod(ebuf, NULL) == n) break;
  }
  if (p > 17) p = 17;

  const char *s = ebuf;
  bool negative = false;
  if (*s == '-') { negative = true; s++; }

  char digits[20];
  int k = 0;
  digits[k++] = *s++;
  if (*s == '.') {
    s++;
    while (*s != 'e' && *s != 'E' && *s != '\0' && k < (int)sizeof(digits)) {
      digits[k++] = *s++;
    }
  }
  if (*s == 'e' || *s == 'E') s++;
  int exp_sign = 1;
  if (*s == '+') s++;
  else if (*s == '-') { exp_sign = -1; s++; }
  int exp10 = 0;
  while (*s >= '0' && *s <= '9') {
    exp10 = exp10 * 10 + (*s - '0');
    s++;
  }
  exp10 *= exp_sign;

  // ECMA-262 ToString: n_pos is the 1-indexed decimal point position. The
  // four arms below are sized to fit within a 48-byte buffer comfortably —
  // worst cases are exponential form (~25 chars) and pure decimal with
  // leading zeros (~27 chars), both well under 48.
  int n_pos = exp10 + 1;
  char *buf = (char *)topaz_arena_alloc(48);
  int pos = 0;

  if (negative) buf[pos++] = '-';

  if (n_pos >= k && n_pos <= 21) {
    memcpy(buf + pos, digits, k); pos += k;
    for (int i = 0; i < n_pos - k; i++) buf[pos++] = '0';
  } else if (n_pos > 0 && n_pos <= 21) {
    memcpy(buf + pos, digits, n_pos); pos += n_pos;
    buf[pos++] = '.';
    memcpy(buf + pos, digits + n_pos, k - n_pos); pos += k - n_pos;
  } else if (n_pos > -6 && n_pos <= 0) {
    buf[pos++] = '0'; buf[pos++] = '.';
    for (int i = 0; i < -n_pos; i++) buf[pos++] = '0';
    memcpy(buf + pos, digits, k); pos += k;
  } else {
    buf[pos++] = digits[0];
    if (k > 1) {
      buf[pos++] = '.';
      memcpy(buf + pos, digits + 1, k - 1); pos += k - 1;
    }
    int e = n_pos - 1;
    if (e >= 0) pos += snprintf(buf + pos, 48 - pos, "e+%d", e);
    else        pos += snprintf(buf + pos, 48 - pos, "e-%d", -e);
  }

  buf[pos] = '\0';
  topaz_string r = { buf, (size_t)pos };
  return r;
}

static inline void topaz_console_log_number(topaz_number n) {
  topaz_string s = topaz_number_to_string(n);
  if (s.len) fwrite(s.data, 1, s.len, stdout);
  putchar('\n');
}

// Phase 1.3: monomorphized growable arrays. Reference semantics — variables
// hold `topaz_array_<elem> *` and share storage on assignment. Bounds-checked
// with abort on violation. Arena-allocated; the old buffer left behind by
// grow() lives until process exit, which the Array's doubling strategy bounds
// to at most 2× peak memory.
#define TOPAZ_ARRAY_DEFINE(name, elem_t)                                              \
typedef struct {                                                                       \
  elem_t *data;                                                                        \
  size_t len;                                                                          \
  size_t cap;                                                                          \
} topaz_array_##name;                                                                  \
                                                                                       \
static inline topaz_array_##name *topaz_array_##name##_new(void) {                     \
  topaz_array_##name *a = (topaz_array_##name *)topaz_arena_alloc(sizeof(*a));         \
  a->data = NULL;                                                                      \
  a->len = 0;                                                                          \
  a->cap = 0;                                                                          \
  return a;                                                                            \
}                                                                                      \
                                                                                       \
static inline void topaz_array_##name##_reserve(topaz_array_##name *a, size_t want) {  \
  if (a->cap >= want) return;                                                          \
  size_t new_cap = a->cap == 0 ? 4 : a->cap * 2;                                       \
  while (new_cap < want) new_cap *= 2;                                                 \
  elem_t *new_data = (elem_t *)topaz_arena_realloc(                                    \
      a->data, a->cap * sizeof(elem_t), new_cap * sizeof(elem_t));                     \
  a->data = new_data;                                                                  \
  a->cap = new_cap;                                                                    \
}                                                                                      \
                                                                                       \
static inline void topaz_array_##name##_push(topaz_array_##name *a, elem_t v) {        \
  topaz_array_##name##_reserve(a, a->len + 1);                                         \
  a->data[a->len++] = v;                                                               \
}                                                                                      \
                                                                                       \
static inline elem_t topaz_array_##name##_pop(topaz_array_##name *a) {                 \
  if (a->len == 0) { fputs("topaz: pop from empty array\n", stderr); abort(); }        \
  return a->data[--a->len];                                                            \
}                                                                                      \
                                                                                       \
static inline elem_t topaz_array_##name##_at(topaz_array_##name *a, topaz_number i) {  \
  if (!(i >= 0) || i >= (topaz_number)a->len) {                                        \
    fputs("topaz: array index out of bounds\n", stderr); abort();                      \
  }                                                                                    \
  return a->data[(size_t)i];                                                           \
}                                                                                      \
                                                                                       \
static inline elem_t topaz_array_##name##_set(                                         \
    topaz_array_##name *a, topaz_number i, elem_t v) {                                 \
  if (!(i >= 0) || i >= (topaz_number)a->len) {                                        \
    fputs("topaz: array index out of bounds\n", stderr); abort();                      \
  }                                                                                    \
  a->data[(size_t)i] = v;                                                              \
  return v;                                                                            \
}

TOPAZ_ARRAY_DEFINE(number, topaz_number)
TOPAZ_ARRAY_DEFINE(boolean, topaz_boolean)
TOPAZ_ARRAY_DEFINE(string, topaz_string)

// Phase 1.5-6 prep #24: node:child_process.execFileSync(cmd, args,
// { stdio: "inherit" }) -> void. fork + execvp + waitpid; stdio inherits the
// parent (no pipe handling required). argv is built into the arena from the
// topaz_string command and Array<string> arg list, each element copied to a
// NUL-terminated buffer because execvp wants C strings. Non-zero exit and
// termination by signal both abort — matches Node's "throw on non-zero"
// behaviour, just collapsed to abort since Topaz has no JS-style Error to
// raise out of a runtime helper. stdout/stderr are flushed before fork so
// buffered parent output isn't interleaved with the child's inherited fds.
static inline void topaz_child_exec_inherit(topaz_string cmd, topaz_array_string *args) {
  char **argv = (char **)topaz_arena_alloc(sizeof(char *) * (args->len + 2));
  char *ccmd = (char *)topaz_arena_alloc(cmd.len + 1);
  memcpy(ccmd, cmd.data, cmd.len);
  ccmd[cmd.len] = '\0';
  argv[0] = ccmd;
  for (size_t i = 0; i < args->len; ++i) {
    topaz_string a = args->data[i];
    char *carg = (char *)topaz_arena_alloc(a.len + 1);
    memcpy(carg, a.data, a.len);
    carg[a.len] = '\0';
    argv[i + 1] = carg;
  }
  argv[args->len + 1] = NULL;
  fflush(stdout);
  fflush(stderr);
  pid_t pid = fork();
  if (pid < 0) {
    fputs("topaz: execFileSync fork failed\n", stderr);
    abort();
  }
  if (pid == 0) {
    execvp(argv[0], argv);
    // execvp only returns on error. Use _exit so the child does not flush the
    // parent's stdio buffers a second time.
    fputs("topaz: execFileSync exec failed for '", stderr);
    fputs(argv[0], stderr);
    fputs("'\n", stderr);
    _exit(127);
  }
  int status = 0;
  while (waitpid(pid, &status, 0) < 0) {
    if (errno != EINTR) {
      fputs("topaz: execFileSync waitpid failed\n", stderr);
      abort();
    }
  }
  if (WIFSIGNALED(status)) {
    fputs("topaz: execFileSync child terminated by signal\n", stderr);
    abort();
  }
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
    fputs("topaz: execFileSync child exited with non-zero status\n", stderr);
    abort();
  }
}

// Phase 1.5-6 prep #25: node:url.fileURLToPath(url) -> path. Strip the
// `file://` scheme + optional empty/`localhost` authority and percent-decode
// the remaining bytes. POSIX target only — Windows drive letters / backslash
// translation are out of scope. Aborts on a non-`file:` URL, a non-absolute
// path, or malformed percent escapes (matches Node's ERR_INVALID_URL family
// collapsed to abort since we have no Error class).
static inline topaz_string topaz_url_file_url_to_path(topaz_string url) {
  static const char PREFIX[] = "file://";
  const size_t plen = sizeof(PREFIX) - 1;
  if (url.len < plen || memcmp(url.data, PREFIX, plen) != 0) {
    fputs("topaz: fileURLToPath: URL must start with 'file://'\n", stderr);
    abort();
  }
  const char *cur = url.data + plen;
  const char *end = url.data + url.len;
  if (cur < end && *cur != '/') {
    const char *host_end = cur;
    while (host_end < end && *host_end != '/') host_end++;
    size_t host_len = (size_t)(host_end - cur);
    if (!(host_len == 9 && memcmp(cur, "localhost", 9) == 0)) {
      fputs("topaz: fileURLToPath: only empty / 'localhost' file URL hosts are supported\n", stderr);
      abort();
    }
    cur = host_end;
  }
  if (cur >= end || *cur != '/') {
    fputs("topaz: fileURLToPath: file URL path must be absolute\n", stderr);
    abort();
  }
  size_t cap = (size_t)(end - cur);
  char *buf = (char *)topaz_arena_alloc(cap);
  size_t out = 0;
  while (cur < end) {
    char c = *cur;
    if (c == '%') {
      if (cur + 3 > end) {
        fputs("topaz: fileURLToPath: truncated percent-encoding\n", stderr);
        abort();
      }
      char h = cur[1], l = cur[2];
      int hv = (h >= '0' && h <= '9') ? h - '0'
              : (h >= 'a' && h <= 'f') ? h - 'a' + 10
              : (h >= 'A' && h <= 'F') ? h - 'A' + 10 : -1;
      int lv = (l >= '0' && l <= '9') ? l - '0'
              : (l >= 'a' && l <= 'f') ? l - 'a' + 10
              : (l >= 'A' && l <= 'F') ? l - 'A' + 10 : -1;
      if (hv < 0 || lv < 0) {
        fputs("topaz: fileURLToPath: invalid percent-encoding\n", stderr);
        abort();
      }
      buf[out++] = (char)((hv << 4) | lv);
      cur += 3;
    } else {
      buf[out++] = c;
      cur++;
    }
  }
  topaz_string r = { buf, out };
  return r;
}

// Phase 1.5-6 prep #25: `import.meta.url` -> "file://<realpath of executable>".
// In Node ESM `import.meta.url` is the URL of the current module; in a native
// AOT binary the equivalent reference point is the running executable. The
// answer is fixed across the process lifetime, so cache it on first call.
static inline topaz_string topaz_runtime_module_url(void) {
  static char cache[4096];
  static size_t cache_len = 0;
  if (cache_len == 0) {
    char raw[4096];
#if defined(__APPLE__)
    uint32_t sz = sizeof(raw);
    if (_NSGetExecutablePath(raw, &sz) != 0) {
      fputs("topaz: import.meta.url: _NSGetExecutablePath buffer too small\n", stderr);
      abort();
    }
#elif defined(__linux__)
    ssize_t n = readlink("/proc/self/exe", raw, sizeof(raw) - 1);
    if (n < 0) {
      fputs("topaz: import.meta.url: readlink(/proc/self/exe) failed\n", stderr);
      abort();
    }
    raw[n] = '\0';
#else
    fputs("topaz: import.meta.url: unsupported platform\n", stderr);
    abort();
#endif
    char resolved[4096];
    if (!realpath(raw, resolved)) {
      fputs("topaz: import.meta.url: realpath failed\n", stderr);
      abort();
    }
    size_t rlen = strlen(resolved);
    static const char SCHEME[] = "file://";
    size_t slen = sizeof(SCHEME) - 1;
    if (slen + rlen >= sizeof(cache)) {
      fputs("topaz: import.meta.url: executable path too long\n", stderr);
      abort();
    }
    memcpy(cache, SCHEME, slen);
    memcpy(cache + slen, resolved, rlen);
    cache_len = slen + rlen;
  }
  topaz_string r = { cache, cache_len };
  return r;
}

// Phase 1.3b: hash helpers + monomorphized Map/Set.
//
// Key equality follows JS Map / Set's SameValueZero (NaN === NaN, -0 === +0)
// rather than `===` — this is the published semantics for Map keys. The
// divergence from topaz `===` only matters for `number` keys.

#define TOPAZ_HASH_SLOT_EMPTY 0
#define TOPAZ_HASH_SLOT_OCCUPIED 1
#define TOPAZ_HASH_SLOT_TOMBSTONE 2

static inline size_t topaz_hash_number(topaz_number n) {
  if (n == 0.0) n = 0.0;          // collapse -0 → +0
  if (n != n) {                    // any NaN → canonical NaN
    n = (topaz_number)NAN;
  }
  uint64_t bits;
  memcpy(&bits, &n, sizeof(bits));
  bits ^= bits >> 33;
  bits *= 0xff51afd7ed558ccdULL;
  bits ^= bits >> 33;
  bits *= 0xc4ceb9fe1a85ec53ULL;
  bits ^= bits >> 33;
  return (size_t)bits;
}

static inline topaz_boolean topaz_key_eq_number(topaz_number a, topaz_number b) {
  if (a == b) return true;                  // covers ±0 and all finite cases
  if (a != a && b != b) return true;        // SameValueZero treats NaN as equal
  return false;
}

static inline size_t topaz_hash_boolean(topaz_boolean b) {
  return b ? 1u : 0u;
}

// Reference identity hash for class instances / interface fat-pointer payloads.
// Runs the same splitmix-style mixer on the pointer's bit pattern. Used by
// Set<class>/Set<interface> monomorphs (codegen wraps this per-type so the
// macro sees a hash_fn with the right key_t parameter).
static inline size_t topaz_hash_pointer(const void *p) {
  uint64_t bits = (uint64_t)(uintptr_t)p;
  bits ^= bits >> 33;
  bits *= 0xff51afd7ed558ccdULL;
  bits ^= bits >> 33;
  bits *= 0xc4ceb9fe1a85ec53ULL;
  bits ^= bits >> 33;
  return (size_t)bits;
}

static inline topaz_boolean topaz_key_eq_boolean(topaz_boolean a, topaz_boolean b) {
  return a == b;
}

// FNV-1a over UTF-8 bytes. ASCII-only at the codegen layer, so byte hashing is
// well-defined; if non-ASCII ever leaks in via FFI, the hash still works but
// `.length` divergence with JS UTF-16 is the bigger issue.
static inline size_t topaz_hash_string(topaz_string s) {
  uint64_t h = 14695981039346656037ULL;
  for (size_t i = 0; i < s.len; i++) {
    h ^= (uint8_t)s.data[i];
    h *= 1099511628211ULL;
  }
  return (size_t)h;
}

// Open-addressing hash table, linear probing, tombstones on delete. Grows when
// (size + tombstones + 1) > cap * 3/4. If size hasn't grown but tombstones
// have, rehash in place at the current cap instead of doubling.
// Phase 1.5-3c: `_get` returns `opt_t`, the optional representation of `val_t`:
// scalar V → `topaz_opt_<scalar>`, class V → `val_t` itself (NULL = absent),
// iface V → `val_t` itself (.data == NULL = absent). `opt_wrap(v)` builds the
// present optional from a stored slot value; `opt_absent` is the missing
// sentinel. Macro args carry the wiring so the same macro body covers all
// three V categories.
#define TOPAZ_MAP_DEFINE(name, key_t, val_t, opt_t, opt_wrap, opt_absent, hash_fn, eq_fn) \
typedef struct {                                                                       \
  uint8_t state;                                                                       \
  key_t key;                                                                           \
  val_t value;                                                                         \
} topaz_map_##name##_slot;                                                             \
                                                                                       \
typedef struct {                                                                       \
  topaz_map_##name##_slot *slots;                                                      \
  size_t cap;                                                                          \
  size_t size;                                                                         \
  size_t tombstones;                                                                   \
} topaz_map_##name;                                                                    \
                                                                                       \
static inline topaz_map_##name *topaz_map_##name##_new(void) {                         \
  topaz_map_##name *m = (topaz_map_##name *)topaz_arena_alloc(sizeof(*m));             \
  m->slots = NULL; m->cap = 0; m->size = 0; m->tombstones = 0;                         \
  return m;                                                                            \
}                                                                                      \
                                                                                       \
static inline size_t topaz_map_##name##_find_slot(                                     \
    topaz_map_##name##_slot *slots, size_t cap, key_t k) {                             \
  size_t mask = cap - 1;                                                               \
  size_t i = hash_fn(k) & mask;                                                        \
  size_t first_tomb = SIZE_MAX;                                                        \
  for (;;) {                                                                           \
    uint8_t st = slots[i].state;                                                       \
    if (st == TOPAZ_HASH_SLOT_EMPTY) {                                                 \
      return first_tomb != SIZE_MAX ? first_tomb : i;                                  \
    }                                                                                  \
    if (st == TOPAZ_HASH_SLOT_OCCUPIED && eq_fn(slots[i].key, k)) return i;            \
    if (st == TOPAZ_HASH_SLOT_TOMBSTONE && first_tomb == SIZE_MAX) first_tomb = i;     \
    i = (i + 1) & mask;                                                                \
  }                                                                                    \
}                                                                                      \
                                                                                       \
static inline void topaz_map_##name##_rehash(topaz_map_##name *m, size_t new_cap) {    \
  topaz_map_##name##_slot *new_slots =                                                 \
      (topaz_map_##name##_slot *)topaz_arena_calloc(new_cap, sizeof(*new_slots));      \
  for (size_t i = 0; i < m->cap; i++) {                                                \
    if (m->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) continue;                       \
    size_t idx = topaz_map_##name##_find_slot(new_slots, new_cap, m->slots[i].key);    \
    new_slots[idx].state = TOPAZ_HASH_SLOT_OCCUPIED;                                   \
    new_slots[idx].key = m->slots[i].key;                                              \
    new_slots[idx].value = m->slots[i].value;                                          \
  }                                                                                    \
  m->slots = new_slots;                                                                \
  m->cap = new_cap;                                                                    \
  m->tombstones = 0;                                                                   \
}                                                                                      \
                                                                                       \
static inline void topaz_map_##name##_set(                                             \
    topaz_map_##name *m, key_t k, val_t v) {                                           \
  if (m->cap == 0) {                                                                   \
    topaz_map_##name##_rehash(m, 8);                                                   \
  } else if ((m->size + m->tombstones + 1) * 4 > m->cap * 3) {                         \
    size_t new_cap = m->size * 2 < m->cap ? m->cap : m->cap * 2;                       \
    topaz_map_##name##_rehash(m, new_cap);                                             \
  }                                                                                    \
  size_t i = topaz_map_##name##_find_slot(m->slots, m->cap, k);                        \
  if (m->slots[i].state == TOPAZ_HASH_SLOT_OCCUPIED) {                                 \
    m->slots[i].value = v;                                                             \
    return;                                                                            \
  }                                                                                    \
  if (m->slots[i].state == TOPAZ_HASH_SLOT_TOMBSTONE) m->tombstones--;                 \
  m->slots[i].state = TOPAZ_HASH_SLOT_OCCUPIED;                                        \
  m->slots[i].key = k;                                                                 \
  m->slots[i].value = v;                                                               \
  m->size++;                                                                           \
}                                                                                      \
                                                                                       \
static inline topaz_boolean topaz_map_##name##_has(topaz_map_##name *m, key_t k) {     \
  if (m->cap == 0) return false;                                                       \
  size_t i = topaz_map_##name##_find_slot(m->slots, m->cap, k);                        \
  return m->slots[i].state == TOPAZ_HASH_SLOT_OCCUPIED;                                \
}                                                                                      \
                                                                                       \
static inline opt_t topaz_map_##name##_get(topaz_map_##name *m, key_t k) {             \
  if (m->cap == 0) return opt_absent;                                                  \
  size_t i = topaz_map_##name##_find_slot(m->slots, m->cap, k);                        \
  if (m->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) return opt_absent;                \
  return opt_wrap(m->slots[i].value);                                                  \
}                                                                                      \
                                                                                       \
static inline topaz_boolean topaz_map_##name##_delete(topaz_map_##name *m, key_t k) {  \
  if (m->cap == 0) return false;                                                       \
  size_t i = topaz_map_##name##_find_slot(m->slots, m->cap, k);                        \
  if (m->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) return false;                     \
  m->slots[i].state = TOPAZ_HASH_SLOT_TOMBSTONE;                                       \
  m->size--;                                                                           \
  m->tombstones++;                                                                     \
  return true;                                                                         \
}

#define TOPAZ_SET_DEFINE(name, elem_t, hash_fn, eq_fn)                                 \
typedef struct {                                                                       \
  uint8_t state;                                                                       \
  elem_t key;                                                                          \
} topaz_set_##name##_slot;                                                             \
                                                                                       \
typedef struct {                                                                       \
  topaz_set_##name##_slot *slots;                                                      \
  size_t cap;                                                                          \
  size_t size;                                                                         \
  size_t tombstones;                                                                   \
} topaz_set_##name;                                                                    \
                                                                                       \
static inline topaz_set_##name *topaz_set_##name##_new(void) {                         \
  topaz_set_##name *s = (topaz_set_##name *)topaz_arena_alloc(sizeof(*s));             \
  s->slots = NULL; s->cap = 0; s->size = 0; s->tombstones = 0;                         \
  return s;                                                                            \
}                                                                                      \
                                                                                       \
static inline size_t topaz_set_##name##_find_slot(                                     \
    topaz_set_##name##_slot *slots, size_t cap, elem_t k) {                            \
  size_t mask = cap - 1;                                                               \
  size_t i = hash_fn(k) & mask;                                                        \
  size_t first_tomb = SIZE_MAX;                                                        \
  for (;;) {                                                                           \
    uint8_t st = slots[i].state;                                                       \
    if (st == TOPAZ_HASH_SLOT_EMPTY) {                                                 \
      return first_tomb != SIZE_MAX ? first_tomb : i;                                  \
    }                                                                                  \
    if (st == TOPAZ_HASH_SLOT_OCCUPIED && eq_fn(slots[i].key, k)) return i;            \
    if (st == TOPAZ_HASH_SLOT_TOMBSTONE && first_tomb == SIZE_MAX) first_tomb = i;     \
    i = (i + 1) & mask;                                                                \
  }                                                                                    \
}                                                                                      \
                                                                                       \
static inline void topaz_set_##name##_rehash(topaz_set_##name *s, size_t new_cap) {    \
  topaz_set_##name##_slot *new_slots =                                                 \
      (topaz_set_##name##_slot *)topaz_arena_calloc(new_cap, sizeof(*new_slots));      \
  for (size_t i = 0; i < s->cap; i++) {                                                \
    if (s->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) continue;                       \
    size_t idx = topaz_set_##name##_find_slot(new_slots, new_cap, s->slots[i].key);    \
    new_slots[idx].state = TOPAZ_HASH_SLOT_OCCUPIED;                                   \
    new_slots[idx].key = s->slots[i].key;                                              \
  }                                                                                    \
  s->slots = new_slots;                                                                \
  s->cap = new_cap;                                                                    \
  s->tombstones = 0;                                                                   \
}                                                                                      \
                                                                                       \
static inline void topaz_set_##name##_add(topaz_set_##name *s, elem_t k) {             \
  if (s->cap == 0) {                                                                   \
    topaz_set_##name##_rehash(s, 8);                                                   \
  } else if ((s->size + s->tombstones + 1) * 4 > s->cap * 3) {                         \
    size_t new_cap = s->size * 2 < s->cap ? s->cap : s->cap * 2;                       \
    topaz_set_##name##_rehash(s, new_cap);                                             \
  }                                                                                    \
  size_t i = topaz_set_##name##_find_slot(s->slots, s->cap, k);                        \
  if (s->slots[i].state == TOPAZ_HASH_SLOT_OCCUPIED) return;                           \
  if (s->slots[i].state == TOPAZ_HASH_SLOT_TOMBSTONE) s->tombstones--;                 \
  s->slots[i].state = TOPAZ_HASH_SLOT_OCCUPIED;                                        \
  s->slots[i].key = k;                                                                 \
  s->size++;                                                                           \
}                                                                                      \
                                                                                       \
static inline topaz_boolean topaz_set_##name##_has(topaz_set_##name *s, elem_t k) {    \
  if (s->cap == 0) return false;                                                       \
  size_t i = topaz_set_##name##_find_slot(s->slots, s->cap, k);                        \
  return s->slots[i].state == TOPAZ_HASH_SLOT_OCCUPIED;                                \
}                                                                                      \
                                                                                       \
static inline topaz_boolean topaz_set_##name##_delete(topaz_set_##name *s, elem_t k) { \
  if (s->cap == 0) return false;                                                       \
  size_t i = topaz_set_##name##_find_slot(s->slots, s->cap, k);                        \
  if (s->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) return false;                     \
  s->slots[i].state = TOPAZ_HASH_SLOT_TOMBSTONE;                                       \
  s->size--;                                                                           \
  s->tombstones++;                                                                     \
  return true;                                                                         \
}

TOPAZ_MAP_DEFINE(number_number,   topaz_number,  topaz_number,  topaz_opt_number,  topaz_opt_wrap_number,  topaz_opt_absent_number,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(number_boolean,  topaz_number,  topaz_boolean, topaz_opt_boolean, topaz_opt_wrap_boolean, topaz_opt_absent_boolean, topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(number_string,   topaz_number,  topaz_string,  topaz_opt_string,  topaz_opt_wrap_string,  topaz_opt_absent_string,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(boolean_number,  topaz_boolean, topaz_number,  topaz_opt_number,  topaz_opt_wrap_number,  topaz_opt_absent_number,  topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(boolean_boolean, topaz_boolean, topaz_boolean, topaz_opt_boolean, topaz_opt_wrap_boolean, topaz_opt_absent_boolean, topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(boolean_string,  topaz_boolean, topaz_string,  topaz_opt_string,  topaz_opt_wrap_string,  topaz_opt_absent_string,  topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(string_number,   topaz_string,  topaz_number,  topaz_opt_number,  topaz_opt_wrap_number,  topaz_opt_absent_number,  topaz_hash_string,  topaz_string_eq)
TOPAZ_MAP_DEFINE(string_boolean,  topaz_string,  topaz_boolean, topaz_opt_boolean, topaz_opt_wrap_boolean, topaz_opt_absent_boolean, topaz_hash_string,  topaz_string_eq)
TOPAZ_MAP_DEFINE(string_string,   topaz_string,  topaz_string,  topaz_opt_string,  topaz_opt_wrap_string,  topaz_opt_absent_string,  topaz_hash_string,  topaz_string_eq)

TOPAZ_SET_DEFINE(number,  topaz_number,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_SET_DEFINE(boolean, topaz_boolean, topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_SET_DEFINE(string,  topaz_string,  topaz_hash_string,  topaz_string_eq)

// Phase 1.5-1: exceptions. setjmp/longjmp + a linked-list frame stack rooted
// at `topaz_try_top`. The thrown value is a class-instance pointer cast to
// `void *` and parked in a global until the catch site reads it (catch body
// binds it back to the annotated class type, no per-frame storage needed).
// Single-TU runtime, so the globals don't need _Thread_local.
typedef struct topaz_try_frame {
  jmp_buf env;
  struct topaz_try_frame *prev;
} topaz_try_frame;

static topaz_try_frame *topaz_try_top = NULL;
static void *topaz_throw_value = NULL;

static inline void topaz_try_push(topaz_try_frame *f) {
  f->prev = topaz_try_top;
  topaz_try_top = f;
}

static inline void topaz_try_pop(void) {
  topaz_try_top = topaz_try_top->prev;
}

// topaz_throw pops its own frame before longjmp so the catch body never has
// to. Volatile-pinned locals aren't needed since the catch body reads only
// the global `topaz_throw_value` — frame-local state is untouched after
// setjmp returns nonzero. `static inline` matches the other runtime helpers
// and keeps -Wunused-function quiet for programs that don't throw.
static inline void topaz_throw(void *v) {
  if (!topaz_try_top) {
    fputs("topaz: uncaught exception\n", stderr);
    abort();
  }
  topaz_throw_value = v;
  topaz_try_frame *f = topaz_try_top;
  topaz_try_top = f->prev;
  longjmp(f->env, 1);
}

#endif
