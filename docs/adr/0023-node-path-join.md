# 0023 — node:path.join(...segments) (POSIX)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #23

## Context

[0022](./0022-node-path-extname.md) で `extname` を解禁した時点で、`src/cli.ts`
の `node:path` import 行 (`cli.ts:4`) に残る blocker は `join` 1 個だけになった。
`join` は `cli.ts:71` の `join(dirname(input), basename(input, ".ts"))` で
output path 組み立てに使われており、cli.ts rewrite (1.5-6h) に入る前の prep
として 1 サブステップで解禁しておくと、`node:path` 行が import 単位で丸ごと
通る状態になり、残 blocker が `node:child_process` / `node:util` / `node:url`
の 3 specifier だけに揃う。

## Decision

`node:path.join(...segments: string[]): string` を `dirname` / `resolve` /
`basename` / `extname` と同じ call-site 限定の syntactic shortcut として
追加する。loader の `STDLIB_SPECIFIERS` の `node:path` set に `join` を足し、
codegen は call-site の `join(...)` だけを拾って variadic で
`topaz_path_join(n, seg0, seg1, ...)` に dispatch する。runtime は **Node の
`path.posix.join` の C 移植**(Topaz は Unix 専用)、内部で既存
`topaz_path_normalize_string` を流用して `.` / `..` / 重複 `/` を解決する。

却下案: A=`join` を `(a, b) => a + "/" + b` 等のユーザ書き換えで代替し runtime
を増やさない(理由: Node の `path.posix.join` は trailing slash 保持 / leading
`..` 保持 / `/` 単独入力 / 空セグメント skip など edge case があり、cli.ts の
使い方を含めて Node 結果と bit-for-bit 一致させたい)。B=Node の posix.normalize
を呼ばずに単純連結だけにする(理由: `join("/foo", "../bar")` → `"/foo/../bar"`
で `..` が解決されず、cli.ts:71 の挙動が Node と divergence する)。C=`join` /
`relative` / `normalize` を 3 関数まとめて投入(理由: 1 サブステップ = 1 機能
の運用と非整合、`relative` / `normalize` は cli.ts では unused で 1.5-6h の
直前にもまだ必要にならない)。

## Implementation

- `runtime/runtime.h:573-` に `topaz_path_join` を追加。Node `lib/path.js`
  posix 版の `join` ロジック(全引数を `/` で連結して `posix.normalize` を
  呼ぶ)を C 移植: 空セグメントは skip、`n == 0` / 全引数 empty で `.` を
  返す、leading `/` と trailing `/` を normalize 前後で保持、normalize 結果
  が空のときは `absolute` / `trailing` で `/` / `./` / `.` を選択。
- `src/loader.ts:142` の `STDLIB_SPECIFIERS` の `node:path` set を
  `{dirname, resolve, basename, extname, join}` に拡張(`node:path` の全
  named import が import 単位で通る状態)。
- `src/codegen.ts` emitCall identifier 分岐に `join` → `emitNodePathJoin`、
  inferType identifier 分岐に `join` → `T_STRING`(引数検査は両経路で
  `checkNodePathJoinArgs`)。`resolve` と同じく variadic lowering、ただし
  arity 0 は Node が `.` を返す仕様なので reject せず `topaz_path_join(0)`
  に lower する。

## Consequences

- **受理**: `join()` / `join(p)` / `join(p, q, ...)` を string として。引数は
  変数 / 関数戻り値でも可。出力は Node `path.posix.join` と bit-for-bit
  一致(`node_path_join` で arity 0 / all-empty / 通常 / absolute / `..`
  解決 / leading `..` 保持 / trailing slash 保持 / 空セグメント skip /
  `/` 単独 / `.` / `..` 単独 / 重複 slash / cli.ts:71 と同じ
  `join(dirname(p), basename(p, ".ts"))` を 15 行で検証)。
- **reject**: 非 string segment(`join segment argument must be string`)、
  bare value 利用(`unknown identifier 'join'`)、`node:path` からの未許可
  named import(`relative` 等は引き続き loader で reject、
  `node_path_unknown_named_import_fail` を `relative` 入力に差し替えて
  許容セットの拡大を反映)。**arity 0 は accept**(Node が `.` を返す
  仕様に合わせる、`basename` / `extname` の arity check とは divergence)。
- **回帰**: positive `node_path_join`、fail `node_path_join_type_fail` /
  `node_path_join_as_value_fail`。累計 238 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `relative` / `normalize` / `isAbsolute` /
  `parse` / `format` / `sep` / `delimiter` は cli.ts でも src/ でも未使用
  なので持ち越し。`join` は subset 内で予約 builtin になり、同名の user
  関数を call-site で shadow する(`basename` / `extname` / `dirname` /
  `resolve` / `readFileSync` 等と同じ既知の divergence)。これで `cli.ts`
  の `node:path` import 行は全 named import が通り、残 blocker は
  `node:child_process` / `node:util` / `node:url` の 3 specifier のみ
  (Topaz-subset rewrite 1.5-6h で別経路に置換予定)。

## Notes

- 同じ call-site shortcut 機構: prep #13 (`readFileSync`) / #17
  (`existsSync`) / #18 ([0018](./0018-node-path-dirname-resolve.md)) / #19
  (`writeFileSync`) / #20 (`mkdirSync`) / #21
  ([0021](./0021-node-path-basename.md)) / #22
  ([0022](./0022-node-path-extname.md)) を踏襲。
