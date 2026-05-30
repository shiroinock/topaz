# 0024 — node:child_process.execFileSync (stdio inherit only)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #24

## Context

`src/cli.ts:2` `import { execFileSync } from "node:child_process"` を self-hosting
サブセットに通すための prep。[0023](./0023-node-path-join.md) `node:path.join`
の解禁で `cli.ts` の残り blocker は `node:child_process` / `node:util` / `node:url`
の 3 specifier に絞られていた。`cli.ts:88-92` は cc を `execFileSync("cc",
[...], { stdio: "inherit" })` で起動して inherit fd 経由で診断を出すだけで戻り値
は読まない — [0020](./0020-node-fs-mkdir-sync.md) `mkdirSync` と同じ「void 戻り
+ syntactic options literal」の構図に乗る。1.5-6h (cli.ts Topaz 化) で改めて
rewrite する前に lowering 部分だけ前倒しで落とす。

## Decision

`execFileSync(cmd: string, args: string[], { stdio: "inherit" }): void` を
**call-site 限定 shortcut + stdio inherit 固定** で追加する。第 2 引数は
`Array<string>` 型の式(リテラル / 変数どちらでも)、第 3 引数は `mkdirSync` 流儀
で **syntactic な `{ stdio: "inherit" }`** に固定。runtime は
`topaz_child_exec_inherit` 1 本で fork + execvp + waitpid + 非 0 exit / signal は
abort。戻り値 void で `inferType` 経路は明示 CodegenError。

却下案: A=variadic で args を可変長 string... として受ける(理由: `cli.ts:90`
は array literal だが将来 `string[]` 変数経由になる可能性が高く、`emitWithExpected
(arg, Array<string>)` 一発で済む方が拡張余地が広い)。B=stdio "pipe" / "ignore"
/ Buffer 戻り値も受ける(理由: cli.ts は inherit しか使わず、pipe を受けると
child の stdout を arena に取り込む lowering が必要で scope が広がる。必要に
なったときに拡張する)。C=`execSync(cmd)` の shell 経由形を追加(理由: shell
injection の温床で self-hosting の用途では不要)。D=child の非 0 exit を例外
throw に lower(理由: runtime helper は class instance しか throw できず、現状
`Error` 相当の class が無い。abort で十分)。

## Implementation

- `runtime/runtime.h:15` で `<sys/wait.h>` を include 追加。
- `runtime/runtime.h:847-901` に `topaz_child_exec_inherit(topaz_string cmd,
  topaz_array_string *args)`。`TOPAZ_ARRAY_DEFINE(string, topaz_string)` 直後に
  置いて型解決を保つ。argv は arena 上で構築、cmd / 各要素を NUL 終端コピー、
  末尾 NULL。fork 前に `fflush(stdout/stderr)`(親バッファと子の inherit fd の
  interleave 防止)。child は execvp が return したら `_exit(127)`。親は
  `waitpid` を EINTR retry しながら待ち、`WIFSIGNALED` / 非 0 `WEXITSTATUS`
  はそれぞれ abort。
- `src/loader.ts:141-145` の `STDLIB_SPECIFIERS` に `node:child_process` →
  `Set(["execFileSync"])` を追加。
- `src/codegen.ts` emitCall / inferType の identifier 分岐に `execFileSync` 分岐
  (前者は `emitNodeChildProcessExecFileSync`、後者は void CodegenError)、
  `emitNodeFsMkdirSync` 直後に `checkNodeChildProcessExecFileSyncArgs` /
  `emitNodeChildProcessExecFileSync` を追加。args 引数は `inferType` 結果が
  `arrayOf(T_STRING)` と `typeEq` 一致することを要求、emit は `emitWithExpected
  (arg1, Array<string>)` で string array monomorph を経由。options は `mkdirSync`
  と同じ syntactic check(`ObjectLiteralExpression`、property 数 1、identifier
  `stdio`、`StringLiteral` `"inherit"`)。

## Consequences

- **受理**: `execFileSync(cmd, args, { stdio: "inherit" })`(cmd は string、
  args は `Array<string>` 型ならリテラル / 変数 / 関数戻り値どれでも、空配列も
  `string[]` 型注釈付き変数経由なら可)。文として呼び出す形のみ。
- **reject**: 引数 0/1/2/4 個以上、cmd / args が非 string / 非 Array<string>、
  第 3 引数が object literal 以外、property が `stdio` 以外、`stdio` 値が
  `"inherit"` 以外、value 文脈使用、`node:child_process` の他 named import
  (`spawnSync` / `execSync` / `fork` 等)。
- **回帰**: positive `node_child_process_exec`(echo を inherit で呼び parent
  との順序を確認、変数経由 / 空配列 / 計算式 cmd を 1 ファイルで)、fail
  `node_child_process_exec_arity_fail` / `..._cmd_type_fail` / `..._args_type_fail`
  / `..._opts_not_object_fail` / `..._opts_wrong_key_fail` /
  `..._opts_wrong_value_fail` / `..._as_value_fail` /
  `node_child_process_unknown_named_import_fail`。累計 247 ケース、`npm test`
  全 pass。
- **scope 外 / 将来課題**: stdio `"pipe"` / `"ignore"`、`cwd` / `env` / `timeout`
  / `encoding` 等のその他 option、Buffer 戻り値、`spawn` / `spawnSync` /
  `execSync` 等の他 child_process API。`cli.ts` の次の blocker は
  `node:util.parseArgs`(prep #25 or 1.5-6h で扱う)。

## Notes

- 同じ call-site shortcut 機構: prep #13 `readFileSync`、prep #17 `existsSync`
  ([0017](./0017-node-fs-exists-sync.md))、prep #18 `dirname`/`resolve`
  ([0018](./0018-node-path-dirname-resolve.md))、prep #19 `writeFileSync`
  ([0019](./0019-node-fs-write-file-sync.md))、prep #20 `mkdirSync`
  ([0020](./0020-node-fs-mkdir-sync.md))。
- syntactic options literal を call-site で要求するパターンは `mkdirSync` 以降
  2 例目。option を増やすときはここの property loop を whitelist 化する形で揃える。
