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
// `data` is either a literal (static lifetime) or arena-allocated by string
// helpers (released at process exit, see topaz_arena_alloc above).
typedef struct {
  const char *data;
  size_t len;
} topaz_string;

typedef struct {
  char *data;
  size_t len;
  size_t cap;
} topaz_string_buffer;

// Phase 2.4c: immutable arbitrary-precision bigint. Generated code only sees
// `topaz_bigint *`; helpers allocate fresh arena objects for every result.
// Limbs are little-endian base 2^32. `sign == 0` canonicalizes zero.
typedef struct {
  uint32_t *limbs;
  size_t len;
  int sign;
} topaz_bigint;

typedef struct {
  uint32_t *limbs;
  size_t len;
  size_t cap;
} topaz_bigint_buffer;

static inline topaz_bigint *topaz_bigint_alloc(size_t len) {
  topaz_bigint *out = (topaz_bigint *)topaz_arena_alloc(sizeof(*out));
  out->limbs = len ? (uint32_t *)topaz_arena_calloc(len, sizeof(uint32_t)) : NULL;
  out->len = len;
  out->sign = 0;
  return out;
}

static inline topaz_bigint *topaz_bigint_zero(void) {
  return topaz_bigint_alloc(0);
}

static inline void topaz_bigint_normalize(topaz_bigint *x) {
  while (x->len > 0 && x->limbs[x->len - 1] == 0) x->len--;
  if (x->len == 0) {
    x->limbs = NULL;
    x->sign = 0;
  }
}

static inline size_t bigint_buffer_number_to_size(topaz_number n, const char *label) {
  if (!isfinite(n) || n < 0 || floor(n) != n || n > (topaz_number)SIZE_MAX) {
    fputs(label, stderr);
    fputc('\n', stderr);
    abort();
  }
  return (size_t)n;
}

static inline uint32_t bigint_buffer_number_to_limb(topaz_number n) {
  if (!isfinite(n) || n < 0 || floor(n) != n || n > (topaz_number)UINT32_MAX) {
    fputs("topaz: bigint buffer limb out of range\n", stderr);
    abort();
  }
  return (uint32_t)n;
}

static inline int bigint_buffer_number_to_sign(topaz_number n) {
  if (!isfinite(n) || floor(n) != n || (n != -1 && n != 0 && n != 1)) {
    fputs("topaz: bigint buffer sign out of range\n", stderr);
    abort();
  }
  return (int)n;
}

static inline topaz_bigint_buffer *topaz_bigint_buffer_new(topaz_number capacity) {
  size_t cap = bigint_buffer_number_to_size(capacity, "topaz: bigint buffer capacity out of range");
  if (cap > SIZE_MAX / sizeof(uint32_t)) {
    fputs("topaz: bigint buffer capacity out of range\n", stderr);
    abort();
  }
  topaz_bigint_buffer *buffer = (topaz_bigint_buffer *)topaz_arena_alloc(sizeof(*buffer));
  buffer->limbs = cap ? (uint32_t *)topaz_arena_calloc(cap, sizeof(uint32_t)) : NULL;
  buffer->len = 0;
  buffer->cap = cap;
  return buffer;
}

static inline topaz_bigint *topaz_bigint_buffer_to_bigint(topaz_bigint_buffer *buffer, topaz_number sign) {
  int s = bigint_buffer_number_to_sign(sign);
  topaz_bigint *out = topaz_bigint_alloc(buffer->len);
  if (buffer->len) memcpy(out->limbs, buffer->limbs, buffer->len * sizeof(uint32_t));
  out->len = buffer->len;
  out->sign = buffer->len == 0 ? 0 : s;
  topaz_bigint_normalize(out);
  if (out->len != 0 && out->sign == 0) {
    fputs("topaz: bigint buffer sign out of range\n", stderr);
    abort();
  }
  return out;
}

static inline topaz_number topaz_bigint_buffer_len(topaz_bigint_buffer *buffer) {
  return (topaz_number)buffer->len;
}

static inline topaz_number topaz_bigint_buffer_get_limb(topaz_bigint_buffer *buffer, topaz_number index) {
  size_t i = bigint_buffer_number_to_size(index, "topaz: bigint buffer index out of range");
  if (i >= buffer->len) {
    fputs("topaz: bigint buffer index out of range\n", stderr);
    abort();
  }
  return (topaz_number)buffer->limbs[i];
}

static inline void topaz_bigint_buffer_set_limb(topaz_bigint_buffer *buffer, topaz_number index, topaz_number limb) {
  size_t i = bigint_buffer_number_to_size(index, "topaz: bigint buffer index out of range");
  uint32_t v = bigint_buffer_number_to_limb(limb);
  if (i >= buffer->cap) {
    fputs("topaz: bigint buffer index out of range\n", stderr);
    abort();
  }
  buffer->limbs[i] = v;
  if (i >= buffer->len) buffer->len = i + 1;
}

static inline topaz_number topaz_bigint_limb_len(const topaz_bigint *value) {
  return (topaz_number)value->len;
}

static inline topaz_number topaz_bigint_limb(const topaz_bigint *value, topaz_number index) {
  size_t i = bigint_buffer_number_to_size(index, "topaz: bigint limb index out of range");
  if (i >= value->len) {
    fputs("topaz: bigint limb index out of range\n", stderr);
    abort();
  }
  return (topaz_number)value->limbs[i];
}

static inline topaz_number topaz_bigint_sign(const topaz_bigint *value) {
  return (topaz_number)value->sign;
}

static inline void topaz_bigint_mul_small_in_place(topaz_bigint *x, uint32_t m) {
  if (x->len == 0 || m == 1) return;
  if (m == 0) {
    x->len = 0;
    x->limbs = NULL;
    x->sign = 0;
    return;
  }
  uint64_t carry = 0;
  for (size_t i = 0; i < x->len; i++) {
    uint64_t cur = (uint64_t)x->limbs[i] * (uint64_t)m + carry;
    x->limbs[i] = (uint32_t)cur;
    carry = cur >> 32;
  }
  if (carry) {
    x->limbs[x->len] = (uint32_t)carry;
    x->len++;
  }
}

static inline void topaz_bigint_add_small_in_place(topaz_bigint *x, uint32_t v) {
  if (v == 0) return;
  if (x->len == 0) {
    x->limbs[0] = v;
    x->len = 1;
    x->sign = 1;
    return;
  }
  uint64_t carry = v;
  size_t i = 0;
  while (carry) {
    uint64_t cur = (uint64_t)x->limbs[i] + carry;
    x->limbs[i] = (uint32_t)cur;
    carry = cur >> 32;
    i++;
  }
}

static inline topaz_bigint *topaz_bigint_from_decimal_cstr(const char *digits) {
  size_t digits_len = strlen(digits);
  topaz_bigint *out = (topaz_bigint *)topaz_arena_alloc(sizeof(*out));
  out->limbs = digits_len ? (uint32_t *)topaz_arena_calloc(digits_len + 1, sizeof(uint32_t)) : NULL;
  out->len = 0;
  out->sign = 0;
  for (size_t i = 0; i < digits_len; i++) {
    char c = digits[i];
    if (c < '0' || c > '9') {
      fputs("topaz: invalid bigint literal\n", stderr);
      abort();
    }
    topaz_bigint_mul_small_in_place(out, 10);
    topaz_bigint_add_small_in_place(out, (uint32_t)(c - '0'));
  }
  topaz_bigint_normalize(out);
  return out;
}

static inline topaz_bigint *topaz_bigint_mul(const topaz_bigint *a, const topaz_bigint *b) {
  if (a->sign == 0 || b->sign == 0) return topaz_bigint_zero();
  topaz_bigint *out = topaz_bigint_alloc(a->len + b->len + 1);
  for (size_t i = 0; i < a->len; i++) {
    uint64_t carry = 0;
    for (size_t j = 0; j < b->len; j++) {
      uint64_t cur = (uint64_t)out->limbs[i + j] + (uint64_t)a->limbs[i] * (uint64_t)b->limbs[j] + carry;
      out->limbs[i + j] = (uint32_t)cur;
      carry = cur >> 32;
    }
    size_t k = i + b->len;
    while (carry) {
      uint64_t cur = (uint64_t)out->limbs[k] + carry;
      out->limbs[k] = (uint32_t)cur;
      carry = cur >> 32;
      k++;
    }
  }
  out->len = a->len + b->len + 1;
  out->sign = a->sign == b->sign ? 1 : -1;
  topaz_bigint_normalize(out);
  return out;
}

static inline topaz_string topaz_bigint_to_string(const topaz_bigint *x) {
  if (x->sign == 0 || x->len == 0) {
    topaz_string z = { "0", 1 };
    return z;
  }

  uint32_t *tmp = (uint32_t *)topaz_arena_alloc(x->len * sizeof(uint32_t));
  memcpy(tmp, x->limbs, x->len * sizeof(uint32_t));
  size_t tmp_len = x->len;
  uint32_t *groups = (uint32_t *)topaz_arena_alloc((x->len * 2 + 1) * sizeof(uint32_t));
  size_t group_len = 0;
  const uint64_t base = 1000000000u;

  while (tmp_len > 0) {
    uint64_t rem = 0;
    size_t i = tmp_len;
    while (i > 0) {
      i--;
      uint64_t cur = (rem << 32) | tmp[i];
      tmp[i] = (uint32_t)(cur / base);
      rem = cur % base;
    }
    groups[group_len++] = (uint32_t)rem;
    while (tmp_len > 0 && tmp[tmp_len - 1] == 0) tmp_len--;
  }

  size_t cap = (x->sign < 0 ? 1 : 0) + group_len * 9 + 1;
  char *buf = (char *)topaz_arena_alloc(cap);
  size_t pos = 0;
  if (x->sign < 0) buf[pos++] = '-';
  int n = snprintf(buf + pos, cap - pos, "%u", groups[group_len - 1]);
  if (n < 0) {
    fputs("topaz: bigint format failed\n", stderr);
    abort();
  }
  pos += (size_t)n;
  size_t gi = group_len - 1;
  while (gi > 0) {
    gi--;
    n = snprintf(buf + pos, cap - pos, "%09u", groups[gi]);
    if (n < 0) {
      fputs("topaz: bigint format failed\n", stderr);
      abort();
    }
    pos += (size_t)n;
  }
  buf[pos] = '\0';
  topaz_string out = { buf, pos };
  return out;
}

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

static inline topaz_boolean topaz_string_eq(topaz_string a, topaz_string b) {
  if (a.len != b.len) return false;
  return memcmp(a.data, b.data, a.len) == 0;
}

static inline size_t string_buffer_number_to_size(topaz_number n, const char *label) {
  if (!isfinite(n) || n < 0 || floor(n) != n || n > (topaz_number)SIZE_MAX) {
    fputs(label, stderr);
    fputc('\n', stderr);
    abort();
  }
  return (size_t)n;
}

static inline void string_buffer_ensure_capacity(topaz_string_buffer *buffer, size_t wanted) {
  if (wanted <= buffer->cap) return;
  size_t new_cap = buffer->cap ? buffer->cap : 16;
  while (new_cap < wanted) {
    if (new_cap > SIZE_MAX / 2) {
      new_cap = wanted;
      break;
    }
    new_cap *= 2;
  }
  buffer->data = (char *)topaz_arena_realloc(buffer->data, buffer->cap + 1, new_cap + 1);
  buffer->cap = new_cap;
}

static inline topaz_string_buffer *topaz_string_buffer_new(topaz_number capacity) {
  size_t cap = string_buffer_number_to_size(capacity, "topaz: string buffer capacity out of range");
  topaz_string_buffer *buffer = (topaz_string_buffer *)topaz_arena_alloc(sizeof(*buffer));
  buffer->data = cap ? (char *)topaz_arena_alloc(cap + 1) : NULL;
  buffer->len = 0;
  buffer->cap = cap;
  if (buffer->data) buffer->data[0] = '\0';
  return buffer;
}

static inline void topaz_string_buffer_push_byte(topaz_string_buffer *buffer, topaz_number byte) {
  if (!isfinite(byte) || byte < 0 || byte > 255 || floor(byte) != byte) {
    fputs("topaz: byte code out of range\n", stderr);
    abort();
  }
  string_buffer_ensure_capacity(buffer, buffer->len + 1);
  buffer->data[buffer->len] = (char)(unsigned char)byte;
  buffer->len++;
  buffer->data[buffer->len] = '\0';
}

static inline void topaz_string_buffer_append_string(topaz_string_buffer *buffer, topaz_string value) {
  if (value.len == 0) return;
  string_buffer_ensure_capacity(buffer, buffer->len + value.len);
  memcpy(buffer->data + buffer->len, value.data, value.len);
  buffer->len += value.len;
  buffer->data[buffer->len] = '\0';
}

static inline topaz_number topaz_string_buffer_byte_at(topaz_string_buffer *buffer, topaz_number index) {
  size_t i = string_buffer_number_to_size(index, "topaz: string buffer index out of range");
  if (i >= buffer->len) {
    fputs("topaz: string buffer index out of range\n", stderr);
    abort();
  }
  return (topaz_number)(unsigned char)buffer->data[i];
}

static inline topaz_string topaz_string_buffer_to_string(topaz_string_buffer *buffer) {
  char *data = (char *)topaz_arena_alloc(buffer->len + 1);
  if (buffer->len) memcpy(data, buffer->data, buffer->len);
  data[buffer->len] = '\0';
  topaz_string out = { data, buffer->len };
  return out;
}

// JS `%` is IEEE-754 remainder with truncated quotient = fmod.
// C's `%` is integer-only, so all topaz_number `%` lowers to this helper.
static inline topaz_number topaz_fmod(topaz_number a, topaz_number b) {
  return fmod(a, b);
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

// Host cwd substrate for path.resolve. POSIX path merging and normalization
// live in the runtime prelude; only the getcwd() syscall boundary remains here.
static inline topaz_string topaz_process_cwd(void) {
  size_t cap = 4096;
  for (;;) {
    char *buf = (char *)topaz_arena_alloc(cap);
    if (getcwd(buf, cap)) {
      topaz_string r = { buf, strlen(buf) };
      return r;
    }
    if (errno == ERANGE) {
      cap *= 2;
      continue;
    }
    fputs("topaz: path.resolve getcwd failed\n", stderr);
    abort();
  }
}

// Phase 1.5-6 prep #16 / Phase 3.52: global parseFloat(s) remains C substrate
// for the self-hosted number-literal parser because decimal/exponent parsing
// and roundoff delegate to libc strtod. parseInt(s, radix)'s pure byte scanner
// now lives in the runtime prelude.
static inline topaz_number topaz_parse_float(topaz_string s) {
  char *buf = (char *)topaz_arena_alloc(s.len + 1);
  if (s.len) memcpy(buf, s.data, s.len);
  buf[s.len] = '\0';
  char *end = buf;
  double v = strtod(buf, &end);
  if (end == buf) return (topaz_number)NAN;
  return v;
}

// Phase 1.2 / 1.5-3.5: ECMA-262 ToString(Number). Shortest round-trip via
// snprintf(%.*e) + strtod precision search, then ECMA-262 formatting written
// into an arena-allocated buffer. The returned `topaz_string` is owned by the
// arena (released at process exit). Phase 2 may swap the precision-search core
// for a real Ryu port; correctness here rests on libc's correctly-rounded
// strtod.
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

// Phase 1.5-6 prep #26: process.argv / process.exit / process.{stdout,stderr}
// .write. The generated `main` always calls topaz_runtime_init_argv so the
// stored argc/argv back `process.argv`. DIVERGENCE from Node: Node's argv is
// `[node, script, ...userArgs]`; a Topaz native binary has no separate script
// layer, so argv is `[executablePath, ...userArgs]` — one fewer leading
// element. Each `process.argv` read builds a *fresh* topaz_array_string (no
// identity-stable singleton); the element bytes alias the OS argv strings,
// which stay valid for the whole process, so no copy is made.
static int topaz_argc_storage = 0;
static char **topaz_argv_storage = NULL;

static inline void topaz_runtime_init_argv(int argc, char **argv) {
  topaz_argc_storage = argc;
  topaz_argv_storage = argv;
}

static inline topaz_array_string *topaz_process_argv(void) {
  topaz_array_string *a = topaz_array_string_new();
  for (int i = 0; i < topaz_argc_storage; ++i) {
    const char *s = topaz_argv_storage[i];
    topaz_string elem = { s, strlen(s) };
    topaz_array_string_push(a, elem);
  }
  return a;
}

// process.exit(code): truncate the IEEE-754 code to int (matching C `exit`),
// then exit. Node coerces non-integers too; NaN/Inf collapse to 0 here.
static inline void topaz_process_exit(topaz_number code) {
  int c = (isnan(code) || isinf(code)) ? 0 : (int)code;
  exit(c);
}

static inline void topaz_stdout_write(topaz_string s) {
  if (s.len) fwrite(s.data, 1, s.len, stdout);
}

static inline void topaz_stderr_write(topaz_string s) {
  if (s.len) fwrite(s.data, 1, s.len, stderr);
}

static inline void topaz_panic(topaz_string message) {
  if (message.len) fwrite(message.data, 1, message.len, stderr);
  fputc('\n', stderr);
  abort();
}

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
