# TS AOT ネイティブコンパイラ 設計メモ

TypeScript 構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で **真の AOT ネイティブコンパイル** を狙うプロジェクトの設計検討資料。Matz の Ruby AOT コンパイラ [spinel](https://github.com/matz/spinel) を直接の参考にする。

現状の仕様(設計上の固定点・既知の divergence・実装されたサンプル)は `CLAUDE.md` を参照。過去 Phase の「なぜそう実装したか」の決定ログは `docs/archive/implementation-log.md` を参照(新 Phase の決定ログもそこへ追記する運用)。

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

### 4.1 サポートする TS 機能(全 Phase 通算の目標)

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

各機能の現状の対応範囲は `CLAUDE.md` の「設計上の固定点」を参照。

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

---

## 5. アーキテクチャ(目標)

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

現状は `parser → codegen` の 2 段で、TypedAST / type inference / monomorphizer は codegen 内に同居している。Phase 1.4c-2(generic function)以降、`Array<Box<number>>` のような型表現が必要になった時点で TypedAST を切り出す予定。

### 各層の規模見込み(Spinel 比較)

| コンポーネント | Spinel | TS 版予想 |
|---|---|---|
| Parser | 1,061 行(libprism wrapper) | SWC/oxc 借用、~500 行のラッパー |
| Codegen | 21,109 行 Ruby | 25,000–30,000 行 TS |
| Runtime header | 581 行 C | 1,500–2,000 行 C |
| Bigint | 5,394 行 C | 必要時のみ、流用検討 |
| Regexp | 1,759 行 C | 必要時のみ |

### 構造的型の扱い

TS の構造的部分型は Ruby のダックタイピングとも Java/C# の名義型とも異なる。実装オプション:

1. **monomorphize 全振り**: 各呼び出し箇所で specialize、バイナリ膨張するが速い(Rust 方式)
2. **vtable で抽象化**: interface を vtable に、小サイズ・間接呼び出し(Go interface 方式)
3. **強制 nominal**: 構造的型互換を許さず明示的キャスト要求(実装楽だが TS らしさ減)

**現状の方針**: interface は fat pointer + per-(I, C) vtable で 2 に近い形に倒し(Phase 1.4b)、コンテナの要素は monomorphize する 1 のハイブリッド。構造的型互換は EXACT match 限定で、変則的な構造的サブタイプ(covariant / contravariant)は将来課題。

---

## 6. ロードマップ(残タスク)

### Phase 1: Self-hosting 可能なサブセット

- [x] **1.1〜1.4c-3** — 制御フロー / `boolean` / `string` / shortest number / `switch` / `Array<T>` / `Map<K,V>` / `Set<T>` / `class` / `interface` / コンテナの class / interface 要素 / generic function / generic class まで着地済み。`TopazType` の structured 表現への移行も 1.4c-3 と同じタイミングで PoC として完了(`Array<Box<number>>` のようなネストが書けるようになった)。詳細は `CLAUDE.md` 参照。
- [x] **1.5-1** — 例外(`throw` / `try` / `catch`)。setjmp/longjmp + linked-list frame stack。throw 値は class instance に限定、catch binding は `catch (e: ClassName)` の明示型注釈必須、`finally` と try body 内 return / break / continue は未対応(1.5 残作業として cleanup と一緒に解禁する)。
- [ ] **1.5 残り** — 以下を 1.5-N サブフェーズに分けて進める。順序は self-hosting に必要なものから逆算で入れ替える。
  - [ ] **1.5-2 (仮)** — ES module 静的解決。`import` / `export` を AST 単位で flatten、循環検出、宣言の topological 順序付け。self-hosting に必須(`src/codegen.ts` 単独でも import を持っているため)。
  - [ ] **1.5-3 (仮)** — 全プログラム型検証層。式単位の `inferType` を TypedAST 層に切り出し、多態(同じ識別子が異なる型で使われる)を検出してエラー、`Map.get` の戻り値を `V | undefined` に変えて narrowing 必須化、`--strictPropertyInitialization` 相当の class field 未初期化検査、catch binding の `unknown` narrowing(これが入ると `catch (e: ClassName)` の型注釈を optional にできる)。
  - [ ] **1.5-4 (仮)** — ヒープ管理。`string +` の連結結果 / `throw` した class instance / `Array` / `Map` / `Set` の slot buffer の leak を一気に回収。GC(BDW conservative)か arena(per-scope / per-request)かは self-hosting で踏むパターンを見てから決める。値型コンテナ(自前 Box / List 等)が書けるようになったので、Set の構造的等値の必要性もここで再評価する。
  - [ ] **1.5-5 (仮)** — generic method(`class C { f<U>(...) {} }`)/ generic interface。class 全体の monomorph と method 単独の monomorph が直交するので、`classMonomorphs` の構造を method 単位に拡張する必要あり。
  - [ ] **1.5-6 (仮)** — self-hosting 通過。`src/*.ts` を Topaz 自身でコンパイルできる状態にする。途中で踏んだ未対応機能を 1.5-N に折り返してフィードバックループを回す。
  - [ ] **1.5-X (オプション)** — `finally` 句および try body 内 return / break / continue 解禁。cleanup の lowering(`__cleanup__` attribute or 手書きの dispatch tree)とセット。self-hosting で実際に欲しくなった時点で着手、不要なら Phase 2 に持ち越し。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`§3.3`)であることを忘れない。

### Phase 2: 実用性

- Promise / async-await(Fiber ベース実装)
- 基本 I/O(`std/fs`、`std/net`)
- regexp 統合
- bigint 統合(必要時のみリンク)
- ベンチマークスイート整備(`topaz_emit_number_shortest` を Ryu へ差し替え含む)

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

## 9. 直近のアクション(未完了)

- [ ] **1.5-2 着手前に self-hosting の最小到達点を割り出す**。`src/parser.ts` / `src/cli.ts` / `src/codegen.ts` を実際に Topaz でコンパイルしようとしたとき、`import` 解決 / 型検証 / ヒープ管理 / generic method のうちどれが先にブロッカーになるかを、生 AST を読みながら棚卸し。1.5-N の順序付けはこれを根拠に確定する(現状の (2) ES module → (3) 型検証 → (4) ヒープ → (5) generic method → (6) self-hosting 通過は仮置き)。
- [ ] **generic class の未対応領域の棚卸し**(`class Box<T> implements I` / type parameter constraint / default type parameter / generic class を Map / Set の key にする方向)。self-hosting で踏むものが 1 つでもあれば 1.5-N のいずれかに組み込む、踏まないなら Phase 2 に降ろす。
- [ ] generic 関数の戻り値が `Array<T>` の場合の monomorph 収集を、generic 関数経路と非 generic 経路で確実に同じ slot へ流すパスをドキュメント化(現状は self-hosting で踏むまで顕在化しない領域)。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
