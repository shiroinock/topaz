# 0030 — codegen 宣言ドメイン + Emitter 状態を Topaz AST 消費へ(seam-shim 第3適用)

- **Status**: Accepted
- **Date**: 2026-05-31
- **Phase**: 1.5-6e-3

## Context

`codegen.ts` を tsc AST → 自前 Topaz AST(`src/ast.ts`)消費へ切替える 1.5-6e は
**Seam 変換 shim strangler-fig** で 4 分割(各コミットで `npm run build && npm test` green を維持)。
進捗: 6e-1 型注釈クラスタ([0027](./0027-codegen-topaz-ast-6e1-types.md))、6e-prep `import.meta.url`
parity([0028](./0028-import-meta-url-parser-parity.md))、6e-2 式+文+推論 SCC
([0029](./0029-codegen-topaz-ast-6e2-expr-stmt.md))が完了。残るは **宣言ドメイン + Emitter 状態**
(本サブステップ)と 6e-4 エントリ倒し。scout で convert_from_tsc が `Decl` 全 5 kind を網羅変換し
(heritage→`implementsList`、modifier→string、typeParam constraint/default は既に reject、field
initializer→`Expr`)、AST 拡張も C 表現の選択も不要と確認した。

## Decision

**A案**:`emit()` の冒頭で各 `ts.SourceFile` を `convertFromTsc(sf)` で `SourceModule` に変換し、
`extractDecls()` が module items を per-kind(function/class/interface/alias)+ root top-level に
flatten(各エントリに宣言モジュールの `sf` を同梱、診断位置の oracle 用)。宣言収集関数
(`collectInterfaceMembers`/`collectClassMembers`/`collectField`/`collectConstructor`/
`collectMethod`/`collectParams`)・module-const ホイスト 3 関数・`unifyTypeParam`・generic/monomorph
経路を Topaz `Decl`/`Stmt`/`Expr`/`TypeNode` 消費へポート。Emitter 状態の `decl` フィールドを Topaz
ノードへ差し替え(`MethodInfo`/`ClassInfo.ctor`→`ClassMethodMember`、`fieldInits`→`Map<string,Expr>`、
generic/mono→`FunctionDecl`/`ClassDecl`、`InterfaceMethodSig.decl`/`InterfaceInfo.decl`/
`typeAliases.decl` は未読ゆえ削除)。error anchor は Topaz `pos`/`end` 由来。6e-2 の内側 convert shim
(`emitStatementBoundary`/`emitBlockBoundary`/ctor body/field init/`typeAnno`)を撤去。
**却下=B案**(decl ごとの per-decl convert shim): shim が分散し 6e-4 撤去コストが増える。A案は
`convertFromTsc` 一発 shim が emit 冒頭 1 点に集約され 6e-4 の自然な布石。

## Implementation

- `src/codegen.ts:1530` `extractDecls()` 新設(`convertFromTsc(sf)` + kind 分岐 + 非 root reject)。
- prepass(Pass 1a/1b/1c/2a/2b + function 登録)を `{decl, sf}` 消費へ。constraint/default 等の
  syntactic reject は convert 側へ移譲、duplicate-typeparam 等の semantic check のみ codegen 維持。
- Emitter 状態型(`src/codegen.ts:740-822, 929`)に `sf` を追加・`decl` を Topaz 化。
- 収集関数群(`src/codegen.ts:2493-2787`)・emission(`emitConstructorDefinition`/`emitMethodDefinition`/
  `formatSignature`/`emitFunctionDefinition`/`emitMonomorphDefinition`)・`resolveGenericCall`/
  `instantiateGenericClass`/`unifyTypeParam`・hoist 3 関数を Topaz 消費へ。
- class member modifier 診断は convert の lowercase 文字列を `StaticKeyword` 等へ再構成し旧メッセージと一致。
- import を `convertFromTsc` のみへ、`validateExportableModifiers` 削除。

## Consequences

- **受理**: 全 examples で生成 C が移行前と **byte-identical**(81 ファイル diff 0)。
- **reject**: 全 fail サンプルのメッセージ部分文字列が不変(位置は Topaz pos 由来、`run_fail_case` は
  substring 判定)。decl 由来 reject の一部は convert(`convertFromTsc:` prefix)が先に発火するが
  substring は一致。
- **回帰**: 新規 example なし(挙動不変リファクタ)。`tests/smoke.sh` 全 pass(`parser_check` + 全
  `run_case`/`run_fail_case`/`run_cc_warnfree_case`)が証跡=ゲート。累計ケース数は据え置き。
- codegen の tsc AST(decl/stmt/expr/型ノード)消費は **0 件**、残る tsc seam は `extractDecls` 内の
  `convertFromTsc(sf)` 呼出と `ts.SourceFile`(位置 oracle / `CodegenError` anchor)のみ。
- **scope 外 / 将来課題**: 6e-4 でエントリ倒し(`codegen()` 側へ `convertFromTsc` 移動)+ standalone
  shim export 撤去。parameter property shorthand / top-level `declare`/`abstract` class は convert が
  寛容に通すため codegen 側 reject が消えた(未テスト・self-host 未使用、必要なら別途 convert に最小追加)。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)。
- ADR は 1 ファイル = 1 決定。
