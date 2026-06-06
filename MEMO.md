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
  - [x] **1.5-6** — self-hosting 通過。`src/*.ts` を Topaz 自身でコンパイルできる状態にする。**parser 戦略は (a) 自前 TS parser** に確定(最終構成のシンプルさ優先、(b) opaque FFI と (c) JSON bridge は永久 Node 依存になるため却下、`§3.3` の「コンパイラが自分自身をコンパイルできる範囲がサブセットの下限」と最も整合)。生成された native compiler path は **Node 依存ゼロの AOT バイナリ**で、コアは `ast.ts` / `lexer.ts` / `topaz_parser.ts` / `loader.ts` / `codegen.ts` / `cli.ts` + `runtime/runtime.h`。source repo には development / stage1 harness として `parser.ts`(tsc parser bridge) / `convert_from_tsc.ts` / `parser_check.ts` / `pnpm` / `tsc` を残す。**重要な設計判断**: SyntaxKind は string literal discriminator + dunion(1.5-3e narrowing が直接効く、enum 解禁しない)/ regex literal は未対応に固定(`/` は常に演算子、`isAnonClassName` を書き換え)/ destructuring は通さず anon class + 個別 field access に書き換え(サブセット最小化)/ ASI は最小限(`return` / `throw` / `break` / `continue` の直後改行のみ)/ 生成 C の bit-for-bit 比較を主指標(cc バージョン依存避け)/ AST 型は Node 製 stage1 と Topaz 製 stage2 で共有。10 サブステップ完了:
    - [x] **1.5-6a** — lexer 単体。`src/lexer.ts` で byte stream → `Array<Token>` を生成。token kind は dunion(ident / number / string / template / punct / keyword / newline / eof)、`newline` token を ASI 用に明示 emit、position tracking、regex literal は未対応に固定。CLI の `--lex-only` と parser 入力で継続回帰。
    - [x] **1.5-6b** — parser core(expression / literal)。`src/topaz_parser.ts` に Topaz サブセット parser を実装、precedence climbing で expression を処理。AST 型は `src/ast.ts` に集約し、arrow vs paren は token cursor の save/restore で backtrack。
    - [x] **1.5-6c** — parser statement(if / for / for-of / while / do / switch / return / throw / try / break / continue / block / var)+ 制御フロー。`examples/*` の statement 系ケースは Topaz parser 経由で smoke gate が通る。
    - [x] **1.5-6d** — parser declaration(class / interface / function / type alias / import、generic class / generic function 含む)。module graph 全体を `SourceModule` に組み上げ、既存 codegen の AST 入力へ接続。
    - [x] **1.5-6e** — AST 型統合(Node 製 codegen の入力切替、**最大の safety net**)。`src/ast.ts` に `Topaz.Module` 型を確定、Node 製 stage1 のまま `convertFromTsc(sf: ts.SourceFile): Topaz.Module` ブリッジを置く。`src/codegen.ts` の入力を `ts.SourceFile` から `Topaz.Module` に切替、`tests/smoke.sh` が pass する = codegen 挙動不変を確認。ここまで通れば parser 置き換えは入力型同一なので Equivalence だけ確認すれば良い。**完了**(6e-1 型 ADR`0027` / 6e-2 式+文+推論 SCC `0028` / 6e-3 宣言+Emitter 状態 `0029` ※番号は git log 参照 / 6e-4 エントリ倒し + tsc import 全除去 `0031`)。codegen.ts は `typescript` を一切 import せず、`convertFromTsc` ブリッジは cli.ts に存在。エラー位置は `SourceModule.lineStarts` + `posToLineCol` で tsc 非依存にバイト一致維持。
    - [x] **1.5-6f** — runtime / stdlib 拡張。`runtime/runtime.h` に self-hosting で必要な fs(read/write/exists/mkdirp)・path(dirname/basename/join/resolve/extname)・process(argv/exit/console_error)・spawn(cc 起動)・number_parse(strtod)・string method(charCodeAt/slice/fromCharCode/startsWith/endsWith/indexOf)を追加。header-only 維持、libc + libm のみ依存。
    - [x] **1.5-6g** — loader Topaz 化。`src/loader.ts` は production loading で `src/topaz_parser.ts` を使い、DFS + 循環検出 + topological flatten は既存ロジックを保持。loader が module-specifier validation、codegen が non-root executable statement policy を担当する分担に整理。
    - [x] **1.5-6h** — cli Topaz 化。`src/cli.ts` は手書き argv parse(`-o` / `--output` / `--emit-c-only` / `--lex-only` / `--parse-only` / `-h`)、loader → codegen → cc 呼び出しに整理。self-hosted binary では JSON dump tooling を切り、native compiler path を優先。
    - [x] **1.5-6i** — stage2 bootstrap。stage1 (Node 製) で `src/cli.ts` を C に emit → native CLI 化し、その native CLI で再度 `src/cli.ts` を C に emit → stage2 native CLI 化する bootstrap ladder を `tests/selfhost_stage2.sh` / `pnpm run test:selfhost` に固定。stage2 native CLI が `examples/fib.ts` を native binary にして `5702887` を出力し、さらに `src/cli.ts` の C emit (`build/selfhost_cli_by_stage2.c`) に成功することを milestone gate とする。default `pnpm test` には入れず、日常 smoke と高コスト self-host gate を分離。
    - [x] **1.5-6j** — bit-for-bit fixed point。`pnpm run test:selfhost` が `build/selfhost_cli_by_selfhost.c`(stage2 compiler C) と `build/selfhost_cli_by_stage2.c`(stage3 compiler C) の `diff -u` を gate 化し、さらに stage2 C から `build/selfhost_cli_stage3_native` を生成して `examples/fib.ts` をビルド・実行し `5702887` を確認する。これで self-hosting 1.5-6 のクリティカルパスは完了。**Node 依存ゼロ宣言の範囲**は生成されたネイティブ AOT compiler binary と runtime path であり、source repo の development harness (`pnpm` / `tsc` / `tests`) は開発・stage1 用に残す。
  - [ ] **1.5-X (post-selfhost backlog)** — no-catch `try/finally` は ADR `0292` で着地済み。残りは `try/catch/finally` と、try body 内 `return` / `break` / `continue` を `finally` cleanup へ dispatch する lowering。self-hosting では不要だったため Phase 2.3c〜d へ持ち越す。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`§3.3`)であることを忘れない。

### Phase 2: 実用性

Phase 2 は「self-hosting できる」から「実用的に配れる / 測れる」へ進む段階。大きな runtime 機能へ入る前に、固定点 gate を壊さず性能・警告・配布単位を観測できる足場を先に置く。

- [x] **2.0 baseline hygiene** — `pnpm run build` / `pnpm test` / `pnpm run test:selfhost` を Phase 2 の開始基準として再確認。fixed-point gate は通過し、generated full-compiler C の warning inventory は stage1/stage2/stage3 で同一(46 `-Wreturn-type` / 38 `-Wunused-parameter` / 1 `-Wunused-variable` / 1 `-Wunused-function`)。決定ログは `docs/adr/0311-phase2-baseline-hygiene.md`。
- [x] **2.1 benchmark suite** — `pnpm bench` を追加し、compiler 自体(`src/cli.ts` emit/compile)、`examples/fib.ts` build/run、runtime hot paths(number/string/container)を best/median ms で測る最小ベンチを固定。`TOPAZ_BENCH_RUNS` で run 数を変更可能。決定ログは `docs/adr/0312-minimal-benchmark-suite.md`。
- [x] **2.2a stdlib surface design** — self-hosting 用の `node:*` shortcut は compiler 互換として残し、公開 Topaz stdlib の方向を `std/fs` / `std/path` / `std/process` に分ける方針として固定。`node:child_process` / `node:url` / `import.meta.url` は初期 public stdlib から外し、`std/process` の具体的 import 名は未決。決定ログは `docs/adr/0313-stdlib-surface-design.md`。
- [x] **2.2b stdlib aliases** — `std/path` を `node:path` と同じ named import set(`dirname` / `resolve` / `basename` / `extname` / `join`)として loader allowlist に追加。codegen / runtime は既存 call-site shortcut を再利用し、既存 `node:*` import は self-host/compiler 互換として残す。決定ログは `docs/adr/0314-std-path-alias.md`。
- [x] **2.2c process stdlib design** — `std/process` の public API 名を named import の `argv` / `exit` / `writeStdout` / `writeStderr` / `writeError` として固定。既存の `process.argv` / `process.exit` / `process.stdout.write` / `process.stderr.write` / `console.error` は self-host/compiler 互換の synthetic/global support として残す。決定ログは `docs/adr/0315-std-process-api-names.md`。
- [x] **2.3a post-selfhost backlog audit** — self-host probe は `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe` で通っており、緊急 blocker ではなく再現可能な実用 gap 順に進める。no-catch `try/finally` は ADR `0292` で着地済みのため、残りを 2.3b〜d に分割。決定ログは `docs/adr/0316-post-selfhost-backlog-audit.md`。
- [ ] **2.3b generic function Array<T> monomorph sample** — generic 関数が `Array<T>` を返す経路で、generic / non-generic の monomorph slot 収集に concrete な positive/fail gap があるかを先にサンプルで再現する。gap が再現できなければ既存 coverage として記録し、コード変更しない。
- [ ] **2.3c generic method/interface design** — generic method(`class C { f<U>(...) {} }`) / generic interface は、method type parameter と class/interface monomorph storage・vtable shape に跨るため設計専用フェーズで境界を切る。
- [ ] **2.3d try/finally cleanup dispatch design** — `try/catch/finally` と try body 内 `return` / `break` / `continue` を `finally` cleanup へ流す dispatch lowering を設計専用フェーズで固定する。
- [ ] **2.4 async / regexp / bigint** — Promise / async-await(Fiber ベース実装)、regexp 統合、bigint 統合(必要時のみリンク)は、2.0〜2.3 の足場ができてから個別 ADR で設計する。

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

- [x] **generic backlog audit** — Phase 2.3 を ADR `0316` で分割し、generic method / generic interface は 2.3c の設計専用フェーズへ降ろした。
- [ ] **generic function Array<T> monomorph sample** — 2.3b として、generic 関数の戻り値が `Array<T>` の場合の concrete gap を positive/fail sample で先に再現する。再現できなければ既存 coverage として記録する。
- [ ] **generic method/interface design** — 2.3c として、method type parameter と generic interface の monomorph storage / vtable shape を設計する。
- [ ] **try/finally cleanup dispatch design** — 2.3d として、`try/catch/finally` と try body 内 `return` / `break` / `continue` の cleanup dispatch を設計する。no-catch `try/finally` は ADR `0292` で実装済み。

---

## 参考リンク

- [matz/spinel](https://github.com/matz/spinel) — 直接のインスピレーション源
- [facebook/hermes](https://github.com/facebook/hermes)(`static_h` ブランチ) — Static Hermes
- [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) — JS/TS AOT 研究
- [AssemblyScript](https://www.assemblyscript.org/) — TS 構文の別言語の先例
- [Effect-TS](https://effect.website/) — TS 内で effect system を擬似実装した例
