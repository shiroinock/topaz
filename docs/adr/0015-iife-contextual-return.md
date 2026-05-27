# 0015 — IIFE の contextual return type 推論

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep

## Context

prep [0014](./0014-try-body-return.md)(try body 内 return)着地後、`src/topaz_parser.ts` の次 blocker は `1593:79`:

```
arrow function requires an explicit return type annotation (no contextual type available)
```

`parseArrow` の末尾、ArrowBody から end position を取り出す IIFE `body.kind === "arrow_expr_body" ? body.expr.end : (() => { ... })()`。即時呼び出しの arrow に戻り型注釈が無く、`inferArrowType` / `emitArrowFunction` は block body の `return` を walk しないため(注釈か expected fn type が無いと reject)止まる。parser には同型の IIFE が複数あり self-hosting に必須。

## Decision

block body を歩いて戻り型を推論するのではなく、**IIFE の結果が要求される位置の expected 型を arrow の戻り型として供給する** contextual 経路を入れる。`emitWithExpected` で「callee が(括弧を剥がすと)戻り型注釈の無い arrow である call 式」を検出したら、`{ params: 実引数の inferType, returnType: expected }` の expected fn type を組み、`inferArrowType` / `emitArrowFunction` に渡して emitFnValueCall と同じ fat-pointer dispatch に流す。block body の `return` は `currentReturnType = expected` の下で `emitWithExpected` され、coercion(scalar / class→iface 等)も通常の return と同経路になる。`return` 注釈付き arrow は単独で型が付くので intercept せず通常 call 経路に落とす(その推論戻り型が `expected` と食い違う可能性があるため上書きしない)。

却下した案: A=block body の `return` 文を walk して戻り型を unify(理由: return 式がブロック内ローカル(self-host の `const ss = body.stmts; ... return ss[...].end`)を参照するため、宣言を追う本格的な型付けパスが必要で scope 過大。expected があれば不要)。B=`inferType(CallExpression)` 側で IIFE を特別扱い(理由: inferType は expected を持たないので contextual 化できず、結局 body-walk に戻る)。

## Implementation

- `src/codegen.ts:8401-8417` — `emitWithExpected` の `inferType` fallthrough 直前に IIFE 検出分岐(`isCallExpression` + 括弧剥がし + `isArrowFunction(callee) && !callee.type`)。
- `src/codegen.ts:6509-6548` — `emitContextualIIFE`: spread 拒否 → 実引数型から expected fn type 構築 → `inferArrowType`(arity 検査込み)→ `emitArrowFunction(arrow, expectedFn)` → `emitFnValueCall` と同形の `({ <fnType> __t = <arrow>; __t.fn(__t.env, args); })` を返す。annotated param は arrow 側が優先(`inferArrowType` / `emitArrowFunction` 既存挙動)、実引数は `fnType.params[i]` へ `emitWithExpected` で coerce。

## Consequences

- **受理**: 戻り型注釈の無い IIFE を expected 型のある位置(変数初期化 / `return` / 関数引数 / ternary arm)で。block body / 式 body 両方、引数あり IIFE は実引数型が param に流れる。`topaz_parser.ts:1593` の blocker 消失。
- **reject**: expected 型の無い位置(`console.log((() => {...})())` 等、`inferType` のみで `emitWithExpected` を経由しない)の注釈無し IIFE は依然 reject — contextual 推論であって body-walk 推論ではない、という scope 境界。
- **回帰**: positive `iife_contextual_return`(4 emit site + 引数あり IIFE、cc-warnfree gate 付き)、fail `iife_no_context_fail`。累計 199 ケース。
- **scope 外 / 将来課題**: closure 越えの dunion narrowing。次 blocker `topaz_parser.ts:1594:31`「cannot access '.stmts' on discriminated union」— 外側 ternary の `body.kind === "arrow_expr_body"` narrowing が IIFE closure 内に伝播しない(別サブステップ)。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- 関連: arrow / closure の基盤は 1.5-3.5e(`docs/archive/implementation-log.md`)、ternary contextual target は [0012](./0012-conditional-ternary.md)
