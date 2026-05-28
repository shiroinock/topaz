# 0018 — node:path.dirname / resolve (POSIX)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #18

## Context

`src/loader.ts` を self-hosting サブセットに通す経路で、[0017](./0017-node-fs-exists-sync.md)
で `existsSync` を解禁した後の次の blocker が `import { dirname, resolve } from
"node:path"`(`loader.ts:2`)だった。loader はモジュール解決で `resolve(rootPath)`
/ `resolve(fromDir, spec)` で絶対パスを組み、`dirname(fromFile)` で親ディレクトリを
取る。同一 import 文に `dirname` と `resolve` の両方があるため、片方だけ allow set に
足しても loader の named-import 検査が他方を `unsupported named import` で落とす。
両方をセットで解禁しないと import 行が通らない。

## Decision

`node:path.dirname(p: string): string` と `resolve(...segments: string[]): string`
を `readFileSync` / `existsSync` と同じ call-site 限定の syntactic shortcut として
追加する。loader の `STDLIB_SPECIFIERS` に `node:path` → `{dirname, resolve}` を追加、
codegen は call-site でのみ識別子を拾い(bare 利用は scope lookup が「unknown
identifier」で落ちる)、runtime の `topaz_path_dirname` / `topaz_path_resolve` に
lower する。両関数は **Node の `path.posix` アルゴリズムの C 移植**(Topaz は Unix
専用なので Windows path 分岐は捨てる)。`resolve` は variadic で、`topaz_path_resolve(n,
seg0, seg1, ...)` に lower(`topaz_string` を varargs で値渡し、右→左に join して
絶対パスになるまで畳み込み、未到達なら `getcwd()` を最終フォールバック、`normalizeString`
で `.`/`..`/重複・末尾セパレータを畳む)。

却下案: A=`basename`/`extname`/`join` も同時投入(理由: それらは cli.ts (1.5-6h) の
依存で loader の今回の blocker ではない。prep は最小 scope を優先し、必要になった時に
別サブステップで足す)。B=`resolve` を自前正規化せず単純な文字列連結で済ます(理由:
モジュール specifier は `../foo` を多用するので `..` 解決が必須、Node と divergence
すると解決先がずれる)。C=path builtin を user 定義関数より優先しない guard を入れる
(理由: `readFileSync` 等の既存 shortcut と非一貫になる。これらの名前は subset 内で
予約済み builtin 扱いという既存方針を踏襲)。

## Implementation

- `runtime/runtime.h:7` に `#include <stdarg.h>`、`runtime.h:231-` に
  `topaz_path_dirname`(末尾スラッシュ除去 + 最終セパレータ手前)/
  `topaz_path_normalize_string`(Node `normalizeString` の C 移植、出力 ≤ 入力なので
  `len+1` arena バッファで足りる)/ `topaz_path_resolve`(variadic、右→左 join +
  `getcwd` フォールバック + normalize)。
- `src/loader.ts:138` の `STDLIB_SPECIFIERS` に `["node:path", new Set(["dirname",
  "resolve"])]` を追加。
- `src/codegen.ts` emitCall identifier 分岐に `dirname` → `emitNodePathDirname` /
  `resolve` → `emitNodePathResolve`、inferType identifier 分岐に両方 → `T_STRING`。
- `src/codegen.ts` に `checkNodePathDirnameArgs`(1 引数 string)/
  `checkNodePathResolveArgs`(1 個以上の string)+ emit メソッドを
  `emitNodeFsExistsSync` の直後に追加。emit/infer 両経路で同じ引数検査を通す。

## Consequences

- **受理**: `dirname(p)` / `resolve(seg, ...)` を string として。引数は変数・関数
  param でも可。出力は Node `path.posix` と bit-for-bit 一致(`node_path_basic` で
  dirname の `.`/`/` edge、resolve の `..` 正規化・後続絶対セグメント優先・getcwd
  フォールバックを 15 行で検証)。
- **reject**: dirname の引数 0/2 個以上、resolve の引数 0 個、非 string 引数、bare
  value 利用(`unknown identifier 'resolve'`)、`node:path` からの `dirname`/`resolve`
  以外の named import(`join`/`basename`/`extname` 等は引き続き loader で reject)。
- **回帰**: positive `node_path_basic`、fail `node_path_dirname_arity_fail` /
  `node_path_dirname_type_fail` / `node_path_resolve_arity_fail` /
  `node_path_resolve_type_fail` / `node_path_as_value_fail` /
  `node_path_unknown_named_import_fail`。累計 213 ケース、`npm test` 全 pass。
- **scope 外 / 将来課題**: `basename`/`extname`/`join`/`normalize` は cli.ts の依存
  として 1.5-6f/h で別途。`resolve`/`dirname` は subset 内で予約 builtin になり、同名の
  user 関数を call-site で shadow する(`readFileSync` 等と同じ既知の divergence)。
  loader.ts の次の blocker は tsc API の namespace import(`loader.ts:3`)で、1.5-6g の
  rewrite 対象。

## Notes

- prep #13(`node:fs.readFileSync`)/ #17(`existsSync` = [0017](./0017-node-fs-exists-sync.md))
  を踏襲。同じ call-site shortcut 機構の parseInt/parseFloat = [0003](./0003-parse-int-float.md)。
