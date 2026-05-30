# 0021 — node:path.basename(p, ext?) (POSIX)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6 prep #21

## Context

[0018](./0018-node-path-dirname-resolve.md) で `dirname` / `resolve` を解禁した時点で
`basename` / `extname` / `join` は scope 外として「cli.ts (1.5-6h) 依存なので別途」と
記録した。今 `src/cli.ts` を `--emit-c-only` に通すと `node:child_process` /
`node:util` / `node:url` がまず blocker になるが、`node:path` 側も
`basename(input, ".ts")` (`cli.ts:71`) を含む named import 行で
`unsupported named import 'basename'` が次に出るため、cli.ts rewrite (1.5-6h) に
入る前の prep として `basename` を先に解禁しておく。`extname` / `join` は同じ
import 行から `basename` を抜いた状態でも引き続き blocker なので、本サブステップは
`basename` 1 関数だけに絞る。

## Decision

`node:path.basename(p: string, ext?: string): string` を `dirname` / `resolve` と
同じ call-site 限定の syntactic shortcut として追加する。loader の
`STDLIB_SPECIFIERS` の `node:path` set に `basename` を足し、codegen は call-site の
`basename(...)` だけを拾って 1 引数 / 2 引数で別 runtime 関数 (`topaz_path_basename`
/ `topaz_path_basename_ext`) に dispatch する。runtime は **Node の
`path.posix.basename` の C 移植**(Topaz は Unix 専用)。

却下案: A=`basename` / `extname` / `join` を 3 関数まとめて投入(理由: 1 サブ
ステップ = 1 機能の運用と非整合、`extname` / `join` は cli.ts 単独 import 行を解く
ためにしか要らないので、cli.ts rewrite (1.5-6h) 直前にまとめて投入した方が
scope が局所化される)。B=`basename` を `(p, ext) => p.endsWith(ext) ? p.slice(0,
-ext.len) : p` 等のユーザ書き換えに任せ runtime を増やさない(理由: Node の
`basename` は trailing slash 剥がし / suffix === path のとき "" など edge case が
あり、cli.ts の使い方 `basename(input, ".ts")` と Node 結果を bit-for-bit 一致
させたい)。C=1 つの C 関数で `ext.len == 0` を「無指定」扱いにする(理由: 呼び出し
側で empty ext literal を fabricate する手間が増える、optional vs explicit empty の
意味分離が崩れる)。

## Implementation

- `runtime/runtime.h:460-` に `topaz_path_basename` (1 引数版、trailing slash 剥がし
  + last segment) と `topaz_path_basename_ext` (2 引数版、`suffix === path` 早期
  return + RTL ext-index scan) を追加。Node `lib/path.js` の posix `basename` の
  両分岐をそのまま C 移植。arena 確保 + NUL 終端。
- `src/loader.ts:141` の `STDLIB_SPECIFIERS` の `node:path` set を
  `{dirname, resolve, basename}` に拡張。
- `src/codegen.ts` emitCall identifier 分岐に `basename` → `emitNodePathBasename`、
  inferType identifier 分岐に `basename` → `T_STRING`(引数検査も両経路で
  `checkNodePathBasenameArgs`)。arity 1 / 2 dispatch は emitNodePathBasename
  内側で完結。

## Consequences

- **受理**: `basename(p)` / `basename(p, ext)` を string として。引数は変数 / 関数
  param でも可。出力は Node `path.posix.basename` と bit-for-bit 一致
  (`node_path_basename` で `/foo/bar/`(trailing slash)/ `""`(empty)/ `/`(no
  non-slash)/ `suffix === path` の早期 ""(`.ts` × `.ts`)/ `.js` ext on `.ts`
  path の no-match を 13 行で検証)。
- **reject**: arity 0 / 3+(`basename expects one or two arguments`)、非 string
  path / ext(`basename path/ext argument must be string`)、bare value 利用
  (`unknown identifier 'basename'`)、`node:path` からの未許可 named import
  (`join` / `extname` 等は引き続き loader で reject)。
- **回帰**: positive `node_path_basename`、fail `node_path_basename_arity_fail` /
  `node_path_basename_path_type_fail` / `node_path_basename_ext_type_fail` /
  `node_path_basename_as_value_fail`。累計 231 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `extname` / `join` は cli.ts (1.5-6h) 直前に別途。
  `basename` は subset 内で予約 builtin になり、同名の user 関数を call-site で
  shadow する(`dirname` / `resolve` / `readFileSync` 等と同じ既知の divergence)。
  cli.ts の残 blocker は `node:child_process` / `node:util` / `node:url` の named
  import で、これらは Topaz-subset rewrite (1.5-6h) で別経路に置換予定。

## Notes

- 同じ call-site shortcut 機構: prep #13 (`readFileSync`) / #17 (`existsSync`) /
  #18 ([0018](./0018-node-path-dirname-resolve.md)) / #19 (`writeFileSync`) /
  #20 (`mkdirSync`) を踏襲。
