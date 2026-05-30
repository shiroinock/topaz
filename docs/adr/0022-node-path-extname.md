# 0022 — node:path.extname(p) (POSIX)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #22

## Context

[0021](./0021-node-path-basename.md) で `basename` を解禁した時点で、`cli.ts` の
`node:path` import 行 (`cli.ts:4`) に残る blocker は `extname` と `join` の 2 つ
になった。`extname` は `cli.ts:50` の `extname(input) !== ".ts"` で拡張子検査に
使われており、`join` (1 個所 `cli.ts:71`) より edge case (`.` / `..` /
leading-dot-only / trailing slash) を吸収する分だけ runtime 実装の重みがある。
1 サブステップ = 1 機能の運用に合わせて `extname` だけを先に着地させ、`join`
は cli.ts rewrite (1.5-6h) 直前に別途やる。

## Decision

`node:path.extname(p: string): string` を `basename` / `dirname` / `resolve` と
同じ call-site 限定の syntactic shortcut として追加する。loader の
`STDLIB_SPECIFIERS` の `node:path` set に `extname` を足し、codegen は call-site
の `extname(...)` だけを拾って 1 引数固定で `topaz_path_extname` に dispatch する。
runtime は **Node の `path.posix.extname` の C 移植**(Topaz は Unix 専用)。

却下案: A=`extname` / `join` を 2 関数まとめて投入(理由: 1 サブステップ = 1
機能の運用と非整合、`join` は variadic + segment 連結ロジックが別物で、runtime
コードの共通性が無い)。B=`extname` を `(p) => { const b = basename(p); const i =
b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; }` 等のユーザ書き換えで代替し
runtime を増やさない(理由: Node の `extname` は leading-dot-only segment
(`.bashrc` → `""`)、`.` / `..` の特別扱い、trailing slash 後の末尾 segment
判定など edge case があり、cli.ts の使い方 `extname(input) !== ".ts"` を含めて
Node 結果と bit-for-bit 一致させたい — `basename` + `lastIndexOf` の組合せでは
`.bashrc` / `.` / `..` が divergence する)。C=Node の `pre_dot_state` 機構を持た
ない簡易実装にする(理由: leading-dot-only segment を `""` に倒せず、Node との
互換性が崩れる)。

## Implementation

- `runtime/runtime.h:530-` に `topaz_path_extname` を追加。Node `lib/path.js`
  posix 版の RTL scan ロジック(`startDot` / `startPart` / `end` /
  `matchedSlash` / `preDotState`)をそのまま C 移植、`.` / `..` /
  leading-dot-only の判定を 1 パスで処理。arena 確保 + NUL 終端で
  `topaz_string` を返す。
- `src/loader.ts:142` の `STDLIB_SPECIFIERS` の `node:path` set を
  `{dirname, resolve, basename, extname}` に拡張。
- `src/codegen.ts` emitCall identifier 分岐に `extname` →
  `emitNodePathExtname`、inferType identifier 分岐に `extname` → `T_STRING`
  (引数検査も両経路で `checkNodePathExtnameArgs`)。arity 1 固定で
  `topaz_path_extname(${path})` に lower。

## Consequences

- **受理**: `extname(p)` を string として。引数は変数 / 関数 param でも可。
  出力は Node `path.posix.extname` と bit-for-bit 一致(`node_path_extname`
  で `index.html` / `index.coffee.md` / `index.` / `index` / `.index` /
  `.index.md` / `/foo/bar/baz.ts` / `/foo/bar/`(trailing slash)/
  `/foo/bar.tar.gz` / `""` / `.` / `..` / 関数経由を 13 行で検証)。
- **reject**: arity 0 / 2+(`extname expects exactly one argument`)、非 string
  path(`extname path argument must be string`)、bare value 利用
  (`unknown identifier 'extname'`)、`node:path` からの未許可 named import
  (`join` 等は引き続き loader で reject、`node_path_unknown_named_import_fail`
  のコメントを `dirname` / `resolve` / `basename` / `extname` 許容に更新)。
- **回帰**: positive `node_path_extname`、fail `node_path_extname_arity_fail` /
  `node_path_extname_type_fail` / `node_path_extname_as_value_fail`。累計 235
  ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `join` は cli.ts (1.5-6h) 直前に別途。`extname` は
  subset 内で予約 builtin になり、同名の user 関数を call-site で shadow する
  (`basename` / `dirname` / `resolve` / `readFileSync` 等と同じ既知の
  divergence)。cli.ts の `node:path` import 行に残る blocker は `join` のみ、
  `node:child_process` / `node:util` / `node:url` の named import は別途
  Topaz-subset rewrite (1.5-6h) で別経路に置換予定。

## Notes

- 同じ call-site shortcut 機構: prep #13 (`readFileSync`) / #17 (`existsSync`) /
  #18 ([0018](./0018-node-path-dirname-resolve.md)) / #19 (`writeFileSync`) /
  #20 (`mkdirSync`) / #21 ([0021](./0021-node-path-basename.md)) を踏襲。
