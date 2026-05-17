# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript-syntax AOT native compiler. TS の構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で真の AOT ネイティブコンパイルを狙う。詳細な設計判断・ロードマップ・落とし穴は `MEMO.md`(設計検討資料)を必ず読むこと。`docs/parser-choice.md` に Phase 0 のパーサ選定根拠がある。

現在 **Phase 0(PoC)完了**。`fib(34)` が TS → C → `cc -O2` → ネイティブバイナリで動く状態。

## Commands

- `npm run build` — `tsc` で `src/` を `dist/` に出す。
- `npm test` — `tests/smoke.sh`。`examples/fib.ts` をコンパイル→実行し、`5702887` が出るかチェック。
- `npm run topaz -- <input.ts> [-o out]` — CLI を npm 越しに起動。
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C をファイルに残す。

cc のパスを変える / フラグ追加したい時は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Architecture

パイプライン:

```
*.ts ──parseFile──▶ ts.SourceFile ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

- `src/parser.ts` — `typescript` の `ts.createSourceFile` を呼ぶだけの薄いラッパ。型チェッカーは使わない(全プログラム推論は将来自前で書く)。
- `src/codegen.ts` — AST から C を直接吐く。未対応構文は `CodegenError` で `file:line:col` 付きで投げて止まる(`MEMO §3.1` の「禁止じゃなく未対応」方針)。
- `src/cli.ts` — argv パース、parser → codegen → cc を駆動。`runtime/` は `dist/../runtime` で解決。
- `runtime/runtime.h` — header-only。`topaz_number`(= `double`)と `topaz_console_log_number` だけ。
- `examples/fib.ts` — Phase 0 の done 定義サンプル。`examples/fib.handwritten.c` は task #1 で codegen ターゲット仕様を確定するために手で翻訳した参照実装。
- `tests/smoke.sh` — `npm test` の中身。
- `docs/parser-choice.md` — パーサ選定(tsc API 採用)の根拠と SWC / oxc への乗り換え条件。

### 設計上の固定点

- **AST は tsc API**。Phase 1 以降 oxc に乗り換える条件は `docs/parser-choice.md` 参照。
- **C 出力 + 単一ヘッダランタイム**。LLVM IR は使わない(`MEMO §3.4`)。
- **型注釈は信用せずヒント扱い**(`MEMO §3.2`)。Phase 0 ではまだ検証していないが、型推論層を追加する場所は parser と codegen の間。
- **未対応構文はエラーで落とす**。`any` 禁止リンターは作らない。コンパイラが「多態」「構造的型の発散」を見つけた時点で諦める(`MEMO §3.1`)。

### 既知の divergence

- `topaz_console_log_number` は `%.17g` を使うため `3.14` が `"3.1400000000000001"` になる。JS の shortest round-trip(Ryu 等)とは未一致。Phase 0 の done 定義(整数の fib)には影響しないため Phase 1 以降で対応(task #7 参照)。

## Phase 0 から先

ロードマップ全体は `MEMO §6`。Phase 1 は self-hosting 可能なサブセットまで持っていく段階で、クラス・interface・ジェネリクス(monomorphize)・例外・ES module 静的解決・全プログラム型検証が射程。Phase 2 で async/await(Fiber)、bigint、regexp、ベンチマーク整備。

新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)であることを忘れない。
