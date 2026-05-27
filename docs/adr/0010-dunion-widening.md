# 0010 — dunion → より広い dunion への widening(部分集合 variant)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #23

## Context

self-hosting blocker は `topaz_parser.ts:520:28` の `const decl: Stmt = this.parseVarDeclBody(...)`。
`parseVarDeclBody` の戻り型は `VarDeclStmt | VarDestrDeclStmt`(2 variant の dunion)で、
これを全 statement を網羅する広い `Stmt` dunion に代入する形が未対応だった。型は
`topaz_dunion_anon_34_or_anon_35` → `topaz_dunion_anon_33_or_..._or_anon_64` の関係で、
狭い dunion の variant 集合が広い dunion の部分集合になっている。先行 ADR の
[0008](./0008-dunion-initializer-narrowing.md)(concrete variant → dunion 初期化子 narrowing)、
[0005](./0005-dunion-common-field.md)(dunion 共通フィールド read)で dunion ↔ class 方向は
通っていたが、dunion ↔ dunion 方向のサブタイプ関係は未実装だった。

## Decision

discriminator が一致し、actual の variant 集合が expected の部分集合である dunion → dunion を
assignable とし、coercion で「同じ tag + payload を広い typedef に再 wrap」する。全 dunion typedef は
`{ topaz_string <disc>; void *data; }` で layout 互換なので、狭い値の `.kind` / `.data` を広い
struct に詰め直すだけで意味が保たれる(`.kind` は実行時の実 variant を既に保持)。
却下した案: A=`void *` への collapse(全 dunion を単一表現に潰す)— 1.5-3e で確定した「variant 集合ごとに
mangle を分ける」設計と矛盾し、container 要素 tag の一意性が壊れる。B=逆方向(広い → 狭い)も許す —
狭い側に存在しない variant の payload を受け取りうるため unsound、明示 narrowing なしには通さない。

## Implementation

- `isAssignableTo`(`src/codegen.ts:8046-8056`)に dunion → dunion 分岐を追加。discriminator 一致 +
  `actual.variants.every(v => expected.variants.includes(v))`。
- `applyCoercion`(`src/codegen.ts:8388-8407`)に同条件の lowering を追加。side-effect ある source を
  statement expression で 1 度だけ束縛し、広い typedef の compound literal に `.kind` / `.data` を詰め直す:

```c
({ topaz_dunion_NARROW __topaz_dw_0 = (src); (topaz_dunion_WIDE){ __topaz_dw_0.kind, __topaz_dw_0.data }; })
```

両 typedef は `recordDunionMonomorph`(annotation 解決時)で登録済みなので追加の emit 経路は不要。
var-init / return / 関数引数の全 emit-site は既存の `emitWithExpected` → `applyCoercion` 経路を通る。

## Consequences

- **受理**: 狭い dunion(同 discriminator・部分集合 variant)の広い dunion への代入。`topaz_parser.ts:520:28`
  の blocker 解消、次 blocker は `topaz_parser.ts:570:9` の `for (;;)`(condition なし for ループ、別サブステップ)。
- **reject**: 逆方向(広い → 狭い)は `is not a variant of` で停止。discriminator 不一致も type mismatch。
- **回帰**: positive `dunion_widen`(var-init / return / 引数の 3 site)、fail `dunion_widen_fail`
  (広い → 狭い)。`dunion_widen` を `run_cc_warnfree_case` に追加。181 → 184 ケース全 pass。
- **scope 外 / 将来課題**: union(`T | undefined`)と dunion の混在、interface ↔ dunion、
  covariant/contravariant な構造的サブタイプは引き続き未対応。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- ADR は 1 ファイル = 1 決定。
