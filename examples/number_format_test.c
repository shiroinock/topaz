#include "runtime.h"
#include <math.h>

int main(void) {
  topaz_console_log_number(0.0);
  topaz_console_log_number(-0.0);
  topaz_console_log_number(1.0);
  topaz_console_log_number(-1.0);
  topaz_console_log_number(5702887.0);
  topaz_console_log_number(3.14);
  topaz_console_log_number(0.1 + 0.2);
  topaz_console_log_number(NAN);
  topaz_console_log_number(INFINITY);
  topaz_console_log_number(-INFINITY);
  topaz_console_log_number(9007199254740992.0);
  return 0;
}
