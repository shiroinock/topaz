# 0028 — `import.meta.url` を Topaz parser / convert / AST に追加(6e seam-shim parity prep)

- **Status**: Accepted
- **Date**: 2026-05-30
- **Phase**: 1.5-6e prep(parity)

## Context

6e の seam-shim(strangler-fig)は「`convert_from_tsc` が codegen の tsc 直結パスが
受理する全構文を透過的に扱える」を前提とする。だが `import.meta.url` は **codegen 専用機能**
だった([0025](./0025-node-url-import-meta.md)、`emitExpression` の `ts.isMetaProperty`
分岐 `src/codegen.ts:5663` → `topaz_runtime_module_url()`)で、`convert_from_tsc` も
`topaz_parser` も import.meta を一切扱えず reject していた。`parser_check` は
`node_url_basic` を「両方 reject だから OK(`both rejected`)」で通しているだけで、真の parity は
無かった。6e-2 の seam-shim で `emitExpression` を `convertStmt` 経由に切り替えると、正例
`examples/node_url_basic.ts:10` の `const u = import.meta.url;` で convert が例外を投げ正例が
壊れる(emitExpression は SCC の一部ゆえ tsc 直結を残せない)。よって 6e-2 の前に parser/convert/AST
層を `import.meta.url` 対応させる(self-host でも `cli.ts:85` `dirname(fileURLToPath(import.meta.url))`
で必須)。

## Decision

汎用 MetaProperty ノードではなく専用 `import_meta_url` leaf を 3 層に追加し、`.url` の 1 形のみ
受理、**codegen は不変**(6e-2 まで tsc 直結のまま)。却下した案: A=汎用 MetaProperty ノード(理由:
codegen は `import.meta.url` 1 形しか受理せず — bare `import.meta` / 他 property / `new.target` は
全 reject — 汎用ノードは過剰で `ThisExpr` 同様 leaf が最小忠実)。B=この prep で codegen も
import_meta_url 消費へ移行(理由: 6e-2 の seam-shim 適用と分離したい、本 prep は parser parity に閉じる)。

## Implementation

- `src/ast.ts:158` `ImportMetaUrlExpr = { kind: "import_meta_url"; pos; end }` を追加、`Expr` union
  (`src/ast.ts:132`)に `| ImportMetaUrlExpr`。`ThisExpr` に倣う leaf。
- `src/topaz_parser.ts:1345` `parsePrimary` の keyword 分岐に `import` → `parseImportMetaUrl`
  (`src/topaz_parser.ts:1372`)。`. meta . url` を読み、codegen `checkImportMetaUrl` /
  `rejectBareMetaProperty` と同一条件で reject(`import.<X≠meta>` / bare `import.meta` / `import.meta.<X≠url>`)。
  statement 位置の import 宣言(`parseModuleItem` `src/topaz_parser.ts:193`)は現状維持、式位置のみ追加。
- `src/convert_from_tsc.ts:870` `convertExpr` dispatch に `ts.isPropertyAccessExpression(e) &&
  ts.isMetaProperty(e.expression)` → `convertImportMetaUrl`、bare `ts.isMetaProperty(e)` →
  `rejectBareMetaProperty`(`new.target` 含む)を `convertPropAccess` の前に追加。受理/reject 条件は
  codegen `src/codegen.ts:7374-7404` をそのまま移植。

## Consequences

- **受理**: `import.meta.url`(式位置)を topaz_parser / convert が `{ kind: "import_meta_url" }` に
  lower。`parser_check` の `node_url_basic` が `both rejected` → `OK`(both-accept・JSON 一致)に変化。
- **reject**: `import.<X≠meta>` / bare `import.meta` / `import.meta.<X≠url>` / `new.target` を両 parser で
  reject(codegen と同一メッセージ)。
- **回帰**: 新規 example 不要(`node_url_basic` が既に import.meta.url 正例)。ゲートは「parser_check が
  `node_url_basic` で both-accept に変わる」+ 既存 smoke 全 pass(累計 261 ケース不変)。`node_url_basic`
  は従来どおり codegen 経由で green、emit C に `topaz_runtime_module_url()` 残存(codegen 不変)。
- **scope 外 / 将来課題**: 6e-2 で codegen emit が `import_meta_url` ノードを消費(→ `topaz_runtime_module_url()`)
  し seam-shim が透過化。負例メッセージ整合(object_destructuring 系 / object_literal_method_shorthand)は
  6e-2 再 spawn 側(shim 経由で run_fail_case が実検証)に畳む。

## Notes

- 関連: [0025](./0025-node-url-import-meta.md)(import.meta.url の codegen 実装)、
  [0027](./0027-codegen-topaz-ast-6e1-types.md)(6e seam-shim 第1適用)。
