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

#endif
