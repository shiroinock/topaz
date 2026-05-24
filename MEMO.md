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
- [x] **1.5-2** — ES module 静的解決。`src/loader.ts` で root から DFS、相対パス specifier (`./foo` / `../foo` / `.js` 拡張子は `.ts` に置換) のみ受け入れ、循環検出 (visiting set)、topological 順の `SourceFile[]` を codegen に渡す。codegen は `emit(SourceFile[])` で全 module の宣言を単一 global namespace に flatten。`export class` / `export function` / `export interface` 修飾子のみ受理、`export default` は明示エラー。**非 root module は宣言のみ許可**(top-level の executable statement は明示エラー、`main()` body は root の top-level のみ)。`import` の構文受付は `import { a, b } from "./x.js"` と side-effect `import "./x.js"` のみ、default / namespace / rename / `import type` は loader 側で明示エラー(parser 戦略 1.5-6 まで保留)。生成 C は引き続き単一 TU。`examples/module_basic_{shapes,util,main}.ts` で success、`examples/module_cycle_{a,b}.ts` で循環検出を回帰。
- [ ] **1.5 残り** — 以下を 1.5-N サブフェーズに分けて進める。順序は self-hosting に必要なものから逆算で入れ替える。詳細な棚卸し根拠は `docs/archive/self-hosting-inventory.md`。
  - [x] **1.5-3** — 全プログラム型検証層 + **discriminated union narrowing** + **`T \| undefined` narrowing** + strict field init + catch `unknown` narrowing。1.5-3a〜f まで完了。式単位の `inferType` を TypedAST 層に切り出し、多態(同じ識別子が異なる型で使われる)を検出してエラー、`switch (t.kind)` で discriminated union を狭める narrowing(`TopazType` 自身がこの形なので self-hosting の中核)、ヘルパ関数戻り値の `T | undefined` を狭める narrowing、`Map.get` の戻り値を `V | undefined` に変えて narrowing 必須化、`--strictPropertyInitialization` 相当の class field 未初期化検査、catch binding の `unknown` narrowing(これが入ると `catch (e: ClassName)` の型注釈を optional にできる)。
    - [x] **1.5-3a** — strict field init。`collectClassMembers` の末尾で `verifyDefiniteFieldInit(info)` を呼び、ctor body の top-level の `this.f = ...` 代入を集めて全 field がカバーされているかチェック。制御フロー (if/for/while/try) 内の代入は保守的に「無代入」扱い(1.5-3d の flow narrowing 基盤投入時に flow-sensitive 版に置き換える)。generic class の monomorph (`infoOverride`) は同じ ctor decl を見るので skip。`examples/strict_field_init_fail.ts` を負例として `run_fail_case` で回帰、既存 17 ケースは全て pass。
    - [x] **1.5-3b** — TopazType に union/optional variant 追加。`{ kind: "undefined" }` と `{ kind: "union", variants }` を導入(現状は `T | undefined` 限定、scalar | undefined は 1.5-3c で開ける)。`makeUnion` で flatten + dedup + canonical sort、`typeEq` は sorted variants の positional 比較、`cTypeName` は reference T → `T *` (NULL が undefined sentinel)・interface T → `topaz_iface_<I>` (`.data == NULL` が sentinel) で union 全体を inner の C 表現に collapse、scalar | undefined はエラーで reject。`emitWithExpected` が `undefined` 識別子を NULL / fat pointer compound literal に lower、`applyCoercion` は T → `T | undefined` widening を no-op で通す。`===` / `!==` は `typesOverlap` ベースに変更し、片方が `undefined` の場合だけ専用 lowering (interface は `.data` 比較)。narrowing 未実装なので union 値の field 参照・method call・`console.log` は明示エラーで reject (1.5-3d で narrowing が入るまで)。`examples/optional_basic.ts` で positive、`examples/optional_field_access_fail.ts` で negative 回帰。
    - [x] **1.5-3c** — Map.get の戻り値を V | undefined 化。`runtime/runtime.h` に scalar の sentinel struct `topaz_opt_<scalar>` (`{ present, value }`) と `topaz_opt_wrap_*` / `topaz_opt_absent_*` / passthrough マクロを追加、`TOPAZ_MAP_DEFINE` に `(opt_t, opt_wrap, opt_absent)` の 3 引数を追加して `_get` を opt 戻りに変更。codegen 側で `cTypeName` に scalar | undefined → `topaz_opt_<scalar>` 分岐、identifier emit で narrowed scalar opt のとき `.value` 経由、`emitMapMonomorphMacro` を 6 引数化(class V は passthrough + NULL、iface V は passthrough + 専用 `topaz_iface_<I>_absent` マクロ)、`emitUndefinedLiteral` / `applyCoercion` / `===` undefined lowering に scalar opt 対応を追加、`inferType` の `Map.get` を `makeUnion([V, T_UNDEFINED])` に変更。1.5-3d の narrowing 機構経由で `if (x !== undefined)` で value として使える。`examples/map_set_basic.ts` と `examples/map_set_class_iface.ts` を narrowing パターンに書き換え、新規 `examples/optional_map_get.ts` を追加。25 ケース全て pass。
    - [x] **1.5-3d** — `T | undefined` の flow-sensitive narrowing。`Scope` に `narrowings` overlay を 1 層追加(`stack` と並走させて `push`/`pop` 同期、`lookup` が narrowing を優先)、`extractNarrowing(cond, polarity)` が `x === undefined` / `x !== undefined`(左右どちらでも、変数側は単一識別子)を `{ name, type }` に解釈。`IfStatement` ハンドラが then / else 両方の polarity で narrowing を抽出して `emitStatementAsBlock` の optional 引数で渡し、ブランチ内 scope に install。`emitBlock` は各 statement の後で `applyCarryNarrowing` を呼び、「then が必ず exit する `if`」「else が必ず exit する `if`」を見つけたら以降の statement に inverted narrowing を残す(`alwaysExits` は return/throw/break/continue/block 末尾再帰/両 branch exit する if を保守的に判定)。`examples/optional_narrow.ts` で then/else narrowing、early-return narrowing、interface narrowing、throw 経由の cleanup などを 10 行カバー。**未対応**: narrowed scope 内での widening 再代入(narrow 型に対する型チェックでエラー)、compound condition (`&&` / `||`)、type guard function、`instanceof`、`in` operator、property の narrowing(1.5-3e/1.5-3f で必要に応じて追加)。1.5-3a の definite-assignment 検査の flow-sensitive 化は次の作業候補だが、現状の保守実装で src/ / examples すべて通っているため、self-hosting で踏むまで延期。
    - [x] **1.5-3e** — discriminated union narrowing。class union (`Circle | Square`) を `{ kind: "circle", radius } | { kind: "square", side }` の string literal discriminator で同定し、`switch (s.kind) { case "circle": /* s narrows to Circle */ }` で各 case 内 narrow。C 表現は fat pointer `topaz_dunion_<sorted>_or_<...> = { topaz_string kind; void *data; }`、`emitWithExpected` で class → dunion 構築、identifier emit で narrowed dunion → 元 class へ cast。`examples/dunion_basic.ts` で positive、`examples/dunion_field_access_fail.ts` で「narrow せず field 参照したらエラー」を回帰。
    - [x] **1.5-3f** — 多態検出 + catch binding の `unknown` narrowing。TopazType に `{ kind: "unknown" }` を追加、`typeFromAnnotation` で `UnknownKeyword` を受理、`cTypeName` は `void *`。catch binding の型注釈を optional 化(`: unknown` または無し → `T_UNKNOWN`)、`: ClassName` は引き続き受理。`instanceof ClassName` を binary operator として追加、AST 上で右辺は宣言済み class 名識別子限定。RTTI は全 class struct の先頭に `const char *__topaz_class_tag` フィールドを追加(constructor で per-class static sentinel `topaz_class_<C>_tag` のアドレスを書く)、`x instanceof C` を `*((const char * const *)x) == &topaz_class_<C>_tag` に lower (NULL guard 付き stmt expr)。`extractNarrowing` を拡張して `<id> instanceof <Class>` の positive 分岐で `unknown` → 当該 class に narrow。narrowing 後の identifier emit は `void *` → `topaz_class_<C> *` に cast。多態検出は既存の `inferType` 型一致チェックで実質的にカバー済み(同 identifier の異型再代入は assignability check で reject)、本サブフェーズで追加コードは無し。`examples/catch_unknown.ts` で positive、`examples/catch_unknown_unnarrowed_fail.ts` で「narrow せず field 参照したらエラー」を回帰。これで 1.5-3 完了。
  - [ ] **1.5-3.5 (新設)** — **syntactic sugar 集中投入**。`src/codegen.ts` の棚卸しで 1.5-3 単独では self-hosting に届かないことが判明したため、別サブフェーズに切る。中身: `for-of`(58 箇所、**Array<T> 限定は 1.5-3.5b で着地**、Map.values() / Set 経由は 1.5-3.5g で Iterator interface と一緒に)、arrow function + closure キャプチャ(22 箇所、`Array.map` のため、**1.5-3.5e**)、template literal(280 箇所、**1.5-3.5a で着地**)、destructuring、optional chaining(`?.`、**1.5-3.5d**)、nullish coalescing(`??`、**1.5-3.5c で着地**)、non-null assertion(`!`、**1.5-3.5c で着地**)、spread(`...x`、関数 args 渡しのみ)、`Array.map` / `.filter` / `.join` / `.includes` / `.slice`(**1.5-3.5f**)、`Map.values()`(**1.5-3.5g**)。**1.5-4 (ヒープ管理)と一緒に検討する**: template literal を `+` に lowering すると毎回 malloc が走るため、arena の前にこれを入れると leak が劇的に増える(→ arena 着地後の 1.5-3.5a で着手して回避)。
    - [x] **1.5-3.5a** — template literal の `topaz_string_concat` chain への lowering。`runtime/runtime.h` に `topaz_number_to_string` / `topaz_boolean_to_string` を追加(number は既存 `topaz_emit_number_shortest` を arena 48-byte buf に書き出す版へ refactor、boolean は `static const char[]` 戻り)、`topaz_console_log_number` も `topaz_number_to_string` 経由に統一して format 回帰テストを既存 `number_format` smoke に集約。codegen 側で `ts.isTemplateExpression` を `emitExpression` / `inferType` の `isStringLiteral` 隣に追加し、`emitStringLiteral` の signature を `TemplateHead` / `TemplateMiddle` / `TemplateTail` も受けるよう広げて escape ロジックを流用。各 `${}` substitution は number / boolean / string のみ受理(class / interface / array / map / set / unnarrowed `T | undefined` は明示エラー)、空フラグメントは skip するので `` `${name}` `` は concat 呼び出し 0 回まで折り畳む。新規 `examples/template_literal.ts`(positive、20 行)と `examples/template_literal_unsupported_fail.ts`(class instance 埋め込みエラー)、30 ケース全 pass。決定ログは `docs/archive/implementation-log.md` 末尾。次は arrow + closure と `for-of` を `Array.map` のために組で(closure キャプチャの C 表現と iterator interface 設計の判断が同時に立つ)。
    - [x] **1.5-3.5b** — `for-of` over `Array<T>` の index-based for-loop への lowering。`emitStatement` に `ts.isForOfStatement` 分岐を追加、RHS を `topaz_array_<short> *` の tmp に snapshot して `for (size_t i = 0; i < arr->len; i++)` で反復、body 先頭で `<elem> bindName = arr->data[i];` を declare(bounds check は `i < len` で構造的に不要なので `_at` は使わず direct buffer 参照)。binding は `const` / `let` の単一識別子のみ、destructuring・初期化子付き・複数宣言・`var`・`for await` は明示エラー、型注釈は elem と EXACT 一致。RHS が Map / Set / string の場合は hint 付きエラーで reject(`Map.values()` / `Set` iteration / string indexing は 1.5-3.5g で Iterator interface と一緒に)。`for-in` は構文丸ごと未対応。新規 `examples/for_of_array.ts`(positive、number / boolean / string / class / interface / break / continue / nested / 空 / `let` rebind / array literal RHS の 17 行)、`examples/for_of_map_fail.ts`(Map RHS reject)、`examples/for_of_destructuring_fail.ts`(destructuring reject)、合計 33 ケース全 pass。決定ログは `docs/archive/implementation-log.md` 末尾。
    - [x] **1.5-3.5c** — `!` non-null assertion と `??` nullish coalescing の lowering。`inferType` / `emitExpression` にそれぞれ `ts.isNonNullExpression(expr)` 分岐と `ts.SyntaxKind.QuestionQuestionToken` 分岐を追加。`!` は operand を tmp に snapshot して sentinel slot を check(scalar = `topaz_opt_T.present`、class = `T *` NULL、iface = fat pointer `.data == NULL`)、失敗時は `fputs + abort`。`??` は同じ sentinel 上の short-circuit ternary で、scalar はチェーン用に RHS が `T | undefined` の場合は present branch を `__t` のまま yield(結果型 `T | undefined`)、T の場合は `__t.value`(結果型 T)を yield する分岐を入れた。class / iface は両ブランチが同じ pointer / fat pointer なので分岐不要。RHS は `emitWithExpected` 経由で class → iface coercion / 文字列リテラル → string widening が自動。no-op `!` / `??`(既に `T` 型に対して適用)は明示エラー(TS は warning だが Topaz は assertion / fallback の意味が消えるため厳格に止める)。新規 `examples/non_null_and_coalesce.ts`(scalar / class / iface の `Map.get` 経由 + 明示 `T | undefined` binding + class→iface coercion fallback + 二段チェーン + 関数中の `!` の 18 行)、`examples/non_null_non_optional_fail.ts` と `examples/coalesce_non_optional_fail.ts` で no-op reject、合計 36 ケース全 pass。決定ログは `docs/archive/implementation-log.md` 末尾。次は **1.5-3.5d (optional chaining `?.`)** → 1.5-3.5e (arrow + closure)→ 1.5-3.5f (`Array.map` 系)→ 1.5-3.5g (`Map.values()` + 最小 Iterator interface)。
  - [x] **1.5-4** — ヒープ管理。`string +` の連結結果 / `throw` した class instance / `Array` / `Map` / `Set` の slot buffer の leak を per-process arena で一気に回収。`runtime/runtime.h` 先頭に chunk-based bump allocator (`topaz_arena_chunk` 32 bytes header + payload 16-byte aligned、初期 chunk 64KB、大きい alloc は専用 chunk)を embed、`topaz_arena_alloc` / `_calloc` / `_realloc` の 3 API を提供。runtime 内の `malloc` / `calloc` / `realloc` / `free` 呼び出しを全て arena 経由に置換(`free(slots)` は単純削除)、codegen の class allocation も `topaz_arena_calloc` に。realloc は単純な alloc + memcpy(Array doubling / Map rehash の grow しか起きないため in-place 最適化は省略、amortized は O(1) のまま、peak memory は最大 +100%)。新規 `examples/arena_stress.ts` で Array 1000 push / class 1000 new / string 200 concat / Map 500 set を総当たり、29 ケース全 pass。Set の構造的等値は self-hosting で踏むまで保留(現状 reference identity で `src/` は通る想定)。BDW conservative GC は self-hosting の範囲では過剰、per-process arena で十分(Phase 2 の async-await で per-task arena に拡張する余地は残してある)。
  - [ ] **1.5-5** — generic method(`class C { f<U>(...) {} }`)/ generic interface。`class` 全体の monomorph と method 単独の monomorph が直交するので、`classMonomorphs` の構造を method 単位に拡張する必要あり。**`src/` では未使用なので self-hosting (1.5-6) の前提ではない**ため、1.5-6 の後ろに回しても良い。
  - [ ] **1.5-6** — self-hosting 通過。`src/*.ts` を Topaz 自身でコンパイルできる状態にする。**parser 戦略をここで確定**(`src/codegen.ts` が `import * as ts from "typescript"` で TS の AST API そのものを使っているため、(a) parser を自前で書き直す、(b) `typescript` を opaque FFI として扱う、(c) parser だけ Node で走らせて AST を JSON で渡す、の三択を実装作業の中で選ぶ)。途中で踏んだ未対応機能は 1.5-N に折り返してフィードバックループを回す。
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

- [x] **1.5-2 着手前に self-hosting の最小到達点を割り出す**。完了。結果は `docs/archive/self-hosting-inventory.md`。要点:
  - 1.5-N の順序は (1) `node:*` / typescript パッケージ依存(parser 戦略)を **1.5-6 まで遅延**、(2) **1.5-3.5 新設**(`for-of` / arrow / template literal / destructuring / optional chaining / `??` / `!` / spread + `Array.map` 系 / `Map.values` を集中投入)、(3) **1.5-3 で discriminated union narrowing と `T | undefined` narrowing を明示**、(4) **1.5-5 (generic method / generic interface) は src/ で未使用のため self-hosting の前提ブロッカーではない**(1.5-6 の後ろに回せる)、で確定。
  - `src/` を Topaz で通すには、合計で `for-of` 58 / arrow 22 / template literal 280 / non-null `!` 18 / access modifier 84 / `as Extract<T, U>` narrowing 5 / discriminated union(`TopazType`)1 中核 / `T | undefined` 14+ ヘルパ戻り値、を片付ける必要がある。
  - **parser 戦略の決断は 1.5-6 に集約**(`import * as ts from "typescript"` を: (a) 自前 parser に置換、(b) opaque FFI、(c) parser だけ Node で走らせて AST を JSON 受け渡し、の三択を実装作業の中で選ぶ)。1.5-2 〜 1.5-5 のスコープには含めない。
- [x] **1.5-2 完了** (相対パス specifier 限定、循環検出、宣言の topo flatten、`export` 修飾子受理、非 root の executable は明示エラー)。決定ログは `docs/archive/implementation-log.md` 末尾。
- [ ] **generic class の未対応領域の棚卸し**(`class Box<T> implements I` / type parameter constraint / default type parameter / generic class を Map / Set の key にする方向)。self-hosting で踏むものが 1 つでもあれば 1.5-N のいずれかに組み込む、踏まないなら Phase 2 に降ろす。src/ では generic class / generic function はユーザー定義 0 件のため、self-hosting からの逆流は今のところ無い。
- [ ] generic 関数の戻り値が `Array<T>` の場合の monomorph 収集を、generic 関数経路と非 generic 経路で確実に同じ slot へ流すパスをドキュメント化(現状は self-hosting で踏むまで顕在化しない領域)。
- [x] **1.5-3 着手前の準備**: `inferType` を TypedAST 層に切り出す前段として、現状の codegen 内の型推論経路を別ファイル/別 module に物理分割するかは 1.5-3 のキックオフ時に判断 → **分けない方針で 1.5-3a に着手**。3300 行に収まっており、union/optional 表現(1.5-3b)と flow narrowing 機構(1.5-3d)を入れる段階でも `Emitter` クラスの中で完結する見込み。物理分割は self-hosting 通過(1.5-6)後に「型検査器が `src/typecheck.ts` の独立 module になっている」レイアウトへ寄せる方が、parser 戦略確定後の境界を考えやすい。
- [x] **1.5-3a 完了** (strict field init、`verifyDefiniteFieldInit` で constructor body の top-level 代入のみ集める保守実装)。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3b 完了** (TopazType に `undefined` / `union` variant、`T | undefined` 限定で型表現 + assignability + `=== undefined` lowering + property access の reject)。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3d 完了** (1.5-3c より先に narrowing を入れる方を選択)。`Scope` に narrowing overlay を追加、`if (x !== undefined) { ... }` の then narrowing と `if (x === undefined) return; /* rest */` の early-exit narrowing を実装、`alwaysExits` で「必ず抜ける」を保守的に判定。`examples/optional_narrow.ts` で 10 行回帰。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3c 完了**。scalar | undefined を `topaz_opt_<scalar>` の sentinel struct (`{ present: bool, value: T }`)で表現、class | undefined は `T *` (NULL = undefined)、interface | undefined は fat pointer (`.data == NULL` = undefined) を流用。`TOPAZ_MAP_DEFINE` を 6 引数化して `_get` が opt 戻りになるよう変更、value kind ごとに opt_t / wrap / absent を渡す方式に統一。`Map.get` の `inferType` が `V | undefined` を返すので、narrowing(1.5-3d)で `if (x !== undefined)` を書かないと使えない。`examples/map_set_basic.ts` と `examples/map_set_class_iface.ts` を narrowing パターンに書き換え、新規 `examples/optional_map_get.ts` で scalar / class / iface V の Map.get を 25 ケース pass。決定ログは `docs/archive/implementation-log.md` 末尾。次は 1.5-3e (discriminated union narrowing)。
- [x] **1.5-3e 完了**。class union (`Circle | Square`) を `kind: "literal"` 共有 discriminator で同定して fat pointer `{ topaz_string kind; void *data; }` に lower。`emitWithExpected` で class → dunion 構築(compound literal)、`emitSwitchStatement` で `switch (<id>.<discriminator>)` パターンを検出して per-case `scope.narrow()`、identifier emit で narrowed dunion → 元 class へ cast (`(topaz_class_<C> *)(<id>).data`)。`tryMakeDiscriminatedUnion` が union node の variants から全 class が同一 string-literal field を持つかチェック。`Scope.narrow` は 1.5-3d で入れた overlay にそのまま乗せた。`examples/dunion_basic.ts` (positive) と `examples/dunion_field_access_fail.ts` (`s.radius` を narrow 前に触ったらエラー) を追加、26 ケース全て pass。決定ログは `docs/archive/implementation-log.md` 末尾。次は 1.5-3f (catch `unknown` narrowing)。
- [x] **1.5-3f 完了**。TopazType に `{ kind: "unknown" }` を追加、`cTypeName` は `void *`。catch binding の型注釈を optional 化(`catch (e)` も `catch (e: unknown)` も `T_UNKNOWN`、`: ClassName` は引き続き受理)。`instanceof` を binary operator として追加、RTTI は全 class struct 先頭の `const char *__topaz_class_tag` フィールド(constructor で per-class static `topaz_class_<C>_tag` のアドレスを書く)を `*((const char * const *)x) == &topaz_class_<C>_tag` で参照する形に lower (NULL guard 付き)。`extractNarrowing` を拡張して `<id> instanceof <Class>` の positive 分岐で unknown → class に narrow、identifier emit が `void *` から concrete class pointer へ cast。多態検出は既存の `inferType` 型一致チェックで実質カバー済みで追加コード無し。`examples/catch_unknown.ts` (positive、`catch (e: unknown)` / `catch (e)` 両方 + nested rewrap + 自明な class instanceof) と `examples/catch_unknown_unnarrowed_fail.ts` (narrow せず field 触ったらエラー) を追加、28 ケース全て pass。これで **Phase 1.5-3 全体が完了**。次は 1.5-3.5 (syntactic sugar 集中投入: `for-of` / arrow + closure / template literal / destructuring / optional chaining / `??` / `!` / spread / `Array.map` 系 / `Map.values()`) か 1.5-4 (per-process arena)。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-4 完了**。template literal 投入の前に arena を入れる方向を選択(template literal を `+` に lowering すると毎回 alloc が走るため、arena が無いと leak が peak memory に直結する)。`runtime/runtime.h` 先頭に chunk-based bump allocator (`topaz_arena_chunk` 32 bytes header + payload 16-byte aligned、初期 chunk 64KB、大きい alloc は専用 chunk) を embed、`topaz_arena_alloc` / `_calloc` / `_realloc` の 3 API を提供。runtime 内の malloc / calloc / realloc / free 呼び出しを全て arena 経由に置換(`topaz_string_concat`、Array `_new` & `_reserve`、Map `_new` & `_rehash`、Set `_new` & `_rehash`、Map / Set の `free(slots)` は単純削除)、codegen の class allocation (`topaz_class_<C>_new` の `calloc(1, sizeof(*self))`) を `topaz_arena_calloc` に置換、NULL guard も削除(arena は常に non-NULL 返却)。realloc は単純な alloc + memcpy(in-place 最適化は省略、Array doubling と Map rehash の grow しか出ないため amortized O(1)、peak は最大 +100%)。新規 `examples/arena_stress.ts` で Array 1000 push / class 1000 new / string 200 concat (~120KB、chunk 跨ぎ) / Map 500 set (rehash ~6 回) を 1 ファイルで総当たり、29 ケース全 pass。次は 1.5-3.5 (syntactic sugar 集中投入)。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3.5a 完了**。**template literal** を左結合 `topaz_string_concat` chain に lowering。`runtime/runtime.h` に `topaz_number_to_string` (既存 `topaz_emit_number_shortest` を arena 48-byte buf 書き出し版に refactor) と `topaz_boolean_to_string` (`"true"` / `"false"` の `static const char[]` 戻り) を追加、`topaz_console_log_number` も `topaz_number_to_string` 経由に統一して既存 `number_format` smoke が ToString の format 回帰として効くようにした。codegen 側で `ts.isTemplateExpression` を `emitExpression` / `inferType` の `isStringLiteral` 隣に追加、`emitStringLiteral` の signature を `TemplateHead` / `TemplateMiddle` / `TemplateTail` も受けるよう広げて escape ロジックを流用。substitution 型は number / boolean / string に限定(class / interface / array / map / set / unnarrowed `T | undefined` は明示エラー)、空フラグメントは skip するので `` `${name}` `` は concat 呼び出し 0 回まで畳む。`examples/template_literal.ts` で各 substitution 型 / 空フラグメント / narrow 後 / class field・method / `\t` escape / ループ内連続 concat の 20 行を網羅、`examples/template_literal_unsupported_fail.ts` で class instance 埋め込みエラーを fail 回帰、合計 30 success + fail ケース全 pass。**`double` は C キーワードなので example 内の関数名は `twice` に**(codegen 段の C 予約語衝突 sanitizer は 1.5-6 self-hosting で踏むまで保留)。次は arrow + closure と `for-of` を `Array.map` のために組で。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3.5b 完了**。**`for-of` over `Array<T>`** を index-based C for-loop へ lowering(`emitForOfStatement` を `emitForStatement` の直後に追加)。RHS の二重評価回避のため `topaz_array_<short> *__topaz_for_arr_N = <rhs>;` で snapshot、`for (size_t __topaz_for_idx_N = 0; __topaz_for_idx_N < __topaz_for_arr_N->len; __topaz_for_idx_N++)` で反復、body 先頭で `<elem> bindName = __topaz_for_arr_N->data[__topaz_for_idx_N];` を declare(`_at` ヘルパの bounds-check + NaN check は `i < len` の構造で不要、direct buffer 参照に切り替え)。binding は `const` / `let` の単一識別子のみ、destructuring・初期化子付き binding・複数宣言・`var`・`for await` は明示エラー、型注釈は elem と EXACT 一致を要求(class → interface coercion 等は意図的に通さない)。RHS が Map / Set / string の場合は hint 付きエラーで reject(`Map.values()` / Set iteration / string indexing は 1.5-3.5g で Iterator interface と一緒に)。`for-in` は構文丸ごと未対応(prototype 探索は JS 固有)。`recordArrayMonomorph(rhsType)` を for-of 経路でも呼び、`Array<Class>` / `Array<Iface>` monomorph が for-of だけで触れられた場合も typedef が emit される。`break` / `continue` / nested for-of は通常 for と同じ挙動(`checkContinueAllowed` が既に `ts.isForOfStatement` を受理)。新規 `examples/for_of_array.ts`(number / boolean / string / class(method 経由 mutation)/ interface(vtable dispatch)/ break / continue / nested / 空 / `let` rebind / array literal RHS の 17 行)、`examples/for_of_map_fail.ts`(Map RHS reject)、`examples/for_of_destructuring_fail.ts`(destructuring reject)、合計 33 ケース全 pass。**ループ変数の lifetime の宿題**: C ローカルは iteration ごとに再代入するだけ(per-iter 再 alloc しない)なので、1.5-3.5e で closure を入れた時に「ループ内 arrow が全部最後の値を見る」問題が出る。closure 着地時に再評価する。決定ログは `docs/archive/implementation-log.md` 末尾。
- [x] **1.5-3.5c 完了**。**`!` non-null assertion** と **`??` nullish coalescing** を `T | undefined` 専用の lowering として投入。`inferType` / `emitExpression` に `ts.isNonNullExpression(expr)` 分岐と `ts.SyntaxKind.QuestionQuestionToken` 分岐をそれぞれ追加。`!` は operand を tmp に snapshot して sentinel slot を check(scalar = `topaz_opt_T.present`、class = `T *` NULL、iface = fat pointer `.data == NULL`)、失敗時は `fputs("topaz: non-null assertion failed\n", stderr); abort();`(JS の `TypeError` とは divergence、stack trace 無し)。`??` は同じ sentinel 上の short-circuit ternary に lower。**チェーン**: `a ?? b ?? c` の中間結果を `T | undefined` のまま流すために、scalar の場合は RHS の型に応じて present branch を `__t` のまま yield(結果型 T | undefined)か `__t.value`(結果型 T)に切り替える分岐を入れた。class / iface は両ブランチが同じ pointer / fat pointer 表現なので分岐不要。RHS は `emitWithExpected` 経由なので class → iface coercion と string-literal → string widening が自動。**no-op は明示エラー**: 既に `T` 型の値に対する `!` / `??` は TS では warning のみだが、Topaz は assertion / fallback の意味が消えるため厳格に止める。新規 `examples/non_null_and_coalesce.ts`(scalar / class / iface の `Map.get` 経由 + 明示 `T | undefined` binding + class→iface coercion fallback + 二段チェーン + 関数中の `!` の 18 行)、`examples/non_null_non_optional_fail.ts` と `examples/coalesce_non_optional_fail.ts` で no-op reject、合計 36 ケース全 pass。`!!` (double bang)・`?.` (optional chaining)・`??=` (logical nullish assignment) は未対応のまま。決定ログは `docs/archive/implementation-log.md` 末尾。次は 1.5-3.5d (optional chaining `?.`)。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
