# 0012 — conditional (ternary) expression `cond ? a : b`

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #25

## Context

self-hosting (1.5-6) の前段で `src/topaz_parser.ts` を Node 製 codegen に食わせると、`topaz_parser.ts:634:28` の `ConditionalExpression`(`init !== undefined ? init.end : (ty !== undefined ? ty.end : name.end)`)で `unsupported expression` で停止していた。三項演算子は parser / loader / cli 全体に散在するので self-hosting の必須機能。先行する条件式系の divergence(`if` / `while` / `for` の厳格 boolean、[`0011`](./0011-for-infinite-loop.md))と narrowing 機構([`0006`](./0006-compound-condition-narrowing.md) の `&&` / `||` 右オペランド narrowing)に揃える。

## Decision

`cond ? a : b` を C 三項にそのまま lower する。condition は厳格 boolean(`if` / `while` と同じ divergence)。各 branch は condition が含意する narrowing 下で emit する — true arm は positive、false arm は negative の `extractNarrowing` を `if` / `&&` と同じ push / narrow / pop で install。両 arm は共通 target 型へ `emitWithExpected` で寄せ、C 三項の両オペランドの型を一致させる。target は contextual expected があればそれ、無ければ両 branch の共通型(`conditionalResultType`)。共通型は「typeEq / 一方が他方へ assignable(class→iface / class→dunion / dunion widening)/ 片方が bare `undefined` なら `T | undefined` へ lift」で求め、互いに無関係な 2 型は reject(合成 multi-member union は未対応型なので作らない)。

却下した案: A=branch を個別に emit して C 側の暗黙変換に任せる(理由: class→iface の fat pointer 構築や scalar opt wrap は C の三項では暗黙化されず型不一致になる)。B=ternary を `if` 文へ desugar して一時変数経由(理由: 式位置で使えず、`f(a ? b : c)` のような部分式に展開できない、stmt-expr 化しても narrowing carry が複雑化)。

## Implementation

- `emitExpression` の dispatch に `ConditionalExpression` 分岐(`src/codegen.ts:5867`)→ contextless 経路として `emitConditional(expr, undefined)`
- `emitWithExpected` に early 分岐(`src/codegen.ts:8152`、fallback の inferType より前)→ contextual 経路 `emitConditional(expr, expected)`
- `inferType` に分岐(`src/codegen.ts:7337`)→ `conditionalResultType` を返す
- 新規 `underNarrowing<T>(n, fn)`(`src/codegen.ts:5878`)— narrowing 下で fn を走らせる push/narrow/pop ラッパ(`n` が無ければ no-op)。`emitConditional` / `conditionalResultType` の両 branch から共用
- 新規 `emitConditional`(`src/codegen.ts:5900`)/ `conditionalResultType`(`src/codegen.ts:5920`)

## Consequences

- **受理**: 数値 / string / class / `T | undefined` branch、true/false arm での `!== undefined` narrowing と narrowed field access、chained ternary(`a ? b : c ? d : e`)、blocker と同型のネスト `p ? p.f : (q ? q.f : c)`、bare-undefined branch による `T | undefined` 結果、4 emit-site(変数初期化 / 引数 / return / 代入 RHS)
- **reject**: 非 boolean 条件(truthy)、contextual target 無しで互いに代入不能な branch
- **回帰**: positive `examples/ternary.ts`(`run_case ternary` + `run_cc_warnfree_case`)、fail `examples/ternary_nonbool_cond_fail.ts` / `examples/ternary_incompatible_branches_fail.ts`(`run_fail_case`)。累計 190 ケース(`run_case` 64 / `run_fail_case` 116 / `run_module_case` 1 / `run_cc_warnfree_case` 9)
- **scope 外 / 将来課題**: contextual expected をまたぐ `ParenthesizedExpression` への expected 型の透過(現状 paren 内 ternary は contextless 経路で共通型を解いてから外側 `applyCoercion` で寄せる — blocker 含む実例は通る)。互いに無関係な class branch を dunion へ寄せるには target 注釈が必要

## Notes

- 旧 blocker `topaz_parser.ts:634:28`(ternary)は解消。次 blocker は `topaz_parser.ts:709:21` の `dunion | undefined` を expected とする object literal(別サブステップ)
- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
