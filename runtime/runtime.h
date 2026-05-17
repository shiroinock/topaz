#ifndef TOPAZ_RUNTIME_H
#define TOPAZ_RUNTIME_H

#include <math.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef double topaz_number;
typedef bool topaz_boolean;

// Phase 1.2: immutable byte string. ASCII-only for now — JS .length is in
// UTF-16 code units, but we store UTF-8, so non-ASCII would diverge.
// `data` is either a literal (static lifetime) or malloc'd by concat (leaked;
// GC/arena lands with the rest of the heap story).
typedef struct {
  const char *data;
  size_t len;
} topaz_string;

static inline topaz_string topaz_string_concat(topaz_string a, topaz_string b) {
  size_t total = a.len + b.len;
  char *buf = (char *)malloc(total + 1);
  if (!buf) {
    fputs("topaz: out of memory\n", stderr);
    abort();
  }
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

static inline void topaz_console_log_string(topaz_string s) {
  if (s.len) fwrite(s.data, 1, s.len, stdout);
  putchar('\n');
}

// JS `%` is IEEE-754 remainder with truncated quotient = fmod.
// C's `%` is integer-only, so all topaz_number `%` lowers to this helper.
static inline topaz_number topaz_fmod(topaz_number a, topaz_number b) {
  return fmod(a, b);
}

static inline void topaz_console_log_boolean(topaz_boolean b) {
  fputs(b ? "true\n" : "false\n", stdout);
}

// Phase 1.2: shortest round-trip via snprintf(%.*e) + strtod precision search,
// then ECMA-262 ToString formatting. Same observable output as a Ryu port;
// Phase 2 may swap in the real Ryu for perf (snprintf+strtod is O(precision)
// per call). Correctness rests on libc's correctly-rounded strtod.
static inline void topaz_emit_number_shortest(topaz_number n) {
  char buf[32];
  int p;
  for (p = 1; p <= 17; p++) {
    snprintf(buf, sizeof(buf), "%.*e", p - 1, n);
    if (strtod(buf, NULL) == n) break;
  }
  if (p > 17) p = 17;

  const char *s = buf;
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

  // ECMA-262 ToString: n_pos is the 1-indexed decimal point position.
  int n_pos = exp10 + 1;

  if (negative) putchar('-');

  if (n_pos >= k && n_pos <= 21) {
    fwrite(digits, 1, k, stdout);
    for (int i = 0; i < n_pos - k; i++) putchar('0');
  } else if (n_pos > 0 && n_pos <= 21) {
    fwrite(digits, 1, n_pos, stdout);
    putchar('.');
    fwrite(digits + n_pos, 1, k - n_pos, stdout);
  } else if (n_pos > -6 && n_pos <= 0) {
    fputs("0.", stdout);
    for (int i = 0; i < -n_pos; i++) putchar('0');
    fwrite(digits, 1, k, stdout);
  } else {
    putchar(digits[0]);
    if (k > 1) {
      putchar('.');
      fwrite(digits + 1, 1, k - 1, stdout);
    }
    int e = n_pos - 1;
    if (e >= 0) printf("e+%d", e);
    else printf("e-%d", -e);
  }
}

static inline void topaz_console_log_number(topaz_number n) {
  if (isnan(n)) {
    fputs("NaN\n", stdout);
    return;
  }
  if (isinf(n)) {
    fputs(n > 0 ? "Infinity\n" : "-Infinity\n", stdout);
    return;
  }
  if (n == 0.0) {
    fputs("0\n", stdout);
    return;
  }
  if (n == (topaz_number)(int64_t)n &&
      n >= -9007199254740992.0 && n <= 9007199254740992.0) {
    printf("%lld\n", (long long)(int64_t)n);
    return;
  }
  topaz_emit_number_shortest(n);
  putchar('\n');
}

// Phase 1.3: monomorphized growable arrays. Reference semantics — variables
// hold `topaz_array_<elem> *` and share storage on assignment. Bounds-checked
// with abort on violation; no GC, malloc/leak until Phase 1.5.
#define TOPAZ_ARRAY_DEFINE(name, elem_t)                                              \
typedef struct {                                                                       \
  elem_t *data;                                                                        \
  size_t len;                                                                          \
  size_t cap;                                                                          \
} topaz_array_##name;                                                                  \
                                                                                       \
static inline topaz_array_##name *topaz_array_##name##_new(void) {                     \
  topaz_array_##name *a = (topaz_array_##name *)malloc(sizeof(*a));                    \
  if (!a) { fputs("topaz: out of memory\n", stderr); abort(); }                        \
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
  elem_t *new_data = (elem_t *)realloc(a->data, new_cap * sizeof(elem_t));             \
  if (!new_data) { fputs("topaz: out of memory\n", stderr); abort(); }                 \
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
#define TOPAZ_MAP_DEFINE(name, key_t, val_t, hash_fn, eq_fn)                            \
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
  topaz_map_##name *m = (topaz_map_##name *)malloc(sizeof(*m));                        \
  if (!m) { fputs("topaz: out of memory\n", stderr); abort(); }                        \
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
      (topaz_map_##name##_slot *)calloc(new_cap, sizeof(*new_slots));                  \
  if (!new_slots) { fputs("topaz: out of memory\n", stderr); abort(); }                \
  for (size_t i = 0; i < m->cap; i++) {                                                \
    if (m->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) continue;                       \
    size_t idx = topaz_map_##name##_find_slot(new_slots, new_cap, m->slots[i].key);    \
    new_slots[idx].state = TOPAZ_HASH_SLOT_OCCUPIED;                                   \
    new_slots[idx].key = m->slots[i].key;                                              \
    new_slots[idx].value = m->slots[i].value;                                          \
  }                                                                                    \
  free(m->slots);                                                                      \
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
static inline val_t topaz_map_##name##_get(topaz_map_##name *m, key_t k) {             \
  if (m->cap == 0) {                                                                   \
    fputs("topaz: map key not found\n", stderr); abort();                              \
  }                                                                                    \
  size_t i = topaz_map_##name##_find_slot(m->slots, m->cap, k);                        \
  if (m->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) {                                 \
    fputs("topaz: map key not found\n", stderr); abort();                              \
  }                                                                                    \
  return m->slots[i].value;                                                            \
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
  topaz_set_##name *s = (topaz_set_##name *)malloc(sizeof(*s));                        \
  if (!s) { fputs("topaz: out of memory\n", stderr); abort(); }                        \
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
      (topaz_set_##name##_slot *)calloc(new_cap, sizeof(*new_slots));                  \
  if (!new_slots) { fputs("topaz: out of memory\n", stderr); abort(); }                \
  for (size_t i = 0; i < s->cap; i++) {                                                \
    if (s->slots[i].state != TOPAZ_HASH_SLOT_OCCUPIED) continue;                       \
    size_t idx = topaz_set_##name##_find_slot(new_slots, new_cap, s->slots[i].key);    \
    new_slots[idx].state = TOPAZ_HASH_SLOT_OCCUPIED;                                   \
    new_slots[idx].key = s->slots[i].key;                                              \
  }                                                                                    \
  free(s->slots);                                                                      \
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

TOPAZ_MAP_DEFINE(number_number,   topaz_number,  topaz_number,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(number_boolean,  topaz_number,  topaz_boolean, topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(number_string,   topaz_number,  topaz_string,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_MAP_DEFINE(boolean_number,  topaz_boolean, topaz_number,  topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(boolean_boolean, topaz_boolean, topaz_boolean, topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(boolean_string,  topaz_boolean, topaz_string,  topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_MAP_DEFINE(string_number,   topaz_string,  topaz_number,  topaz_hash_string,  topaz_string_eq)
TOPAZ_MAP_DEFINE(string_boolean,  topaz_string,  topaz_boolean, topaz_hash_string,  topaz_string_eq)
TOPAZ_MAP_DEFINE(string_string,   topaz_string,  topaz_string,  topaz_hash_string,  topaz_string_eq)

TOPAZ_SET_DEFINE(number,  topaz_number,  topaz_hash_number,  topaz_key_eq_number)
TOPAZ_SET_DEFINE(boolean, topaz_boolean, topaz_hash_boolean, topaz_key_eq_boolean)
TOPAZ_SET_DEFINE(string,  topaz_string,  topaz_hash_string,  topaz_string_eq)

#endif
