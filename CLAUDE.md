# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript-syntax AOT native compiler. TS の構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で真の AOT ネイティブコンパイルを狙う。詳細な設計判断・ロードマップ・落とし穴は `MEMO.md`(設計検討資料)を必ず読むこと。`docs/parser-choice.md` に Phase 0 のパーサ選定根拠がある。

現在 **Phase 1.2 完了**。Phase 1.1 までで制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論を整備し、Phase 1.2 で `%` の `fmod` 化、ECMA-262 準拠 shortest round-trip による `number → string`、`switch`(`do/while(0)` ラダーへ lowering)、`string` 型(immutable・ASCII のみ・連結 `+` / `+=` / `.length` / `===`)を追加した。`tests/smoke.sh` が複数ケースを回す形になっている。

## Commands

- `npm run build` — `tsc` で `src/` を `dist/` に出す。
- `npm test` — `tests/smoke.sh`。`examples/*.ts` を順にコンパイル→実行して期待値と一致するか確認(`fib`, `loop_sum`, `while_count`, `boolean_print`, `mod_check`, `switch_check`, `number_format`, `string_basic`)。新しいサンプルを追加したら `run_case` 行を増やす。
- `npm run topaz -- <input.ts> [-o out]` — CLI を npm 越しに起動。
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C をファイルに残す。

cc のパスを変える / フラグ追加したい時は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Architecture

パイプライン:

```
*.ts ──parseFile──▶ ts.SourceFile ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

- `src/parser.ts` — `typescript` の `ts.createSourceFile` を呼ぶだけの薄いラッパ。型チェッカーは使わない(全プログラム推論は将来自前で書く)。
- `src/codegen.ts` — AST から C を直接吐く。未対応構文は `CodegenError` で `file:line:col` 付きで投げて止まる(`MEMO §3.1` の「禁止じゃなく未対応」方針)。`Emitter` クラスがレキシカルスコープ(`Scope`)と関数戻り値テーブル(`functionReturns`)を持ち、式単位で `inferType` を走らせて型不一致や `const` 再代入をエラーにする。型注釈なしの `let`/`const` は初期化式から型を推論する(`number` / `boolean` / `string` リテラル、識別子、関数呼び出し、各種演算)。
- `src/cli.ts` — argv パース、parser → codegen → cc を駆動。`runtime/` は `dist/../runtime` で解決。
- `runtime/runtime.h` — header-only。`topaz_number`(= `double`)、`topaz_boolean`(= C99 `bool`)、`topaz_string`(= `{ const char *data; size_t len; }`)、`topaz_console_log_*`、`topaz_fmod`、`topaz_string_concat`、`topaz_string_eq`、`topaz_emit_number_shortest`(ECMA-262 shortest)。
- `examples/fib.ts` — Phase 0 の done 定義サンプル。`examples/fib.handwritten.c` は codegen ターゲット仕様を手で確定するための参照実装。
- `examples/loop_sum.ts` / `examples/while_count.ts` / `examples/boolean_print.ts` — Phase 1.1 の回帰サンプル(`for`/`let`/`while`/`boolean` の代表ケース)。
- `examples/mod_check.ts` / `examples/switch_check.ts` / `examples/number_format.ts` / `examples/string_basic.ts` — Phase 1.2 の回帰サンプル(`%`/`switch`/数値フォーマット/`string` の代表ケース)。
- `tests/smoke.sh` — `npm test` の中身。`run_case <name> <expected>` を並べる構造。
- `docs/parser-choice.md` — パーサ選定(tsc API 採用)の根拠と SWC / oxc への乗り換え条件。

### 設計上の固定点

- **AST は tsc API**。Phase 1 以降 oxc に乗り換える条件は `docs/parser-choice.md` 参照。
- **C 出力 + 単一ヘッダランタイム**。LLVM IR は使わない(`MEMO §3.4`)。
- **型注釈は信用せずヒント扱い**(`MEMO §3.2`)。Phase 1.2 時点でも codegen 内に式レベルの型推論が同居している。本格的な全プログラム推論層を切り出すのは Phase 1.3 以降の課題で、その時点で `src/codegen.ts` から型推論を分離する想定。
- **未対応構文はエラーで落とす**。`any` 禁止リンターは作らない。コンパイラが「多態」「構造的型の発散」を見つけた時点で諦める(`MEMO §3.1`)。
- **条件式は厳格 boolean**。`if`/`while`/`for`/`do-while` の条件は `boolean` を要求する(`if (n)` のような truthy/falsy は型エラー)。
- **緩い等価は未対応**。`==` / `!=` は `CodegenError` で「`===` / `!==` を使え」と教える(JS の値変換セマンティクスは持ち込まない)。
- **`let`/`const` は初期化必須、`var` は未対応**。`const` への再代入も `CodegenError`。
- **for-init は単一宣言まで**。`for (let i = 0, j = 0; ...)` は未対応(型が混じり得るため)。複数変数を回したい場合は外で宣言する。
- **`switch` は `do { ... } while (0)` への lowering**。case ラベルは判別式と同型のみ、`default` は最終 clause のみ、暗黙の fall-through は禁止(非空 case は `break`/`return`/`throw`/`continue` で終わる必要あり)、`switch` 本体内の `continue` は未対応(do/while(0) で吸われてしまうため、明示的にエラー)。switch の対応型は `number` / `boolean` / `string`(string は `topaz_string_eq` で比較)。
- **`string` は immutable・ASCII 限定**。`+` / `+=` で `topaz_string_concat`(malloc・leak 前提、Phase 1.5 の GC/arena までは諦める)、`===` / `!==` は `topaz_string_eq`(byte 比較)、`.length` はバイト数(JS の UTF-16 code units とは divergence するため非 ASCII リテラルは codegen 段でエラー)。

### 既知の divergence

- `string.length` は UTF-8 バイト長で、JS の UTF-16 code units と divergence する。非 ASCII を含む文字列リテラルは codegen 段でエラーに落としているため未対応のまま顕在化はしないが、`Array` や FFI で外から非 ASCII が来た時点で破綻する。Phase 1.5(全プログラム型検証)で UTF-16 へ寄せるか、`string` を UCS-2/UTF-16 で表現し直すか決める。
- `topaz_emit_number_shortest` は `snprintf("%.*e") + strtod` のラウンドトリップ探索を 1〜17 回まわす実装で、観測上の出力は ECMA-262 ToString と一致するが、Ryu と比べて 1〜2 桁遅い。Phase 2 のベンチマーク整備時に Ryu(Ulf Adams)へ差し替える宿題。
- 文字列連結は毎回 `malloc`、解放はしない(Phase 1.5 までヒープ管理を持たないため)。長時間走るプログラムだとリークする。
- 数値表記の divergence(`3.14` / `0.1+0.2` / `1e21` 等)と `%` の divergence は解消済み(Phase 1.2)。

## Phase 0 から先

ロードマップ全体は `MEMO §6`。Phase 1 は self-hosting 可能なサブセットまで持っていく段階で、クラス・interface・ジェネリクス(monomorphize)・例外・ES module 静的解決・全プログラム型検証が射程。Phase 2 で async/await(Fiber)、bigint、regexp、ベンチマーク整備。

Phase 1 の内訳(現状の刻み方):

- **Phase 1.1 (done)** — 制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論。
- **Phase 1.2 (done)** — `%` の `fmod` 化、ECMA-262 ToString による shortest `number → string`(現状は `snprintf+strtod` ループ、Ryu 差し替えは Phase 2 のベンチ整備時に回す)、`switch`(`do/while(0)` ラダー、暗黙 fall-through 禁止、`default` 最後限定、`string` discriminant 対応)、`string` 型(immutable・ASCII 限定・`+`/`+=`/`.length`/`===`/`!==`)。
- **Phase 1.3** — `Array<T>`(monomorphized)、`Map`/`Set`。
- **Phase 1.4** — class / interface / ジェネリクス(monomorphize)。
- **Phase 1.5** — 例外、ES module 静的解決、全プログラム型検証、ヒープ管理(GC/arena)、self-hosting 通過。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。

新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)であることを忘れない。
