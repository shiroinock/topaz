# 0032. String.prototype.startsWith / endsWith (6f)

- Status: Accepted
- Date: 2026-05-31

## Context

6e-4 で codegen は Topaz AST 消費に倒れ、次の self-host graph では loader /
codegen 内の string prefix / suffix 判定が残った。具体的には `src/loader.ts` の
相対 import 判定と拡張子判定、`src/codegen.ts` の synthesized iterator source 名
判定が `.startsWith()` / `.endsWith()` を要求する。現 blocker の
`node:util.parseArgs` は 6h の cli 手書き argv パースで消す方針なので、6f では
string method だけを足す。直前の足場は [6e-4](./0031-codegen-topaz-ast-6e4-entry-flip.md)。

## Decision

`String.prototype.startsWith(search: string): boolean` と
`String.prototype.endsWith(search: string): boolean` の一引数形だけを Topaz string
method として受理し、runtime helper
`topaz_string_starts_with` / `topaz_string_ends_with` に直接 lower する。検索引数は
exact `string` で、JS の ToString coercion や optional position / endPosition は
入れない。実行時 semantics は既存 ASCII-only `topaz_string` の byte-wise 比較で、
empty search は true、search が receiver より長ければ false。

却下案: `indexOf` も同時に追加する案は self-host src に利用がなく、`-1` sentinel
と数値 semantics を増やすため却下。optional 引数対応は現 src が一引数形だけなので
後続の独立拡張へ回す。`.slice(...) === ...` への rewrite は一時 allocation が増え、
receiver 評価も helper 直呼びより複雑になるため却下。

## Implementation

- `runtime/runtime.h:118`: `topaz_string_starts_with` /
  `topaz_string_ends_with` を追加。length guard 後に `memcmp` し、allocation しない。
- `src/codegen.ts:6979`: `emitStringMethodCall` に startsWith / endsWith の arity と
  string 引数検証を追加し、`topaz_string_{starts,ends}_with` 呼び出しへ lower。
- `src/codegen.ts:7571`: `inferStringMethodReturn` でも同じ検証を行い `T_BOOLEAN` を返す。
- `examples/string_starts_ends_with.ts`: prefix / suffix true-false、empty search、
  search longer、full match、slice/concat/template receiver、boolean control-flow、
  loader-like extension checks を covered。

## Consequences

- **受理**: `"abc".startsWith("a")` / `"abc".endsWith("c")` / empty search /
  string 式 receiver / `if` 条件内の boolean use。
- **reject**: arity != 1 は method-specific message、non-string search は
  `String.<method> argument must be string, got ...`。`indexOf` は引き続き
  `unsupported method '.indexOf' on topaz_string`。
- **回帰**: `string_starts_ends_with` positive、arity/type fail 4 件、
  既存 `string_unsupported_method_fail` 更新。`tests/smoke.sh` は 269 checks
  (run_case / run_module_case / run_fail_case / run_cc_warnfree_case)。
- **scope 外**: `indexOf`、optional position / endPosition、Unicode-aware matching、
  stdlib namespace 化。
