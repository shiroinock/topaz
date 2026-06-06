#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build > /dev/null

mkdir -p build

echo "SELFHOST [stage1 emit compiler C]"
node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe > /dev/null
test -s build/selfhost_cli_probe.c

echo "SELFHOST [stage1 compile native CLI]"
cc -O2 -Iruntime -Wall -Wextra build/selfhost_cli_probe.c -o build/selfhost_cli_probe_native

echo "SELFHOST [native CLI emit stage2 compiler C]"
./build/selfhost_cli_probe_native src/cli.ts --emit-c-only -o build/selfhost_cli_by_selfhost > /dev/null
test -s build/selfhost_cli_by_selfhost.c

echo "SELFHOST [compile stage2 native CLI]"
cc -O2 -Iruntime -Wall -Wextra build/selfhost_cli_by_selfhost.c -o build/selfhost_cli_by_selfhost_native

echo "SELFHOST [stage2 native CLI builds fib]"
./build/selfhost_cli_by_selfhost_native examples/fib.ts -o build/selfhost2_fib_native > /dev/null
fib_out=$(./build/selfhost2_fib_native)
if [[ "$fib_out" != "5702887" ]]; then
  echo "FAIL [selfhost2_fib_native]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: $fib_out" >&2
  exit 1
fi

echo "SELFHOST [stage2 native CLI emits compiler C]"
./build/selfhost_cli_by_selfhost_native src/cli.ts --emit-c-only -o build/selfhost_cli_by_stage2 > /dev/null
test -s build/selfhost_cli_by_stage2.c

echo "PASS [selfhost_stage2]"
