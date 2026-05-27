# 0016 — closure 越えの dunion narrowing 伝播

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #28

## Context

self-hosting の次 blocker は `topaz_parser.ts:1594:31` の
`cannot access '.stmts' on discriminated union topaz_dunion_anon_28_or_anon_29`。
`parseArrow` の endPos 計算が
`body.kind === "arrow_expr_body" ? body.expr.end : (() => { const ss = body.stmts; ... })()`
の形で、ternary の condition が外側の dunion 識別子 `body` を narrow するが、その
narrowing が false-arm の IIFE closure body に伝わらず、closure 内で `body` が元の
full dunion のまま見えていた。ternary per-arm narrowing は [0012](./0012-conditional-ternary.md)、
IIFE の contextual return は [0015](./0015-iife-contextual-return.md) で入っているが、
両者を跨ぐ「narrowing が closure を越える」経路が欠けていた。

## Decision

capture 解析専用の `Scope.lookupAcrossBarrier` を narrowing-aware にする(`lookup` の
narrowing スキャンを barrier floor なし=floor 0 で複製)。closure 構築時に有効な
narrowed 型を capture の型として記録すると、narrowed 型が env struct の field C 型・
その初期化子(`emitCapturedIdentifier` は既に narrowing-aware)・closure body 内の
`inferType`(`captureContext.captures` 経由)に一貫して流れる。capture は構築時点の
値コピーなので、そこで成立していた narrowing は捕捉値に対しても健全。

却下した案:
- **IIFE 専用に narrowing を別経路で渡す**(理由: ternary arm に限らず、`if` ブロック内で
  構築した closure 等でも同じ narrowing が有効。一般化すべきで IIFE 特化は筋が悪い)
- **`emitContextualIIFE` で expected に narrowing を畳む**(理由: 型システムの責務が
  contextual-type 供給経路に染み出し、capture という本来の場所から分離してしまう)

## Implementation

- `src/codegen.ts:639-661` — `lookupAcrossBarrier` に `lookup` と同じ narrowing スキャンを
  追加(barrier floor は無視のまま)。このメソッドは capture 解析(`collectCaptures` の
  3 サイト)からのみ呼ばれるため影響範囲は capture 型の確定に限定される。
- 既存経路で吸収: `collectCaptures` が narrowed 型を `captures` に積む → env field 型 /
  body の `inferType`(`src/codegen.ts:7433`)が narrowed 型を返す。値側は
  `emitCapturedIdentifier`(`src/codegen.ts:3635-3638`)が narrowed dunion→class cast を
  既に行うので追加変更なし。

## Consequences

- **受理**: ternary arm / `if` ブロック内で構築した closure(IIFE 含む)が、構築時点で有効な
  外側識別子の dunion narrowing を捕捉して closure body 内で narrowed variant の field を
  参照できる。`topaz_parser.ts` 全体が emit でき、`cc -O2 -Iruntime -c` がオブジェクト化成功
  (残る 3 警告は全 path が return/throw する関数への `-Wreturn-type` で本変更とは無関係)。
- **reject**: narrowing の無い dunion を closure が capture して field を読む形は従来どおり
  `narrow it first` で拒否(fix が全 capture を素通しにしない担保)。
- **回帰**: positive `iife_closure_narrowing`(ternary false/true arm の IIFE + if 内 IIFE、
  self-host と同じ anon-class dunion、cc-warnfree gate 付き)、fail
  `iife_closure_unnarrowed_fail`。累計 202 ケース。
- **scope 外 / 将来課題**: `let` の再代入で narrowing が無効化された後の closure 構築(現状の
  per-block narrowing 仕様に従う)、closure が後で呼ばれる時点では捕捉値が変わらない前提
  (by-value capture なので成立)。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- 関連: ternary per-arm narrowing [0012](./0012-conditional-ternary.md)、IIFE contextual return
  [0015](./0015-iife-contextual-return.md)
