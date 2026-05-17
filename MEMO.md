# TS AOT ネイティブコンパイラ 設計メモ

TypeScript 構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で **真の AOT ネイティブコンパイル** を狙うプロジェクトの設計検討資料。Matz の Ruby AOT コンパイラ [spinel](https://github.com/matz/spinel) を直接の参考にする。

---

## 1. 背景 — 既存の「TS → バイナリ」アプローチの整理

### 1.1 ランタイム同梱型(実用解、ただし真の AOT ではない)

ランタイムごとバイナリにパッケージするアプローチ。実態は自己解凍 fat binary。

- **Bun** (`bun build --compile`): TS 直接入力可、バイナリ 50–100MB
- **Deno** (`deno compile`): 同上
- **Node.js SEA**: 公式、TS は事前 JS 化必要
- **pkg / nexe**: 古典、Node の古いバージョン依存

→ 配布 CLI なら現実的だが「ネイティブコンパイル」ではない。

### 1.2 真の AOT ネイティブコンパイル(研究・実験段階)

| 名前 | 戦略 | 状態 |
|---|---|---|
| **Static Hermes (shermes)** | Hermes を拡張、sound TS 型でランタイム検査を省く。C / LLVM 経由でネイティブ機械語に AOT | 実験的、TS サポート不完全、バイナリ配布なし |
| **Porffor** | ゼロから書かれた JS/TS → Wasm/C AOT。ランタイム同梱せず、バイナリ 1000x 小さい | Test262 通過率 ~35%、研究プロジェクト |
| **AssemblyScript** | TS 構文の別言語(strict、`i32`/`i64` あり、Wasm 専用) | 実用段階、Wasm 用途で実績あり |

このプロジェクトの位置づけは「AssemblyScript の哲学(TS 構文を借りた別言語)」+「Static Hermes/Porffor の AOT 技術」+「Spinel の現実的スコープ感」。

---

## 2. Hermes と Static Hermes の整理

### Hermes(2019, Meta)

React Native 向け JS エンジン。**JIT を持たず、ビルド時に Hermes Bytecode (HBC) に AOT コンパイル**。

- JIT を捨てる代わりに、起動・メモリ・バイナリサイズで勝つ設計
- iOS の JIT 禁止制約とも親和性が高い
- ランタイム本体が小さく、HBC は mmap 可能 → コールドスタート最適

### Static Hermes

Hermes の延長で、**型情報を信じて機械語まで AOT する**新世代:

1. TS/Flow の sound な型を使ってランタイム型検査を省略
2. C 経由 / LLVM 経由でネイティブバイナリに落とす
3. 動的部分は JIT で補う

「Static」は「事前コンパイル」ではなく「**型情報を静的に使う**」の意味。Hermes V1 として React Native のデフォルトに置き換わる流れ。

### モバイル以外での活用

Static Hermes 自体はモバイル特化ではないため、以下が候補:

- **CLI ツール配布**: Bun/Deno の compile 競合。バイナリ数百 KB 〜数 MB(対 50–100MB)
- **組み込みスクリプティング**: QuickJS / Lua 置き換え
- **エッジワーカーのコールドスタート最適化**: V8 isolate の ~5ms を 0ms 近くへ
- **シェルスクリプト代替**: `#!/usr/bin/env shermes`
- **WASI ターゲット**: TS → C → Wasm のパイプライン

ただし障害として、SH は「エンジン」であり「ランタイム」ではない(`fs`、`http` 等を自前で書く必要)、npm エコシステムが使えない、TS サポートが sound subset 限定、安定性が production レベルでない、ロングランニング steady-state は V8 に劣る、等がある。

---

## 3. 設計思想 — Spinel に学ぶ

[matz/spinel](https://github.com/matz/spinel) の重要な設計判断:

### 3.1 「禁止」じゃなく「未対応」

Spinel の制限は禁止リストではなくサポート範囲の宣言:

> No eval / No metaprogramming / No threads / No encoding / No general lambda calculus

言語仕様には手を入れず、「コンパイラができる範囲を正直に切る」だけ。利用者は普通の Ruby を書き、通れば AOT、通らなければインタプリタにフォールバック。

**TS 文脈に持ち込むと**: `any` 禁止リンターを作る代わりに、**コンパイラが多態を発見した時点で諦めるだけ**。書く側は普通の TS を書く。

### 3.2 全プログラム型推論

Spinel は Ruby に型注釈を一切足さず、全呼び出し箇所を見て型を確定。RBS や Sorbet 的な追加表記なし。

**TS 文脈に持ち込むと**: TS の型注釈はヒントとして使うが、「型注釈 = 信用」とせず**全プログラムで本当にその型しか来ないか検証**。多態が見つかれば「ここで `arr.push(x)` の x が `string | number` です」とエラー。

### 3.3 Self-hosting をスコープ決定装置にする

Spinel のバックエンドは Spinel 自身がコンパイルできる Ruby サブセットで書かれている。「**自分自身をコンパイルできる範囲が、サポート範囲の下限**」。仕様議論ではなく実装作業がサブセットを規定する。

### 3.4 C 出力 + 単一ヘッダランタイム

- 21K 行の Ruby(codegen) + 600 行の C ヘッダ(runtime) + 必要に応じて bigint/regexp
- 生成バイナリの実行時依存は libc + libm のみ
- LLVM IR ではなく C を選んだ点が現実的(デバッグ・移植性で有利)

### 3.5 ベンチマーク

74 feature tests / 55 benchmarks pass。geometric mean で miniruby の **~11.6x**。fib, ackermann, mandelbrot, Conway's GoL など計算系で 30–80x、データ構造系で 2–20x、実アプリ系で 3–10x。**個人プロジェクトでこの成果**であることが、TS 版の野心の上限を引き上げてくれる。

---

## 4. MVP スコープ

### 4.1 サポートする TS 機能

- クラス、`extends`、`implements`、メソッド、`super`
- `interface`、`type` エイリアス、基本ジェネリクス(monomorphize 可能な範囲)
- 制御フロー全般(`if`/`switch`/`for`/`while`/`break`/`continue`/`return`)
- 関数、アロー関数、クロージャ
- 基本型: `number`(`f64`)、`string`、`boolean`、`Array<T>`、`Map<K,V>`、`Set<T>`
- discriminated union with exhaustive match
- `try`/`catch`/`finally`、`throw`
- ES module(`import`/`export`)、静的解決のみ
- `null | undefined` の narrowing 必須
- `console.log`、基本 I/O

### 4.2 未対応(コンパイルエラー)

- `any`、`unknown` の終端使用(narrowing なしで返す等)
- `as` キャスト(`as const` のみ許容)
- decorator
- `eval`、`Function` constructor、`Proxy`、`Reflect`
- prototype 改変、`__proto__`
- index signature の dynamic key
- 動的 `import()`
- `with`、`arguments` オブジェクト
- `Symbol.iterator` などのメタプログラミング(将来検討)
- async/await(Phase 2 で Fiber/コルーチン実装後)

### 4.3 コンパイラ自体が使うサブセット(self-hosting)

上のサポート範囲のうち、ジェネリクスを最小限に絞り、async/await を使わない範囲。**コンパイラがコンパイラを書けることがサブセットの最低保証**。

### 4.4 最初に動かすサンプル

```typescript
function fib(n: number): number {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
console.log(fib(34));
```

これが `cc -O2` 経由で native binary に落ち、`./fib` で実行できるところまで。

---

## 5. アーキテクチャ

```
TypeScript (.ts)
    |
    v
parser              Phase 0 は tsc API。Phase 1 以降の乗り換え候補は oxc。詳細 docs/parser-choice.md
    |
    v
TypedAST            型注釈付き AST
    |
    v
type inference      全プログラム推論、多態検出 → エラー
    |
    v
monomorphizer       ジェネリクスを具体化、構造的型を実質 nominal に統合
    |
    v
codegen             AST → C
    |
    v
C source (.c)
    |
    v
cc -O2 -Iruntime    標準 C コンパイラ + 自前 runtime header
    |
    v
Native binary       libc + libm のみ依存
```

### 各層の規模見込み(Spinel 比較)

| コンポーネント | Spinel | TS 版予想 |
|---|---|---|
| Parser | 1,061 行(libprism wrapper) | SWC/oxc 借用、~500 行のラッパー |
| Codegen | 21,109 行 Ruby | 25,000–30,000 行 TS |
| Runtime header | 581 行 C | 1,500–2,000 行 C |
| Bigint | 5,394 行 C | 必要時のみ、流用検討 |
| Regexp | 1,759 行 C | 必要時のみ |

### 設計判断: 構造的型をどう扱うか

TS の構造的部分型は Ruby のダックタイピングとも Java/C# の名義型とも異なる。実装オプション:

1. **monomorphize 全振り**: 各呼び出し箇所で specialize、バイナリ膨張するが速い(Rust 方式)
2. **vtable で抽象化**: interface を vtable に、小サイズ・間接呼び出し(Go interface 方式)
3. **強制 nominal**: 構造的型互換を許さず明示的キャスト要求(実装楽だが TS らしさ減)

**MVP 方針**: monomorphize + cycle-detection でジェネリクス展開、構造的型は同じ shape なら統合して nominal 相当として扱う。

---

## 6. ロードマップ

### Phase 0: PoC(目標 1–2 ヶ月) — **完了**

- [x] パーサ統合(tsc API を採用、`docs/parser-choice.md`)
- [x] 最小型推論(注釈をそのまま信じる版、現状は codegen 内で `number` のみ受理)
- [x] `fib(34)` が動く(`npm test` で回帰チェック)
- [x] runtime.h に `number`, `console.log` だけ
- [x] C 出力 + `cc -O2` でビルド

実装概要は `CLAUDE.md` を参照。

### Phase 1: Self-hosting 可能なサブセット(3–4 ヶ月)

実装サイズが大きすぎるので 1.1〜1.5 に細分化して進める。各小段階の done 定義は CLAUDE.md の「Phase 0 から先」セクションを参照。

- [x] **1.1**: 制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論(codegen 内に同居)。サンプル: `loop_sum.ts` (= 5050)、`while_count.ts` (= 10)、`boolean_print.ts`。
- [x] **1.2**: `%` の `fmod` 化、ECMA-262 ToString 準拠 shortest による `number → string`(Ryu 差し替えは perf 課題として Phase 2 のベンチ整備時に回す)、`switch`(do/while(0) ラダー)、`string` 型と最小文字列操作。サンプル: `mod_check.ts`、`switch_check.ts`、`number_format.ts`、`string_basic.ts`。
- [x] **1.3**: `Array<T>` (monomorphize、done)、`Map<K, V>` / `Set<T>`(K×V scalar monomorph、open-addressing + tombstone、SameValueZero key equality、done)。
- [~] **1.4**: 1.4a で class(継承・ジェネリクスなし、明示 constructor 必須、reference 型、`this` / property read-write / メソッド呼び出し / `new ClassName(args)`、done)、1.4b で interface(構造的型 + 同 shape クラス統合、TODO)、1.4c で generics(関数・クラスの型パラメータ、monomorphize、`Array<ClassName>` 等のコンテナ展開もここ、TODO)。
- [ ] **1.5**: 例外、ES module 静的解決、全プログラム型検証(多態検出 → エラー)、ヒープ管理(GC/arena)、self-hosting 通過。

### Phase 2: 実用性(6 ヶ月〜)

- Promise / async-await(Fiber ベース実装)
- 基本 I/O(`std/fs`、`std/net`)
- regexp 統合
- bigint 統合(必要時のみリンク)
- ベンチマークスイート整備

### Phase 3 以降: エコシステム

ここから先は「Effect-TS の延長線」的な発展:

- capability / effect 型追跡(`!{ fs.read, throw<E> }` 的シグネチャ)
- strict パッケージマニフェスト(npm 互換、`strict-ts.json` で宣言)
- LLM 駆動マイグレーションツール(既存 TS → strict 化)
- stdlib 整備
- Wasm バックエンド(WASI Preview 2/3)

---

## 7. 競合との立ち位置

| プロジェクト | アプローチ | このプロジェクトとの違い |
|---|---|---|
| Static Hermes | JS をフル受け入れ、sound 部分のみ最適化 | 我々は最初から非 sound を未対応にする |
| Porffor | JS フル仕様を目指す研究 | 我々は subset を最初から宣言、Test262 を追わない |
| AssemblyScript | TS 風の別言語、Wasm 専用 | 我々はネイティブもターゲット、構文も普通の TS により近く |
| Bun/Deno compile | ランタイム同梱 | 我々は真の AOT、バイナリは KB〜MB 級 |
| ReScript/PureScript | 別言語、別エコシステム | 我々は TS 構文・型を流用、エディタ体験そのまま |

---

## 8. 落とし穴(事前に意識しておく)

1. **「TS 構文」というラベルは諸刃**: 既存 TS 開発者が「ほとんど同じだから書ける」と思って入り、`any` 禁止で挫折する(AssemblyScript で実際起きた)。「これは TS ではない」と最初に強く伝えるブランディングが必要
2. **stdlib のサイズが寿命を決める**: Deno が成功して pkg が消えた理由はだいたいこれ
3. **「速い」を売りにすると失敗する**: ほとんどの TS 開発者は性能で困ってない。売りは「**バグの一クラス全体が消える**」「**小さい単機能バイナリが配れる**」
4. **structural typing の扱いを最初に決めないと後で苦しむ**: monomorphize 戦略を MVP から固める
5. **npm 互換性は意図的に切る**: 中途半端な互換性は混乱を生む。FFI 経由の明示的 binding のみ

---

## 9. 名前候補

Spinel(尖晶石)が宝石名なので、参照を見せる意味で同系列がよさげ:

- **Topaz** — 黄玉、シンプルで覚えやすい
- **Beryl** — 緑柱石、エメラルドの母石
- **Zircon** — 風信子石、強度感がある
- **Olivine** — 橄欖石、緑色のイメージ

---

## 10. 直近のアクション

1. [x] リポジトリ初期化、ライセンス決定(MIT)
2. [x] SWC か oxc か Babel か、パーサ選定の比較メモを書く → `docs/parser-choice.md`(tsc API 採用)
3. [x] `fib(34)` を C に手で落としてみて、runtime header の最小要件を出す → `examples/fib.handwritten.c` / `runtime/runtime.h`
4. [ ] monomorphize のジェネリクス展開ポリシーを明文化(Phase 1 入口でやる、Phase 0 時点では机上検討になる)
5. [ ] Phase 0 のスコープを issue に切る(remote/issue 運用が未定のため保留)

## 11. Phase 0 実装決定ログ

Phase 0 を実装する過程で確定した、設計検討時点で開いていた選択肢の解:

- **パーサ**: `typescript` パッケージの tsc API。`ts.createSourceFile` を呼ぶだけの薄いラッパで Phase 0 は十分。乗り換え条件は `docs/parser-choice.md`。
- **runtime のレイアウト**: header-only、`static inline` 関数。Spinel の単一ヘッダ流儀を踏襲。Phase 0 では `topaz_number`(= `double`)と `topaz_console_log_number` のみ。
- **codegen の C 出力スタイル**: 全関数を `static`、トップレベル文は `int main(void)` に包む。前方宣言を全関数まとめて出してから定義。
- **未対応構文の扱い**: codegen 中に `CodegenError` を `file:line:col` 付きで投げて停止(`§3.1` の方針を実装に落とした形)。
- **number → 文字列**: Phase 0 は `printf("%.17g", n)`。`3.14` が `"3.1400000000000001"` になる divergence あり。Phase 1 で **Ryu**(Ulf Adams, PLDI 2018, Apache-2.0 / Boost)を `runtime/` に取り込んで差し替える。shortest round-trip 系として実装サイズ・C 単体での扱いやすさで採用。
- **CLI のデフォルト出力**: `<input>.ts` の隣にバイナリと `.c` を落とす。`--emit-c-only` で cc をスキップして生成 C を残せる。`.gitignore` で `examples/` の生成物は無視。

## 12. Phase 1.1 実装決定ログ

- **`boolean` の C 表現**: `<stdbool.h>` の `bool` を `topaz_boolean` に typedef。`int` を直接使うのではなく `bool` にすることで、生成 C 側で「真偽値」と「数値」が混ざる事故を C コンパイラの警告層でも捕まえやすくする。
- **条件式は strict boolean**: `if`/`while`/`for`/`do-while` の条件に数値を渡すとコンパイルエラー。`if (n !== 0)` のように明示させる。JS の truthy/falsy を持ち込まないことで、後段で `number` 以外の型(`null`/`undefined`/オブジェクト)を入れた時の意味論ブレを未然に防ぐ。
- **`==`/`!=` は未対応エラー**: `===`/`!==` を使えとメッセージで誘導。Phase 1.1 時点で `Number(x) == "1"` のような暗黙変換を実装する利得がないため、最初から切る(`§3.1` 「禁止じゃなく未対応」の応用)。
- **`let`/`const` は初期化必須**: 未初期化の局所変数を C にそのまま落とすと不定値の読み出し UB を踏む。JS の `undefined` セマンティクスを Phase 1 では実装しないので、「明示初期化を要求する」方が単純で安全。
- **型推論の置き場所**: 専用の TypedAST 層を切る前段として、Phase 1.1 では `Emitter.inferType` が AST を式単位で歩く軽量実装で済ませる。`MEMO §5` の流れ図でいう「TypedAST」「全プログラム型推論」を 1.2〜1.5 の中で切り出していく。
- **for-init は単一宣言**: `for (let i = 0, j = 0; ...)` を許すと、型が混じった場合に C の for 構文に乗らない。単一宣言だけ受理し、複数変数を回したい場合は外で `let` しておくスタイルに統一。
- **scope と関数シグネチャ**: 関数の前方宣言が全関数ぶん最初に出るのを利用して、本体 emit より先に全関数の戻り値型を `functionReturns` に登録する。これで相互再帰しても型解決できる。
- **`%` は C の `%` でとりあえず出している**: 浮動小数では JS の `%` (= `fmod`) とずれる。整数領域では一致するので Phase 1.1 のサンプル(`loop_sum`/`while_count`)に影響しないが、Phase 1.2 で Ryu と一緒に `topaz_fmod` 経由に差し替える宿題。

## 13. Phase 1.2 実装決定ログ

- **`%` の lowering**: `topaz_number` の `%` / `%=` は常に `topaz_fmod(a, b)` に下ろす。C の `%` は整数型限定でそもそも `double` を受けないため「整数領域なら同じ」という Phase 1.1 のコメントは正確ではなく、Phase 1.1 のサンプル(`loop_sum`/`while_count`)が `%` を使っていなかっただけで、`%` を含むコードは Phase 1.1 では一切コンパイルできない状態だった。`topaz_fmod` は `<math.h>` の `fmod` を `static inline` でラップしただけのもの。
- **shortest `number → string`**: Ryu(d2s)の本家ポートは ~1500 行のテーブル付きで取り込み・検証コストが大きいので、Phase 1.2 では `snprintf("%.*e") + strtod` の精度探索(p=1..17)で shortest 桁数を見つけ、ECMA-262 ToString の場合分け(`k <= n <= 21` / `0 < n <= 21` / `-6 < n <= 0` / それ以外は指数表記)で出力する実装にした。観測上の出力は Ryu と一致するはずだが、最悪 17 回 snprintf+strtod を回すので、Ryu に比べて 1〜2 桁遅い。perf に敏感な用途が顕在化するまでは置いておく(Phase 2 のベンチ整備で差し替え)。
- **`switch` lowering**: C の `switch` は整数型しか受けないので、`do { if (d === c1) { ... } else if (...) { ... } else { default } } while (0)` の if/else ラダーに落とす。`break` は do/while の `break` でそのまま switch を抜ける。trade-off として、`switch` 本体内の `continue`(外側ループに対する continue)は do/while(0) で吸われてしまうため、AST の親をたどって「switch を間に挟む continue」を検出して `CodegenError` で落としている。JS の暗黙 fall-through は禁止(非空 case は terminator で終わる必要あり)、`default` は最終 clause のみ許可、case ラベルは判別式と同型のみ。`number` / `boolean` / `string` 判別式に対応(string は `topaz_string_eq`)。
- **`string` の表現**: `{ const char *data; size_t len; }` を値渡しで運ぶ。リテラルは C99 compound literal `((topaz_string){"abc", 3})` として埋め込み、`data` は string literal(静的寿命)を指す。連結は `topaz_string_concat` が `malloc` して詰める。Phase 1.5 まで GC/arena を持たないので連結結果はリーク前提。文字列リテラルは ASCII 限定で codegen 段で reject(JS の `.length` は UTF-16 code units、C 側のバイト長との divergence を回避するため)。
- **`+` の型分岐**: `inferType` で左辺を見て `topaz_string` なら右辺も `topaz_string` を要求して string 連結、それ以外は両辺 `topaz_number` を要求して数値加算。`+=` も同じ分岐。実装上は `inferType` を一度走らせて codegen 側で再度型を見るので少しもったいないが、Phase 1.3 以降の型推論層分離で解消する想定。
- **`.length` の扱い**: `PropertyAccessExpression` を `inferType` / `emitExpression` の両方で扱う最初のケース。今は `topaz_string.length` だけだが、Phase 1.3 以降 `Array<T>.length` でも同じ枠組みに乗せられるよう、`baseType + propertyName` で dispatch する形にしてある(現状は `if` 1 本だが)。

## 14. Phase 1.3 実装決定ログ(Array<T> 着地時点)

- **Array<T> は monomorphize + reference 型**。`runtime.h` の `TOPAZ_ARRAY_DEFINE(name, elem_t)` マクロで要素型ごとに `topaz_array_<name>` struct(`data` / `len` / `cap`)と `_new` / `_reserve` / `_push` / `_pop` / `_at` / `_set` 関数群を生成。codegen からは `number` / `boolean` / `string` の 3 monomorph に対して `topaz_array_number *` 等のポインタ型として扱う。代入で storage を共有する JS の semantics に揃えるため value 型(struct そのまま)ではなくポインタにした。
- **TopazType の拡張方法**。`type TopazType` を `topaz_number | topaz_boolean | topaz_string | topaz_array_number | topaz_array_boolean | topaz_array_string` の文字列ユニオンに増やし、`arrayElem` / `arrayOf` / `isArrayType` / `arrayShortName` / `cTypeName` のヘルパを足した。Phase 1.4 で nested array(`number[][]`)や任意要素型のジェネリクスを入れる時に、この文字列ユニオン表現は破綻するので、その時点で structured な型表現(`{ kind: "array", elem: ... }` 等)へ移行する。今は monomorph 数が小さく事前列挙できるので文字列で十分。
- **空 `[]` の型解決**。`inferType` 単独では要素型が決まらないので、`declareVar` から annotation 由来の expected 型を `emitArrayLiteral` に thread する。`expectType` を回避して直接 `emitArrayLiteral(initializer, type)` を呼ぶ経路を declareVar に作った。non-empty な配列リテラルは従来通り inferType でいける。
- **GCC statement-expression を活用**。`[1,2,3]` を `({ topaz_array_number *t = topaz_array_number_new(); ...push... t; })` の statement-expression に下ろす。compound literal で初期化リストを書けば一発で済ませたいところだが、`malloc`+`push` の手続きが要るので statement-expression が必要。`tmpCounter` で `__topaz_arr_<n>` を生成して衝突回避。
- **`[i] = v` の lowering**。`checkAssignTarget` を `ElementAccessExpression` も受理するよう緩め、`emitExpression` の `BinaryExpression` 分岐の冒頭で「LHS が ElementAccessExpression」かつ「単純代入」のときは `topaz_array_<name>_set(a, i, v)` を吐く特殊ケースを置いた。複合代入(`a[i] += v` 等)はインデックスを 2 回評価する書き下しが必要なので、Phase 1.3 では未対応エラーで明示的に弾いている(temporary を導入する lowering は Phase 1.4 以降)。
- **`.length` / `.push` / `.pop` の dispatch**。`PropertyAccessExpression` の `.length` は string と Array で別 C 式(`.len` vs `->len`)に展開。method call は `emitCall` から `emitArrayMethodCall` に分岐させた。`push` は void を返すので `inferType` 側で「式として使えない」エラーを出し、`pop` は要素型を返す。`console.log` も配列引数を整形ポリシー未定として明示的にエラー化。
- **bounds check の `!(i >= 0)` イディオム**。`NaN` を弾くために `i >= 0` の否定で書いている(`NaN < 0` も `NaN >= 0` も false)。`size_t` への変換時に負値が wrap して巨大値になる事故も同時に防げる。
- **Map/Set は次チャンクに分離**。実装には `new Map()` 構文サポート、key 型ごとの hash 関数、open-addressing マクロ、K×V monomorph 列挙、複数メソッド dispatch(`.set` / `.get` / `.has` / `.delete` / `.size`)が必要で、Array<T> と一塊にすると粒度が大きすぎる。「刻む」方針で 1.3 を 1.3a(Array)・1.3b(Map/Set)に分割した。

## 15. Phase 1.3 実装決定ログ(Map/Set 着地時点 = 1.3b)

- **K×V monomorph をプリ展開**。scalar 3 種(`number` / `boolean` / `string`)の全組合せで Map 9 個 + Set 3 個を `TOPAZ_MAP_DEFINE` / `TOPAZ_SET_DEFINE` マクロでヘッダ末尾に展開。`TopazType` の文字列ユニオンは Phase 1.3a 時点で「破綻直前」と書いた通りすでに苦しく、ここで template literal 型で `` `topaz_map_${ScalarShortName}_${ScalarShortName}` `` 形式に書き換えて静的列挙を継続。Phase 1.4 でジェネリクスを入れる段で `{ kind: "map", key, value }` 等の structured 表現へ移行する想定は変わらない。
- **TopazType を template literal で再構成**。Phase 1.3a 時点では string union を手で並べていたが、Map 9 monomorph を素直に並べると 18 行になるため、`type TopazType = \`topaz_${ScalarShortName}\` | \`topaz_array_${ScalarShortName}\` | \`topaz_map_${ScalarShortName}_${ScalarShortName}\` | \`topaz_set_${ScalarShortName}\`` に集約。`arrayElem` / `mapKey` / `mapValue` / `setElem` 等のヘルパは文字列を `slice` / `split("_")` で剥がす実装にして、scalar 名にアンダースコアを含めない不変条件で押し切っている(scalar 名を増やす時はこの不変条件を見直す)。
- **key の同値性は SameValueZero、`===` ではない**。JS Map / Set は SameValueZero(NaN === NaN、-0 === +0)を採用しており、Web で動いている TS コードの暗黙の前提もこれ。`topaz_key_eq_number` を `a == b || (a != a && b != b)` で実装し、ハッシュ側でも `-0 → +0` と NaN 正規化を行う。`===` 演算子のセマンティクス(NaN !== NaN)と意図的に divergence する点だけ CLAUDE.md に明記。
- **open-addressing + tombstone**。線形プローブで実装。slot state を 3 値(empty/occupied/tombstone)で持ち、`(size + tombstones + 1) * 4 > cap * 3` で grow 判定。`size * 2 < cap` なら同 cap で rehash(tombstone だけで太った場合の縮退)。初期 cap は最初の `set` / `add` で 8 にする lazy 確保で、空の Map / Set 1 個あたりのバイト数を抑えている。
- **`new Map<K,V>()` / `new Set<T>()` 構文サポート**。`NewExpression` を `emitExpression` / `inferType` / `emitNewExpression` の 3 箇所でハンドル。`Array` 用の `new Array()` は誤用率が高いので「`[]` リテラルを使え」というエラーメッセージで明示的に弾く。bare `new Map()` / `new Set()` は `[]` 同様 `declareVar` から expected 型を thread して受理する(`let m: Map<...> = new Map()` の TS で一番自然な書き味を守るため)。`expected` を持つ場所が declareVar しかないので、関数引数や return 値では型引数必須という非対称が残るが、Phase 1.4 で全プログラム推論を入れる時に解消するつもり。
- **メソッド dispatch は型別に分岐**。`emitCall` を `isArrayType` / `isMapType` / `isSetType` の 3 分岐に拡張し、各々 `emitArrayMethodCall` / `emitMapMethodCall` / `emitSetMethodCall` に流す。`inferType` 側でも対称に同じ分岐を入れ、`.set` / `.add` が void(式中で使えない)、`.get` / `.has` / `.delete` が値を返すというルールを片側だけに書かないよう注意。
- **`.size` は property、`.length` と同じ枠**。`isMapType(t) || isSetType(t)` の `.size` を `((topaz_number)(x)->size)` に下ろすケースを `length` のすぐ下に並べる。実装パスは同じだが、`.size` という名前は JS の Map/Set の API 上の決定で、`Array.length` と揃えてくれなかったのは諦めポイント。
- **`Map.get(k)` は key 不在で `abort`**。JS では `V | undefined` を返すが、optional / union を現状持たないので、`undefined` 相当を表現する手段がない。`.has` で先にチェックする運用にし、divergence は CLAUDE.md に明記。Phase 1.5 で `T | undefined` の narrowing を入れる段で、`Map.get` の戻り値を `V | undefined` に変えて narrowing 必須にする計画。
- **`Map.set` / `Set.add` は void**。JS では `this` を返すので `m.set(k, v).set(k2, v2)` がチェーンできるが、`Array.push` を void にしたのと同じ理由で void に倒した。チェーンしたい時にはエラーメッセージで「式として使えない」と教える。Phase 1.4 で `this` 型が入った後で再検討する宿題。
- **テスト**。`examples/map_set_basic.ts` で全 monomorph(Map<string,number> / Map<boolean,string> / Map<number,number> / Set<number> / Set<string>)、重複 add の冪等性、delete 後の `.size` / `.has`、50 要素入れての grow パス、`new Map()` の context typing、`Map.get` の存在 key からの読み出し を一通り叩いている。tombstone を多数生む `delete` ストレスは未カバー(load factor 計算と rehash 縮退パスの単体検証は今回ペンディング、Phase 1.5 でプロパティテスト基盤を入れる時に拾い直す)。

## 16. Phase 1.4 実装決定ログ(class 着地時点 = 1.4a)

- **TopazType の文字列ユニオン拡張で乗り切った**。Phase 1.3 時点で「文字列ユニオンは破綻直前」と書いていたが、class は monomorph 数が宣言数(ユーザー定義)に等しいだけで、map みたいに K×V の組合せ爆発がないので、`type TopazType = ... | \`topaz_class_${string}\`` を 1 行足すだけで対応できた。これでよい(structured 表現への移行は Phase 1.4c の generics で本格的にコンテナ要素型として class を入れる時に再検討する)。class 名は scalar 名と違って underscore を含み得るが、`isClassType` / `classNameOf` 系のヘルパは prefix を剥がすだけで full name を取り出すので問題ない。逆に `Array` / `Map` / `Set` を class 名にしようとすると built-in と衝突するので class 宣言時にエラーで弾く。
- **明示 constructor を必須化**。フィールドがあるのに constructor がない場合は `calloc` の zero-fill だけで初期化される(JS の `undefined` セマンティクスは持っていないため)。reference field を NULL のまま渡すと segfault するし、scalar field でも 0/""/false が JS の `undefined` とは divergence するので、フィールドを持つクラスには constructor を要求するルールにした。フィールド 0 個のクラス(タグ型)だけは constructor 省略可。`field 初期化子`(`x: number = 0`)は constructor 一本化のため明示エラー。
- **reference 型(`calloc` + leak)**。Array/Map/Set と同じく `topaz_class_<Name> *` をポインタで持つ。代入で storage を共有する JS の semantics に揃えるためで、`r = p` のあと `r.y = 555` を書くと `p.y` も変わる(test ケースで明示)。確保は `calloc(1, sizeof(*self))` で zero-fill する(`malloc` だと未初期化 UB を踏みやすい)。`free` は Phase 1.5 のヒープ管理まで持ち越し。
- **`this` の C 表現は `__topaz_this`**。`this` は C++ の予約語だが C99 では reserved ではないので普通の識別子として使える。ただし C コンパイラ警告や FFI 互換のリスクを避けるため、生成 C 側では `__topaz_this` という `__topaz_` prefix 付きの名前に倒した(`__topaz_arr_<n>` / `__topaz_sw_<id>` と命名規則を揃える)。`Emitter.currentClass` という単一フィールドで「いまどのクラスの method/constructor を emit 中か」を管理し、`this` キーワードが現れたらそのクラスの instance 型を返す。`currentClass` は constructor / method の emit 前後で push/pop ではなく単純に set/clear する(class 宣言の中に class 宣言は書けないので nesting を考えなくてよい)。
- **コンストラクタは `_new` 関数として展開**。`new Point(3, 4)` → `topaz_class_Point_new(3.0, 4.0)`。`_new` の本体は `calloc` + constructor body + `return __topaz_this;`。constructor 内の `return` 文は禁止(JS では `return;` は `this` を返し、`return obj;` は別オブジェクトを返すという面倒な仕様があるので、ここで未対応エラーに切ってシンプル化)。
- **メソッドは static C 関数 + 暗黙 `this` 引数**。`obj.method(args)` → `topaz_class_<Name>_method_<m>(obj, args...)`。第 1 引数は常に `topaz_class_<Name> *__topaz_this`。`this.field` / `this.method(...)` も普通の PropertyAccess / Call として処理されるので特別な lowering は不要。
- **`new Map()` の context typing と class 構文の干渉を切る**。`declareVar` の `initIsBareNew` は元々「`new Map()` / `new Set()` で型引数が省略されているとき、annotation 側で補完する」用に作ったが、class インスタンス化 `new Point(3, 4)` も identifier `Point` のみ + type argument なしの形で同じパターンに合致してしまう。後者は identifier から型が決まるので annotation 不要。`initIsBareNew` の判定を `identifier が "Map" または "Set"` に絞り込んで切り分けた。
- **PropertyAccess 代入は `(obj)->field op= v` に native lower**。Array の `a[i] = v` は C に lvalue 表現がないので `topaz_array_X_set(a, i, v)` というヘルパを通すが、class の `obj.field = v` は C の `obj->field = v` が直接 lvalue として使えるので、`emitExpression` の BinaryExpression 分岐を特別扱いせず普通に `(emit(left) <op> emit(right))` で乗る。複合代入(`obj.field += v`)も C 側で単発の `+=` になり、`obj` は 1 回しか評価されない(Array の場合と違って index がない)。ただし `obj` が複雑な式(例: `getFoo().x += 1`)だと、文字列連結の `+=` のような特殊 lowering で `obj` を 2 回 emit する経路があるので、`checkAssignTarget` で `base が identifier / this / chained PropertyAccess` のみに制限した。
- **メソッド参照(`obj.method` without `()`)は未対応**。first-class function を持たない方針なので、メソッドを値として取り出すと使い道がない。`emitExpression` / `inferType` の PropertyAccess 分岐で「class 型 base に対する method 名」を検出した場合、明示的に「`call it instead`」エラーを出す。
- **`Array<ClassName>` などコンテナでクラスを持つ用途は 1.4c に持ち越し**。`arrayOf` / `mapOf` / `setOf` は scalar 型しか受け取らない実装になっていて、Array monomorph も number / boolean / string の 3 つだけプリ展開している。class 型まで広げるには TOPAZ_ARRAY_DEFINE をクラス宣言時に動的展開する経路を新設するか、generics 経由で monomorph を生成するインフラを作る必要があり、1.4a の範囲を超える。`class C { items: number[]; ... }` のように Array<scalar> をフィールドに持つのは普通に動く(reference 型同士のネストなので問題なし)。
- **未対応リスト(class まわり、明示エラー)**。`extends` / `implements`、`static` / `private` / `protected` / `public` / `readonly` / `abstract` / `override` 修飾子、generic class / generic method、class expression、decorator、getter / setter、static block、parameter property shorthand、`super`、暗黙コンストラクタ(フィールドあり時)、フィールド初期化子、メソッド参照、constructor 内 `return`、class を `console.log` の引数に取る、`Array<ClassName>` / `Map<K, ClassName>` などコンテナでクラスを保持する用途。1.4b で interface + 構造的型統合、1.4c で generics + クラスを含むコンテナ展開を入れる。
- **テスト**。`examples/class_basic.ts` で 2 クラス(`Point` / `Greeter`)、フィールド read / 通常代入 / 複合代入(`+=`)、メソッド呼び出し(`this.x + this.y`、`new Point(...)` の return、引数にクラスインスタンスを取るメソッド)、reference 共有(`r = p` 後の `r.y = 555` が `p.y` に反映)、関数引数・戻り値としてクラスインスタンスを渡す、`string` フィールド + メソッド内の `string` 連結、を一通り叩いている。エラー側は手動で「`new Foo("oops")` の引数型不一致」「`this` を関数外で使用」「`class B extends A {}`」「`obj.method` のメソッド参照」「`console.log(classInstance)`」「フィールドあり class で constructor なし」が全部期待通り `CodegenError` で落ちることを確認(回帰テスト化は未着手、Phase 1.5 のプロパティテスト基盤と一緒に拾い直す宿題)。

## 17. Phase 1.4 実装決定ログ(interface / 構造的型 = 1.4b)

- **fat pointer + per-(I, C) vtable を選択**。代替案は (a) interface 型をそのまま class 型として monomorphize する(関数ごとに class 数分の monomorph を出す)、(b) interface は単なる型宣言だけにして dispatch を一切しない、の 2 つ。(a) は Phase 1.4c の generics で似たことをやる予定なので二重投資感がある+1 つの値が runtime で動的に「複数のクラスのうちどれか」にバインドされる(`makeShape(kind)` のような factory パターン)の表現がそもそもできない。(b) は構造的型の旨味がほぼ消える(関数引数の型を interface にしてもただの documentation になる)。fat pointer なら 16 byte(data ptr + vt ptr)で OOP 言語の interface とほぼ同じ semantics が乗るし、vtable を class × interface 単位で 1 つだけ生成すれば static const として data 領域に乗るので、runtime cost は call site の indirect call 1 回だけ。これを選択。
- **vtable はフィールドも getter/setter 関数ポインタとして持つ**。素朴には class の struct layout を interface ごとに alignment 揃えて固定する方法もあるが、複数の interface を 1 つのクラスが implement する場合に layout 制約が衝突するし、field offset を直接埋め込むと別の翻訳単位から見えなくなる。getter/setter 関数経由なら class layout が完全に自由で、後で field を class の前後どこに足しても vtable 側の wrapper を再生成するだけで済む。indirect call 1 段増えるが、固定 layout 戦略に比べると implementation complexity の差が大きい。
- **構造的一致は EXACT match を要求(coercion なし)**。`class C` が `interface I` を `implements` する時、フィールド型もメソッド signature も完全一致を要求する。例えば interface が `f(): I` と宣言していて、クラスが `f(): C`(C は I を実装する具象クラス)を返すケースは現状エラーにする。理由は、vtable wrapper の生成が単純な「`(C*)self->f()` を呼んで返す」になるため。covariant return / contravariant param まで対応すると wrapper 内で coercion を挟む必要があり、wrapper の数が増えるし C 側の型互換性も崩れる。1.4b の射程外。
- **coercion は user-visible value sites のみで挟む**。`emitWithExpected(expr, expected)` ヘルパを新設し、変数宣言の初期化子 / 関数呼び出しの引数 / `return` 文 / 代入の RHS の 4 サイトで使う。class -> interface への変換は ここでだけ起きる(fat pointer の compound literal `((topaz_iface_I){ .data = ..., .vt = &topaz_iface_I_for_C_vt })` を emit する)。`==`/`!==` を含む式中の値比較や `console.log` 引数では coercion しない(`console.log(iface)` 自体が未対応エラー、`iface === iface` も未対応で十分)。これで coercion の挿入箇所がほぼ網羅できる。
- **`return` 文の coercion のため `currentReturnType` を Emitter に追加**。関数 / メソッドの本体を emit 中、`return expr;` の expr に対して `emitWithExpected(expr, currentReturnType)` を呼ぶ必要があるが、`emitFunctionDefinition` / `emitMethodDefinition` の中でしか分からない情報なので、Emitter のメンバとして push/pop する。`functionReturns` を `functionSigs`(params + returnType)に rename して、関数呼び出し側でも param type を引いて coercion をかけられるようにした。
- **emit 順序: vtable wrapper / instance は user 関数より前に置く**。`describe(new Circle(3))` のような coercion site が user 関数本体に入ると `&topaz_iface_Shape_for_Circle_vt` を参照する必要があり、forward declaration だけだと不十分(static const のアドレスを取るので definition が見える必要がある)。emit の順序は: include → class struct fwd → interface fat pointer typedef + vt struct fwd → class struct def → interface vt struct def → fn/method fwd → vt wrapper def + vt instance def → user fn def → class method def → main、に固定。
- **interface 経由の dispatch は stmt expression で base を一度だけ評価**。`makeShape(2).area()` のような「base が副作用を持つ式」を `(base).vt->area((base).data)` の素朴 lowering で出すと、base が 2 回呼ばれてしまう。GCC/clang stmt expression `({ topaz_iface_X __t = base; __t.vt->m(__t.data, args); })` で base を temp に固定する形に統一(getter / setter / method call すべて同じパターン)。base が identifier の場合は temp が冗長だが、C compiler が最適化で取り除くので codegen を分岐させるより読みやすい。
- **interface field 代入は void 評価**。`iface.f = v` は `({ topaz_iface_X __t = base; __t.vt->set_f(__t.data, v); })` という stmt expr で、setter が void を返すので式全体の値も void。chained assignment `x = (iface.f = v)` は使えないが、TypeScript ユーザーの実コードでほぼ書かないパターンなので未対応で割り切る。class の field 代入(C lvalue がある)とは divergence する。
- **interface field の compound assignment は未対応**。`iface.f += v` を実装するなら getter + setter を 1 文に統合する必要があり、stmt expr で書けなくはないが、divergence が増えるだけなので明示エラーで弾く(`iface.f = iface.f + v` を書けと案内する)。
- **interface 値の Map/Set/Array 要素は未対応**。`Array<Shape>` などは `arrayOf` が scalar 型しか受け取らないため `no Array monomorph for element type topaz_iface_Shape` で自然に弾かれる。本格対応は 1.4c の generics monomorphize で interface も含めて再設計する。
- **interface に対する `new`、interface の `extends`、generic interface、optional フィールド / メソッド、modifiers、index / call / construct signature、getter / setter** は collectInterfaceMembers の段で全部明示エラー。「`new Shape()`」は class 名と interface 名が同じ namespace に乗っているので emitNewExpression / inferType 両方で interface かどうか判別して「instantiate an implementing class instead」と案内する。
- **エラーメッセージは class 由来の文言を流用**。「`'<m>' is a field, not a method, on interface ...`」「`interface '<I>' has no method '<m>'`」など、class の同種エラーと並びを揃えてある。ユーザーが class と interface を切り替えた時にメッセージで混乱しないようにするため。
- **テスト**。`examples/interface_basic.ts` で 2 クラスを 1 interface に implements、`describe(s: Shape)` / `makeShape(kind: number): Shape` の interface 引数・戻り値、`const a: Shape = new Circle(2)` の変数初期化での coercion、`a.name`(field read)/`a.name = "renamed"`(field write)/`a.area()` / `a.scale(3)` のメソッド・フィールド dispatch、`makeShape(2).area()` の「return された interface 即 method call」(stmt expr の base 一度評価が効くケース)を一通り叩いている。エラー側は手動で「`class C implements I` で field 型不一致」「method signature 不一致」「missing field/method」「`new Shape()`」「`Array<Shape>`」「`console.log(iface)`」「`iface.method`(値として)」が `CodegenError` で落ちることを確認。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
