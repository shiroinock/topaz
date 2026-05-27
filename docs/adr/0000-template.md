# NNNN — タイトル

- **Status**: Accepted | Superseded by [NNNN](./NNNN-slug.md) | Deprecated
- **Date**: YYYY-MM-DD
- **Phase**: 1.5-6 prep-xxx 等(該当があれば)

## Context

なぜこの判断が必要になったか。直前の blocker、棚卸し結果、関連 ADR への [link](./NNNN-other.md)。

## Decision

採用した方針を 1 段落で簡潔に。検討した代替案がある場合は「却下した案: A=...(理由: ...), B=...(理由: ...)」を続ける。

## Implementation

- 主な変更点と file:line 参照(コードを貼らずに `src/codegen.ts:431-482` 等で示す)
- 必要なら短い lowering の例

```ts
// 必要最小限の code block のみ
```

## Consequences

- **受理**: ...
- **reject**: ...
- **回帰**: positive / fail サンプル名 + 累計ケース数(`tests/smoke.sh` で `run_case` / `run_fail_case`)
- **scope 外 / 将来課題**: ...

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- ADR は 1 ファイル = 1 決定。原則 Accepted のまま保ち、覆す時は新規 ADR を起こして Status を `Superseded by ...` に書き換える
