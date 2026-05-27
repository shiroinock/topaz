# 0014 — `try` body 内の `return`

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-X(部分着手)

## Context

prep #16 ([0013](./0013-dunion-optional-object-literal.md)) 着地後、`src/topaz_parser.ts` の次 blocker は `1272:47`:

```
`return` inside a `try` body is unsupported (would skip topaz_try_pop)
```

`tryParseTypeArgsBeforeCall` の backtracking パターン(`try { ...; if (cond) return args; this.pos = save; return undefined; } catch (e) { ... return undefined; }`)。parser には他にも同型が多く、self-hosting には必須。例外は setjmp/longjmp + linked-list frame stack([0001](./0001-recursive-type-alias.md) より前の 1.5-1)で、`topaz_try_pop()` は try body の末尾(`if (setjmp...==0) { ...; topaz_try_pop(); }`)に置かれている。C の `return` はこの pop を飛び越えるため、`topaz_try_top` が死んだ jmp_buf を指したまま残り、後続の throw が dead frame に longjmp する。これが MEMO の 1.5-X(`finally` / try body 内 return/break/continue 解禁)で、self-hosting で実際に踏んだので return のみ先行着手する。

## Decision

emit 中に「現在の関数内で live な try frame 数」を数える `liveTryFrames` カウンタを持つ。try *body* の emit 中だけ +1(catch body は topaz_throw / 正常 pop で既に frame が剥がれているので増やさない)、関数境界 4 箇所(method / function / monomorph / arrow)で 0 に reset(nested fn/arrow の return は外側 try を跨がない)。`return` を emit する際 `liveTryFrames > 0` なら、値式を frame が live な状態で temp へ評価 → `liveTryFrames` 個の `topaz_try_pop()` → `return temp` を 1 つの C ブロックに展開する。評価を pop より先に置くのは式中の throw を正しく現ハンドラに捕捉させるため(pop 後だと外側ハンドラに誤って飛ぶ)。nested try は body emit が入れ子で増減するので、跨ぐ frame 数が自然に正しくなる。

却下した案: A=cleanup を `finally` 相当の dispatch tree に汎用化(理由: 今回必要なのは return のみ、`finally` / break / continue は据え置きで scope 最小)。B=pop を省き return 後に外側で stack を巻き戻す(理由: longjmp 経路と正常経路で巻き戻し点が分かれ複雑、frame は C local なので pop し損ねた時点で UB)。C=式を pop 後に評価(理由: 式中 throw の捕捉先が壊れる)。

## Implementation

- `src/codegen.ts:788` — `liveTryFrames` フィールド。
- `src/codegen.ts:4176-4201` — `return` ハンドラ: void/非 void とも `liveTryFrames > 0` で `{ <T> __topaz_ret_N = <expr>; topaz_try_pop()...; return __topaz_ret_N; }` 形に展開。
- `src/codegen.ts:4314` — `popFrames()`(`topaz_try_pop(); ` × liveTryFrames)。
- `src/codegen.ts:4363` — try body emit を `liveTryFrames++ … --` で挟む(`finally` で復元)。
- `src/codegen.ts:4405` — `checkTryBodyNoEscape` から return 拒否を撤去(break/continue 拒否は維持)。
- 4 関数境界(`emitMethodDefinition` / `emitFunctionDefinition` / `emitMonomorphDefinition` / arrow)で `liveTryFrames` を save/0-reset/restore。

## Consequences

- **受理**: try body 内の `return`(void / 値あり)、nested try を跨ぐ return(複数 pop)、catch body 内 return(frame 既剥がしのため pop 0)。`topaz_parser.ts:1272` の blocker 消失。
- **reject**: try body から脱出する `break` / `continue` は依然 unsupported(`checkTryBodyNoEscape` 維持。loop が try 内に閉じる安全形も保守的に一律拒否)。
- **回帰**: positive `try_return`(frame balance を壊すと後続 throw が dead frame に飛ぶ形を含む 7 行)、fail `try_break_fail`。累計 196 ケース。
- **scope 外 / 将来課題**: `finally` 句 / try body 内 break / continue(1.5-X 残り)。catch body が binding を参照しない時に `topaz_class_X *e` が `-Wunused-variable` を出すのは [0001](./0001-recursive-type-alias.md) 以前からの既存 codegen 挙動で本 ADR の対象外。`src/topaz_parser.ts` の次 blocker は `1593:79`「arrow function requires an explicit return type annotation」(arrow の contextual return type 推論)。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- 関連: 例外の基盤は 1.5-1(`docs/archive/implementation-log.md`)
