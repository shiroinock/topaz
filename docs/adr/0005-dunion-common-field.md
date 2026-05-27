# 0005 — dunion 共通フィールドの narrow なし read

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #18

## Context

self-hosting の次 blocker は `src/topaz_parser.ts:90` の `t.pos`(`t: Token`)。
`Token` は 11 variant の dunion で、全 variant が `pos: number` / `end: number` /
`kind: "..."` を共有する。TS は「全 variant に同型で存在するフィールド」への
narrow なし read(common-property access)を許すが、Topaz は 1.5-3e 以来
discriminator(`kind`)以外を一律 reject していた。lexer/parser は token の
`.pos` / `.end` を随所で narrow せず読むため、self-hosting に必須。

## Decision

dunion 値の field アクセスで、**全 variant が同一型で持つ共通フィールド**を read
専用で許可する。dunion は fat pointer `{ kind, void *data }` で、共通フィールドでも
variant ごとに struct offset が違う(`kind` の後ろの field 数が異なる)ため、
`.data` を一度 tmp に退避してから **variant tag(struct offset 0、`instanceof` が
読む slot)で dispatch** し、一致した variant に cast して read する inline
stmt-expr に lower。最終 variant は型保証によるチェック不要の fall-through。

却下案: (a) per-(dunion, field) の helper 関数生成 = 収集 Set + prelude emit pass
が要り prep substep には scope 過大。(b) 共通フィールドを固定 offset へ hoist =
struct 再配置で侵襲的。(c) `.kind` 文字列比較 dispatch = 文字列リテラル構築が要り
tag 比較より重い。write は variant を選べないため `checkAssignTarget` で明示 reject
(read のみ解禁)。

## Implementation

- `dunionCommonFieldType(t, field)` — 全 variant に同型存在する非 discriminator
  フィールドの型を返す / 無ければ undefined。`src/codegen.ts:1066-1087`
- `emitDunionCommonFieldAccess(expr, t)` — tag dispatch の stmt-expr を emit。
  `src/codegen.ts:1088-1113`
- `inferType` の dunion property-access 分岐に共通フィールド判定を追加。
  `src/codegen.ts:7188-7203`
- `emitExpression` の dunion property-access を discriminator / 共通フィールドで
  分岐。`src/codegen.ts:5427-5435`
- `checkAssignTarget` に dunion 代入の明示 reject 分岐を追加。`src/codegen.ts:7804-7811`

```c
// `t.pos` (t: dunion) の lowering
({ void *__topaz_dcf_0 = (t).data;
   *((const char * const *)__topaz_dcf_0) == &topaz_class_anon_0_tag ? ((topaz_class_anon_0 *)__topaz_dcf_0)->pos
   : ... : ((topaz_class_anon_2 *)__topaz_dcf_0)->pos; })
```

## Consequences

- **受理**: 全 variant が同一型で持つフィールドの narrow なし read(number / string
  いずれも、識別子 base / 配列要素など非識別子 base 含む)。discriminator read と
  `switch (x.kind)` narrowing は従来どおり共存。
- **reject**: 一部 variant にしか無い / variant 間で型が違うフィールドの read(従来
  どおり「narrow it first」)。共通フィールドへの **write**(`checkAssignTarget`)。
- **回帰**: positive `dunion_common_field`(common read × number/string + 配列要素
  base + discriminator read + switch narrowing 共存)+ warnfree。fail
  `dunion_common_field_write_fail`(common field への代入を reject)。168 → 171
  ケース全 pass。
- **scope 外 / 将来課題**: 次 blocker は `src/topaz_parser.ts:103` の
  `t.kind === "punct" && t.op`(`&&` 内 discriminator narrowing / compound
  condition narrowing、1.5-3d で未対応と明記済み)。これが次 substep の出発点。

## Notes

- 関連: discriminated union narrowing の初出は [archive の 1.5-3e](../archive/implementation-log.md)、
  dunion の fat-struct 共有は [0002](./0002-dunion-optional.md)。
- tag dispatch は `instanceof`(`src/codegen.ts` の `InstanceOfKeyword` 分岐)と
  同じ offset-0 tag 比較を再利用。
