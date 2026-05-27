# TS AOT ネイティブコンパイラ 設計メモ

TypeScript 構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で **真の AOT ネイティブコンパイル** を狙うプロジェクトの設計検討資料。Matz の Ruby AOT コンパイラ [spinel](https://github.com/matz/spinel) を直接の参考にする。

現状の仕様(設計上の固定点・既知の divergence・実装されたサンプル)は `CLAUDE.md` を参照。新規 Phase の決定ログは `docs/adr/NNNN-<slug>.md` に 1 ファイル = 1 決定で追記する運用(テンプレは `docs/adr/0000-template.md`)。Phase 1.5-6 prep #15 までの決定ログは `docs/archive/implementation-log.md`(凍結 archive)を参照。

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
  - [x] **1.5-3.5** — syntactic sugar 集中投入(`for-of` / arrow + closure / template literal / `?.` / `??` / `!` / spread / Array higher-order / Map.values / Iterator / destructuring の entries / spread)。10 サブステップ(3.5a〜3.5h-spread)完了。決定ログは `docs/archive/implementation-log.md`。
  - [x] **1.5-4** — ヒープ管理。chunk-based per-process arena(`topaz_arena_chunk` 32B header + 16B aligned payload、初期 64KB)に統一、runtime / codegen の全 alloc を arena 経由に置換。realloc は alloc + memcpy(amortized O(1)、peak 最大 +100%)。決定ログは `docs/archive/implementation-log.md`。
  - [ ] **1.5-5** — generic method(`class C { f<U>(...) {} }`)/ generic interface。`class` 全体の monomorph と method 単独の monomorph が直交するので、`classMonomorphs` の構造を method 単位に拡張する必要あり。**`src/` では未使用なので self-hosting (1.5-6) の前提ではない**ため、1.5-6 の後ろに回しても良い。
  - [x] **1.5-6 prep** — self-hosting 着手前の地ならし、16 サブステップ完了(access modifier no-op / void return / field initializer + auto-ctor / type alias / object literal & anonymous class / object destructuring / optional parameter & field / Array<dunion> / module-level const hoist / string method (charCodeAt + slice) / dunion-context object literal / String.fromCharCode / node:fs.readFileSync / recursive type alias (SCC + 2-phase fill) / `T | undefined` for T = dunion / global parseInt + parseFloat)。決定ログは #1〜#15 が `docs/archive/implementation-log.md`、#16 以降が `docs/adr/`(parseInt/parseFloat = `0003`)。次 blocker は `topaz_parser.ts:90` の dunion 共通フィールドアクセス。
  - [ ] **1.5-6** — self-hosting 通過。`src/*.ts` を Topaz 自身でコンパイルできる状態にする。**parser 戦略は (a) 自前 TS parser** に確定(最終構成のシンプルさ優先、(b) opaque FFI と (c) JSON bridge は永久 Node 依存になるため却下、`§3.3` の「コンパイラが自分自身をコンパイルできる範囲がサブセットの下限」と最も整合)。最終構成は **Node 依存ゼロのネイティブ AOT バイナリ**、7 ファイル(`ast.ts` / `lexer.ts` / `parser.ts` / `loader.ts` / `codegen.ts` / `runtime_helpers.ts` / `cli.ts`)+ `runtime/runtime.h` 拡張(~1000 行)。**重要な設計判断**: SyntaxKind は string literal discriminator + dunion(1.5-3e narrowing が直接効く、enum 解禁しない)/ regex literal は未対応に固定(`/` は常に演算子、`isAnonClassName` を書き換え)/ destructuring は通さず anon class + 個別 field access に書き換え(サブセット最小化)/ ASI は最小限(`return` / `throw` / `break` / `continue` の直後改行のみ)/ 生成 C の bit-for-bit 比較を主指標(cc バージョン依存避け)/ AST 型は Node 製 stage1 と Topaz 製 stage2 で共有。10 サブステップで進める:
    - [ ] **1.5-6a** — lexer 単体(`src/lexer.ts` 新規、~600-800 行)。byte stream → Array<Token> を生成。token kind は dunion(ident / number / string / template_{head,middle,tail,full} / punct / keyword / newline / eof)、template literal は mode stack で処理、`newline` token を ASI 用に明示 emit、position tracking、regex literal は未対応に固定。Node 製 lex(tsc から token を取り出す薄ラッパ)との出力 diff で検証。
    - [ ] **1.5-6b** — parser core(expression / literal)。`src/parser.ts` を Topaz サブセット parser に書き直し、Pratt-style precedence climber で expression。AST 型は `src/ast.ts` に集約。arrow vs paren は token cursor の save/restore で backtrack。到達点: `examples/fib.ts` の AST を完全に組み上げ、tsc 製と JSON diff で一致。
    - [ ] **1.5-6c** — parser statement(if / for / for-of / while / do / switch / return / throw / try / break / continue / block / var)+ 制御フロー。examples/* の statement 系ケースが parser を通る。
    - [ ] **1.5-6d** — parser declaration(class / interface / function / type alias / import、generic class / generic function 含む)。examples/* 全体の AST 構築が tsc 製と一致するところまで。
    - [ ] **1.5-6e** — AST 型統合(Node 製 codegen の入力切替、**最大の safety net**)。`src/ast.ts` に `Topaz.Module` 型を確定、Node 製 stage1 のまま `convertFromTsc(sf: ts.SourceFile): Topaz.Module` ブリッジを置く。`src/codegen.ts` の入力を `ts.SourceFile` から `Topaz.Module` に切替、`tests/smoke.sh` が pass する = codegen 挙動不変を確認。ここまで通れば parser 置き換えは入力型同一なので Equivalence だけ確認すれば良い。
    - [ ] **1.5-6f** — runtime / stdlib 拡張。`runtime/runtime.h` に fs(read/write/exists/mkdirp)・path(dirname/basename/join/resolve/extname)・process(argv/exit/console_error)・spawn(cc 起動)・number_parse(strtod)・string method(charCodeAt/slice/fromCharCode/startsWith/endsWith/indexOf)を追加。header-only 維持、libc + libm のみ依存、`#ifdef TOPAZ_NO_IO` でライブラリ用途も残す。lexer の char_code_at ホットパスのため `static inline` または raw `topaz_string.data` access の特殊 builtin を検討。
    - [ ] **1.5-6g** — loader Topaz 化。`src/loader.ts` を Topaz サブセットで書き直し、DFS + 循環検出 + topological flatten は現状ロジック保持、destructuring を使わず anon class + 個別 field access に書き換え、runtime/path helper を使う。
    - [ ] **1.5-6h** — cli Topaz 化。`src/cli.ts` を Topaz サブセットで書き直し、argv parse 手書き(`-o` / `--emit-c-only` / `-h`)、loader → codegen → cc 呼び出し、runtime の spawn で cc 起動。
    - [ ] **1.5-6i** — stage2 bootstrap。stage1 (Node 製) で `src/` 全体を食わせて stage2 native binary 生成、stage2 が `examples/*` 全 smoke を pass。途中で踏んだ未対応構文は anon class 書き換えで回避、回避不能なら 1.5-N サブステップで通す。
    - [ ] **1.5-6j** — bit-for-bit fixed point。`./topaz_stage2 src/cli.ts -o topaz_stage3` && 生成 C(`--emit-c-only`)の `diff -u` で identical 確認、divergence あれば原因特定して詰める。`package.json` / `node_modules/` / `dist/` 削除可否のチェックで **Node 依存ゼロ宣言**。
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

- [x] **1.5-2 完了** — 相対パス specifier 限定、循環検出、宣言の topo flatten、`export` 修飾子受理、非 root の executable は明示エラー。事前棚卸し結果は `docs/archive/self-hosting-inventory.md`、決定ログは `docs/archive/implementation-log.md`。
- [x] **1.5-3 (a〜f) 完了** — strict field init / `T | undefined` の型表現 + flow narrowing + `Map.get` の opt 戻り / discriminated union narrowing / catch `unknown` narrowing + `instanceof`。決定ログは `docs/archive/implementation-log.md`。
- [x] **1.5-4 完了** — chunk-based per-process arena。決定ログは `docs/archive/implementation-log.md`。
- [x] **1.5-3.5 (a〜h-spread) 完了** — template literal / for-of over Array / `!` / `??` / `?.` / arrow + closure / Array higher-order 5 種 / for-of over Set & Map.{values,keys} / Iterator<T> / Array<fn> storage / for-of over .entries() / array literal spread。決定ログは `docs/archive/implementation-log.md`。
- [ ] **generic class の未対応領域の棚卸し**(`class Box<T> implements I` / type parameter constraint / default type parameter / generic class を Map / Set の key にする方向)。self-hosting で踏むものが 1 つでもあれば 1.5-N のいずれかに組み込む、踏まないなら Phase 2 に降ろす。src/ では generic class / generic function はユーザー定義 0 件のため、self-hosting からの逆流は今のところ無い。
- [ ] generic 関数の戻り値が `Array<T>` の場合の monomorph 収集を、generic 関数経路と非 generic 経路で確実に同じ slot へ流すパスをドキュメント化(現状は self-hosting で踏むまで顕在化しない領域)。
- [ ] **codegen 二重括弧の `-Wparentheses-equality` 警告除去**。汎用 binary emit (`src/codegen.ts:5664`) が常に `(${lhs} ${op} ${rhs})` で包むため、`===` / `!==` 比較を `if` / `while` / `for` の条件に直接書くと `if ((tag == 1.0))` となり cc が `-Wparentheses-equality` を出す(実害なし、既存 `dunion_optional` 等で発生)。self-hosting の pass criterion「emit C が `cc -Wall -Wextra` で警告なし」に必要。条件 emit 側で外側括弧を 1 枚剥がすか、equality を非括弧で吐く分岐を入れる。dev experience / codegen 品質改善カテゴリ。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
