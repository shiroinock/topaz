# パーサ選定メモ(Phase 0)

Phase 0 で TS 構文をパースするためのフロントエンド選定。我々は型推論を自前で書く方針なので、**チェッカーは不要・AST だけ欲しい** という前提。

## 候補

| 項目 | typescript (tsc API) | @swc/core | oxc-parser | @babel/parser |
|---|---|---|---|---|
| 言語 | TS | Rust + napi | Rust + napi | JS |
| TS 構文サポート | 100%(参照実装) | 全 stable 構文 | 全 stable 構文 | プラグイン経由で全構文 |
| AST 形 | ts 独自(kind enum + factories) | SWC 独自(ESTree 系 + TS 拡張) | ESTree 準拠 + TS 拡張 | Babel 拡張 ESTree |
| 型情報 | 型チェッカー同梱(使わない) | 型情報なし(注釈は AST 上に残る) | 同左 | 同左 |
| パース速度 | 並 | 非常に速い | SWC と同等以上を主張 | 一番遅い(JS) |
| ライセンス | Apache-2.0 | Apache-2.0 | MIT | MIT |
| 成熟度 | 標準 | 本番採用多数(Next/Deno/Parcel) | 比較的新しい、活発 | 極めて成熟 |
| 自前 codegen から触る容易さ | `ts.isXxx` 型ガードが豊富で書きやすい | ESTree 系で扱いやすい | 同左 | 同左 |

## 我々の評価軸

1. **TS 構文の取りこぼしがないこと** — `MEMO §4.1` のサポート機能(クラス/ジェネリクス/discriminated union/モジュール…)が一発で AST に乗ること。
2. **AST から TS の型注釈に簡単に到達できること** — `MEMO §3.2` の全プログラム推論で「注釈はヒント」として読みつつ独自に検証する。
3. **Phase 0 の統合コスト最小** — `fib(34)` を C に落とすのに余計な配管を増やさない。
4. **将来の self-hosting 互換性** — Phase 1〜2 で自分でコンパイルできる必要がある。Rust native bindings は self-hosted バイナリの中で動かす段で問題になる(別言語依存)。

## 判断: Phase 0 は `typescript`(tsc API)を採用

理由:

- 構文サポートが参照実装そのもの。エッジケースで止まらない。
- AST の網羅性チェックが `ts.SyntaxKind` で機械的に書け、未対応構文を「コンパイルエラー」として出す `MEMO §3.1` の方針と噛み合う(漏れた `kind` を集約して報告するだけで「未対応」が宣言できる)。
- 型注釈(`TypeNode`)が AST に明示的に乗っていて取り出しやすい。
- 依存は npm パッケージ 1 つだけ。Phase 0 の配管を最小化できる。
- チェッカーは linker から落とせないが、Phase 0 のバイナリサイズは気にしない。

## SWC / oxc に乗り換える条件(Phase 1 以降)

以下のいずれかが顕在化したら検討:

- パーサが体感ボトルネックになる(現実的には数万行までは tsc API で問題ない見込み)
- self-hosting 時に `typescript` パッケージを成果物に含めたくない事情が出てくる
- AST の表現が我々の IR に合わず変換コストが累積する

その時点で **oxc** を第一候補にする。理由:

- ESTree 準拠で抽象化層を挟みやすい
- MIT で取り回しがよい
- 開発が活発で TS 対応の進度も追随している

SWC は十分な選択肢だが、API がやや低レイヤで欠落構文への遭遇時に oxc より調査コストが高い印象。

## Babel を選ばない理由

純 JS で遅い、Rust 系に対する明確な優位がない、TS 構文プラグインの保守状況が読みにくい。

## 自前パーサを書かない理由

`MEMO §5` の規模見込み通り、parser は ~500 行のラッパーに留める方針。Spinel も libprism を借用しており、自前で書くのは ROI が悪い。

## 直近の作業

- Phase 0 のコード(src/parser.ts)は `import * as ts from "typescript"` で組む。
- AST から `FunctionDeclaration` / `IfStatement` / `ReturnStatement` / `BinaryExpression` / `CallExpression` / `NumericLiteral` / `Identifier` / `ExpressionStatement` だけ拾えれば fib は通る。
