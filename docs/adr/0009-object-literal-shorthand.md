# 0009 — object literal property shorthand

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep

## Context

self-hosting (1.5-6) の前提として Node 製 codegen が `src/` を食えるようにする地ならしの続き。
直前の blocker は `src/topaz_parser.ts:310` の object literal property shorthand
(`out.push({ name: name.text, type: ty, isOptional, pos: name.pos, end: ty.end })`
の `isOptional` が `isOptional: isOptional` の省略記法)。anon class への object literal は
[0005](./0005-dunion-common-field.md) / [0008](./0008-dunion-initializer-narrowing.md)
で contextual typing 経由で受理済みだが、property は `name: value` の
`PropertyAssignment` 形のみで shorthand は明示 reject していた。

## Decision

`emitWithExpected` の anon-class object literal path で `ShorthandPropertyAssignment` を
受理し、`{ x }` を `{ x: x }` と同等に desugar する。値式は `prop.name`
(Identifier ノード)をそのまま使い、現スコープの参照として `emitWithExpected(prop.name, fieldType)`
に流す — 専用の lowering を足さず既存の identifier 経路に合流させる最小実装。
却下した案: A=parser/AST 段で shorthand を `PropertyAssignment` に正規化(現状 tsc AST を
直接読む構成で AST 書き換え層が無く、emit-site 1 箇所の分岐で済むので過剰)。
method shorthand / getter-setter / spread / `{ x = default }`(`objectAssignmentInitializer`)は
引き続き未対応で `CodegenError`。

## Implementation

- `src/codegen.ts:8191-8228` — anon-class path の property ループを `isPropertyAssignment` /
  `isShorthandPropertyAssignment` / else(reject)の 3 分岐に再構成。shorthand は
  `prop.objectAssignmentInitializer` があれば reject、無ければ `valueExpr = prop.name`。
- `src/codegen.ts:8219` — reject メッセージを `(no method shorthand, getter / setter, spread)` に更新
  (shorthand を許可した分を文言から除外)。
- `src/codegen.ts:398-401` — capture 解析 `isReferencePosition` のコメント修正。shorthand の
  identifier は member 名ではなく scope 参照なので末尾 `return true` に落ちる(= 参照位置)挙動が
  正しいことを明記(コード変更なし、arrow closure 内 shorthand の捕捉が従来通り効く)。
- dunion 文脈の discriminator 探索 (`codegen.ts:8127`) は `kind: "..."` の string literal 限定で
  shorthand が discriminator になり得ないため変更なし。非 discriminator field の shorthand は
  variant class への recursion 経由で上記 path に合流する。

## Consequences

- **受理**: `{ a, b }` / shorthand と explicit の混在 `{ a: c, b }` / arrow closure に捕捉される
  shorthand identifier。`topaz_parser.ts:310` の blocker 解消、次 blocker は
  `topaz_parser.ts:520:28` の dunion → より広い dunion への代入(部分集合 variant の widening、
  別サブステップ)。
- **reject**: method shorthand `{ f() {} }` / getter-setter / spread `{ ...x }` /
  default 付き shorthand `{ x = v }`。
- **回帰**: positive `object_literal_shorthand`、fail `object_literal_method_shorthand_fail`
  (旧 `object_literal_shorthand_fail` を positive に転換)。`object_literal_spread_fail` の
  assert 文言を新メッセージに更新。180 → 181 ケース全 pass。
- **scope 外 / 将来課題**: anon class に method を生やす方向(method shorthand)、structural
  merge(spread)は現方針(同 shape を positional ctor で組む)と噛み合わないため据え置き。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- ADR は 1 ファイル = 1 決定。
