# 0011 — condition 省略形 `for (;;)`(無限ループ)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep

## Context

[0010](./0010-dunion-widening.md) までの地ならし後、`node dist/cli.js src/topaz_parser.ts --emit-c-only` の次 blocker が `topaz_parser.ts:570:9` の `for (;;)`(condition なし無限ループ)で止まっていた。`parseVarDeclBody` の object destructuring 走査が C-style 無限ループ + 内部 `break` で書かれており、self-hosting 経路上で踏む。`emitForStatement` は condition 欠落を明示エラーにしていた一方、init / incrementor の省略は既に許容済みだった。`while (true)` は受理されるので、`for (;;)` を reject し続けるのは非対称でもある。

## Decision

condition 欠落を「未対応」から「無限ループ」に格上げし、C の空 middle clause `for (init; ; incr)` をそのまま emit する。body 内の `break` / `return` / `throw` で抜ける責務はユーザー側(`while (true)` と同じ契約)で、exit 経路の有無は検証しない。却下した案: A = `for (init; 1; incr)` と明示 `1` を挿入(理由: 機能等価だが生成 C が source と乖離し bit-for-bit 比較のノイズになる)、B = `while (1)` への書き換え(理由: init / incrementor を別 statement に展開する必要が出て lowering が無駄に複雑化)。

## Implementation

- `src/codegen.ts:4764-4771` — `emitForStatement` の `if (!stmt.condition) throw` を削除し、`condStr` を空文字列で初期化、condition がある時だけ `expectType(_, T_BOOLEAN)` + `emitExpression` を通す分岐に変更。emit 末尾の `for (${initStr}; ${condStr}; ${incrStr})` は不変(空 condStr で `for (...; ; ...)` になる)。
- init / incrementor の省略は従来通り `initStr` / `incrStr` が空のままで対応済み。

## Consequences

- **受理**: `for (;;)` / `for (init; ; incr)` / `for (; cond; )` 等、3 clause の任意の組み合わせ省略。
- **reject**: condition を書いた場合は依然 strict boolean(truthy / falsy は型エラー)。
- **回帰**: positive `examples/for_infinite.ts`(`run_case for_infinite` + `run_cc_warnfree_case`)、fail `examples/for_nonbool_cond_fail.ts`(`run_fail_case`、`for (; 5; )` が boolean 厳格性で reject)。累計 186 ケース(`run_case` 63 / `run_fail_case` 114 / `run_module_case` 1 / `run_cc_warnfree_case` 8)。
- **scope 外 / 将来課題**: exit 経路を持たない真の無限ループの静的検出は行わない(`while (true)` と同契約)。次 blocker は `topaz_parser.ts:634:28` の `ConditionalExpression`(三項演算子)で、別サブステップ。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- ADR は 1 ファイル = 1 決定。原則 Accepted のまま保つ
