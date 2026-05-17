#include "runtime.h"

static topaz_number fib(topaz_number n);

static topaz_number fib(topaz_number n) {
  if (n < 2.0) return n;
  return fib(n - 1.0) + fib(n - 2.0);
}

int main(void) {
  topaz_console_log_number(fib(34.0));
  return 0;
}
