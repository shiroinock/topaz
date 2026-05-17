#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build > /dev/null

mkdir -p build

run_case() {
  local name="$1"
  local expected="$2"
  node dist/cli.js "examples/$name.ts" -o "build/$name" > /dev/null
  local out
  out=$(./build/$name)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$name]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$name]"
}

run_case fib "5702887"
run_case loop_sum "5050"
run_case while_count "10"
run_case boolean_print $'true\nfalse\ntrue\ntrue'

echo "all tests passed"
