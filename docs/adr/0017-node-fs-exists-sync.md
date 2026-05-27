# 0017 — node:fs.existsSync(path): boolean

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #17

## Context

`src/loader.ts` を self-hosting サブセットに通す経路の最初の blocker が
`import { existsSync } from "node:fs"`(`loader.ts:1:10`)だった。loader は
モジュール解決の前に `existsSync(absPath)` でファイル存在を確認する。stdlib
import は prep #13([0003 の前段、`docs/archive/implementation-log.md`])で
`node:fs` から `readFileSync` 1 個だけを受理する syntactic shortcut として
入っており、`existsSync` を同じ枠で 1 個足すだけで blocker が解ける。loader の
残る依存(`node:path` の `dirname`/`resolve`、tsc API)は 1.5-6g の rewrite
対象で、本サブステップの単発 lowering の範囲外。

## Decision

`existsSync(path: string): boolean` を `readFileSync` と全く同じ call-site
限定の syntactic shortcut として追加する。loader の `STDLIB_SPECIFIERS` の
`node:fs` 許可集合に `existsSync` を足し、codegen は call-site でのみ識別子を
拾い(bare 利用は scope lookup が「unknown identifier」で落ちる)、runtime の
`topaz_fs_exists` に lower する。runtime 実装は `access(cpath, F_OK) == 0`。
却下した案: A=`stat` で実装(理由: 存在判定だけなら `access` が最小、戻り値の
解釈も簡潔)、B=`fopen` 成否で判定(理由: ディレクトリに対し false を返して
しまい Node の existsSync と divergence する)。`access(F_OK)` はファイル/
ディレクトリ両方に true を返し Node セマンティクスに一致する。

## Implementation

- `runtime/runtime.h:12` に `#include <unistd.h>` 追加、`runtime.h:220-230`
  に `topaz_fs_exists`(arena に NUL 終端コピー → `access(F_OK)`)。
- `src/loader.ts:138` の `STDLIB_SPECIFIERS` `node:fs` 集合に `existsSync` 追加。
- `src/codegen.ts` emitCall identifier 分岐に `existsSync` → `emitNodeFsExistsSync`、
  inferType identifier 分岐に `existsSync` → `T_BOOLEAN`。
- `src/codegen.ts` に `checkNodeFsExistsSyncArgs`(1 引数 string)と
  `emitNodeFsExistsSync`(`topaz_fs_exists(${path})`)を `emitNodeFsReadFileSync`
  の直後に追加。emit/infer 両経路で同じ引数検査を通す。

## Consequences

- **受理**: `existsSync("path")` を boolean として(`if` 条件 / `!` / `&&` 含む)。
  path は変数・関数引数でも可。`access(F_OK)` でディレクトリも true。
- **reject**: 引数 0 個 or 2 個以上(`existsSync expects exactly one argument`)、
  path が非 string(`existsSync path argument must be string`)、bare value 利用
  (`unknown identifier 'existsSync'`)、`node:fs` からの `existsSync`/`readFileSync`
  以外の named import(`writeFileSync` 等は引き続き loader で reject)。
- **回帰**: positive `node_fs_exists`、fail `node_fs_exists_arity_fail` /
  `node_fs_exists_path_type_fail` / `node_fs_exists_as_value_fail`。既存
  `node_fs_unknown_named_import_fail` は `existsSync` 解禁に伴い `writeFileSync`
  へ差し替え。累計 206 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: Node の `options` 第 2 引数、`writeFileSync` /
  `mkdirSync` / `node:path` 系は 1.5-6f/g で別途。loader.ts の次の blocker は
  `node:path` の `dirname`/`resolve`。

## Notes

- prep #13(`node:fs.readFileSync`)を踏襲。決定ログの prep #15 までは
  `docs/archive/implementation-log.md`、#16 以降は `docs/adr/`。
- 関連: 同じ call-site shortcut 機構の parseInt/parseFloat = [0003](./0003-parse-int-float.md)。
