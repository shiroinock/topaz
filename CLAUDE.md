# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript-syntax AOT native compiler. TS の構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で真の AOT ネイティブコンパイルを狙う。詳細な設計判断・ロードマップ・落とし穴は `MEMO.md`(設計検討資料)を必ず読むこと。`docs/parser-choice.md` に Phase 0 のパーサ選定根拠がある。

現在 **Phase 1.4c-1a 完了(`Array<ClassName>` / `Array<InterfaceName>` 着地)、次は Phase 1.4c-1b(`Map<K, ClassName>` / `Map<K, InterfaceName>` / `Set<ClassName>` / `Set<InterfaceName>`)**。Phase 1.1 までで制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論を整備し、Phase 1.2 で `%` の `fmod` 化、ECMA-262 準拠 shortest round-trip による `number → string`、`switch`(`do/while(0)` ラダーへ lowering)、`string` 型(immutable・ASCII のみ・連結 `+` / `+=` / `.length` / `===`)を追加。Phase 1.3a で `Array<T>`(monomorphize、reference 渡し、doubling growable buffer、`.length` / `[i]` / `[i]=v` / `.push` / `.pop`)、Phase 1.3b で `Map<K, V>` / `Set<T>`(K×V 9 monomorph + T 3 monomorph、open-addressing + tombstone、SameValueZero key 同値性、`.set` / `.get` / `.has` / `.delete` / `.add` / `.size`)を入れた。Phase 1.4a で class(明示的 constructor 必須、フィールド・インスタンスメソッド・`this`・プロパティ read/write・`new ClassName(args)`、reference 型で `calloc` 確保・leak、継承・ジェネリクスは未対応)、Phase 1.4b で interface(構造的型を fat pointer + per-(I, C) vtable で実装、`implements` で宣言、EXACT 構造的一致、class→interface coercion は変数初期化 / 関数引数 / `return` / 代入 RHS の 4 サイトのみ)を着地。Phase 1.4c-1a で generics の最初のサブフェーズとして `Array<ClassName>` / `Array<InterfaceName>` を on-demand monomorph として展開(ユーザー側はまだ generic 宣言を書けない・コンパイラが型注釈・配列リテラル・push 引数・`[i] = v` の RHS から要素型を集めて要素ごとに `TOPAZ_ARRAY_DEFINE` を on-demand 展開する形)。`tests/smoke.sh` が複数ケースを回す形になっている。

## Commands

- `npm run build` — `tsc` で `src/` を `dist/` に出す。
- `npm test` — `tests/smoke.sh`。`examples/*.ts` を順にコンパイル→実行して期待値と一致するか確認(`fib`, `loop_sum`, `while_count`, `boolean_print`, `mod_check`, `switch_check`, `number_format`, `string_basic`, `array_basic`, `map_set_basic`, `class_basic`, `interface_basic`, `array_class_iface`)。新しいサンプルを追加したら `run_case` 行を増やす。
- `npm run topaz -- <input.ts> [-o out]` — CLI を npm 越しに起動。
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C をファイルに残す。

cc のパスを変える / フラグ追加したい時は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Architecture

パイプライン:

```
*.ts ──parseFile──▶ ts.SourceFile ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

- `src/parser.ts` — `typescript` の `ts.createSourceFile` を呼ぶだけの薄いラッパ。型チェッカーは使わない(全プログラム推論は将来自前で書く)。
- `src/codegen.ts` — AST から C を直接吐く。未対応構文は `CodegenError` で `file:line:col` 付きで投げて止まる(`MEMO §3.1` の「禁止じゃなく未対応」方針)。`Emitter` クラスがレキシカルスコープ(`Scope`)、関数 signature テーブル(`functionSigs` = params + returnType)、クラス情報テーブル(`classes`)、interface 情報テーブル(`interfaces`)、`this` の解決用に現在処理中のクラス名(`currentClass`)、`return` の coercion 用に現在処理中の関数/メソッドの戻り値型(`currentReturnType`)を持ち、式単位で `inferType` を走らせて型不一致や `const` 再代入をエラーにする。型注釈なしの `let`/`const` は初期化式から型を推論する(`number` / `boolean` / `string` リテラル、識別子、関数呼び出し、各種演算、`new ClassName(...)`)。class → interface coercion は `emitWithExpected(expr, expectedType)` ヘルパに集約してあり、変数初期化 / 関数引数 / `return` / 代入 RHS の 4 サイトでのみ走る。
- `src/cli.ts` — argv パース、parser → codegen → cc を駆動。`runtime/` は `dist/../runtime` で解決。
- `runtime/runtime.h` — header-only。`topaz_number`(= `double`)、`topaz_boolean`(= C99 `bool`)、`topaz_string`(= `{ const char *data; size_t len; }`)、`topaz_console_log_*`、`topaz_fmod`、`topaz_string_concat`、`topaz_string_eq`、`topaz_emit_number_shortest`(ECMA-262 shortest)、`TOPAZ_ARRAY_DEFINE(name, elem_t)` で monomorphize される growable array(`number` / `boolean` / `string` の 3 monomorph 済み)、`topaz_hash_<scalar>` / `topaz_key_eq_<scalar>` と `TOPAZ_MAP_DEFINE(name, key_t, val_t, hash_fn, eq_fn)` / `TOPAZ_SET_DEFINE(name, elem_t, hash_fn, eq_fn)` で生成する open-addressing ハッシュテーブル(Map は scalar 3×3 の 9 monomorph、Set は 3 monomorph)。interface 用の fat pointer 型(`topaz_iface_<I> = { void *data; const struct topaz_iface_<I>_vt *vt; }`)と vtable struct、および class/interface 要素の `topaz_array_class_<C>` / `topaz_array_iface_<I>` monomorph は codegen 時にユーザー宣言から生成される(runtime.h 側に固有実装はない)。
- `examples/fib.ts` — Phase 0 の done 定義サンプル。`examples/fib.handwritten.c` は codegen ターゲット仕様を手で確定するための参照実装。
- `examples/loop_sum.ts` / `examples/while_count.ts` / `examples/boolean_print.ts` — Phase 1.1 の回帰サンプル(`for`/`let`/`while`/`boolean` の代表ケース)。
- `examples/mod_check.ts` / `examples/switch_check.ts` / `examples/number_format.ts` / `examples/string_basic.ts` — Phase 1.2 の回帰サンプル(`%`/`switch`/数値フォーマット/`string` の代表ケース)。
- `examples/array_basic.ts` — Phase 1.3a の回帰サンプル(`number[]` / `Array<boolean>` / `Array<string>` の生成・読み書き・`.push` / `.pop` / `.length` / 空配列リテラル)。
- `examples/map_set_basic.ts` — Phase 1.3b の回帰サンプル(`Map<string,number>` / `Map<boolean,string>` / `Map<number,number>` / `Set<number>` / `Set<string>` の生成・`.set` / `.get` / `.has` / `.delete` / `.add` / `.size`、50 要素入れて grow パスを叩くケース、`new Map()` の context typing)。
- `examples/class_basic.ts` — Phase 1.4a の回帰サンプル(`Point` / `Greeter` の宣言、`new` 呼び出し、`this.field` 読み書き、`+=` での複合代入、reference 共有(`r = p` 後の field 変更が反映される)、関数引数・戻り値としてクラスインスタンスを渡す、メソッドがクラスインスタンスを引数に取る、`string` フィールド+メソッド内 `string` 連結)。
- `examples/interface_basic.ts` — Phase 1.4b の回帰サンプル(`Shape` interface に対する `Circle` / `Square` の `implements`、`describe(s: Shape): number` / `makeShape(kind: number): Shape` で interface 引数・戻り値、`const a: Shape = new Circle(2)` で変数初期化時の class→interface coercion、`a.name`(getter)/`a.name = "renamed"`(setter)/`a.area()` / `a.scale(3)` の vtable dispatch、`makeShape(2).area()` で base が副作用を持つ式のケース)。
- `examples/array_class_iface.ts` — Phase 1.4c-1a の回帰サンプル(`Counter[]` で class 要素 array の `.length` / `[i]` / `[i] = new C(...)` / `.push` / `.pop`、`Array<Named>` で interface 要素 array、`shapes[0] = new Circle(5)` / `shapes.push(new Square(4))` 経由の class→interface coercion、空 array 注釈 `Counter[]` / `Named[]` に `.push` で生やすケース)。
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
- **`Array<T>` は monomorphize 後の reference 型**。変数は `topaz_array_<elem> *` を持ち、代入で storage を共有する。`number` / `boolean` / `string` の 3 monomorph は `runtime/runtime.h` に `TOPAZ_ARRAY_DEFINE` でプリ展開済み。class / interface 要素は Phase 1.4c-1a で対応し、codegen が型注釈・配列リテラル・push 引数・`[i] = v` の各サイトから集めた `topaz_array_class_<C>` / `topaz_array_iface_<I>` を `Emitter.arrayMonomorphs` に登録、生成 C の interface vtable 定義の後・class struct 定義の前に `TOPAZ_ARRAY_DEFINE(class_<C>, topaz_class_<C> *)` / `TOPAZ_ARRAY_DEFINE(iface_<I>, topaz_iface_<I>)` を `#pragma GCC diagnostic ignored "-Wunused-function"` で囲んで吐く。`[i]` / `[i] = v` はバウンドチェック付き(範囲外で `abort`、`NaN` も弾く)、interface 要素の `[i] = v` は `emitWithExpected` で class→interface coercion が走るので RHS に implementing class を直接書ける。`.push` は void なので式中で使えない、`.pop` は要素を返す(interface 要素の `.pop` の値は fat pointer 戻り)。空 `[]` リテラルは要素型推論できないので注釈必須(class/interface 要素も同じく注釈必須)。配列要素への複合代入(`a[i] += v` 等)はインデックス二重評価を避けるため未対応エラー。`console.log` の配列引数も未対応(整形ポリシー未定)。ネストした `Array<Array<T>>` / 任意の generic 関数・クラスは Phase 1.4c-2 以降で再設計する。
- **`Map<K, V>` / `Set<T>` も monomorphize 後の reference 型**。変数は `topaz_map_<K>_<V> *` / `topaz_set_<T> *` を持ち、`Array<T>` と同じく代入で storage を共有する。`new Map<K, V>()` / `new Set<T>()` は型引数必須(`Array` と同様 `[]` リテラル相当の context typing は `let m: Map<...> = new Map()` の declareVar 経由のみ受理)。コンストラクタ引数(iterable initializer)は未対応。メソッドは Map = `.set` / `.get` / `.has` / `.delete` / `.size`、Set = `.add` / `.has` / `.delete` / `.size`(`.size` は property、それ以外は method call)。`.set` / `.add` は `Array.push` 同様 void 扱いでチェーン不可。`.get` は key 不在で `abort` するので、optional/union を持たない現状は `.has` で先にチェックする運用(JS 仕様の `V | undefined` とは divergence)。`console.log` の Map/Set 引数も未対応。
- **Map/Set の key 同値性は SameValueZero**(NaN === NaN、-0 === +0)。これは JS Map の published セマンティクスに合わせたもので、`===` 演算子(NaN !== NaN)とは意図的に divergence する。number key の hash は `splitmix64`、string key は FNV-1a、boolean key は 0/1。テーブルは open-addressing + 線形プローブ + tombstone、load factor 0.75 で grow(tombstone が多いだけなら同 cap で rehash)。
- **class は reference 型**。変数は `topaz_class_<Name> *` を持ち、Array/Map/Set と同じく代入で storage を共有する(`r = p` で field の変更が `p` 経由でも見える)。`new ClassName(args)` は `topaz_class_<Name>_new(args)` を呼び、ボディは `calloc(1, sizeof(*self))` で 0 埋め確保→constructor 本体→`return self`。インスタンスメソッドは `static <ret> topaz_class_<Name>_method_<m>(topaz_class_<Name> *__topaz_this, ...)` に展開し、`this` は `__topaz_this` に lower。`this.field` / `obj.field` の read は `((obj)->field)`、write は普通の C 代入(`obj.field = v` / `obj.field += v` の compound も C 側に下ろせるので native lvalue として扱う、ただし `obj` が複雑な式の二重評価を避けるため代入の base は識別子・`this`・チェーンされた property access のみに制限)。フィールド宣言は型注釈必須・初期化子禁止(`x: number = 0` は未対応、constructor で代入させる)、フィールドが 1 つでもあるクラスは constructor 必須。`class C implements I` で interface を宣言できる(構造的一致は EXACT match を要求、covariant return / contravariant param は未対応)。
- **class の未対応リスト(明示エラー)**。`extends`、`static` / `private` / `protected` / `public` / `readonly` / `abstract` / `override` 修飾子、generic class / generic method(Phase 1.4c-2 以降)、class expression、decorator、getter / setter、static block、parameter property shorthand(`constructor(public x: number)`)、`super`、暗黙コンストラクタ、メソッド参照(`obj.method` without `()`)、constructor 内 `return`、class を `console.log` の引数に取る。`Array<ClassName>` は Phase 1.4c-1a で対応済み。`Map<K, ClassName>` / `Set<ClassName>` 等は Phase 1.4c-1b で着地予定。
- **interface は fat pointer + per-(I, C) vtable**。変数は `topaz_iface_<I>`(= `{ void *data; const struct topaz_iface_<I>_vt *vt; }`)を値として持ち、vtable には field ごとの `get_<f>` / `set_<f>` 関数ポインタとメソッド関数ポインタが並ぶ。class が複数の interface を implement する場合、per-(I, C) wrapper 関数 + static const vtable を 1 つずつ生成し、coercion 時に `((topaz_iface_<I>){ .data = obj, .vt = &topaz_iface_<I>_for_<C>_vt })` の compound literal で fat pointer を組み立てる。dispatch は `({ topaz_iface_<I> __t = base; __t.vt->method(__t.data, args); })` の GCC stmt expression で base を一度評価する形に統一(base が `makeShape(2)` のような副作用持ちでも二重評価を避けるため)。class→interface coercion は `emitWithExpected` ヘルパに集約し、変数初期化 / 関数引数 / `return` / 代入 RHS の 4 サイトでのみ走る(interface→class narrowing、interface→interface coercion、`==`/`!==` での widening は未対応)。
- **interface の未対応リスト(明示エラー)**。`extends`(interface inheritance)、generic interface、optional field/method(`f?: T` / `m?(): T`)、interface modifiers(`export` / `default`)、`readonly` field、index signature(`[k: string]: T`)、call/construct signature、getter / setter、`new InterfaceName()`(implementing class を `new` しろと案内)、interface 値を `console.log` の引数に取る、interface field への compound assignment(`iface.f += v`、stmt expr で複雑化するため `iface.f = iface.f + v` を書けと案内)、interface field 代入の chain(`x = (iface.f = v)`、setter が void を返すため)。`Array<InterfaceName>` は Phase 1.4c-1a で対応済み(class→interface coercion を配列リテラル各要素 / `.push` 引数 / `[i] = v` の RHS の 3 サイトで走らせる)。`Map<K, InterfaceName>` / `Set<InterfaceName>` 等は Phase 1.4c-1b で着地予定。class が implement する際の構造的一致は EXACT match を要求(field/method 型が完全一致しないと「`class C.f` has type X, but interface I requires Y」)。

### 既知の divergence

- `string.length` は UTF-8 バイト長で、JS の UTF-16 code units と divergence する。非 ASCII を含む文字列リテラルは codegen 段でエラーに落としているため未対応のまま顕在化はしないが、`Array` や FFI で外から非 ASCII が来た時点で破綻する。Phase 1.5(全プログラム型検証)で UTF-16 へ寄せるか、`string` を UCS-2/UTF-16 で表現し直すか決める。
- `topaz_emit_number_shortest` は `snprintf("%.*e") + strtod` のラウンドトリップ探索を 1〜17 回まわす実装で、観測上の出力は ECMA-262 ToString と一致するが、Ryu と比べて 1〜2 桁遅い。Phase 2 のベンチマーク整備時に Ryu(Ulf Adams)へ差し替える宿題。
- 文字列連結は毎回 `malloc`、解放はしない(Phase 1.5 までヒープ管理を持たないため)。長時間走るプログラムだとリークする。Map/Set の slot buffer や rehash で確保したテーブルも同じく leak 前提(`free` は rehash 時の旧テーブルだけ呼んでいる)。
- 数値表記の divergence(`3.14` / `0.1+0.2` / `1e21` 等)と `%` の divergence は解消済み(Phase 1.2)。
- `Map.get(k)` は JS では `V | undefined` を返すが、現状 optional/union を持たないため key 不在で `abort` する。`Map.set` / `Set.add` は JS では `this` を返すが、`Array.push` と同じく void 扱いで chain 不可。`Map.set` の中で型不一致(`m.set(k, undefined)` 相当)も書ける手段がないので顕在化しない。
- class インスタンスはすべて `calloc` で確保するため、JS の「未初期化フィールドは `undefined`」とは divergence する。scalar field は 0 / false / `{NULL, 0}` の空 string で、reference field は NULL ポインタになる。constructor 内で全フィールドに代入することを実装者が責任を持つ前提(TS の `--strictPropertyInitialization` 相当のチェックは Phase 1.5 で全プログラム検証を入れる時に行う)。reference field を未初期化のまま使うと segfault する。
- interface は EXACT 構造的一致を要求する(covariant return / contravariant param なし)ため、TS の構造的サブタイプとは divergence する。例えば interface が `f(): I` で、class が `f(): C`(C implements I)を返すケースは「class C.f returns C, but interface I requires I」エラーになる。Phase 1.4c の generics で variance を持ち込むかどうか判断する宿題。interface field 代入(`iface.f = v`)は vtable setter 経由で void を返すため、`x = (iface.f = v)` の chained assignment は使えない(C 側で「assigning void to ...」のコンパイルエラーになる)。class field 代入は C lvalue なので chain できる、その差は documentation で許容。

## Phase 0 から先

ロードマップ全体は `MEMO §6`。Phase 1 は self-hosting 可能なサブセットまで持っていく段階で、クラス・interface・ジェネリクス(monomorphize)・例外・ES module 静的解決・全プログラム型検証が射程。Phase 2 で async/await(Fiber)、bigint、regexp、ベンチマーク整備。

Phase 1 の内訳(現状の刻み方):

- **Phase 1.1 (done)** — 制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論。
- **Phase 1.2 (done)** — `%` の `fmod` 化、ECMA-262 ToString による shortest `number → string`(現状は `snprintf+strtod` ループ、Ryu 差し替えは Phase 2 のベンチ整備時に回す)、`switch`(`do/while(0)` ラダー、暗黙 fall-through 禁止、`default` 最後限定、`string` discriminant 対応)、`string` 型(immutable・ASCII 限定・`+`/`+=`/`.length`/`===`/`!==`)。
- **Phase 1.3 (done)** — 1.3a で `Array<T>`(monomorphized)、1.3b で `Map<K, V>` / `Set<T>`(scalar key/value monomorph、open-addressing + tombstone、SameValueZero key equality、`new Map<K,V>()` / `new Set<T>()` 構文)。
- **Phase 1.4** — 1.4a で class(継承・ジェネリクスなし、明示 constructor、reference 型、`this` / プロパティ read/write / メソッド呼び出し / `new ClassName(args)`、done)、1.4b で interface(`implements` 宣言、fat pointer + per-(I, C) vtable、EXACT 構造的一致、class→interface coercion は 4 サイト限定、done)、1.4c で generics:
  - **1.4c-1a (done)** — `Array<ClassName>` / `Array<InterfaceName>` をユーザー宣言不要の on-demand monomorph として展開(`TopazType` に `topaz_array_class_<C>` / `topaz_array_iface_<I>` を追加、Emitter が必要な monomorph を集めて生成 C に `TOPAZ_ARRAY_DEFINE` を吐く、配列リテラル各要素 / `.push` 引数 / `[i] = v` の RHS で class→interface coercion)。
  - **1.4c-1b** — `Map<K, ClassName>` / `Map<K, InterfaceName>` / `Set<ClassName>` / `Set<InterfaceName>`(Set は要素の同値判定で reference identity と structural equality の選択が宿題)。
  - **1.4c-2** — generic function(`function f<T>(...)`、monomorphize は呼び出しサイトの型から逆引き)。
  - **1.4c-3** — generic class(`class Box<T> { ... }`、`new Box<number>()` でインスタンス化、コンテナ自前定義が可能になる)。
- **Phase 1.5** — 例外、ES module 静的解決、全プログラム型検証、ヒープ管理(GC/arena)、self-hosting 通過。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。

新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)であることを忘れない。
