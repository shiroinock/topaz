# 0029 — codegen 式+文+型推論 SCC を Topaz AST 消費へ(seam-shim 第2適用・大型)

- **Status**: Accepted
- **Date**: 2026-05-31
- **Phase**: 1.5-6e-2

## Context

`codegen.ts` を tsc AST 消費から自前 Topaz AST(`src/ast.ts` の `SourceModule`)消費へ切替える 1.5-6e を **Seam 変換 shim strangler-fig** で 4 分割する戦略の第 2 段。検証済み(`parser_check` oracle)の `src/convert_from_tsc.ts` の `convert*` を「Topaz 化済み ↔ tsc」境界に shim として差し込み、各コミットで `npm run build && npm test` を green に保つ。先行は 6e-1(型注釈クラスタ、commit `a03382b`、[ADR 0027](./0027-codegen-topaz-ast-6e1-types.md))と 6e-prep parity(`import.meta.url` leaf、commit `5dd4292`、[ADR 0028](./0028-import-meta-url-parser-parity.md))。

`{inferType, emitExpression, emitStatement, emitBlock, emitArrowFunction, emitWithExpected, …}` は**一つの SCC**(emit↔infer 相互再帰 + `emitArrowFunction→emitBlock` の式→文 back-edge + `emitStatement→emitExpression` の文→式)。seam-shim は `convert*` の tsc→Topaz **一方向**しか掛けられない(逆向き Topaz→tsc 変換は存在しない)ため、SCC 内に tsc 関数と Topaz 関数を混在させると必ず Topaz→tsc 呼出が生じ build が割れる。よって SCC は**原子的に一括移行**する(正当性制約・分割不能)。本サブステップは初回 spawn が `import.meta.url` のパリティギャップで停止した後の再 spawn(ギャップは 6e-prep で解消済み)。挙動 100% 不変リファクタ。

## Decision

SCC(式系 dispatcher / 推論 / emit ヘルパ全部 + 文系 dispatcher / ブロック / for / for-of / switch / try / var-decl)を Topaz `Expr`/`Stmt` 消費へ一括移行。境界は宣言ドメインの呼出元(関数 / メソッド / ctor 本体・field initializer・root top-level)に `convertExpr`/`convertStmt`/`convertBlock` shim を差し込み、6e-3 で宣言が Topaz 化するたび内側へ後退、6e-4 で消える。

主要設計: (1) Topaz ノードの `file:line:col` を、module-level ambient `g_currentSf` + `CodegenError`/`unsupported` 拡張で解決(`pos` == tsc `getStart` ゆえ位置不変)。境界 shim 全点で save/restore。(2) `emitVarDecls` を廃し `var_decl`/`var_destr_decl` 2 kind を `emitStatement` から直接 dispatch(構文 reject は convert へ、意味検査は codegen 維持)。(3) `import_meta_url` emit/infer arm を追加し旧 tsc MetaProperty 分岐除去。(4) `.parent`/`ts.forEachChild` 依存の 3 walker を Topaz tree-walk へ再実装(`checkContinueAllowed` は `loopCtx` スタック、`checkTryBodyNoEscape`/`collectCaptures` は手書き Expr/Stmt visitor — 参照位置判定はメンバ名 / key が string で Expr でないため構造的に成立)。(5) 6e-1 内側の `convertType` shim を撤去し Topaz `TypeNode` 子を `typeFromAnnotation` に直接。(6) 負例文言を convert 側で codegen に整合。

却下案: A=SCC を段階移行(混在で build 不成立、正当性制約により不可)。B=examples 負例側を convert 文言に書き換え(期待部分文字列は固定契約、convert を寄せる方が正)。

## Implementation

- `src/convert_from_tsc.ts:138,142,146`: `convertExpr`/`convertStmt`/`convertBlock` standalone export(`Converter` 薄ラッパ)。負例整合: object destructuring の annotation/rename/nested/method-shorthand 文言を codegen の期待部分文字列へ寄せる。
- `src/codegen.ts`:
  - `g_currentSf`(`:39`)+ `CodegenError`(`:575`)が Topaz `{pos}` を ambient sf で解決。境界 shim は ctor(`:2881`)/ body helper(`:3081`)等で save/restore。
  - dispatcher 移行: `emitStatement`(`:4414`)/ `emitExpression`(`:5665`)/ `inferType`(`:8029`)/ `emitWithExpected`(`:8953`)が Topaz 型を消費。
  - `stringLitText`(`:423`)で str_lit と空 subs の template_lit を統一、`emitStringLiteralText`(`:6391`)を str_lit / template head / cookedAfter 共用へ。operator は op 文字列 switch へ。
  - 3 walker: `collectCaptures`(`:3812`)/ `checkTryBodyNoEscape`(`:4666`)を Topaz visitor へ、`checkContinueAllowed` を `loopCtx` スタックへ。`ts.forEachChild` 参照 0。
  - `resolveGenericCall`(`:3994`)は hybrid(Topaz call expr + tsc `generic.decl` param)、`unifyTypeParam` は tsc TypeNode 据え置き(6e-3)。

## Consequences

- **受理**: 全 examples が挙動等価(全 `run_case`/`run_cc_warnfree_case` green)。`node_url_basic` が `import_meta_url` の Topaz 経由 emit で green。
- **reject**: 型不一致 / const 再代入 / narrowing 無し参照 / 多態検出 等が同一メッセージ・同一位置(全 `run_fail_case` green、object_destructuring の annotation/rename/nested/method/empty/unknown_field/non_class/rest/default の 9 fail 含む)。
- **回帰**: 挙動不変リファクタにつき新規 example 無し。`tests/smoke.sh` の `parser_check` + 全 case(累計 261 ケース)が gate。SCC region の `ts.` 参照 638→70(残は decl-land 据え置き / anchor union 型 / sf plumbing / 境界 shim)。
- **scope 外 / 将来**: 6e-3(宣言 + Emitter 状態 + module-const ホイスト + `unifyTypeParam` の tsc 依存)、6e-4(エントリ `convertFromTsc(sf)` 一発化 + shim 全撤去 + codegen から tsc 依存除去)。境界は宣言 land のみに後退。
