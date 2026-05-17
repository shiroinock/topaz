# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript-syntax AOT native compiler. TS の構文をフロントエンドにして、JS のセマンティクスを切り捨てた上で真の AOT ネイティブコンパイルを狙う。詳細な設計判断・ロードマップ・落とし穴は `MEMO.md`(設計検討資料)を必ず読むこと。`docs/parser-choice.md` に Phase 0 のパーサ選定根拠がある。

現在 **Phase 1.4a 完了(class 着地)、次は Phase 1.4b(interface / 構造的型)、その先 1.4c(generics)**。Phase 1.1 までで制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論を整備し、Phase 1.2 で `%` の `fmod` 化、ECMA-262 準拠 shortest round-trip による `number → string`、`switch`(`do/while(0)` ラダーへ lowering)、`string` 型(immutable・ASCII のみ・連結 `+` / `+=` / `.length` / `===`)を追加。Phase 1.3a で `Array<T>`(monomorphize、reference 渡し、doubling growable buffer、`.length` / `[i]` / `[i]=v` / `.push` / `.pop`)、Phase 1.3b で `Map<K, V>` / `Set<T>`(K×V 9 monomorph + T 3 monomorph、open-addressing + tombstone、SameValueZero key 同値性、`.set` / `.get` / `.has` / `.delete` / `.add` / `.size`)を入れた。Phase 1.4a で class(明示的 constructor 必須、フィールド・インスタンスメソッド・`this`・プロパティ read/write・`new ClassName(args)`、reference 型で `calloc` 確保・leak、継承・ジェネリクスは未対応)を着地させた。`tests/smoke.sh` が複数ケースを回す形になっている。

## Commands

- `npm run build` — `tsc` で `src/` を `dist/` に出す。
- `npm test` — `tests/smoke.sh`。`examples/*.ts` を順にコンパイル→実行して期待値と一致するか確認(`fib`, `loop_sum`, `while_count`, `boolean_print`, `mod_check`, `switch_check`, `number_format`, `string_basic`, `array_basic`, `map_set_basic`, `class_basic`)。新しいサンプルを追加したら `run_case` 行を増やす。
- `npm run topaz -- <input.ts> [-o out]` — CLI を npm 越しに起動。
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C をファイルに残す。

cc のパスを変える / フラグ追加したい時は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Architecture

パイプライン:

```
*.ts ──parseFile──▶ ts.SourceFile ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

- `src/parser.ts` — `typescript` の `ts.createSourceFile` を呼ぶだけの薄いラッパ。型チェッカーは使わない(全プログラム推論は将来自前で書く)。
- `src/codegen.ts` — AST から C を直接吐く。未対応構文は `CodegenError` で `file:line:col` 付きで投げて止まる(`MEMO §3.1` の「禁止じゃなく未対応」方針)。`Emitter` クラスがレキシカルスコープ(`Scope`)、関数戻り値テーブル(`functionReturns`)、クラス情報テーブル(`classes`)、`this` の解決用に現在処理中のクラス名(`currentClass`)を持ち、式単位で `inferType` を走らせて型不一致や `const` 再代入をエラーにする。型注釈なしの `let`/`const` は初期化式から型を推論する(`number` / `boolean` / `string` リテラル、識別子、関数呼び出し、各種演算、`new ClassName(...)`)。
- `src/cli.ts` — argv パース、parser → codegen → cc を駆動。`runtime/` は `dist/../runtime` で解決。
- `runtime/runtime.h` — header-only。`topaz_number`(= `double`)、`topaz_boolean`(= C99 `bool`)、`topaz_string`(= `{ const char *data; size_t len; }`)、`topaz_console_log_*`、`topaz_fmod`、`topaz_string_concat`、`topaz_string_eq`、`topaz_emit_number_shortest`(ECMA-262 shortest)、`TOPAZ_ARRAY_DEFINE(name, elem_t)` で monomorphize される growable array(`number` / `boolean` / `string` の 3 monomorph 済み)、`topaz_hash_<scalar>` / `topaz_key_eq_<scalar>` と `TOPAZ_MAP_DEFINE(name, key_t, val_t, hash_fn, eq_fn)` / `TOPAZ_SET_DEFINE(name, elem_t, hash_fn, eq_fn)` で生成する open-addressing ハッシュテーブル(Map は scalar 3×3 の 9 monomorph、Set は 3 monomorph)。
- `examples/fib.ts` — Phase 0 の done 定義サンプル。`examples/fib.handwritten.c` は codegen ターゲット仕様を手で確定するための参照実装。
- `examples/loop_sum.ts` / `examples/while_count.ts` / `examples/boolean_print.ts` — Phase 1.1 の回帰サンプル(`for`/`let`/`while`/`boolean` の代表ケース)。
- `examples/mod_check.ts` / `examples/switch_check.ts` / `examples/number_format.ts` / `examples/string_basic.ts` — Phase 1.2 の回帰サンプル(`%`/`switch`/数値フォーマット/`string` の代表ケース)。
- `examples/array_basic.ts` — Phase 1.3a の回帰サンプル(`number[]` / `Array<boolean>` / `Array<string>` の生成・読み書き・`.push` / `.pop` / `.length` / 空配列リテラル)。
- `examples/map_set_basic.ts` — Phase 1.3b の回帰サンプル(`Map<string,number>` / `Map<boolean,string>` / `Map<number,number>` / `Set<number>` / `Set<string>` の生成・`.set` / `.get` / `.has` / `.delete` / `.add` / `.size`、50 要素入れて grow パスを叩くケース、`new Map()` の context typing)。
- `examples/class_basic.ts` — Phase 1.4a の回帰サンプル(`Point` / `Greeter` の宣言、`new` 呼び出し、`this.field` 読み書き、`+=` での複合代入、reference 共有(`r = p` 後の field 変更が反映される)、関数引数・戻り値としてクラスインスタンスを渡す、メソッドがクラスインスタンスを引数に取る、`string` フィールド+メソッド内 `string` 連結)。
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
- **`Array<T>` は monomorphize 後の reference 型**。変数は `topaz_array_<elem> *` を持ち、代入で storage を共有する。要素型ごとに `TOPAZ_ARRAY_DEFINE` で `_new` / `_reserve` / `_push` / `_pop` / `_at` / `_set` を生成し、現状 `number` / `boolean` / `string` の 3 monomorph をプリ展開している(ネストや任意要素型は Phase 1.4 のジェネリクス展開で再設計)。`[i]` / `[i] = v` はバウンドチェック付き(範囲外で `abort`、`NaN` も弾く)。`.push` は void なので式中で使えない、`.pop` は要素を返す。空 `[]` リテラルは要素型推論できないので注釈必須。配列要素への複合代入(`a[i] += v` 等)はインデックス二重評価を避けるため未対応エラー。`console.log` の配列引数も未対応(整形ポリシー未定)。
- **`Map<K, V>` / `Set<T>` も monomorphize 後の reference 型**。変数は `topaz_map_<K>_<V> *` / `topaz_set_<T> *` を持ち、`Array<T>` と同じく代入で storage を共有する。`new Map<K, V>()` / `new Set<T>()` は型引数必須(`Array` と同様 `[]` リテラル相当の context typing は `let m: Map<...> = new Map()` の declareVar 経由のみ受理)。コンストラクタ引数(iterable initializer)は未対応。メソッドは Map = `.set` / `.get` / `.has` / `.delete` / `.size`、Set = `.add` / `.has` / `.delete` / `.size`(`.size` は property、それ以外は method call)。`.set` / `.add` は `Array.push` 同様 void 扱いでチェーン不可。`.get` は key 不在で `abort` するので、optional/union を持たない現状は `.has` で先にチェックする運用(JS 仕様の `V | undefined` とは divergence)。`console.log` の Map/Set 引数も未対応。
- **Map/Set の key 同値性は SameValueZero**(NaN === NaN、-0 === +0)。これは JS Map の published セマンティクスに合わせたもので、`===` 演算子(NaN !== NaN)とは意図的に divergence する。number key の hash は `splitmix64`、string key は FNV-1a、boolean key は 0/1。テーブルは open-addressing + 線形プローブ + tombstone、load factor 0.75 で grow(tombstone が多いだけなら同 cap で rehash)。
- **class は reference 型**。変数は `topaz_class_<Name> *` を持ち、Array/Map/Set と同じく代入で storage を共有する(`r = p` で field の変更が `p` 経由でも見える)。`new ClassName(args)` は `topaz_class_<Name>_new(args)` を呼び、ボディは `calloc(1, sizeof(*self))` で 0 埋め確保→constructor 本体→`return self`。インスタンスメソッドは `static <ret> topaz_class_<Name>_method_<m>(topaz_class_<Name> *__topaz_this, ...)` に展開し、`this` は `__topaz_this` に lower。`this.field` / `obj.field` の read は `((obj)->field)`、write は普通の C 代入(`obj.field = v` / `obj.field += v` の compound も C 側に下ろせるので native lvalue として扱う、ただし `obj` が複雑な式の二重評価を避けるため代入の base は識別子・`this`・チェーンされた property access のみに制限)。フィールド宣言は型注釈必須・初期化子禁止(`x: number = 0` は未対応、constructor で代入させる)、フィールドが 1 つでもあるクラスは constructor 必須。
- **class の未対応リスト(明示エラー)**。`extends` / `implements`、`static` / `private` / `protected` / `public` / `readonly` / `abstract` / `override` 修飾子、generic class / generic method(Phase 1.4c)、class expression、decorator、getter / setter、static block、parameter property shorthand(`constructor(public x: number)`)、`super`、暗黙コンストラクタ、メソッド参照(`obj.method` without `()`)、constructor 内 `return`、class を `console.log` の引数に取る。`Array<ClassName>` / `Map<K, ClassName>` 等のコンテナでクラスを持つ用途は monomorph 表に未登録なので未対応(Phase 1.4c の generics で再着地する)。

### 既知の divergence

- `string.length` は UTF-8 バイト長で、JS の UTF-16 code units と divergence する。非 ASCII を含む文字列リテラルは codegen 段でエラーに落としているため未対応のまま顕在化はしないが、`Array` や FFI で外から非 ASCII が来た時点で破綻する。Phase 1.5(全プログラム型検証)で UTF-16 へ寄せるか、`string` を UCS-2/UTF-16 で表現し直すか決める。
- `topaz_emit_number_shortest` は `snprintf("%.*e") + strtod` のラウンドトリップ探索を 1〜17 回まわす実装で、観測上の出力は ECMA-262 ToString と一致するが、Ryu と比べて 1〜2 桁遅い。Phase 2 のベンチマーク整備時に Ryu(Ulf Adams)へ差し替える宿題。
- 文字列連結は毎回 `malloc`、解放はしない(Phase 1.5 までヒープ管理を持たないため)。長時間走るプログラムだとリークする。Map/Set の slot buffer や rehash で確保したテーブルも同じく leak 前提(`free` は rehash 時の旧テーブルだけ呼んでいる)。
- 数値表記の divergence(`3.14` / `0.1+0.2` / `1e21` 等)と `%` の divergence は解消済み(Phase 1.2)。
- `Map.get(k)` は JS では `V | undefined` を返すが、現状 optional/union を持たないため key 不在で `abort` する。`Map.set` / `Set.add` は JS では `this` を返すが、`Array.push` と同じく void 扱いで chain 不可。`Map.set` の中で型不一致(`m.set(k, undefined)` 相当)も書ける手段がないので顕在化しない。
- class インスタンスはすべて `calloc` で確保するため、JS の「未初期化フィールドは `undefined`」とは divergence する。scalar field は 0 / false / `{NULL, 0}` の空 string で、reference field は NULL ポインタになる。constructor 内で全フィールドに代入することを実装者が責任を持つ前提(TS の `--strictPropertyInitialization` 相当のチェックは Phase 1.5 で全プログラム検証を入れる時に行う)。reference field を未初期化のまま使うと segfault する。

## Phase 0 から先

ロードマップ全体は `MEMO §6`。Phase 1 は self-hosting 可能なサブセットまで持っていく段階で、クラス・interface・ジェネリクス(monomorphize)・例外・ES module 静的解決・全プログラム型検証が射程。Phase 2 で async/await(Fiber)、bigint、regexp、ベンチマーク整備。

Phase 1 の内訳(現状の刻み方):

- **Phase 1.1 (done)** — 制御フロー(`let`/`const`/`while`/`for`/`do-while`/`break`/`continue`)、`boolean` 型、論理・単項・複合代入・`++`/`--`、軽量な式レベル型推論。
- **Phase 1.2 (done)** — `%` の `fmod` 化、ECMA-262 ToString による shortest `number → string`(現状は `snprintf+strtod` ループ、Ryu 差し替えは Phase 2 のベンチ整備時に回す)、`switch`(`do/while(0)` ラダー、暗黙 fall-through 禁止、`default` 最後限定、`string` discriminant 対応)、`string` 型(immutable・ASCII 限定・`+`/`+=`/`.length`/`===`/`!==`)。
- **Phase 1.3 (done)** — 1.3a で `Array<T>`(monomorphized)、1.3b で `Map<K, V>` / `Set<T>`(scalar key/value monomorph、open-addressing + tombstone、SameValueZero key equality、`new Map<K,V>()` / `new Set<T>()` 構文)。
- **Phase 1.4** — 1.4a で class(継承・ジェネリクスなし、明示 constructor、reference 型、`this` / プロパティ read/write / メソッド呼び出し / `new ClassName(args)`、done)、1.4b で interface(構造的型、同 shape クラス統合)、1.4c で generics(関数・クラスの型パラメータ、monomorphize、`Array<ClassName>` / `Map<K, ClassName>` 等のコンテナ展開もこのタイミング)。
- **Phase 1.5** — 例外、ES module 静的解決、全プログラム型検証、ヒープ管理(GC/arena)、self-hosting 通過。

順序はあくまで現時点の見立てで、self-hosting に必要な機能から逆算して入れ替える。

新機能を入れる時は **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)であることを忘れない。
