# 0026 — process.argv / process.exit / process.{stdout,stderr}.write + console.error

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #26

## Context

`node dist/cli.js src/cli.ts` の現 blocker は loader が弾く `node:util.parseArgs`([0025](./0025-node-url-import-meta.md) で `node:url` まで通過済み)。だが cli.ts は parseArgs 以外に `process.argv`(`die` の引数 dump)・`process.exit`(`die` / 不正引数)・`process.stdout.write`(lex/parse-only dump)・`console.error`(usage / `die`)も使い、これらはいずれも未対応で 1.5-6f の runtime/stdlib 拡張に含まれる。parseArgs は per-site anon class 合成 + hyphenated bracket access + truthy/falsy-on-dunion が連鎖する大物で、しかも cli.ts 1 箇所でしか使わない。先に小さく独立した process/console builtin を着地させ、parseArgs の扱いは cli.ts 書き直し時(1.5-6h)に回す。

## Decision

`process` / `console` を `console.log`(既存)と同じ synthetic namespace として扱い、call-site / value-site で構文的に認識する: `process.argv` → `Array<string>` 値、`process.exit(code?)` → `never`、`process.{stdout,stderr}.write(s)` → void、`console.error` → console.log の scalar lowering を stderr に流すだけ。`process.argv` を供給するため生成 `main` を `main(int __topaz_argc, char **__topaz_argv)` 化し(`__topaz_` 予約 prefix でユーザー変数 `argv` との衝突回避)、先頭で unconditional に `topaz_runtime_init_argv` を呼んで argc/argv を file-static に stash(unconditional ゆえ -Wextra の unused-parameter も出ない)。`process.argv` 読みは毎回 fresh な `topaz_array_string` を組む(要素は OS argv バイトを alias、プロセス生存中有効なので copy しない)。

却下した案: A=parseArgs を builtin 化(理由: cli.ts 1 用途のために anon class 合成等の大機構を作るのは「単一用途の機構を作らない」minimalism に反する。1.5-6h で cli.ts を argv 手書きパースに書き直せば parseArgs 自体が不要になる)。B=`process.argv` を Node 同形 `[node, script, ...]` に詰める(理由: native バイナリに script 層は無く、合成 dummy 要素は嘘。`[exe, ...]` の素直な mapping を divergence として明記する方が筋が良い)。

## Implementation

- `src/codegen.ts:1835-1836`: `main(int __topaz_argc, char **__topaz_argv)` + 先頭 `topaz_runtime_init_argv` 呼び出し。
- `src/codegen.ts:6420-6474`: emitCall — console.log 分岐を log/error 両対応に一般化、process.exit / process.{stdout,stderr}.write を構文的に dispatch。
- `src/codegen.ts:7267-7298`: `emitProcessExit`(arity 0→`exit(0)` / 1→number、非 number reject)、`emitProcessStreamWrite`(string 1 引数、newline 無し)。
- `src/codegen.ts:5600-5614` / `8017-8030`: `process.argv` の value emit / inferType short-circuit(`process` は binding が無いので `inferType(expr.expression)` 前に拾う)。他 `process.<member>` value 読みは reject。
- `src/codegen.ts:8383-8412`: value 文脈で console.error void / process.exit never / process.*.write void を reject。
- `runtime/runtime.h:128-149`(console_error 3 種)/ `850-903`(argv stash + `topaz_process_argv` / `topaz_process_exit` / `topaz_st{dout,derr}_write`)。

## Consequences

- **受理**: `process.argv`(値、`Array<string>`)/ `process.argv[i]` / `.length` / for-of、`process.exit(n)` / `process.exit()`、`process.stdout.write(s)` / `process.stderr.write(s)`、`console.error(boolean|string|number)`。
- **reject**: `process.<other>` 値読み(argv 以外)、`process.exit` 非 number / 2 引数以上 / 値利用、`process.*.write` 非 string / 値利用、`console.error` 引数数 ≠ 1 / reference・interface・union・unknown 引数。
- **divergence**: `process.argv` は Node の `[node, script, ...args]` と違い `[executablePath, ...args]`(先頭 1 つ少ない)。毎回 fresh な array(identity 非安定)。`process.exit` の code は `(int)` 切り捨て、NaN/Inf→0。`process.*.write` は Node の backpressure boolean を捨て void。
- **回帰**: positive `process_io`(argv.length / basename / 改行無し write coalesce / stderr 非捕捉 / for-of count / exit で打ち切り の 5 行 stdout)、fail `process_exit_type_fail` / `process_exit_arity_fail` / `process_stdout_write_type_fail` / `process_stdout_write_as_value_fail` / `process_member_value_fail` / `console_error_arity_fail`。累計 261 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `node:util.parseArgs` は builtin 化せず 1.5-6h の cli.ts Topaz 化で argv 手書きパースに置換予定。`process.stdin` / 環境変数 / signal は未着手。
