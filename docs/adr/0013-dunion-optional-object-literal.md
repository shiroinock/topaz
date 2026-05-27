# 0013 — `dunion | undefined` を expected とする object literal

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #16

## Context

prep #15 ([0002](./0002-dunion-optional.md) 系の延長で `T | undefined` の T = dunion を解禁)着地後、`src/topaz_parser.ts` の次 blocker は `709:21`:

```
object literal expression requires a contextually typed anonymous-class target,
got topaz_union_dunion_anon_67_or_anon_68_or_undefined
```

`let binding: ForOfBinding | undefined = undefined; binding = { kind: "for_of_single", ... }` の形。`ForOfBinding` 自体が dunion なので object literal の expected が `dunion | undefined`(union)になる。`emitWithExpected` の object literal handler は `expected.kind === "dunion"` の分岐([0008](./0008-dunion-initializer-narrowing.md) prep #11 で投入)は持つが、それを `undefined` で包んだ union には未対応で fallthrough して reject していた。

## Decision

object literal handler の冒頭に「`expected` が `undefined` を含む union なら、`withoutUndefined` で inner を剥がして `emitWithExpected(expr, inner)` で再帰し、`applyCoercion(inner→union)` で widen する」分岐を追加。inner は dunion(既存 discriminator 駆動の variant 選択分岐へ)または anon class(末尾の anon-class fallthrough へ)で、どちらも widening は C 表現上 no-op(dunion は `.data == NULL` sentinel と同 shape の fat struct、anon は reference)。`emitUndefinedLiteral` / `applyCoercion` の union 分岐は prep #15 で既に dunion absent / 同型 widening を持つので新規 runtime / 経路追加は不要。inner は union を含まないため再帰は 1 段で止まる。

却下した案: A=object literal 専用の union 展開ロジックを書く(理由: 既存の dunion 分岐 + applyCoercion をそのまま使えるので不要な重複)。B=union 全体に一般化して scalar variant も許す(理由: scalar | undefined の object literal は意味を持たず、現状 inner=dunion / anon 以外は下流の既存 reject に任せれば十分)。

## Implementation

- `src/codegen.ts:8215-8230` — object literal handler 冒頭に `expected.kind === "union" && containsUndefined(expected)` 分岐。`withoutUndefined` で inner を取り、`this.emitWithExpected(expr, inner)` → `this.applyCoercion(..., inner, expected, expr)`。
- widening の no-op 性は `applyCoercion:8441`(union widening)と `emitUndefinedLiteral:8417`(dunion absent `{0}`)に既存。

## Consequences

- **受理**: `dunion | undefined` / `anon | undefined` を expected とする object literal(変数初期化・代入 RHS・引数・return の全 emit-site で `emitWithExpected` 経由)。`undefined` 自体は従来通り同 slot を流れる。
- **reject**: undefined を剥がした後も inner dunion の discriminator 検証は維持(不正な `kind` は `no variant of ... has kind="..."`)。
- **回帰**: positive `dunion_optional_object_literal`(+ cc-warnfree)、fail `dunion_optional_object_literal_fail`。累計 194 ケース。
- **scope 外 / 将来課題**: `Array<dunion | undefined>` / `Map<scalar, dunion | undefined>` / `Set<dunion | undefined>` の container 要素型は依然未対応(prep #15 の scope 外 (1) のまま)。`src/topaz_parser.ts` の次 blocker は `1272:47` の「`return` inside a `try` body」(1.5-X)。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(prep #15 まで)
- 関連: [0008](./0008-dunion-initializer-narrowing.md)(dunion 初期化子 narrowing)、[0010](./0010-dunion-widening.md)(dunion → 広い dunion widening)
