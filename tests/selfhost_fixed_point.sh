#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build > /dev/null

mkdir -p build

echo "SELFHOST [node compiler emits bootstrap C]"
node dist/cli.js src/cli.ts --emit-c-only -o build/topaz_bootstrap > /dev/null
test -s build/topaz_bootstrap.c

echo "SELFHOST [compile bootstrap topaz]"
cc -O2 -Iruntime -Wall -Wextra build/topaz_bootstrap.c -o build/topaz_bootstrap

echo "SELFHOST [bootstrap topaz emits self-host C]"
./build/topaz_bootstrap src/cli.ts --emit-c-only -o build/topaz_selfhost > /dev/null
test -s build/topaz_selfhost.c

echo "SELFHOST [compile self-host topaz]"
cc -O2 -Iruntime -Wall -Wextra build/topaz_selfhost.c -o build/topaz_selfhost

echo "SELFHOST [self-host topaz builds fib]"
./build/topaz_selfhost examples/fib.ts -o build/topaz_selfhost_fib > /dev/null
fib_out=$(./build/topaz_selfhost_fib)
if [[ "$fib_out" != "5702887" ]]; then
  echo "FAIL [topaz_selfhost_fib]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: $fib_out" >&2
  exit 1
fi

echo "SELFHOST [self-host topaz re-emits compiler C]"
./build/topaz_selfhost src/cli.ts --emit-c-only -o build/topaz_fixedpoint > /dev/null
test -s build/topaz_fixedpoint.c

echo "SELFHOST [self-host/fixed-point compiler C diff]"
diff -u build/topaz_selfhost.c build/topaz_fixedpoint.c

echo "SELFHOST [compile final topaz]"
cc -O2 -Iruntime -Wall -Wextra build/topaz_fixedpoint.c -o build/topaz

echo "SELFHOST [final topaz builds fib]"
./build/topaz examples/fib.ts -o build/topaz_fib > /dev/null
fib_out=$(./build/topaz_fib)
if [[ "$fib_out" != "5702887" ]]; then
  echo "FAIL [topaz_fib]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: $fib_out" >&2
  exit 1
fi

echo "PASS [selfhost_fixed_point]"
