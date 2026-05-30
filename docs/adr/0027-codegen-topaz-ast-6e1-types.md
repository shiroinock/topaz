# 0027 — codegen 型注釈クラスタを Topaz AST 消費へ(seam-shim 第1適用)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6e-1

## Context

`codegen.ts`(9290 行・`ts.*` 658 参照)を tsc AST 消費から自前 Topaz AST(`src/ast.ts` の `SourceModule`)消費へ切り替える 1.5-6e を、**Seam 変換 shim strangler-fig** で 5 サブステップに分割する。戦略は、既に `parser_check` で oracle として検証済みの `src/convert_from_tsc.ts` の `convert*` を「Topaz 化済み領域 ↔ tsc 領域」の境界に shim として差し込み、**各コミットで `npm run build && npm test` を green に保つ**こと。順序は依存方向に従い leaf-ward(型 → 式 → 文 → 宣言+Emitter 状態 → エントリ倒し)。

「型が最 leaf」の根拠: 式クラスタ(`resolveGenericCall` / `instantiateGenericClass` / `inferArrowType` 等)は型引数・arrow param 型 = Topaz `TypeNode` の子を持つため、型を先に Topaz 化しないと前方 shim が作れない。逆依存(型注釈 → 値式)はこのサブセットの型注釈には無い。本サブステップ = 6e-1 = 「型」、挙動 100% 不変のリファクタ。

## Decision

`typeFromAnnotation` を中心とする型注釈クラスタを `ts.TypeNode` → Topaz `TypeNode` 消費へ移行する。境界は seam method `typeAnno(tscType, anchor)`(tsc 型を `convertType` で変換して Topaz-consuming core に渡す)に集約し、tsc-land に残る型呼出元(`collectField` / `collectMethod` / `collectParams` / var decl / arrow param / alias intake / Map・Set・generic の expr-land 型引数)はこの seam 経由にした。`typeAliases` には `decl`(tsc)を残しつつ `body: TypeNode`(intake 時に `convertType` 生成)と `sf` を足し、型機械は `body` を読む。`preAllocatedAnons` のキーは Topaz `TypeLiteralNode`(object-identity 維持)。

エラー位置は、Topaz ノードが SourceFile を持たないため `typeErr(anchor, msg)` で解決する: anchor が tsc ノードなら従来通り `getSourceFile`、Topaz `{ pos }` なら ambient `currentTypeSf`(`typeFromAnnotation` 入口で save/restore)+ `pos` から `file:line:col` を組む。Topaz `pos` は `convertType` が記録した `getStart(sf)` と一致するので位置は完全一致。

却下した案: A=型機械に sf を全 helper まで引数で透過(`assertNotVoid` 等の tsc-land 共用呼出元まで波及し churn 大、却下)。B=`convertType` に generic fn type 等の reject を追加して旧 reject 経路を完全再現(convert_from_tsc は oracle で `parser_check` 対象ゆえ新規 reject はパーサ非対称を生む、却下。未対応形は型機械側 fallthrough に委ねる)。

## Implementation

- `src/convert_from_tsc.ts`: `export function convertType(node, sf)`(`Converter` 薄ラッパ)を追加。`TypeFnParam` 構築に `...this.span(p)` を付与。
- `src/ast.ts`: `TypeFnParam` に `pos` / `end` を追加(fn-type / method-sig param エラーの anchor 用。`parser_check` は `stripSpans` で span 除去後に比較するため非破壊)。`src/topaz_parser.ts:1717,1753` で span を充填。
- `src/codegen.ts`:
  - `typeErr` / `typeAnno` / `instantiateGenericClassTs` seam + `currentTypeSf` / `preAllocatedAnonSf` を追加(`src/codegen.ts:3010-3060` 付近)。
  - `typeFromAnnotation` / `collectAliasRefs` / `markRecursiveAliases` / `preAllocateRecursiveAnons` / `fillPreAllocatedAnonFields` を Topaz `TypeNode` walk へ。`number`/`string`/`boolean`/`undefined` は `type_ref` に lower されるので branch 冒頭で keyword 優先解決。
  - `CodegenError` が pre-formatted string を受理。`ClassInfo.decl` / `recordAnonClass` / `tryMakeDiscriminatedUnion` / `instantiateGenericClass` の anchor を `ts.Node | { pos }` / Topaz `TypeLiteralNode` へ拡張。`Scope.declare` の anchor も同拡張(anon ctor の Topaz anchor 用)。
  - 外部型呼出元 ~30 箇所を `typeAnno` / `instantiateGenericClassTs` 経由へ rename。

## Consequences

- **受理**: 既存の全 examples が**同一 C をバイト単位で生成**(positive 81 ファイル diff = 0)。
- **reject**: 未対応 union / scalar|undefined / 未知 type_ref / object literal type の method-sig・重複 prop・empty・circular alias 等、全 reject 経路が**同一メッセージ・同一位置**(全 fail 例の stderr diff = 0)。
- **回帰**: 挙動不変リファクタにつき**新規 example は追加しない**。`tests/smoke.sh` の全 `run_case` / `run_fail_case` / `run_cc_warnfree_case` + 先頭 `parser_check` の全 pass が gate(累計 261 ケース)。
- **scope 外 / 将来課題**: 式 / 文 / 宣言 / クラス・IF メンバ収集の本体は tsc 据え置き(6e-2..6e-4)。`preAllocatedAnons` の pos ベース再設計はしない。境界(`typeAnno` / `instantiateGenericClassTs` / `typeAliases.decl`)は上位 Topaz 化のたびに内側へ移動し、6e-5 でエントリを `convertFromTsc(sf)` 一発に倒して shim 全撤去・codegen から tsc 依存除去。`src/topaz_parser.c`(自己ホスト C 版)の `TypeFnParam` span は stage1 テスト非対象につき未追従。

## Notes

- 凍結された旧決定ログは `docs/archive/implementation-log.md`(Phase 1.5-6 prep #15 まで)
- 先行 ADR: [0026](./0026-process-console-builtins.md)(直前の self-host blocker 解消)
