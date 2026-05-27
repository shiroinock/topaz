# 0006 — compound condition narrowing(`&&` / `||` の右オペランド narrowing)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #19

## Context

self-hosting の次 blocker は `src/topaz_parser.ts:103` の
`return t.kind === "punct" && t.op === op`(`t: Token` は 11 variant の dunion)。
`&&` の左辺 `t.kind === "punct"` が `t` を `punct` variant に narrow し、右辺
`t.op === op` がその variant 固有フィールド `op` を読む。1.5-3d は narrowing を
`if` の単項条件と `extractNarrowing` の `===`/`!==` undefined・`instanceof` に
限定し、compound condition(`&&` / `||`)を未対応と明記していた。lexer/parser は
`t.kind === "..." && t.<field>` の形を随所で使うため self-hosting に必須。

## Decision

`&&` / `||` の **右オペランドを、左オペランドが含意する narrowing 下で**
emit / type-check する。`&&` の右辺は左辺が真のときだけ評価されるので左辺の
positive narrowing を、`||` の右辺は左辺が偽のときに走るので negative narrowing を
`Scope` overlay に install して右辺を処理し、直後に pop。あわせて
`extractNarrowing` に discriminator 形 `<id>.<disc> === "lit"` を追加し、`switch`
と同じ `scope.narrow(id, classOf(variant))` 経路に乗せる(narrowed identifier emit
の `(topaz_class_<C> *)(id).data` cast を再利用)。`===` 真(または `!==` 偽)は
当該 variant、補集合は 2-variant dunion のときだけもう片方に narrow。

却下案: (a) `if` 本体まで含めた両オペランド結合 narrowing(De Morgan)= 今回の
blocker は `return` 式中の `&&` 単独なので scope 過大、early-exit guard 後の carry
は次 blocker(`||` + throw)として別 substep。(b) ternary `? :` の分岐 narrowing も
今回は不要なので見送り。(c) discriminator narrowing を `switch` 専用に留め `&&` で
別機構を組む = `extractNarrowing` 一本化のほうが `if` / carry / `&&` / `||` で共有
できる。

## Implementation

- `extractDiscriminatorNarrowing(cond, tok, polarity)` 新設 — property-access ×
  string-literal の組を判定し variant class を返す。`src/codegen.ts:4082`
- `extractNarrowing` の `===`/`!==` guard 直後に discriminator 判定を挿入
  (undefined 判定とは node 形状で排他)。`src/codegen.ts:4054`
- `inferType` の `&&` / `||` 分岐を narrowing 下の右辺 `expectType` に変更。
  `src/codegen.ts:7469`
- `emitExpression` の binary 汎用 emit 直前に `&&` / `||` 専用分岐を追加(右辺を
  narrow overlay 下で emit)。`src/codegen.ts:5773`

## Consequences

- **受理**: `x.kind === "lit" && x.<variant-field>`、`x.kind !== "lit" || ...`、
  2-variant 補集合 narrowing、既存 `s !== undefined && s.length` 等の
  `T | undefined` narrowing も同じ `&&` 経路で通るようになった。
- **reject**: 左辺が別 variant に narrow する場合の右辺 variant-field read は narrowed
  class のメンバ不在として reject(narrowing は honor され bypass しない)。
- **回帰**: positive `compound_narrow`(`&&` discriminator + `||` 補集合 + 2-variant
  complement + `T | undefined`)+ warnfree。fail `compound_narrow_no_left_fail`
  (別 variant narrow 後の variant-field read を reject)。171 → 174 ケース全 pass。
- **scope 外 / 次 blocker**: `src/topaz_parser.ts:137` の
  `if (t.kind !== "punct" || t.op !== op) { throw ... }` 後の carry narrowing
  (compound 条件の両オペランドを De Morgan 結合する early-exit narrowing)。次 substep
  の出発点。

## Notes

- 関連: 単項 narrowing と carry の基盤は [archive の 1.5-3d](../archive/implementation-log.md)、
  discriminated union narrowing の `switch` 経路は [archive の 1.5-3e](../archive/implementation-log.md)、
  dunion の fat-struct 共有は [0002](./0002-dunion-optional.md)。
- narrowed dunion identifier の `.data` cast は `switch` narrowing と同一コード。
