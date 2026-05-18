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

# Phase 1.5-2: multi-module ケースは root を指定 (loader が依存を解決)。
# label と root path を分けて受ける。
run_module_case() {
  local label="$1"
  local root="$2"
  local expected="$3"
  node dist/cli.js "$root" -o "build/$label" > /dev/null
  local out
  out=$(./build/$label)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$label]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

# Phase 1.5-2: コンパイル時にエラーで落ちることを期待するケース。
# 標準エラー出力に `expected_substring` が含まれていることをチェック。
run_fail_case() {
  local label="$1"
  local root="$2"
  local expected_substring="$3"
  local err
  if err=$(node dist/cli.js "$root" -o "build/$label" 2>&1); then
    echo "FAIL [$label]: expected compile error, got success" >&2
    echo "  stdout:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

run_case fib "5702887"
run_case loop_sum "5050"
run_case while_count "10"
run_case boolean_print $'true\nfalse\ntrue\ntrue'
run_case mod_check $'1\n1\n-1\n1.5'
run_case switch_check $'1699\n22'
run_case number_format $'3.14\n0.30000000000000004\n1.5\n-1.5\n1e+21\n1e-7\n0.000001\n100000000000000000'
run_case string_basic $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof'
run_case array_basic $'3\n10\n30\n5\n40\n50\n99\n50\n4\n189\ntrue\nfalse\nalpha\ngamma\n3\n1\n7'
run_case map_set_basic $'3\n2\ntrue\nfalse\n10\ntrue\n2\nfalse\n3\ntrue\nfalse\ntrue\n2\nfalse\nyes\nno\n2\ntrue\nfalse\ntrue\n50\n250\n490\n7'
run_case class_basic $'3\n4\n7\n30\n40\n99\n100\n555\n101\n557\n110\n575\nhello, topaz\nhello, topaz\n2'
run_case interface_basic $'circle\n36\nsquare\n25\n16\nrenamed\n6\n144\n8\n64\n4\n4'
run_case array_class_iface $'3\n1\n12\n12\n4\n99\n99\n3\n500\n2\nsquare\n9\ncircle\n16\n16\ncircle\n100\n0\n7\ncircle\n4'
run_case map_set_class_iface $'3\n2\n11\n11\ntrue\nfalse\n2\nfalse\n2\nsquare\n9\ncircle\n100\ncircle\n16\n2\ntrue\ntrue\nfalse\n1\nfalse\n2\ntrue\ntrue\nfalse\n1\nfalse\n60\n99\n1'
run_case generic_fn $'42\n7\nhi\nyo\ntrue\nfalse\n10\n30\nalpha\ngamma\ntwo\n2\n1\n99\nsolo\n1\n123\nzzz\n1\n777\n555'
run_case generic_class $'42\n42\n99\nhello\ntrue\n1\none\n3\n20\n99\nhello'
run_case try_catch_basic $'boom\n1\nnegative\n42\n10\n7\n100\n9\nrewrapped\n2\n0\n999'

run_module_case module_basic examples/module_basic_main.ts $'7\n11\n12\n12\n25\n25'
run_fail_case module_cycle examples/module_cycle_a.ts "circular import detected"

echo "all tests passed"
