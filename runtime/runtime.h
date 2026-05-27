#ifndef TOPAZ_RUNTIME_H
#define TOPAZ_RUNTIME_H

#include <math.h>
#include <setjmp.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
