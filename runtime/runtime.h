#ifndef TOPAZ_RUNTIME_H
#define TOPAZ_RUNTIME_H

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

typedef double topaz_number;
typedef bool topaz_boolean;

static inline void topaz_console_log_boolean(topaz_boolean b) {
  fputs(b ? "true\n" : "false\n", stdout);
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
  // Phase 0: %.17g guarantees round-trip but is longer than JS's shortest-roundtrip.
  // e.g. 3.14 -> "3.1400000000000001". Replace with a Ryu/Grisu port later.
  printf("%.17g\n", n);
}

#endif
