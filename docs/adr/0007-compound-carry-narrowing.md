# 0007 — compound 条件の early-exit carry narrowing(De Morgan 分解)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #20

## Context

self-hosting の次 blocker は `src/topaz_parser.ts:137` の `expectPunct`:

```ts
if (t.kind !== "punct" || t.op !== op) { throw this.error(t, ...); }
this.pos += 1;
return t;  // ← t を PunctToken (punct variant) に narrow したい
```

`if` の本体が必ず exit(throw)するので、条件の否定が後続 statement に carry する
(1.5-3d の `applyCarryNarrowing`)。だが条件が compound(`||`)で、
`extractNarrowing` は単項の `===`/`!==`・`instanceof` しか解釈せず、`&&`/`||` を
未対応として `undefined` を返していた([0006](./0006-compound-condition-narrowing.md)
は `&&`/`||` の **右オペランド** narrowing を入れたが、compound 条件そのものを
carry する経路はこれが残課題と明記)。lexer/parser は `expectPunct` 系の
early-exit guard を随所で使うため self-hosting に必須。

## Decision

`extractNarrowing` の冒頭に `&&`/`||` の De Morgan 分解を追加する。`A && B` が真
なのは両方真のときだけなので **polarity-true** で左→右の順に narrowing を取り出す。
`A || B` が偽なのは両方偽のときだけなので **polarity-false** で左→右を取り出す。
逆 polarity(`!(A && B)` = `!A || !B`)はどちらの否定かが確定しないため `undefined`
を返して諦める(false negative は narrowing 無効化のみで誤コードを生まない)。再帰
なので `a && b && c` のようなネストもそのまま分解される。

却下案: (a) carry 用に複数 narrowing を返す list 化 = 現 blocker は単一変数 1 件で
足りるうえ `applyCarryNarrowing` / `emitStatementAsBlock` の単一 narrowing interface を
広く触る必要が出る。必要になった時点で別 substep。(b) `applyCarryNarrowing` 側で
compound を分解 = `extractNarrowing` 一本化のほうが if 本体内 narrowing・`&&`/`||`
右オペランド([0006](./0006-compound-condition-narrowing.md))・carry の 3 経路で
共有でき、ネスト再帰も自然。

## Implementation

- `extractNarrowing` 冒頭に `&&`(polarity-true 必須)/ `||`(polarity-false 必須)の
  分解を追加、左→右を `??` で fold して再帰呼び出し。`src/codegen.ts:4031-4048`
- 既存の `applyCarryNarrowing`(`src/codegen.ts:3990`)・`emitStatementAsBlock` の
  単一 narrowing 経路・`&&`/`||` 右オペランド emit / inferType 経路は無変更で恩恵を受ける。

## Consequences

- **受理**: `expectPunct` の `if (t.kind !== "punct" || t.op !== op) throw` 後の
  `t` narrow(`||` polarity-false De Morgan)、`&&` else-exit guard 後の positive
  carry、ネスト compound、既存の `s !== undefined && ...` 系も同経路。`topaz_parser.ts`
  の blocker が 137 → 233(別件: 変数注釈 `Token` が返り値 variant を dunion に
  widening して narrow 不在)へ前進。
- **reject**: 不定 polarity(`&&` を carryPolarity-false、`||` を carryPolarity-true)
  では narrowing が流れず、後続の dunion field read は引き続き reject。
- **回帰**: positive `compound_carry_narrow`(`||` early-return carry + `&&` else-exit
  carry)+ warnfree、fail `compound_carry_indeterminate_fail`(`&&` 本体 exit・else
  無しで carry 不定 → field read reject)。174 → 177 ケース全 pass。
- **scope 外 / 次 blocker**: `src/topaz_parser.ts:233` の
  `const name: Token = this.expectIdent()` — 宣言注釈が返り値の具体 variant
  (`IdentToken`)を dunion `Token` に widening し narrow が消える。次 substep の出発点。

## Notes

- 単項 narrowing と `applyCarryNarrowing` / `alwaysExits` の基盤は
  [archive の 1.5-3d](../archive/implementation-log.md)、discriminator narrowing の
  `switch` 経路は [archive の 1.5-3e](../archive/implementation-log.md)、`&&`/`||`
  右オペランド narrowing は [0006](./0006-compound-condition-narrowing.md)。
