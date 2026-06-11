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
- [x] **1.5 self-hosting path** — self-hosting に必要な 1.5-N サブフェーズは完了。詳細な棚卸し根拠は `docs/archive/self-hosting-inventory.md`、最終 gate は `pnpm run test:selfhost`。self-hosting に不要だった generic method / generic interface / `finally` 周辺は post-selfhost backlog として Phase 2 側で扱う。
  - [x] **1.5-3** — 全プログラム型検証層 + **discriminated union narrowing** + **`T \| undefined` narrowing** + strict field init + catch `unknown` narrowing。1.5-3a〜f まで完了。式単位の `inferType` を TypedAST 層に切り出し、多態(同じ識別子が異なる型で使われる)を検出してエラー、`switch (t.kind)` で discriminated union を狭める narrowing(`TopazType` 自身がこの形なので self-hosting の中核)、ヘルパ関数戻り値の `T | undefined` を狭める narrowing、`Map.get` の戻り値を `V | undefined` に変えて narrowing 必須化、`--strictPropertyInitialization` 相当の class field 未初期化検査、catch binding の `unknown` narrowing(これが入ると `catch (e: ClassName)` の型注釈を optional にできる)。
    - [x] **1.5-3a** — strict field init。`collectClassMembers` の末尾で `verifyDefiniteFieldInit(info)` を呼び、ctor body の top-level の `this.f = ...` 代入を集めて全 field がカバーされているかチェック。制御フロー (if/for/while/try) 内の代入は保守的に「無代入」扱い(1.5-3d の flow narrowing 基盤投入時に flow-sensitive 版に置き換える)。generic class の monomorph (`infoOverride`) は同じ ctor decl を見るので skip。`examples/strict_field_init_fail.ts` を負例として `run_fail_case` で回帰、既存 17 ケースは全て pass。
    - [x] **1.5-3b** — TopazType に union/optional variant 追加。`{ kind: "undefined" }` と `{ kind: "union", variants }` を導入(現状は `T | undefined` 限定、scalar | undefined は 1.5-3c で開ける)。`makeUnion` で flatten + dedup + canonical sort、`typeEq` は sorted variants の positional 比較、`cTypeName` は reference T → `T *` (NULL が undefined sentinel)・interface T → `topaz_iface_<I>` (`.data == NULL` が sentinel) で union 全体を inner の C 表現に collapse、scalar | undefined はエラーで reject。`emitWithExpected` が `undefined` 識別子を NULL / fat pointer compound literal に lower、`applyCoercion` は T → `T | undefined` widening を no-op で通す。`===` / `!==` は `typesOverlap` ベースに変更し、片方が `undefined` の場合だけ専用 lowering (interface は `.data` 比較)。narrowing 未実装なので union 値の field 参照・method call・`console.log` は明示エラーで reject (1.5-3d で narrowing が入るまで)。`examples/optional_basic.ts` で positive、`examples/optional_field_access_fail.ts` で negative 回帰。
    - [x] **1.5-3c** — Map.get の戻り値を V | undefined 化。`runtime/runtime.h` に scalar の sentinel struct `topaz_opt_<scalar>` (`{ present, value }`) と `topaz_opt_wrap_*` / `topaz_opt_absent_*` / passthrough マクロを追加、`TOPAZ_MAP_DEFINE` に `(opt_t, opt_wrap, opt_absent)` の 3 引数を追加して `_get` を opt 戻りに変更。codegen 側で `cTypeName` に scalar | undefined → `topaz_opt_<scalar>` 分岐、identifier emit で narrowed scalar opt のとき `.value` 経由、`emitMapMonomorphMacro` を 6 引数化(class V は passthrough + NULL、iface V は passthrough + 専用 `topaz_iface_<I>_absent` マクロ)、`emitUndefinedLiteral` / `applyCoercion` / `===` undefined lowering に scalar opt 対応を追加、`inferType` の `Map.get` を `makeUnion([V, T_UNDEFINED])` に変更。1.5-3d の narrowing 機構経由で `if (x !== undefined)` で value として使える。`examples/map_set_basic.ts` と `examples/map_set_class_iface.ts` を narrowing パターンに書き換え、新規 `examples/optional_map_get.ts` を追加。25 ケース全て pass。
    - [x] **1.5-3d** — `T | undefined` の flow-sensitive narrowing。`Scope` に `narrowings` overlay を 1 層追加(`stack` と並走させて `push`/`pop` 同期、`lookup` が narrowing を優先)、`extractNarrowing(cond, polarity)` が `x === undefined` / `x !== undefined`(左右どちらでも、変数側は単一識別子)を `{ name, type }` に解釈。`IfStatement` ハンドラが then / else 両方の polarity で narrowing を抽出して `emitStatementAsBlock` の optional 引数で渡し、ブランチ内 scope に install。`emitBlock` は各 statement の後で `applyCarryNarrowing` を呼び、「then が必ず exit する `if`」「else が必ず exit する `if`」を見つけたら以降の statement に inverted narrowing を残す(`alwaysExits` は return/throw/break/continue/block 末尾再帰/両 branch exit する if を保守的に判定)。`examples/optional_narrow.ts` で then/else narrowing、early-return narrowing、interface narrowing、throw 経由の cleanup などを 10 行カバー。**未対応**: narrowed scope 内での widening 再代入(narrow 型に対する型チェックでエラー)、compound condition (`&&` / `||`)、type guard function、`instanceof`、`in` operator、property の narrowing(1.5-3e/1.5-3f で必要に応じて追加)。1.5-3a の definite-assignment 検査の flow-sensitive 化は次の作業候補だが、現状の保守実装で src/ / examples すべて通っているため、self-hosting で踏むまで延期。
    - [x] **1.5-3e** — discriminated union narrowing。class union (`Circle | Square`) を `{ kind: "circle", radius } | { kind: "square", side }` の string literal discriminator で同定し、`switch (s.kind) { case "circle": /* s narrows to Circle */ }` で各 case 内 narrow。C 表現は fat pointer `topaz_dunion_<sorted>_or_<...> = { topaz_string kind; void *data; }`、`emitWithExpected` で class → dunion 構築、identifier emit で narrowed dunion → 元 class へ cast。`examples/dunion_basic.ts` で positive、`examples/dunion_field_access_fail.ts` で「narrow せず field 参照したらエラー」を回帰。
    - [x] **1.5-3f** — 多態検出 + catch binding の `unknown` narrowing。TopazType に `{ kind: "unknown" }` を追加、`typeFromAnnotation` で `UnknownKeyword` を受理、`cTypeName` は `void *`。catch binding の型注釈を optional 化(`: unknown` または無し → `T_UNKNOWN`)、`: ClassName` は引き続き受理。`instanceof ClassName` を binary operator として追加、AST 上で右辺は宣言済み class 名識別子限定。RTTI は全 class struct の先頭に `const char *__topaz_class_tag` フィールドを追加(constructor で per-class static sentinel `topaz_class_<C>_tag` のアドレスを書く)、`x instanceof C` を `*((const char * const *)x) == &topaz_class_<C>_tag` に lower (NULL guard 付き stmt expr)。`extractNarrowing` を拡張して `<id> instanceof <Class>` の positive 分岐で `unknown` → 当該 class に narrow。narrowing 後の identifier emit は `void *` → `topaz_class_<C> *` に cast。多態検出は既存の `inferType` 型一致チェックで実質的にカバー済み(同 identifier の異型再代入は assignability check で reject)、本サブフェーズで追加コードは無し。`examples/catch_unknown.ts` で positive、`examples/catch_unknown_unnarrowed_fail.ts` で「narrow せず field 参照したらエラー」を回帰。これで 1.5-3 完了。
  - [x] **1.5-3.5** — syntactic sugar 集中投入(`for-of` / arrow + closure / template literal / `?.` / `??` / `!` / spread / Array higher-order / Map.values / Iterator / destructuring の entries / spread)。10 サブステップ(3.5a〜3.5h-spread)完了。決定ログは `docs/archive/implementation-log.md`。
  - [x] **1.5-4** — ヒープ管理。chunk-based per-process arena(`topaz_arena_chunk` 32B header + 16B aligned payload、初期 64KB)に統一、runtime / codegen の全 alloc を arena 経由に置換。realloc は alloc + memcpy(amortized O(1)、peak 最大 +100%)。決定ログは `docs/archive/implementation-log.md`。
  - [ ] **1.5-5 (post-selfhost backlog)** — generic method(`class C { f<U>(...) {} }`)/ generic interface。`class` 全体の monomorph と method 単独の monomorph が直交するので、`classMonomorphs` の構造を method 単位に拡張する必要あり。**`src/` では未使用で self-hosting (1.5-6) の前提ではなかった**ため、Phase 2 の generic audit へ降ろす。
  - [x] **1.5-6 prep** — self-hosting 着手前の地ならし、38 サブステップ完了(access modifier no-op / void return / field initializer + auto-ctor / type alias / object literal & anonymous class / object destructuring / optional parameter & field / Array<dunion> / module-level const hoist / string method (charCodeAt + slice) / dunion-context object literal / String.fromCharCode / node:fs.readFileSync / recursive type alias (SCC + 2-phase fill) / `T | undefined` for T = dunion / global parseInt + parseFloat / equality without redundant outer parens / dunion 共通フィールドの narrow なし read / compound condition narrowing (`&&` / `||` の右オペランド) / compound 条件の early-exit carry narrowing (De Morgan 分解) / dunion 初期化子 narrowing (`const x: U = <variant>`) / object literal property shorthand (`{ x }` → `{ x: x }`) / dunion → より広い dunion への widening (部分集合 variant) / condition 省略形 `for (;;)` 無限ループ / conditional (ternary) `cond ? a : b`(branch 別 narrowing + 共通 target 寄せ)/ `dunion | undefined` を expected とする object literal(undefined を剥がして inner で emit → applyCoercion で widen)/ IIFE `(() => {...})()` の contextual return type 推論(expected を arrow 戻り型として供給)/ closure 越えの dunion narrowing 伝播(capture 解析の `lookupAcrossBarrier` を narrowing-aware 化、ternary arm / if 内で構築した IIFE が外側 dunion の narrowing を捕捉)/ `node:fs.existsSync(path): boolean` / `node:path.dirname` + `resolve` / `node:fs.writeFileSync(path, content): void` / `node:fs.mkdirSync(path, { recursive: true }): void` / `node:path.basename(path, ext?): string` / `node:path.extname(path): string` / `node:path.join(...segments): string` / `node:child_process.execFileSync(cmd, args, { stdio: "inherit" }): void` / `node:url.fileURLToPath(url): string` + `import.meta.url` / `process.argv` + `process.exit(code?)` + `process.{stdout,stderr}.write(s)` + `console.error`)。決定ログは #1〜#15 が `docs/archive/implementation-log.md`、#16 以降が `docs/adr/`(parseInt/parseFloat = `0003`、equality = `0004`、dunion 共通フィールド = `0005`、compound 右オペランド narrowing = `0006`、compound carry narrowing = `0007`、dunion 初期化子 narrowing = `0008`、object literal shorthand = `0009`、dunion widening = `0010`、`for (;;)` = `0011`、ternary = `0012`、dunion-optional object literal = `0013`、try body 内 return = `0014`、IIFE contextual return = `0015`、closure narrowing 伝播 = `0016`、node:fs.existsSync = `0017`、node:path.dirname/resolve = `0018`、node:fs.writeFileSync = `0019`、node:fs.mkdirSync = `0020`、node:path.basename = `0021`、node:path.extname = `0022`、node:path.join = `0023`、node:child_process.execFileSync = `0024`、node:url.fileURLToPath + import.meta.url = `0025`、process/console builtin = `0026`)。prep 終了時点では `codegen.ts` / `loader.ts` / `cli.ts` / parser bridge 周辺が 1.5-6e〜h の Topaz-subset rewrite 対象だったが、これらは 1.5-6 本編で解消済み。
  - [x] **1.5-6** — self-hosting 通過。`src/*.ts` を Topaz 自身でコンパイルできる状態にする。**parser 戦略は (a) 自前 TS parser** に確定(最終構成のシンプルさ優先、(b) opaque FFI と (c) JSON bridge は永久 Node 依存になるため却下、`§3.3` の「コンパイラが自分自身をコンパイルできる範囲がサブセットの下限」と最も整合)。生成された native compiler path は **Node 依存ゼロの AOT バイナリ**で、コアは `ast.ts` / `lexer.ts` / `topaz_parser.ts` / `loader.ts` / `codegen.ts` / `cli.ts` + `runtime/runtime.h`。source repo には development / bootstrap harness として `parser.ts`(tsc parser bridge) / `convert_from_tsc.ts` / `parser_check.ts` / `pnpm` / `tsc` を残す。**重要な設計判断**: SyntaxKind は string literal discriminator + dunion(1.5-3e narrowing が直接効く、enum 解禁しない)/ regex literal は未対応に固定(`/` は常に演算子、`isAnonClassName` を書き換え)/ destructuring は通さず anon class + 個別 field access に書き換え(サブセット最小化)/ ASI は最小限(`return` / `throw` / `break` / `continue` の直後改行のみ)/ 生成 C の bit-for-bit 比較を主指標(cc バージョン依存避け)/ AST 型は Node 製 bootstrap と Topaz 製 self-host compiler で共有。10 サブステップ完了:
    - [x] **1.5-6a** — lexer 単体。`src/lexer.ts` で byte stream → `Array<Token>` を生成。token kind は dunion(ident / number / string / template / punct / keyword / newline / eof)、`newline` token を ASI 用に明示 emit、position tracking、regex literal は未対応に固定。CLI の `--lex-only` と parser 入力で継続回帰。
    - [x] **1.5-6b** — parser core(expression / literal)。`src/topaz_parser.ts` に Topaz サブセット parser を実装、precedence climbing で expression を処理。AST 型は `src/ast.ts` に集約し、arrow vs paren は token cursor の save/restore で backtrack。
    - [x] **1.5-6c** — parser statement(if / for / for-of / while / do / switch / return / throw / try / break / continue / block / var)+ 制御フロー。`examples/*` の statement 系ケースは Topaz parser 経由で smoke gate が通る。
    - [x] **1.5-6d** — parser declaration(class / interface / function / type alias / import、generic class / generic function 含む)。module graph 全体を `SourceModule` に組み上げ、既存 codegen の AST 入力へ接続。
    - [x] **1.5-6e** — AST 型統合(Node 製 codegen の入力切替、**最大の safety net**)。`src/ast.ts` に `Topaz.Module` 型を確定、Node 製 bootstrap compiler のまま `convertFromTsc(sf: ts.SourceFile): Topaz.Module` ブリッジを置く。`src/codegen.ts` の入力を `ts.SourceFile` から `Topaz.Module` に切替、`tests/smoke.sh` が pass する = codegen 挙動不変を確認。ここまで通れば parser 置き換えは入力型同一なので Equivalence だけ確認すれば良い。**完了**(6e-1 型 ADR`0027` / 6e-2 式+文+推論 SCC `0028` / 6e-3 宣言+Emitter 状態 `0029` ※番号は git log 参照 / 6e-4 エントリ倒し + tsc import 全除去 `0031`)。codegen.ts は `typescript` を一切 import せず、`convertFromTsc` ブリッジは cli.ts に存在。エラー位置は `SourceModule.lineStarts` + `posToLineCol` で tsc 非依存にバイト一致維持。
    - [x] **1.5-6f** — runtime / stdlib 拡張。`runtime/runtime.h` に self-hosting で必要な fs(read/write/exists/mkdirp)・path(dirname/basename/join/resolve/extname)・process(argv/exit/console_error)・spawn(cc 起動)・number_parse(strtod)・string method(charCodeAt/slice/fromCharCode/startsWith/endsWith/indexOf)を追加。header-only 維持、libc + libm のみ依存。
    - [x] **1.5-6g** — loader Topaz 化。`src/loader.ts` は production loading で `src/topaz_parser.ts` を使い、DFS + 循環検出 + topological flatten は既存ロジックを保持。loader が module-specifier validation、codegen が non-root executable statement policy を担当する分担に整理。
    - [x] **1.5-6h** — cli Topaz 化。`src/cli.ts` は手書き argv parse(`-o` / `--output` / `--emit-c-only` / `--lex-only` / `--parse-only` / `-h`)、loader → codegen → cc 呼び出しに整理。self-hosted binary では JSON dump tooling を切り、native compiler path を優先。
    - [x] **1.5-6i** — self-host bootstrap。Node 製 compiler で `src/cli.ts` を C に emit して `build/topaz_bootstrap` を作り、その bootstrap topaz で再度 `src/cli.ts` を C に emit して `build/topaz_selfhost` を作る bootstrap ladder を `tests/selfhost_fixed_point.sh` / `pnpm run test:selfhost` に固定。`build/topaz_selfhost` が `examples/fib.ts` を native binary にして `5702887` を出力し、さらに `src/cli.ts` の C emit (`build/topaz_fixedpoint.c`) に成功することを milestone gate とする。default `pnpm test` には入れず、日常 smoke と高コスト self-host gate を分離。
    - [x] **1.5-6j** — bit-for-bit fixed point。`pnpm run test:selfhost` が `build/topaz_selfhost.c`(self-host compiler C) と `build/topaz_fixedpoint.c`(self-host compiler が再 emit した compiler C) の `diff -u` を gate 化し、さらに fixed-point C から最終成果物 `build/topaz` を生成して `examples/fib.ts` をビルド・実行し `5702887` を確認する。これで self-hosting 1.5-6 のクリティカルパスは完了。**Node 依存ゼロ宣言の範囲**は生成されたネイティブ AOT compiler binary と runtime path であり、source repo の development harness (`pnpm` / `tsc` / `tests`) は開発・bootstrap 用に残す。
  - [ ] **1.5-X (post-selfhost backlog)** — no-catch `try/finally` は ADR `0292` で着地済み、try body 内 `return` の cleanup dispatch は ADR `0320` で着地済み、`try/catch/finally` normal/throw dispatch は ADR `0321` で着地済み。残りは `return` from catch+finally / `return` from finally body / nested active finally return / `break` / `continue` を `finally` cleanup へ dispatch する lowering。self-hosting では不要だったため Phase 2.3c〜d へ持ち越す。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`§3.3`)であることを忘れない。

### Phase 2: 実用性

Phase 2 は「self-hosting できる」から「実用的に配れる / 測れる」へ進む段階。大きな runtime 機能へ入る前に、固定点 gate を壊さず性能・警告・配布単位を観測できる足場を先に置く。

- [x] **2.0 baseline hygiene** — `pnpm run build` / `pnpm test` / `pnpm run test:selfhost` を Phase 2 の開始基準として再確認。fixed-point gate は通過し、generated full-compiler C の warning inventory は bootstrap/self-host/fixed-point の各 compiler C で同一(46 `-Wreturn-type` / 38 `-Wunused-parameter` / 1 `-Wunused-variable` / 1 `-Wunused-function`)。決定ログは `docs/adr/0311-phase2-baseline-hygiene.md`。
- [x] **2.1 benchmark suite** — `pnpm bench` を追加し、compiler 自体(`src/cli.ts` emit/compile)、`examples/fib.ts` build/run、runtime hot paths(number/string/container)を best/median ms で測る最小ベンチを固定。`TOPAZ_BENCH_RUNS` で run 数を変更可能。決定ログは `docs/adr/0312-minimal-benchmark-suite.md`。
- [x] **2.2a stdlib surface design** — self-hosting 用の `node:*` shortcut は compiler 互換として残し、公開 Topaz stdlib の方向を `std/fs` / `std/path` / `std/process` に分ける方針として固定。`node:child_process` / `node:url` / `import.meta.url` は初期 public stdlib から外し、`std/process` の具体的 import 名は未決。決定ログは `docs/adr/0313-stdlib-surface-design.md`。
- [x] **2.2b stdlib aliases** — `std/path` を `node:path` と同じ named import set(`dirname` / `resolve` / `basename` / `extname` / `join`)として loader allowlist に追加。codegen / runtime は既存 call-site shortcut を再利用し、既存 `node:*` import は self-host/compiler 互換として残す。決定ログは `docs/adr/0314-std-path-alias.md`。
- [x] **2.2c process stdlib design** — `std/process` の public API 名を named import の `argv` / `exit` / `writeStdout` / `writeStderr` / `writeError` として固定。既存の `process.argv` / `process.exit` / `process.stdout.write` / `process.stderr.write` / `console.error` は self-host/compiler 互換の synthetic/global support として残す。決定ログは `docs/adr/0315-std-process-api-names.md`。
- [x] **2.3a post-selfhost backlog audit** — self-host probe は `node dist/cli.js src/cli.ts --emit-c-only -o build/topaz_bootstrap` で通っており、緊急 blocker ではなく再現可能な実用 gap 順に進める。no-catch `try/finally` は ADR `0292` で着地済みのため、残りを 2.3b〜d に分割。決定ログは `docs/adr/0316-post-selfhost-backlog-audit.md`。
- [x] **2.3b generic function Array<T> monomorph sample** — flat `Array<T>` は既存 coverage で通っていたが、generic 関数が `Array<Array<T>>` を返す経路で nested array element tag / monomorph が欠けていたため、array element array だけを解禁。`Array<Array<number>>` と `Array<Array<Cell>>` の回帰は `examples/array_nested.ts` / ADR `0317`。
- [x] **2.3c generic method/interface design** — generic method / generic interface は ADR `0318` で staged に分割。2.3c-1 は direct class receiver の generic method monomorph、2.3c-2 は generic interface frontend / realized interface shape、2.3c-3 は realized interface vtable integration。generic interface methods と generic classes implementing interfaces は別設計へ残す。
- [x] **2.3d try/finally cleanup dispatch design** — ADR `0319` で `normal` / `throw` / `return` / `break` / `continue` を明示的な cleanup reason として扱う dispatch model を固定。実装は no-catch `try/finally` return、`try/catch/finally` normal/throw、break/continue cleanup labels の順に分割する。
- [x] **2.3d-1 return through no-catch try/finally** — no-catch `try/finally` の try body からの `return` を ADR `0320` の cleanup dispatch 経由で通す。finally body からの `return`、nested active finally return、`break` / `continue`、`try/catch/finally` は引き続き未対応として残す。
- [x] **2.3d-2 try/catch/finally normal/throw dispatch** — `try { ... } catch (...) { ... } finally { ... }` の normal completion と throw propagation を ADR `0321` の cleanup dispatch に接続した。catch body の throw も finally 実行後に伝播する。`return` through catch+finally、finally body return、nested active finally return、`break` / `continue` cleanup labels は引き続き未対応として残す。
- [x] **2.3d-3 break/continue through cleanup labels** — loop/switch context に明示的な break/continue label target を持たせ、no-catch `try/finally` protected region からの `break` / `continue` を active cleanup context 経由で dispatch する。`continue` inside `switch` と `try/catch/finally` の break/continue、nested active finally break/continue は引き続き未対応として残す。ADR `0322`。
- [x] **2.4a bigint staged design** — `bigint` は `number` と別の primitive value family として扱い、`int64` 仮実装ではなく arena 確保の immutable arbitrary-precision object として段階導入する。初期 surface と deferred surface は ADR `0323`。
- [x] **2.4b bigint frontend/type skeleton** — `bigint` 型注釈、bigint literal AST node または等価表現、decimal `123n` literal を受理する。最初の pass で hex/bin/octal literal を入れない場合は、非 decimal bigint literal を clear diagnostic で reject する。ADR `0324`。
- [x] **2.4c bigint arithmetic/comparison runtime** — binary `+` / `-` / `*`、unary `-`、`<` / `<=` / `>` / `>=`、`===` / `!==`、`console.log` と template literal stringification を最初の runtime/codegen surface とする。`/` / `%`、bitwise / shifts、`BigInt()`、`.toString()`、hex/bin/octal literal、Array/Map/Set 内 bigint、hashing、parse/format performance は後続設計へ回す。ADR `0325`。
- [x] **2.4d regexp design** — 最初の surface は regexp literal `/pattern/`、`new RegExp("pattern")`、`RegExp.prototype.test(input: string): boolean` に絞り、flags / match 系 API / captures / unicode / containers は後続設計へ回す。ADR `0326`。
- [x] **2.4e async design** — Promise / async-await(Fiber ベース実装)を個別 ADR `0327` で設計した。

### 3.MVP / Phase 3: Single-binary MVP

MVP 境界は **Topaz-subset TypeScript の source graph を、設定ファイル必須なしで 1 つの native binary にする**こと。公開 surface は `std/fs` / `std/path` / `std/process` と、未対応 package shape への clear reject までに絞る。capability / manifest / doctor / explain などの ecosystem work はこの MVP の後ろへ回す。

- [x] **3.0 capability / effect 型追跡 design** — 関数は return type と effect set を持つものとして扱い、`throw<E>` / `fs.read` / `fs.write` / `fs.metadata` / `process.argv` / `process.exit` / `io.stdout` / `io.stderr` / `async.schedule` を最初の effect atom family とする。capability は package / host 境界で effect を discharge する権限であり、`!{ fs.read, throw<E> }` 的シグネチャは当面は例示表記に留める。決定ログは `docs/adr/0328-capability-effect-tracking-design.md`。
- [x] **3.1 zero-config package/module resolution design** — `topaz <entry.ts>` を primary entry experience として維持し、bare import / `node_modules` は将来の source lookup 対象として扱うが、npm 互換・package install・lifecycle script・CommonJS / Node emulation は約束しない。`strict-ts.json` は multi-entry / target / import allowlist / capability grant 用の optional policy file として位置付ける。決定ログは `docs/adr/0329-zero-config-package-resolution-design.md`。
- [x] **3.2 manifest doctor / capability guidance design** — zero-config build と optional manifest policy を分離したまま、`topaz doctor <entry.ts>` / `topaz manifest init <entry.ts>` / `topaz check <entry.ts>` / `topaz explain ...` で effect/capability 要求を file:line provenance 付きに説明し、1 問ずつ manifest 生成を支援する UX 方針を固定。依存 source graph / 将来の `node_modules` lookup も compiled graph なら capability inference に参加する。決定ログは `docs/adr/0330-manifest-doctor-capability-guidance-design.md`。
- [x] **3.3 stdlib capability metadata design** — future effect inference / `doctor` / `manifest init` / `check` / `explain` が semantic builtin descriptor 上の metadata を共有し、public `std/*` と compatibility `node:*` / synthetic globals が同じ挙動なら同一 descriptor を指せる方針として固定。`std/path` / `node:path` / `node:url.fileURLToPath` / `import.meta.url` は pure、`std/fs` / `node:fs` と `std/process` / synthetic process-console surface は対応する effect atom に mapping し、`node:child_process.execFileSync` 用に compatibility-only `process.spawn` atom を追加する。決定ログは `docs/adr/0331-stdlib-capability-metadata-design.md`。
- [x] **3.4 builtin descriptor metadata skeleton** — ADR `0331` の semantic builtin descriptor 方針を最初の実装に落とし、`src/builtin_descriptors.ts` に import / synthetic global descriptor と effect metadata を集約した。loader の stdlib specifier / named import allowlist は descriptor helper 参照へ移し、codegen lowering・受理 import surface・capability enforcement は変えない。決定ログは `docs/adr/0332-builtin-descriptor-metadata-skeleton.md`。
- [x] **3.5 self-host-compatible descriptor metadata** — Phase 20 の descriptor metadata は維持しつつ、native self-host parser が未対応の top-level `export const` descriptor arrays を exported function へ戻した。ロードマップは single-binary MVP と post-MVP ecosystem work を分離。決定ログは `docs/adr/0333-single-binary-mvp-roadmap.md`。
- [x] **3.6 public std/fs** — `std/fs` の read / metadata / write helper を公開 import surface として実装し、`node:fs` compatibility path と意味を揃える。決定ログは `docs/adr/0334-public-std-fs.md`。
- [x] **3.7 public std/process** — `std/process` の `argv` / `exit` / stdio write helper を公開 import surface として実装し、synthetic process-console compatibility path と意味を揃える。決定ログは `docs/adr/0335-public-std-process.md`。
- [x] **3.8 minimal bare package source lookup** — source package graph を最小限 lookup し、未対応 package shape は clear reject する。npm 互換・install・lifecycle script・CommonJS / Node emulation は MVP 外。決定ログは `docs/adr/0336-minimal-bare-package-lookup.md`。
- [x] **3.9 MVP release/UX gate** — zero-config single-binary path、public stdlib、package-shape reject、diagnostic wording、README/CLI usage を MVP として通す。CLI help smoke を MVP gate に追加し、決定ログは `docs/adr/0337-single-binary-mvp-ux-gate.md`。
- [x] **3.10 native compiler release artifact builder** — `pnpm run build:release` で self-host fixed-point gate を通したあと、最終 native compiler `build/topaz` を platform-qualified artifact (`dist-release/topaz-<os>-<arch>`) と `SHA256SUMS` にまとめる。Apple Silicon macOS では `topaz-darwin-arm64`。決定ログは `docs/adr/0350-release-artifact-builder.md`。
- [x] **3.11 GitHub Actions release artifact automation** — `release artifact` workflow で GitHub-hosted macOS arm64 runner 上の `pnpm run build:release` を実行し、manual run は workflow artifact、`v*` tag push は draft GitHub Release asset として `topaz-darwin-arm64` と `SHA256SUMS` をアップロードする。決定ログは `docs/adr/0351-github-actions-release-artifact.md`。
- [x] **3.12 release versioning / runbook skill** — `0.x.y` SemVer、`v0.1.0 = single-binary MVP`、`v0.x.y-rc.N` release candidate、tag-triggered draft Release を方針として固定し、公開手順を `.agents/skills/topaz-release/SKILL.md` に skill 化した。決定ログは `docs/adr/0352-release-versioning-and-skill.md`。
- [x] **3.13 embedded runtime header for release compiler** — RC1 black-box check で release compiler binary を repo 外へ置くと `runtime.h` が見つからない blocker を検出したため、生成 C に `runtime/runtime.h` 本文を埋め込み、`runtime/` directory なしで `cc` まで通る single-binary compiler artifact にした。決定ログは `docs/adr/0353-embedded-runtime-header.md`。
- [x] **3.14 v0.1.1 release workflow stabilization** — `v0.1.0` final tag 後に残った GitHub Actions Node.js 20 deprecation annotation へ Node 24 対応済みの official action major 更新で対応し、README / MVP doc / release skill に checksum + downloaded binary black-box smoke を明記した。言語 surface / runtime semantics は変えない patch。決定ログは `docs/adr/0354-release-workflow-stabilization.md`。
- [x] **3.15 runtime TS prelude boundary** — `runtime/runtime.h` の全面 TS 化ではなく、host ABI / raw memory / exception jump / container macro を tiny C substrate に残し、純粋 helper を internal Topaz runtime prelude へ段階移行する方針を固定した。決定ログは `docs/adr/0355-runtime-ts-prelude-boundary.md`、移行計画は `docs/runtime-ts-migration.md`。
- [x] **3.29 runtime header freshness check** — `src/runtime_header.ts` が `runtime/runtime.h` から再生成済みかを既存 generator の `--check` で検証し、通常 smoke と release artifact build の前段 gate に組み込んだ。決定ログは `docs/adr/0356-runtime-header-freshness-check.md`。
- [x] **3.30 embedded runtime prelude skeleton** — `runtime/prelude.ts` を `src/runtime_prelude.ts` に埋め込み、loader が internal module として user module より前に parse する lane を追加した。stable C module id `runtime_prelude` と no-op init symbol を持つが、user name resolution からは隠す。決定ログは `docs/adr/0357-embedded-runtime-prelude-skeleton.md`。
- [x] **3.31 startsWith runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_starts_with` を追加し、`String.prototype.startsWith(search)` の lowering 先を stable internal prelude symbol へ切り替えた。public surface / diagnostics は維持し、`endsWith` と allocation/host helper は引き続き C substrate に残す。決定ログは `docs/adr/0358-runtime-prelude-starts-with.md`。
- [x] **3.32 endsWith runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_ends_with` を追加し、`String.prototype.endsWith(search)` の lowering 先を stable internal prelude symbol へ切り替えた。public surface / diagnostics は維持し、allocation/host helper は引き続き C substrate に残す。決定ログは `docs/adr/0359-runtime-prelude-ends-with.md`。
- [x] **3.33 substrate-backed prelude string allocation boundary** — runtime prelude の次の移行境界として、`slice` / `repeat` / concat / `String.fromCharCode` 自体は allocation primitive として C substrate に残しつつ、`trimStart` のような allocation client は pure TS の scan ロジックから既存 primitive へ最終 allocation を委譲する形なら移行可能と整理した。prelude は引き続き compiler-owned internal module であり、public import API にはしない。決定ログは `docs/adr/0360-substrate-backed-prelude-string-allocation.md`。
- [x] **3.34 trimStart runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_is_trim_start_code` / `__topaz_string_trim_start` を追加し、`String.prototype.trimStart()` の lowering 先を stable internal prelude symbol へ切り替えた。scan ロジックは runtime prelude へ移しつつ、最終 allocation は `slice` substrate primitive へ委譲し、public surface / diagnostics は維持する。決定ログは `docs/adr/0361-runtime-prelude-trim-start.md`。
- [x] **3.35 path extname runtime prelude migration** — `runtime/prelude.ts` に `__topaz_path_extname` を追加し、imported `node:path` / `std/path` `extname(path)` の lowering 先を stable internal prelude symbol へ切り替えた。既存 C state machine を Topaz-subset の string scan と `slice` 委譲へ移し、public surface / diagnostics と `runtime/runtime.h` は維持する。決定ログは `docs/adr/0362-runtime-prelude-path-extname.md`。
- [x] **3.36 path dirname runtime prelude migration** — `runtime/prelude.ts` に `__topaz_path_dirname` を追加し、imported `node:path` / `std/path` `dirname(path)` の lowering 先を stable internal prelude symbol へ切り替えた。既存 C helper の right-to-left scan を Topaz-subset の `charCodeAt` / `slice(0, end)` に移し、public surface / diagnostics と `runtime/runtime.h` は維持する。決定ログは `docs/adr/0363-runtime-prelude-path-dirname.md`。
- [x] **3.37 path basename runtime prelude migration** — `runtime/prelude.ts` に `__topaz_path_basename` / `__topaz_path_basename_ext` を追加し、imported `node:path` / `std/path` `basename(path, ext?)` の lowering 先を stable internal prelude symbol へ切り替えた。既存 C helper の last-segment scan / suffix match を Topaz-subset の `charCodeAt` / `slice(start, end)` に移し、public surface / diagnostics は維持する。`runtime/runtime.h` の C helper は substrate cleanup backlog として意図的に残す。決定ログは `docs/adr/0364-runtime-prelude-path-basename.md`。
- [x] **3.38 boolean stringification runtime prelude migration** — `runtime/prelude.ts` に `__topaz_boolean_to_string` を追加し、template literal substitution と `Array<boolean>.join(...)` の compiler-owned boolean stringification を stable internal prelude symbol へ切り替えた。console boolean IO と `runtime/runtime.h` の C helper は維持し、public `boolean.toString()` は scope 外に残す。決定ログは `docs/adr/0365-runtime-prelude-boolean-stringification.md`。
- [x] **3.39 string equality runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_eq` を追加し、binary string `===` / `!==`、string `switch`、`Array<string>.includes(...)` の compiler-owned byte equality を stable internal prelude symbol へ切り替えた。Map/Set key equality と C substrate helper は維持し、public helper 名は user scope から隠したままにする。決定ログは `docs/adr/0366-runtime-prelude-string-equality.md`。
- [x] **3.40 path join runtime prelude migration** — `runtime/prelude.ts` に `__topaz_path_join_segments(Array<string>)` を追加し、imported `node:path` / `std/path` `join(...segments)` の variadic public call shape を codegen-local `Array<string>` packaging 経由で stable internal prelude symbol へ切り替えた。host-bound `resolve` と `runtime/runtime.h` の C helper は維持し、public helper 名は user scope から隠したままにする。決定ログは `docs/adr/0367-runtime-prelude-path-join.md`。
- [x] **3.41 runtime header path helper cleanup** — runtime prelude に移行済みの `dirname` / `basename` / `extname` / `join` C helper 定義を `runtime/runtime.h` と embedded `src/runtime_header.ts` から削除した。host-bound `resolve` とその normalize substrate は維持し、生成 C smoke で削除済み定義の不在と `resolve` substrate の残存を確認する。決定ログは `docs/adr/0368-runtime-header-path-helper-cleanup.md`。
- [x] **3.42 runtime header string helper cleanup** — runtime prelude に移行済みの `startsWith` / `endsWith` / `trimStart` / compiler-owned boolean stringification C helper 定義を `runtime/runtime.h` と embedded `src/runtime_header.ts` から削除した。Map/Set string key equality、string allocation primitives、number/bigint formatting、console boolean IO、host-bound path helpers は C substrate に維持し、生成 C smoke で stable prelude symbol の残存と削除済み定義の不在を確認する。決定ログは `docs/adr/0369-runtime-header-string-helper-cleanup.md`。
- [x] **3.43 runtime header trim byte helper cleanup** — 3.42 の `trimStart` C helper cleanup 後に残っていた stale `topaz_string_is_trim_start_byte` 定義を `runtime/runtime.h` と embedded `src/runtime_header.ts` から削除した。runtime prelude の `__topaz_string_is_trim_start_code` / `__topaz_string_trim_start` と、Map/Set string key equality・string allocation primitives・path/number/bigint substrate は維持し、生成 C smoke で stale helper の不在を確認する。決定ログは `docs/adr/0370-runtime-header-trim-byte-helper-cleanup.md`。
- [x] **3.44 path resolve runtime prelude migration** — `runtime/prelude.ts` に `__topaz_path_resolve_segments(Array<string>, cwd: string)` を追加し、imported `node:path` / `std/path` `resolve(...segments)` の right-to-left merge と POSIX normalization を runtime prelude へ移した。C substrate は `topaz_process_cwd()` の getcwd fallback だけに縮小し、旧 `topaz_path_resolve` / `topaz_path_normalize_string` 定義を embedded header から削除した。決定ログは `docs/adr/0371-runtime-prelude-path-resolve.md`。
- [x] **3.45 runtime substrate inventory check** — `runtime/runtime.h` に残る `topaz_*` static helper と `TOPAZ_*` / `topaz_opt_*` macro を substrate category/reason 付き inventory で分類し、新規 C surface が未分類のまま増えたら smoke / release gate で止める。runtime 挙動は変更しない。決定ログは `docs/adr/0372-runtime-substrate-inventory-check.md`。
- [x] **3.46 console boolean IO prelude route** — `console.log` / `console.error` / `console.warn` の boolean 引数を `__topaz_boolean_to_string` 経由で既存 string IO substrate へ流し、専用 C boolean console helper と inventory entry を削除した。public console behavior / diagnostics / prelude import surface は維持する。決定ログは `docs/adr/0373-console-boolean-prelude-io.md`。
- [x] **3.47 numeric console IO string substrate route** — `console.log` / `console.error` / `console.warn` の number / bigint 引数を既存 `topaz_number_to_string` / `topaz_bigint_to_string` から string IO substrate へ流し、専用 C number / bigint console helper と inventory entry を削除した。formatting / newline / diagnostics は維持する。決定ログは `docs/adr/0374-numeric-console-string-substrate.md`。
- [x] **3.48 console warn string wrapper cleanup** — `console.warn(...)` の lowering を既存 stderr string IO substrate `topaz_console_error_string(...)` へ直接向け、純粋 wrapper だった `topaz_console_warn_string` と inventory entry を削除した。accepted argument / diagnostics / stderr newline behavior は維持する。決定ログは `docs/adr/0375-console-warn-string-wrapper-cleanup.md`。
- [x] **3.49 console line IO wrapper cleanup** — `console.log` / `console.error` / `console.warn` / `std/process.writeError` の line-oriented behavior を codegen 側の raw `topaz_stdout_write(...)` / `topaz_stderr_write(...)` + compiler-owned newline literal に畳み込み、薄い C wrapper だった `topaz_console_log_string` / `topaz_console_error_string` と inventory entry を削除した。raw `process.stdout.write` / `process.stderr.write` は no-newline substrate のまま維持する。決定ログは `docs/adr/0376-console-line-io-wrapper-cleanup.md`。
- [x] **3.50 runtime prelude panic / byte-string boundary design** — `node:url.fileURLToPath` を runtime prelude に移す前提として、internal-prelude-only な `__topaz_panic(message): never` と `__topaz_string_from_byte_codes(Array<number>): string` を先に substrate affordance として追加し、その後に `file://` parse / `localhost` host / absolute path / percent decode を `runtime/prelude.ts` に移す段階設計を固定した。`topaz_runtime_module_url()` は executable path syscall / `realpath` / platform conditional / process-lifetime cache のため C substrate に残す。決定ログは `docs/adr/0377-runtime-prelude-panic-byte-string-boundary.md`、移行計画は `docs/runtime-ts-migration.md`。
- [x] **3.51 runtime prelude file URL path migration** — internal-prelude-only な `__topaz_panic(message)` / `__topaz_string_from_byte_codes(Array<number>)` lowering と C substrate を追加し、`node:url.fileURLToPath(url)` の `file://` parse / `localhost` host / absolute path / percent decode を `runtime/prelude.ts` の `__topaz_url_file_url_to_path` へ移した。旧 `topaz_url_file_url_to_path(...)` は `runtime/runtime.h` / substrate inventory から削除し、`topaz_runtime_module_url()` は C substrate に維持する。決定ログは `docs/adr/0378-runtime-prelude-file-url-path.md`。
- [x] **3.52 parseInt runtime prelude migration** — global `parseInt(s, radix)` の call-site 限定 surface / diagnostics は維持しつつ、radix truncate・ASCII whitespace/sign・auto-base prefix・digit scan を `runtime/prelude.ts` の internal `__topaz_parse_int` へ移した。旧 `topaz_parse_int(...)` は `runtime/runtime.h` / substrate inventory から削除し、`parseFloat(s)` は `strtod` roundoff に依存する C substrate として維持する。決定ログは `docs/adr/0379-runtime-prelude-parse-int.md`。
- [x] **3.53 String.fromCharCode runtime prelude migration** — public `String.fromCharCode(n)` の call-site 限定 surface / diagnostics は維持しつつ、NaN / negative / `>= 128` reject と valid fractional truncation を `runtime/prelude.ts` の internal `__topaz_string_from_char_code` へ移した。最終 allocation は `__topaz_string_from_byte_codes(Array<number>)` 経由で C substrate に委譲し、旧 `topaz_string_from_char_code(...)` は `runtime/runtime.h` / substrate inventory から削除する。決定ログは `docs/adr/0380-runtime-prelude-string-from-char-code.md`。
- [x] **3.54 runtime substrate migration lane classification** — `scripts/check-runtime-substrate.mjs` の inventory 契約を `category` / `reason` / `migration` / `next` へ強化し、残る C substrate を raw memory、host ABI、libc/libm、exception、container monomorph、string buffer intrinsics、bigint limb intrinsics、C ABI type の migration lane で集計する。runtime 挙動は変更しない。決定ログは `docs/adr/0381-runtime-substrate-migration-lanes.md`。
- [x] **3.55 String.slice runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_slice(s, rawStart, rawEnd)` を追加し、`String.prototype.slice(start?, end?)` の public diagnostics と NaN sentinel call shape を維持したまま stable internal prelude symbol へ切り替えた。旧 `topaz_string_slice(...)` は `runtime/runtime.h` / substrate inventory から削除し、`topaz_slice_normalize(...)` は `Array.prototype.slice` 用 substrate として維持する。決定ログは `docs/adr/0382-runtime-prelude-string-slice.md`。
- [x] **3.56 string concat runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_concat(a, b)` を追加し、binary string `+` / string `+=` / template literal concat chain の public 型検査と挙動を維持したまま stable internal prelude symbol へ切り替えた。旧 `topaz_string_concat(...)` は `runtime/runtime.h` / substrate inventory から削除し、`String.repeat` / `charCodeAt` / `__topaz_string_from_byte_codes` / container は scope 外に維持する。決定ログは `docs/adr/0383-runtime-prelude-string-concat.md`。
- [x] **3.57 String.repeat runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_repeat(s, count)` を追加し、`String.prototype.repeat(count)` の public diagnostics と range / output-size panic を維持したまま stable internal prelude symbol へ切り替えた。旧 `TOPAZ_STRING_REPEAT_MAX_BYTES` / `topaz_string_repeat(...)` は `runtime/runtime.h` / substrate inventory から削除し、`charCodeAt` / `__topaz_string_from_byte_codes` / container / `Array.slice` は scope 外に維持する。決定ログは `docs/adr/0384-runtime-prelude-string-repeat.md`。
- [x] **3.58 Array.slice normalization runtime prelude migration** — `runtime/prelude.ts` に `__topaz_slice_normalize(n, len, def)` を追加し、`Array.prototype.slice(start?, end?)` の receiver snapshot / allocation / reserve / copy loop と public diagnostics を維持したまま index normalization だけを stable internal prelude symbol へ切り替えた。旧 `topaz_slice_normalize(...)` は `runtime/runtime.h` / substrate inventory から削除し、`charCodeAt` / `__topaz_string_from_byte_codes` / Array storage-copy helpers / Map-Set containers / `String.slice` は scope 外に維持する。決定ログは `docs/adr/0385-runtime-prelude-array-slice-normalize.md`。
- [x] **3.59 String.charCodeAt runtime prelude migration** — `runtime/prelude.ts` に `__topaz_string_char_code_at(s, index)` を追加し、public `String.prototype.charCodeAt(index)` の arity/type diagnostics は codegen に残したまま NaN / negative / out-of-range / fractional truncation semantics を stable internal prelude symbol へ切り替えた。C substrate は internal-prelude-only `__topaz_string_byte_at(s, index)` が呼ぶ raw `topaz_string_byte_at(...)` に縮小し、旧 `topaz_string_char_code_at(...)` は `runtime/runtime.h` / substrate inventory から削除する。決定ログは `docs/adr/0386-runtime-prelude-string-char-code-at.md`。
- [x] **3.60 string buffer intrinsic boundary** — `needs-string-buffer-intrinsics` lane を `topaz_string_byte_at(...)` / `topaz_string_from_byte_codes(...)` の 2 symbol に固定し、checker / smoke が増減を検出するようにした。ここから先の string substrate 縮小は ordinary Topaz-subset TS migration ではなく、compiler-owned internal string-buffer intrinsic family の設計・lowering が prerequisite。決定ログは `docs/adr/0387-string-buffer-intrinsic-boundary.md`。
- [x] **3.61 string buffer intrinsic family design** — internal-prelude-only な opaque `StringBuffer` pseudo type と `__topaz_string_buffer_new` / `push_byte` / `append_string` / `byte_at` / `to_string` intrinsic family を次の実装 target として固定した。public language surface は増やさず、user source からは hidden helper を引き続き unknown identifier にする。決定ログは `docs/adr/0388-string-buffer-intrinsic-family.md`、移行計画は `docs/runtime-ts-migration.md`。
- [x] **3.62 string buffer intrinsic substrate** — runtime prelude 限定の opaque `StringBuffer` pseudo type / hidden intrinsic lowering / C substrate helper family を実装し、`__topaz_string_from_char_code(n)` だけを `Array<number>` + `__topaz_string_from_byte_codes` bridge から buffer 経路へ移した。legacy `needs-string-buffer-intrinsics` lane は旧 2 symbol のまま固定し、新 helper は `string-buffer-intrinsic-family` lane に分類する。決定ログは `docs/adr/0389-string-buffer-intrinsic-substrate.md`。
- [x] **3.63 string concat string-buffer migration** — `__topaz_string_concat(a, b)` を `Array<number>` + `__topaz_string_from_byte_codes` bridge から `StringBuffer` allocation + `append_string` + `to_string` 経路へ移した。binary string `+` / `+=` / template literal concat chain の public lowering と diagnostics は維持し、repeat / slice / fileURLToPath / charCodeAt / 旧 byte-code substrate cleanup は scope 外に残す。決定ログは `docs/adr/0390-string-concat-string-buffer.md`。
- [x] **3.64 string repeat string-buffer migration** — `__topaz_string_repeat(s, count)` を `Array<number>` + `__topaz_string_from_byte_codes` bridge から `StringBuffer` allocation + repeated `append_string` + `to_string` 経路へ移した。`String.prototype.repeat(count)` の public lowering / diagnostics と range / fractional truncation / empty output / output-size panic は維持し、slice / fileURLToPath / charCodeAt / 旧 byte-code substrate cleanup は scope 外に残す。決定ログは `docs/adr/0391-string-repeat-string-buffer.md`。
- [x] **3.65 string slice string-buffer migration** — `__topaz_string_slice(s, rawStart, rawEnd)` を `Array<number>` + `__topaz_string_from_byte_codes` bridge から `StringBuffer` allocation + `push_byte` + `to_string` 経路へ移した。`String.prototype.slice(start?, end?)` の public lowering / diagnostics と NaN sentinel / negative-index normalization / clamp / fractional truncation / `hi < lo` behavior は維持し、fileURLToPath / charCodeAt / 旧 byte-code substrate cleanup は scope 外に残す。決定ログは `docs/adr/0392-string-slice-string-buffer.md`。
- [x] **3.66 fileURLToPath string-buffer migration** — `__topaz_url_file_url_to_path(url)` を `Array<number>` + `__topaz_string_from_byte_codes` bridge から `StringBuffer` allocation + `push_byte` + `to_string` 経路へ移した。`node:url.fileURLToPath(url)` / `import.meta.url` の public lowering、diagnostics、`file://` prefix / host / absolute path / percent decode の panic behavior、`topaz_runtime_module_url()` は維持し、charCodeAt / 旧 byte-code substrate cleanup は scope 外に残す。決定ログは `docs/adr/0393-file-url-to-path-string-buffer.md`。
- [x] **3.67 byte-code string substrate cleanup** — runtime prelude allocation clients が `StringBuffer` family へ移行済みになったため、internal-prelude-only `__topaz_string_from_byte_codes(...)` lowering と C substrate `topaz_string_from_byte_codes(...)` を削除した。`needs-string-buffer-intrinsics` lane は `topaz_string_byte_at(...)` だけに縮小し、`String.prototype.charCodeAt` の raw byte read boundary と public string / URL behavior は維持する。決定ログは `docs/adr/0394-remove-byte-code-string-substrate.md`。
- [x] **3.68 string byte-read substrate cleanup** — `topaz_string_byte_at(...)` を `runtime/runtime.h` / substrate inventory から削除し、runtime prelude 限定 `__topaz_string_byte_at(s, index)` は compiler intrinsic として generated C の `topaz_string.data[(size_t)index]` 直読みへ lowering する。`needs-string-buffer-intrinsics` lane は `<none>` になり、public `String.prototype.charCodeAt` diagnostics / output と five-symbol `StringBuffer` family は維持する。決定ログは `docs/adr/0395-remove-string-byte-read-substrate.md`。
- [x] **3.69 bigint limb intrinsic family design** — `needs-bigint-limb-intrinsics` lane の次段として、runtime prelude 限定の opaque `BigIntBuffer` pseudo type と `__topaz_bigint_buffer_*` / `__topaz_bigint_limb*` / `__topaz_bigint_sign` hidden intrinsic family を実装前提に固定した。public BigInt surface と `topaz_bigint *` ABI は維持し、leaf helper から add/sub/mul、decimal parse/format の順に後続実装へ分割する。決定ログは `docs/adr/0396-bigint-limb-intrinsic-family.md`、移行計画は `docs/runtime-ts-migration.md`。
- [x] **3.70 bigint buffer intrinsic substrate** — runtime prelude 限定の opaque `BigIntBuffer` pseudo type、8 個の hidden BigInt limb intrinsic lowering、C substrate helper family を実装した。既存 public BigInt operator / `topaz_bigint_*` helper target は変更せず、旧 `needs-bigint-limb-intrinsics` 17-symbol lane は維持し、新 helper は `bigint-limb-intrinsic-family` lane として別集計する。決定ログは `docs/adr/0397-bigint-buffer-intrinsic-substrate.md`。
- [x] **3.71 bigint equality prelude migration** — public bigint `===` / `!==` lowering を C helper `topaz_bigint_eq(...)` から runtime prelude `__topaz_bigint_eq(a, b)` へ移し、hidden limb inspection family だけで sign / zero / limb length / limb equality を判定する。ordering / arithmetic / literal parse / formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 16 symbol に縮小する。決定ログは `docs/adr/0398-bigint-equality-prelude.md`。
- [x] **3.72 bigint ordering prelude migration** — public bigint `<` / `<=` / `>` / `>=` lowering を C helper `topaz_bigint_cmp(...)` から runtime prelude `__topaz_bigint_cmp(a, b)` へ移し、hidden limb inspection family だけで sign / zero / limb length / most-significant limb comparison を判定する。add/sub/mul / literal parse / formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 14 symbol に縮小する。決定ログは `docs/adr/0399-bigint-ordering-prelude.md`。
- [x] **3.73 bigint unary negation prelude migration** — public bigint unary `-` lowering を C helper `topaz_bigint_neg(...)` から runtime prelude `__topaz_bigint_neg(value)` へ移し、hidden BigInt buffer family だけで canonical zero と絶対値 limb clone + sign flip を維持する。binary add/sub/mul / literal parse / formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 13 symbol に縮小する。決定ログは `docs/adr/0400-bigint-unary-negation-prelude.md`。
- [x] **3.74 bigint add/sub prelude migration** — public bigint binary `+` / `-` lowering を C helper `topaz_bigint_add(...)` / `topaz_bigint_sub(...)` から runtime prelude `__topaz_bigint_add(a, b)` / `__topaz_bigint_sub(a, b)` へ移し、hidden BigInt buffer family で carry / borrow limb 演算と canonical zero を維持する。mul / literal parse / formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 8 symbol に縮小する。決定ログは `docs/adr/0401-bigint-add-sub-prelude.md`。
- [x] **3.75 bigint multiplication prelude migration** — public bigint binary `*` lowering を C helper `topaz_bigint_mul(...)` から runtime prelude `__topaz_bigint_mul(a, b)` へ移し、16-bit half-limb decomposition で `number` 中間値を exact integer 範囲内に保ちながら multi-limb carry propagation と sign / canonical zero を維持する。literal parse / formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 6 symbol に縮小する。決定ログは `docs/adr/0402-bigint-multiplication-prelude.md`。
- [x] **3.76 bigint decimal parse prelude migration** — decimal bigint literal construction を C helper `topaz_bigint_from_decimal_cstr(...)` から runtime prelude `__topaz_bigint_from_decimal(digits)` へ移し、hidden BigInt buffer family で left-to-right decimal parse / canonical zero / positive sign materialization を維持する。formatting は C substrate のまま残し、`needs-bigint-limb-intrinsics` lane は 3 symbol に縮小する。決定ログは `docs/adr/0403-bigint-decimal-parse-prelude.md`。
- [x] **3.77 bigint buffer materialization cleanup** — C substrate の `topaz_bigint_alloc(...)` / `topaz_bigint_normalize(...)` を standalone helper から外し、`topaz_bigint_buffer_to_bigint(...)` 内で trailing zero trim / arena allocation / limb copy / sign canonicalization を完結させた。`topaz_bigint *` ABI と public BigInt behavior は維持し、`needs-bigint-limb-intrinsics` lane は formatting helper 1 symbol に縮小する。決定ログは `docs/adr/0404-bigint-buffer-materialization-cleanup.md`。
- [x] **3.78 bigint decimal formatting prelude migration** — `console.*` / template literal の bigint stringification を C helper `topaz_bigint_to_string(...)` から runtime prelude `__topaz_bigint_to_string(value)` へ移し、16-bit chunk の exact divide-by-1e9 と `StringBuffer` byte 出力で decimal formatting を維持する。旧 standalone C helper と `needs-bigint-limb-intrinsics` lane は削除し、8-symbol `bigint-limb-intrinsic-family` は維持する。決定ログは `docs/adr/0405-bigint-decimal-formatting-prelude.md`。
- [x] **3.79 legacy runtime migration lanes closed** — `needs-string-buffer-intrinsics` / `needs-bigint-limb-intrinsics` を通常の空 migration lane ではなく checker invariant として閉じ、再分類された runtime symbol があれば `pnpm run check:runtime-substrate` で lane と symbol を診断して止める。runtime behavior は変えず、残作業は raw-memory / libc-libm / container-monomorph / host ABI / exception / C ABI boundary と active intrinsic family に固定する。決定ログは `docs/adr/0406-legacy-runtime-migration-lanes-closed.md`。
- [x] **3.80 closed runtime migration guidance alignment** — closed lane の `NEXT` guidance / failure diagnostic / smoke probe / runtime migration docs を Phase 3.79 後の現状態へ揃え、`needs-string-buffer-intrinsics` / `needs-bigint-limb-intrinsics` が completed migration history であって backlog bucket ではないことを checker と docs の両方で明示した。runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0407-closed-runtime-migration-guidance.md`。
- [x] **3.81 libc/libm number substrate policy** — `libc-libm-boundary` を pre-v0.2.0 の明示的な number substrate boundary として固定し、`topaz_fmod` / `topaz_parse_float` / `topaz_number_to_string` の 3 helper は parse / roundoff / remainder / shortest-roundtrip formatting を保つ将来 ADR なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0408-libc-libm-number-substrate-policy.md`。
- [x] **3.82 host ABI substrate policy** — `host-abi-boundary` を pre-v0.2.0 の明示的な capability-aware host ABI substrate boundary として固定し、raw stdio / fs / process argv-cwd-exit / module URL / child process spawn の 12 helper は manifest・capability・doctor/check/explain を伴う将来 ADR なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0409-host-abi-substrate-policy.md`。
- [x] **3.83 raw memory substrate policy** — `raw-memory-boundary` を pre-v0.2.0 の明示的な compiler-owned raw memory / arena substrate boundary として固定し、`topaz_arena_alloc` / `topaz_arena_calloc` / `topaz_arena_realloc` の 3 helper は raw pointer・byte buffer・ownership・allocation failure model を伴う将来 ADR なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0410-raw-memory-substrate-policy.md`。
- [x] **3.84 exception substrate policy** — `exception-boundary` を pre-v0.2.0 の明示的な exception/control-transfer substrate boundary として固定し、`topaz_try_push` / `topaz_try_pop` / `topaz_throw` / `topaz_panic` の 4 helper は `setjmp` / `longjmp`、`jmp_buf` frame lifetime、panic diagnostics、abort/panic control transfer を扱う将来の exception runtime/backend design なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0411-exception-substrate-policy.md`。
- [x] **3.85 C ABI type substrate policy** — `c-abi-type-boundary` を pre-v0.2.0 の明示的な generated-C/runtime ABI type substrate boundary として固定し、`TOPAZ_RUNTIME_H` と scalar optional wrapper / absent / passthrough の 8 entry は generated C・runtime macro・optional narrowing・`Map.get`・`?.`・`??`・`T | undefined` coercion が共有する ABI/layout 方針を伴う将来 ADR なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0412-c-abi-type-substrate-policy.md`。
- [x] **3.86 container monomorph substrate policy** — `container-monomorph-boundary` を pre-v0.2.0 の明示的な compiler-owned container monomorph substrate boundary として固定し、Array/Map/Set macro families、hash slot state、growth/rehash/tombstone、SameValueZero number equality、string byte hashing/equality、reference identity hashing/equality を担う 13 entry は compiler-owned container monomorphization/backend design なしに runtime prelude へ移さない方針にした。checker guidance、smoke lane count、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0413-container-monomorph-substrate-policy.md`。
- [x] **3.87 active intrinsic family substrate policy** — `string-buffer-intrinsic-family` / `bigint-limb-intrinsic-family` を pre-v0.2.0 の active compiler-owned internal runtime-prelude substrate family として固定し、hidden `StringBuffer` / `BigIntBuffer` pseudo type と intrinsic lowering に依存する 5 + 8 entry は closed legacy lane ではなく、将来の compiler intrinsic/backend representation decision なしに helper-by-helper migration しない方針にした。checker guidance、smoke failure message、runtime migration docs のみを更新し、runtime behavior と generated runtime/codegen は変更しない。決定ログは `docs/adr/0414-active-intrinsic-family-substrate-policy.md`。
- [x] **3.88 runtime prelude release checkpoint** — runtime TS prelude checkpoint として internal runtime prelude injection / embedding、hidden prelude symbols と移行済み pure helper、`StringBuffer` / `BigIntBuffer` intrinsic substrate family、pre-v0.2.0 に pin した残りの C substrate boundary を release roadmap に反映した。言語 surface / runtime semantics / runtime behavior / package version / release tag は変更しない。決定ログは `docs/adr/0415-runtime-prelude-release-checkpoint.md`(3.89 で supersede)。
- [x] **3.89 runtime checkpoint release version realignment** — 既に公開済みの `v0.1.2` release / tag を phase 3.60 の immutable public history として保持し、現在の runtime TS prelude checkpoint は次の release vehicle `v0.1.3` に割り当て直した。retag / force-push / GitHub Release 編集 / package version 変更 / runtime behavior 変更はしない。決定ログは `docs/adr/0416-runtime-checkpoint-version-realignment.md`。
- [x] **3.90 RC draft release prerelease flag** — `*-rc.*` tag-driven draft GitHub Releases を GitHub prerelease としても作成するよう release workflow を固定し、final tag は draft-only / non-prerelease のまま維持する。既存 draft Release / tag は編集せず、offline static smoke で workflow 分岐を守る。決定ログは `docs/adr/0417-rc-draft-release-prerelease-flag.md`。
- [x] **4.0 builtin effect inventory gate** — 既存の `src/builtin_descriptors.ts` effect metadata を v0.2 seed artifact として固定し、offline checker / package script / smoke で `fs.read`・`fs.metadata`・`fs.write`・`process.argv`・`process.exit`・`io.stdout`・`io.stderr`・`process.spawn` の語彙、descriptor metadata、pure path/URL/import.meta.url 境界を検証する。public CLI / manifest schema / permission enforcement / source-level effect inference はまだ追加しない。決定ログは `docs/adr/0418-builtin-effect-inventory.md`。
- [x] **4.1 builtin effect provenance collector** — loaded source graph から descriptor-backed な builtin effect provenance (`file:line:col` / semanticName / status / import-call-value source) を収集する内部 API と checker を追加し、`std/fs` / `std/process` / synthetic `process` / `console` の effectful import・call・value read を smoke で固定した。public CLI / manifest schema / compile-time permission rejection / runtime enforcement / broad function effect propagation はまだ追加しない。決定ログは `docs/adr/0419-effect-provenance-collector.md`。
- [x] **4.2 builtin effect report renderer** — provenance records を deterministic な内部 report に整形する `src/effect_report.ts` と checker / package script / smoke gate を追加し、effect summary、`file:line:col` requirement、`console.warn(...)` detail、no-effect graph 表示を固定した。public CLI / manifest schema / compile-time permission rejection / runtime enforcement / broad function effect propagation はまだ追加しない。決定ログは `docs/adr/0420-effect-report-renderer.md`。
- [x] **4.3 effect report self-host gate** — `src/effect_provenance.ts` / `src/effect_report.ts` を Topaz 自身で C emit できる subset に収め、delimiter / path display / effect summary ordering を public CLI や manifest policy なしに自己コンパイル可能な内部 report layer として固定した。`pnpm run check:effect-selfhost` と smoke で生成 C を `cc -O2 -Iruntime -Wall -Wextra -c` で object 化できることまで検証する。決定ログは `docs/adr/0421-effect-report-selfhost.md`。
- [x] **4.4 manifest requirements seed** — descriptor-backed builtin provenance を effect atom ごとの internal requirement snapshot に畳み、stable vocabulary order と first-seen fallback、per-occurrence `file:line:col` / semanticName / status / source / detail の保持を checker / package script / smoke gate で固定した。public CLI / manifest schema / compile-time permission rejection / runtime enforcement / broad function effect propagation はまだ追加しない。決定ログは `docs/adr/0422-manifest-requirements.md`。
- [x] **4.5 manifest requirements self-host gate** — `src/manifest_requirements.ts` の内部 grouping を `Map<BuiltinEffect, Array<...>>` / `Set<BuiltinEffect>` から配列 backed helper に置き換え、public API と requirement order を保ったまま Topaz 自身で C emit できる manifest layer として固定した。`pnpm run check:manifest-selfhost` と smoke で生成 C を `cc -O2 -Iruntime -Wall -Wextra -c` で object 化できることまで検証する。public CLI / manifest schema / permission enforcement / container lowering 拡張はまだ追加しない。決定ログは `docs/adr/0423-manifest-requirements-selfhost.md`。
- [x] **4.6 doctor diagnostic renderer** — `ManifestRequirement[]` を doctor-facing な deterministic text に整形する `src/doctor_report.ts` と checker / package script / smoke gate を追加し、capability summary、`file:line:col` occurrence、`console.warn(...)` detail、no-effect graph、pure `std/path` exclusion を固定した。public `topaz doctor` / `check` / `explain` / `manifest init`、manifest schema、permission enforcement、runtime sandboxing はまだ追加しない。決定ログは `docs/adr/0424-doctor-report-renderer.md`。
- [x] **4.7 doctor report self-host gate** — `src/doctor_report.ts` の literal union source/status 表示を label helper 経由に正規化し、public API と report text を保ったまま Topaz 自身で C emit できる doctor diagnostic layer として固定した。`pnpm run check:doctor-selfhost` と smoke で生成 C を `cc -O2 -Iruntime -Wall -Wextra -c` で object 化できることまで検証する。public CLI / manifest schema / permission enforcement / subset lowering 拡張はまだ追加しない。決定ログは `docs/adr/0425-doctor-report-selfhost.md`。
- [x] **4.8 public doctor CLI entrypoint** — `topaz doctor <entry.ts>` / `node dist/cli.js doctor <entry.ts>` を既存 doctor report renderer の read-only public 入口として追加し、通常の `topaz <entry.ts>` compile path は維持した。doctor は compile-only flag を `topaz:` diagnostic で拒否し、manifest schema / parsing / writing、permission enforcement、runtime sandboxing、`check` / `explain` / `manifest init` はまだ追加しない。決定ログは `docs/adr/0426-public-doctor-cli.md`。
- [x] **4.9 public explain capability CLI** — `topaz explain capability <name>` / `node dist/cli.js explain capability <name>` を既存 builtin descriptor metadata の read-only 説明入口として追加し、known capability は説明・descriptor source・semantic name・status・descriptor explanation を deterministic に表示する。unknown capability と compile-only flag は `topaz:` diagnostic で拒否し、通常 compile と `topaz doctor <entry.ts>` は維持する。manifest schema / parsing / writing、permission enforcement、runtime sandboxing、`check` / `manifest init` / `explain std/<module>` はまだ追加しない。決定ログは `docs/adr/0427-public-explain-capability-cli.md`。
- [x] **4.10 capability explain self-host gate** — `src/capability_explain.ts` の descriptor status 表示を local label helper 経由に正規化し、public explain output と descriptor metadata を保ったまま Topaz 自身で C emit できる guidance layer として固定した。smoke で生成 C を `cc -O2 -Iruntime -Wall -Wextra -c` で object 化し、full `src/cli.ts` probe が Phase 4.9 の literal-union template blocker を越えることまで検証する。manifest schema / parsing / writing、permission enforcement、runtime sandboxing、package lookup、runtime/prelude/header、effect vocabulary は変更しない。決定ログは `docs/adr/0428-capability-explain-selfhost.md`。
- [x] **4.10 doctor command self-host gate** — `runDoctorCommand` の optional positional state を `string | undefined` 再代入から `entry: string` + `hasEntry: boolean` へ置き換え、doctor CLI の診断・出力を保ったまま full `src/cli.ts` probe が C emit まで通ることを確認した。optional union 代入 semantics、manifest/check/init、runtime/prelude/header は変更しない。決定ログは `docs/adr/0429-doctor-command-selfhost.md`。
- [x] **4.11 full CLI self-host binary gate** — Node-hosted compiler で `src/cli.ts` から native CLI binary を生成し、その binary の `--help` が compile / doctor / explain capability の入口を表示することを `pnpm run check:cli-selfhost` と smoke で固定した。full CLI C の既知 warning はこの phase では gate にせず、exit status と生成 binary behavior を回帰境界にする。runtime/prelude/header、manifest schema、permission enforcement は変更しない。決定ログは `docs/adr/0430-cli-selfhost-binary-gate.md`。
- [x] **4.12 CLI self-host compile/run gate** — 生成された native CLI binary が `examples/fib.ts` をさらに native binary にコンパイルし、その生成 binary が `5702887` を出力することを `pnpm run check:cli-selfhost` と smoke で固定した。full fixed-point ladder は `pnpm run test:selfhost` 側に残し、日常 gate は `src/cli.ts -> build/cli_selfhost/topaz` と `examples/fib.ts -> build/cli_selfhost/fib` の実行境界に絞る。決定ログは `docs/adr/0431-cli-selfhost-fib-gate.md`。
- [x] **4.13 public std module explain CLI** — `topaz explain std/<module>` を既存 builtin descriptor metadata の read-only 説明入口として追加し、`std/fs` / `std/path` の API、semantic name、status、effects、説明を deterministic に表示する。unknown module と compile-only flag は `topaz:` diagnostic で拒否し、manifest schema / parsing / writing、permission enforcement、runtime sandboxing、runtime/prelude/header、effect vocabulary は変更しない。決定ログは `docs/adr/0432-public-explain-std-module-cli.md`。
- [x] **4.14 strict-ts capability policy schema** — optional `strict-ts.json` の最初の normalized policy slice として `{ capabilities: string[] }` を固定し、`src/manifest_policy.ts` で `builtinEffectVocabulary()` に対する known / duplicate capability validation、input-order preserving grant set、empty grant set を self-hostable に実装した。JSON parsing、public `topaz check`、permission enforcement、runtime sandboxing はまだ追加しない。決定ログは `docs/adr/0433-strict-ts-capability-policy-schema.md`。
- [x] **4.15 strict-ts policy text parser** — `strict-ts.json` の現行 `{ capabilities: string[] }` shape を `JSON.parse` なしで読む self-hostable text parser を `src/manifest_policy.ts` に追加し、空 object / 空配列 / extra top-level keys / known grant order と、invalid syntax・非 object・非 array・非 string entry・duplicate key・unknown/duplicate capability diagnostics を checker / smoke / manifest self-host gate で固定した。public `topaz check`、permission enforcement、runtime/prelude/header はまだ追加しない。決定ログは `docs/adr/0434-strict-ts-policy-text-parser.md`。
- [x] **4.16 strict-ts policy file loader** — path-explicit な `strict-ts.json` loader を `src/manifest_policy.ts` に追加し、missing file は zero-config empty policy / `found: false`、present file は UTF-8 text を Phase 4.15 parser に渡す境界を checker / smoke / manifest self-host gate で固定した。directory discovery、public `topaz check`、permission enforcement、runtime/prelude/header はまだ追加しない。決定ログは `docs/adr/0435-strict-ts-policy-file-loader.md`。
- [x] **4.17 strict-ts policy coverage evaluator** — inferred `ManifestRequirement[]` と path-explicit に load した `strict-ts.json` policy を比較する read-only evaluator / compact report を `src/manifest_check.ts` に追加し、missing policy は valid empty policy として pure graph を通し、effectful graph には requirement order の missing capability を返す境界を checker / smoke / manifest self-host gate で固定した。public `topaz check`、directory discovery、permission enforcement、runtime/prelude/header はまだ追加しない。決定ログは `docs/adr/0436-strict-ts-policy-check-evaluator.md`。
- [x] **4.18 public check CLI** — `topaz check <entry.ts>` を Phase 4.17 の manifest evaluator/report への read-only public wrapper として追加し、policy path は entry 隣接の `strict-ts.json` だけに固定した。pure missing-policy graph は ok、effectful missing/partial/invalid policy は report を出して exit 1 にし、通常 compile は zero-config のまま維持する。`--policy`、親探索、package-root 推定、manifest init、permission enforcement、runtime/prelude/header は変更しない。決定ログは `docs/adr/0437-public-check-cli.md`。
- [x] **4.19 release artifact guidance CLI smoke** — `pnpm run build:release` の produced native artifact で `--help` / `doctor` / `check` / `explain capability fs.read` / `explain std/fs` を credential-free に black-box smoke し、通常 `pnpm test` では release script の guidance smoke fragments を静的に固定する。runtime/prelude/header、CLI diagnostics、artifact 名、checksum format、release publication flow は変更しない。決定ログは `docs/adr/0438-release-guidance-cli-smoke.md`。
- [x] **4.20 strict-ts manifest suggestion renderer** — inferred `ManifestRequirement[]` から現行 schema `{ capabilities: string[] }` の normalized `strict-ts.json` text を生成する self-hostable な純粋 renderer を追加し、pure graph / effectful graph / duplicate provenance / parser round-trip を checker と smoke で固定した。`topaz manifest init`、interactive prompt、file write、policy discovery、permission enforcement、runtime/prelude/header は変更しない。決定ログは `docs/adr/0439-strict-ts-manifest-suggestion-renderer.md`。
- [x] **4.21 public manifest init CLI** — `topaz manifest init <entry.ts>` を Phase 4.20 の suggestion renderer への write-free public wrapper として追加し、loaded graph から requirements を集めて normalized `strict-ts.json` text を stdout に出す。pure graph は empty capabilities を出力し、compile-only flag / missing subcommand は deterministic に拒否する。file write、prompt、policy discovery、overwrite handling、permission enforcement、runtime sandboxing、schema expansion は変更しない。決定ログは `docs/adr/0440-public-manifest-init-cli.md`。
- [x] **4.22 release artifact manifest init smoke** — `pnpm run build:release` の produced native artifact guidance smoke に `topaz manifest init <entry.ts>` を追加し、effectful fixture の normalized stdout preview が `fs.read` だけを含み、write/stdout capability や file-write side effect に依存しないことを black-box で固定した。通常 `pnpm test` は release script の manifest-init smoke fragments を静的に確認する。決定ログは `docs/adr/0441-release-manifest-init-smoke.md`。
- [x] **4.23 manifest init write flag** — `topaz manifest init <entry.ts> --write` を明示 opt-in の file-writing slice として追加し、entry 隣接 `strict-ts.json` が存在しない時だけ normalized manifest text を作成する。preview は stdout-only のまま維持し、既存 policy overwrite・重複 `--write`・他 command の `--write` は deterministic に拒否する。prompt / force / policy discovery / compile-time permission enforcement / schema expansion は変更しない。決定ログは `docs/adr/0442-manifest-init-write-flag.md`。
- [x] **4.24 release artifact manifest init write smoke** — `pnpm run build:release` の produced native artifact guidance smoke に `topaz manifest init --write <entry.ts>` を追加し、policy のない fixture で entry 隣接 `strict-ts.json` を作成してから同じ artifact の `topaz check <entry.ts>` が `status: ok` になる round-trip を black-box で固定した。preview fixture は引き続き stdout-only / write-free として保持し、通常 `pnpm test` は release script の write-mode smoke fragments を静的に確認する。決定ログは `docs/adr/0443-release-manifest-init-write-smoke.md`。
- [x] **4.25 v0.2 guidance docs / release runbook** — README / MVP snapshot / release skill を current HEAD の v0.2 guidance surface へ揃え、`doctor` → `manifest init` preview/write → `check` → `explain` の reader-facing loop と RC/final black-box release確認を明記した。CLI behavior、manifest schema、permission enforcement、runtime sandboxing、release publication flow は変更しない。決定ログは `docs/adr/0444-v0-2-guidance-docs.md`。
- [x] **4.26 release guidance fixture fix** — release skill の v0.2 black-box fixture を current `std/fs.writeFileSync(path, content)` surface に戻し、3 引数 `writeFileSync(..., "utf8")` が再混入したら `pnpm test` の静的 contract で落ちるようにした。read side の `readFileSync(path, "utf8")` と `fs.read` / `fs.write` / `io.stdout` effect guidance は維持し、CLI behavior、manifest schema、permission enforcement、runtime sandboxing、release publication flow は変更しない。決定ログは `docs/adr/0445-release-guidance-fixture.md`。
- [x] **4.27 release artifact guidance fixture fix** — `scripts/build-release.sh` の produced native artifact `manifest init --write` fixture も current `std/fs.writeFileSync(path, content)` surface に戻し、通常 `pnpm test` で release script / release skill の両方から stale 3 引数 fixture を静的に拒否するようにした。`readFileSync(path, "utf8")` と `fs.read` / `fs.write` / `io.stdout` guidance、CLI behavior、manifest schema、permission enforcement、runtime sandboxing、release publication flow は変更しない。決定ログは `docs/adr/0446-release-artifact-guidance-fixture.md`。
- [x] **4.28 v0.2 handoff checklist** — binary-only MVP handoff doc に `--help` / `doctor` / `manifest init` preview / `manifest init --write` / `check` / `explain capability fs.read` / `explain std/fs` を外部 tester がそのまま実行できる fixture として追記し、`strict-ts.json` の preview/write/check 挙動と current `writeFileSync(path, content)` arity を通常 `pnpm test` の静的 contract で固定した。CLI behavior、manifest schema、permission enforcement、runtime sandboxing、release publication flow は変更しない。決定ログは `docs/adr/0447-v0-2-handoff-checklist.md`。
- [x] **4.29 release runtime prelude smoke** — `pnpm run build:release` の copied native artifact を temp dir 内から実行し、`String.slice` / string concat / `String.charCodeAt` / `String.startsWith` に依存する binary-only fixture を compile/run することで v0.1.3 runtime TS prelude checkpoint を black-box に固定した。通常 `pnpm test` は release script の runtime-prelude smoke fragments と fib 使い回し禁止を静的に確認する。言語 surface、runtime semantics、artifact 名、checksum format、GitHub release flow は変更しない。決定ログは `docs/adr/0448-release-runtime-prelude-smoke.md`。
- [x] **4.30 v0.1.3 RC runtime prelude handoff** — release skill の downloaded-artifact black-box validation に `runtime-prelude-smoke.ts` fixture を追加し、`./topaz-darwin-arm64 runtime-prelude-smoke.ts -o ./runtime-prelude-smoke` で `String.slice` / string concat / `String.charCodeAt` / `String.startsWith` を使う v0.1.3 runtime TS prelude checkpoint を外部 tester が再現できるようにした。通常 `pnpm test` は release skill の handoff fragments と fib 使い回し禁止を静的に確認する。tag 作成、release publication、CLI behavior、runtime semantics、artifact 名、checksum format は変更しない。決定ログは `docs/adr/0449-v0-1-3-rc-runtime-prelude-handoff.md`。
- [x] **4.31 release tag HEAD guard** — release skill の RC/final tag flow に既存 tag の peeled commit と current `HEAD` を `git rev-parse HEAD` / `git rev-parse "${tag}^{commit}"` で比較する guard を追加し、不一致なら stale tag push・draft Release 再利用・remote tag force-move/delete を止める。tag 作成/削除/移動/push、GitHub Release 状態の検査、version 自動選択、release workflow/runtime/CLI behavior は変更しない。通常 `pnpm test` は release skill の tag-head guard 文言を静的に確認する。決定ログは `docs/adr/0450-release-tag-head-guard.md`。
- [x] **4.32 v0.1.3 release notes draft** — `docs/releases/v0.1.3.md` に runtime TS prelude checkpoint の final release notes draft を置き、release skill から `gh release edit v0.1.3 --notes-file docs/releases/v0.1.3.md` で適用できるようにした。通常 `pnpm test` は notes の section、checksum / fib / runtime-prelude fixture、no public surface expansion note、release skill linkage、workflow placeholder 不在を静的に確認する。tag 作成/削除/移動/push、GitHub Release 編集、runtime/CLI behavior は変更しない。決定ログは `docs/adr/0451-v0-1-3-release-notes.md`。
- [x] **4.33 v0.1.3 final readiness checklist** — `docs/releases/v0.1.3-readiness.md` に local gates、Tag Head Guard、downloaded artifact checksum / fib / runtime-prelude validation、release notes 適用 command、no-push/no-publish 境界をまとめ、release skill から final `v0.1.3` tag / draft asset / notes trust 前に参照するようにした。通常 `pnpm test` は readiness checklist と release skill linkage を静的に確認する。tag 作成/削除/移動/push、GitHub Release 編集/公開、release artifact/runtime/CLI/manifest/doctor/check/explain/permission behavior は変更しない。決定ログは `docs/adr/0452-v0-1-3-final-readiness.md`。
- [x] **4.34 pre-v0.2.0 transition checkpoint** — `docs/releases/pre-v0.2.0-checkpoint.md` に `v0.1.3` runtime TS prelude checkpoint から `v0.2.0` guidance release track への repo-local handoff を記録し、runtime migration doc / release skill から参照するようにした。通常 `pnpm test` は checkpoint の readiness evidence、pinned substrate/intrinsic lane counts、v0.2 guidance command surface、future-out-of-scope 境界、runtime migration doc linkage、release skill linkage を静的に確認する。tag 作成/削除/移動/push、GitHub Release 編集/公開、release artifact/runtime/CLI/manifest/doctor/check/explain/permission behavior は変更しない。決定ログは `docs/adr/0453-pre-v0-2-0-transition-checkpoint.md`。

Release/version allocation:

- `v0.1.0` — single-binary MVP。Topaz-subset TS source graph を single native binary にし、native compiler artifact / README / MVP doc / GitHub Actions draft Release 導線を持つ。
- `v0.1.1` — release artifact 安定化 patch。GitHub Actions の Node 24 対応 action major 更新、downloaded asset checksum / black-box smoke の手順補強、release skill の検査手順更新。言語 surface / runtime semantics は変えない。
- `v0.1.2` — published runtime prelude start / string-buffer boundary / substrate freshness release。phase 3.60 時点の immutable public release history として保持し、既存の GitHub Release / tag を動かさない。current HEAD の runtime checkpoint 全体を表す release vehicle にはしない。
- `v0.1.3` — runtime TS prelude checkpoint。internal runtime prelude injection / embedding、stable hidden prelude symbols と移行済み pure helper、`StringBuffer` / `BigIntBuffer` intrinsic substrate family、closed legacy lanes、pre-v0.2.0 に pin した残りの C substrate boundary をまとめる。public language surface / runtime semantics は拡張しない。
- `v0.1.y` — MVP-preserving patch。crash fix、diagnostic/doc/workflow 修正、self-host/release gate 安定化。言語 surface や runtime semantics の拡張はしない。
- `v0.2.0` — capability/effect inference、manifest generation、`doctor` / `check` / `explain`。optional policy file と zero-config build の関係を実装へ進める。
- `v0.3.0` — async/await / Promise execution。ADR `0327` の fiber-based design を実装 track に移す。
- `v0.4.0` — RegExp execution。ADR `0326` の minimal regexp surface を実装する。
- `v0.5.0` — generic method/interface support。Phase 2.3c で設計した staged surface を実装する。
- `v0.6.0` — remaining BigInt surface。division/modulo、containers、format/parse/performance などを段階的に広げる。
- `v0.7.0+` — LLM migration tool、Wasm/WASI backend、multi-platform artifacts、signing/notarization/attestation など、配布・移行・target 拡張の大きい track。

Post-MVP ecosystem items:

- restore current self-host fixed-point gate (old blocker `src/codegen.ts:7843:15` cleanup target frame walk cleared by ADR `0347`; `src/codegen.ts:9612:24` `fixedTmps.length.toString()` cleared by ADR `0348`; `pnpm run test:selfhost` now reaches `PASS [selfhost_fixed_point]` and writes the final native compiler as `build/topaz`)
- v0.2 guidance follow-through: compile-time policy enforcement, runtime
  sandboxing, schema expansion, and richer policy discovery remain future work
- async implementation
- regexp implementation
- generic method/interface implementation
- remaining bigint surface
- LLM migration tool
- Wasm/WASI backend

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

- [x] **generic backlog audit** — Phase 2.3 を ADR `0316` で分割し、generic method / generic interface は 2.3c の設計専用フェーズへ降ろした。
- [x] **generic function Array<T> monomorph sample** — 2.3b として、flat `Array<T>` は既存 coverage、missing path は generic 関数が返す `Array<Array<T>>` と確認。array element array の monomorph 登録を追加し、`examples/array_nested.ts` で scalar / class inner arrays を固定。
- [x] **generic method/interface design** — 2.3c として、generic method / generic interface を direct generic methods、generic interface frontend / realization、realized interface vtables に分割し、generic interface methods と generic classes implementing interfaces は別設計へ残す。
- [x] **try/finally cleanup dispatch design** — 2.3d として、ADR `0319` で cleanup reason / payload model と follow-up order を固定した。
- [x] **try/finally return cleanup dispatch** — 2.3d-1 として、no-catch `try/finally` の try body `return` を cleanup dispatch 経由で解禁した。ADR `0320`。
- [x] **try/catch/finally normal/throw dispatch** — 2.3d-2 として、return / break / continue より前に `try/catch/finally` の normal/throw path を通した。ADR `0321`。
- [x] **break/continue cleanup labels** — 2.3d-3 として、no-catch `try/finally` protected region からの `break` / `continue` を cleanup label target へ dispatch する。ADR `0322`。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
