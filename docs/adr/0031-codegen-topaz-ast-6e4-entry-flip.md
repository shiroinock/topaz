# 0031. codegen エントリ倒し + tsc 依存完全除去 (6e-4・6e 完了)

- Status: Accepted
- Date: 2026-05-31

## Context

6e-3 後、codegen は式・文・型・宣言を全て Topaz AST で消費していたが、tsc 依存が
2 点残っていた: (1) `emit()` から呼ぶ `extractDecls` 内の `convertFromTsc(sf)` シーム、
(2) エラー位置整形が ambient `g_currentSf: ts.SourceFile` / `currentTypeSf` 経由で
tsc の `getLineAndCharacterOfPosition()` に依存する plumbing(`CodegenError` /
`typeErr`)、加えて残存する `ts.SourceFile` / `ts.Node` / `ts.SyntaxKind` の型注釈
(計 174 参照)。6e-4 は codegen 入力を `ts.SourceFile[]` → `SourceModule[]` に倒し、
`convertFromTsc` を cli.ts へ移して codegen から `typescript` import を完全除去する。
これで 6e(seam-shim strangler-fig 戦略)が完了し、codegen が Node/tsc 非依存に到達する。
論点は、tsc を外すとエラー位置整形が `getLineAndCharacterOfPosition` を失うこと。

## Decision

案A(ユーザー design gate 済み): `SourceModule` に行頭オフセット表
`lineStarts: number[]`(**required**)を載せ、codegen に `posToLineCol(module, pos)`
(二分探索、tsc の 0-based line/character と一致)を持たせる。producer は (1)
`convert_from_tsc` が `sf.getLineStarts()` を積む(stage1 の位置は tsc 由来ゆえ
既存の `file:line:col` とバイト一致)、(2) `lexer` が LF 位置を蓄積する
`computeLineStarts` を提供し `topaz_parser` が `SourceModule` に載せる(6i self-host 用)。
`codegen()` を `SourceModule[]` 受けに倒し、`convertFromTsc` を cli.ts へ移動、
codegen から `import * as ts` / `convertFromTsc` を削除。ambient `g_currentSf` /
`currentTypeSf` を `g_currentModule` / `currentTypeModule`(SourceModule 保持)へ改名。

却下案: lineStarts を optional にして 0:0 フォールバック → エラー位置が黙って劣化。
loader を即 Topaz 化(6g)/ cli を Topaz 化(6h)→ 本サブステップの scope 外。

## Implementation

- `src/ast.ts`: `SourceModule` に `lineStarts: Array<number>`(required)追加。
- `src/codegen.ts`: `posToLineCol` 新設(`codegen.ts:557`)、`CodegenError` / `typeErr`
  を lineStarts 化、`unsupported` / `declare` から dead な tsc 分岐を撤去、残存 `ts.*`
  を全て Topaz `{ pos }` / `SourceModule` へ、`extractDecls` の `convertFromTsc(sf)`
  を撤去、`import * as ts` / `convertFromTsc` 削除(`ts.*` 参照 174→0、+146/-157)。
- `src/convert_from_tsc.ts`: `convertModule` 返り値に `lineStarts: [...sf.getLineStarts()]`。
- `src/lexer.ts`: `computeLineStarts(source)` 追加。`src/topaz_parser.ts`: `Parser` に
  `lineStarts` フィールド + ctor 引数、`parseModule` 返り値 + `parseFile` で構築。
- `src/cli.ts`: `codegen(graph.files.map((sf) => convertFromTsc(sf)))` + import 移動。
- `src/parser_check.ts`: `stripSpans` が `lineStarts` を比較から除外。

## Consequences

- codegen.ts が `typescript` を一切 import しない(self-hosting の最大 safety net 達成)。
  `npm run build` 通過。挙動 100% 不変リファクタ(新 example なし)。
- 生成 C は全 examples(`--emit-c-only`、79 件)でバイト一致、コンパイル時 reject 例の
  `file:line:col`(168 件)もバイト一致(HEAD worktree との直接 diff で確認)。
  `npm test` 全 pass(261 ケース、先頭 parser_check 含む)。
- 残: 6f(runtime/stdlib 拡張)/ 6g(loader Topaz 化)/ 6h(cli Topaz 化)/ 6i(stage2
  bootstrap)/ 6j(bit-for-bit fixed point)。scope 外: loader / cli 本体の Topaz 化。
- 関連: [6e-3](./0030-codegen-topaz-ast-6e3-decl-emitter.md)。
