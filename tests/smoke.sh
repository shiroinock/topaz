#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build > /dev/null

mkdir -p build
node dist/cli.js examples/fib.ts -o build/fib

out=$(./build/fib)
expected="5702887"
if [[ "$out" != "$expected" ]]; then
  echo "FAIL: expected $expected, got '$out'" >&2
  exit 1
fi
echo "PASS: fib(34) = $out"
