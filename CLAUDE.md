# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript-syntax AOT native compiler. TS の構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で真の AOT ネイティブコンパイルを狙う。詳細な設計判断・ロードマップ・落とし穴は `MEMO.md`(設計検討資料)を必ず読むこと。`docs/parser-choice.md` に Phase 0 のパーサ選定根拠がある。

現在 **Phase 1.1 進行中**。Phase 0 (`fib(34)` E2E) は完了し、Phase 1.1 で制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論を追加した。`tests/smoke.sh` が複数ケースを回す形になっている。

## Commands

- `npm run build` — `tsc` で `src/` を `dist/` に出す。
- `npm test` — `tests/smoke.sh`。`examples/*.ts` を順にコンパイル→実行して期待値と一致するか確認(`fib`, `loop_sum`, `while_count`, `boolean_print`)。新しいサンプルを追加したら `run_case` 行を増やす。
- `npm run topaz -- <input.ts> [-o out]` — CLI を npm 越しに起動。
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C をファイルに残す。

cc のパスを変える / フラグ追加したい時は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Architecture

パイプライン:

```
*.ts ──parseFile──▶ ts.SourceFile ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

- `src/parser.ts` — `typescript` の `ts.createSourceFile` を呼ぶだけの薄いラッパ。型チェッカーは使わない(全プログラム推論は将来自前で書く)。
- `src/codegen.ts` — AST から C を直接吐く。未対応構文は `CodegenError` で `file:line:col` 付きで投げて止まる(`MEMO §3.1` の「禁止じゃなく未対応」方針)。`Emitter` クラスがレキシカルスコープ(`Scope`)と関数戻り値テーブル(`functionReturns`)を持ち、式単位で `inferType` を走らせて型不一致や `const` 再代入をエラーにする。型注釈なしの `let`/`const` は初期化式から型を推論する(`number` または `boolean` リテラル、識別子、関数呼び出し、各種演算)。
- `src/cli.ts` — argv パース、parser → codegen → cc を駆動。`runtime/` は `dist/../runtime` で解決。
- `runtime/runtime.h` — header-only。`topaz_number`(= `double`)、`topaz_boolean`(= C99 `bool`)と `topaz_console_log_number` / `topaz_console_log_boolean`。
- `examples/fib.ts` — Phase 0 の done 定義サンプル。`examples/fib.handwritten.c` は codegen ターゲット仕様を手で確定するための参照実装。
- `examples/loop_sum.ts` / `examples/while_count.ts` / `examples/boolean_print.ts` — Phase 1.1 の回帰サンプル(`for`/`let`/`while`/`boolean` の代表ケース)。
- `tests/smoke.sh` — `npm test` の中身。`run_case <name> <expected>` を並べる構造。
- `docs/parser-choice.md` — パーサ選定(tsc API 採用)の根拠と SWC / oxc への乗り換え条件。

### 設計上の固定点

- **AST は tsc API**。Phase 1 以降 oxc に乗り換える条件は `docs/parser-choice.md` 参照。
- **C 出力 + 単一ヘッダランタイム**。LLVM IR は使わない(`MEMO §3.4`)。
- **型注釈は信用せずヒント扱い**(`MEMO §3.2`)。Phase 1.1 時点では codegen 内に式レベルの型推論が同居している。本格的な全プログラム推論層を切り出すのは Phase 1.2 以降の課題で、その時点で `src/codegen.ts` から型推論を分離する想定。
- **未対応構文はエラーで落とす**。`any` 禁止リンターは作らない。コンパイラが「多態」「構造的型の発散」を見つけた時点で諦める(`MEMO §3.1`)。
- **条件式は厳格 boolean**。`if`/`while`/`for`/`do-while` の条件は `boolean` を要求する(`if (n)` のような truthy/falsy は型エラー)。
- **緩い等価は未対応**。`==` / `!=` は `CodegenError` で「`===` / `!==` を使え」と教える(JS の値変換セマンティクスは持ち込まない)。
- **`let`/`const` は初期化必須、`var` は未対応**。`const` への再代入も `CodegenError`。
- **for-init は単一宣言まで**。`for (let i = 0, j = 0; ...)` は未対応(型が混じり得るため)。複数変数を回したい場合は外で宣言する。

### 既知の divergence

- `topaz_console_log_number` は `%.17g` を使うため `3.14` が `"3.1400000000000001"` になる。JS の shortest round-trip(Ryu 等)とは未一致。Phase 1 で Ryu を取り込んで差し替える(`MEMO §11`)。
- 浮動小数の `%` を `fmod` ではなく C の `%` 演算子で出している。JS の `%` は IEEE-754 余り = `fmod` 相当。現状の `loop_sum` のように整数演算では問題が出ないが、非整数で `%` を使った時に divergence が出る。Phase 1.2 で `topaz_fmod` 経由に差し替える。

## Phase 0 から先

ロードマップ全体は `MEMO §6`。Phase 1 は self-hosting 可能なサブセットまで持っていく段階で、クラス・interface・ジェネリクス(monomorphize)・例外・ES module 静的解決・全プログラム型検証が射程。Phase 2 で async/await(Fiber)、bigint、regexp、ベンチマーク整備。

Phase 1 の内訳(現状の刻み方):

- **Phase 1.1 (done)** — 制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論。
- **Phase 1.2** — `%` の `fmod` 化、Ryu による `number → string`、(未着手の)`switch`、`string` 型と最小限の文字列操作。
- **Phase 1.3** — `Array<T>`(monomorphized)、`Map`/`Set`。
- **Phase 1.4** — class / interface / ジェネリクス(monomorphize)。
- **Phase 1.5** — 例外、ES module 静的解決、全プログラム型検証、self-hosting 通過。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。

新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)であることを忘れない。
