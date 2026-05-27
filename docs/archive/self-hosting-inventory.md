# self-hosting 棚卸し (Phase 1.5-2 着手前)

`MEMO.md §9` のアクション「**1.5-2 着手前に self-hosting の最小到達点を割り出す**」の作業ログ。
`src/parser.ts` / `src/cli.ts` / `src/codegen.ts` を Topaz 自身でコンパイルしようとしたとき、
どの未対応機能が先にブロッカーになるかを生 AST を読みながら数えた結果。

対象コミット: Phase 1.5-1 完了直後 (`ab55e32 phase 1.5-1: exception`)
src 規模: `parser.ts` 13 行 / `cli.ts` 79 行 / `codegen.ts` 3294 行。

---

## 0. 結論(先に)

Phase 1.5 の **1.5-N サブフェーズの順序付け仮置きを下記に確定する** ことを提案する:

1. **1.5-2** — ES module 静的解決(仮置き通り、`import` / `export` の flatten + 循環検出)
2. **1.5-3** — 全プログラム型検証 + **discriminated union narrowing + `T | undefined` narrowing**(仮置きに narrowing を明示)
3. **1.5-3.5 (新設)** — **syntactic sugar 層**: `for-of` / arrow function / template literal / destructuring / optional chaining (`?.`) / nullish coalescing (`??`) / non-null assertion (`!`) / spread。これら無しでは src/codegen.ts が一行も通らない。**新設の根拠は §2 を参照**。
4. **1.5-4** — ヒープ管理(仮置き通り、arena 推奨)
5. **1.5-5** — generic method / generic interface(**src/ では未使用、後ろに回せる**)
6. **1.5-6** — self-hosting 通過。**ここで parser 問題に必ず突き当たる**(§5 参照)、別途方針決定が必要。
7. **1.5-X (オプション)** — `finally` / try 内 return-break-continue(仮置き通り)

仮置きとの差分は (a) **1.5-3.5 の新設**、(b) **1.5-5 を 1.5-6 の後ろに移動可能と明示**、(c) **parser 問題を 1.5-6 で正面から議論する宿題化**。

---

## 1. ts.SyntaxKind / typescript パッケージ依存(超大ブロッカー)

| カテゴリ | 使用回数 | コメント |
|---|---:|---|
| `ts.SyntaxKind.*` の判別 | 91 | enum 値での switch、Topaz は enum 未対応(数値定数化 or 文字列タグ化が必要) |
| `ts.is*` 述語 | 60+ | `ts.isIdentifier` / `ts.isCallExpression` 等。typescript パッケージ依存 |
| `ts.NodeFlags` | 4 | enum |
| `(ts as any).canHaveModifiers?.(m)` | 1 | `(_ as any)` + optional chaining、Topaz は両方未対応 |

**観察**: `src/codegen.ts` は `import * as ts from "typescript"` を通じて TS の AST API そのものを使っている。
self-hosting するなら以下のいずれか:

- **(a) parser を自前で書き直す**(Topaz でセルフホスト可能な範囲の TS パーサ)。Phase 2 候補の oxc 借用とは別物。
- **(b) typescript パッケージを Topaz 側で受け入れ可能な「不透明 FFI ハンドル」として扱う**。`ts.SourceFile` 等をすべて opaque に。
- **(c) parser だけは tsc/Node で走らせ、AST を JSON シリアライズして Topaz に渡す**。

これは **1.5-6 (self-hosting 通過) に到達した時点で必ず決断が必要**な宿題。
1.5-2 〜 1.5-5 のスコープには含めない方が良い(parser 戦略が逆流して仕様を捻じ曲げる)。

---

## 2. 構文の未対応箇所(self-hosting の素直なブロッカー)

`src/codegen.ts` で実際に使われている構文を Topaz の現状サポートと突き合わせた結果:

| 構文 | 使用回数 | Topaz 現状 | 影響 |
|---|---:|---|---|
| **template literal `` ` ${x} ` `` | **280** | 未対応 | 書き直し可能だが膨大、`+` 連結に置き換えるとヒープ leak が急増 |
| **`for-of`** | **58** | **未対応**(`isForOfStatement` は try body walk 内のチェック専用、emit パスは無い) | 全 `.map` 等を含む iteration が落ちる |
| **arrow function** | 22 | 未対応 | `Array.map((x) => ...)` の callback が全滅、`function` 式で代替するにせよ closure 必須 |
| **non-null assertion `x!`** | 18 | 未対応 | narrowing で代替可能(1.5-3) |
| **access modifier (`private` / `public` / `protected`)** | 84 | 明示エラー(class) | 全削除可能 |
| **spread `...x`** | 4 | 未対応 | 書き直し容易 |
| **destructuring `const {a, b} = x`** | 3 | 未対応 | 書き直し容易 |
| **optional chaining `?.`** | 2 | 未対応 | 書き直し容易 |
| **nullish coalescing `??`** | 3 | 未対応 | 書き直し容易 |
| `(ts as any)` (any cast) | 1 | 禁止領域 | API surface の問題、別途解消 |

**観察**:

- **template literal の 280 箇所は単なる構文糖以上の意味を持つ**。これを `string + string + ...` に書き直すと、Topaz の `topaz_string_concat` が連結のたびに malloc して leak するため、ヒープ管理(1.5-4)が入る前に self-hosting を試みると **コンパイル中に malloc 数万回・leak 数 MB** が起きる。1.5-3.5 (sugar) と 1.5-4 (arena) はセットで考えるべき。
- **`for-of` は 58 箇所で核心的に使われており**(`for (const stmt of sf.statements)` 等)、ここを通常 for 文に書き戻すと `Array.length` プロパティ + index アクセスのコードが大量に増える。**1.5-3.5 の中で最優先で実装すべき構文**。
- access modifier の `private` は単に noop として受け流すだけで src 全体が通るようになる(C 出力ではそもそも private 概念なし)。簡単な勝ち筋。

---

## 3. 型システム不足(discriminated union / `T | undefined`)

| 機能 | 使用回数 | 用途 |
|---|---:|---|
| **discriminated union(`type T = { kind: "A" } \| { kind: "B" }`)** | 1 中核箇所 | `TopazType` 自身がこれ。self-hosting の心臓 |
| **`T \| undefined` 戻り値型** | 14+ | `classNameOf`、`arrayElem`、`mapKey` などのヘルパ全部 |
| **discriminated union narrowing(`switch (t.kind)` の中で `t.elem` が見える)** | 7+ | `typeEq` / `typeIdent` / `cTypeName` で多用 |
| **`as Extract<T, { kind: "..." }>`** | 5 | 上記 narrowing の代替として使われている。**1.5-3 で narrowing が入れば不要** |
| **`unknown`** | 0 | 使われていない |
| **type alias の object 型(`type X = { a: number; b: string }`)** | 10+ | `Binding` / `ParamInfo` / `MethodInfo` / `FunctionSig` 等 |

**観察**:

- **TopazType を Topaz 自身で表現するには discriminated union narrowing が必須**。これ無しでは self-hosting の中核データ構造が書けない。
- 代替案として「TopazType を `class` 階層 + virtual method」に書き換える手は理論上あるが、`typeEq(a, b)` のような双 dispatch を書く必要があり、現状の interface(EXACT match のみ、narrowing 無し)では破綻する。
- **`T | undefined` は object 型 narrowing と並んで Topaz の型システムに欠けている最大級のピース**。これを 1.5-3 のスコープに **明示的に含める** ことを推奨する(MEMO §6 の 1.5-3 は「`Map.get` の `V | undefined`」とだけ書かれており、ヘルパ関数戻り値の話が抜けている)。

---

## 4. ヒープ圧(arena か GC か)

| 指標 | カウント |
|---|---:|
| `Array.push` 呼び出し(主に出力バッファ追加) | 130 |
| `Map<string, ...>` 宣言 | 21 |
| `Set<...>` 宣言 | 2 |
| template literal | 280 |
| `String.length` 参照 | 121 |

**観察**:

- 出力 C source は `out: string[]` を `.push` で蓄積して末尾で `.join("\n")` する古典パターン。
- self-hosting で codegen を 1 回回すだけで `topaz_string_concat` が数千〜数万回呼ばれ、`Array.push` の rehash で旧 buffer も leak する。
- ただし **「1 プロセス = 1 コンパイル」なので arena で十分**。MEMO §6 の「GC(BDW conservative)か arena か」の選択は **arena 推奨**(per-process arena = malloc 置き換えで free を no-op に、最後にプロセス終了で OS が回収)。
- 値型コンテナ(自前 Box / List)を入れる動機は self-hosting だけでは見えないので、Set の構造的等値の必要性(MEMO §6 の保留事項)はここでは判定保留。

---

## 5. 標準ライブラリ / 組み込みメソッド不足

| メソッド | 使用回数 | Topaz 現状 |
|---|---:|---|
| `Array.join(sep)` | 36 | **未対応** |
| `Array.map(callback)` | 19 | **未対応**(callback + closure 必要) |
| `Array.includes(x)` | 5 | **未対応** |
| `Array.slice(...)` | 1 | **未対応** |
| `Array.filter(...)` | 1 | **未対応**(callback + closure 必要) |
| `Map.values()` | 4 | **未対応**(iterator 必要) |
| `String.repeat(n)` | 8 | **未対応** |
| `String.charCodeAt(i)` | 1 | **未対応** |
| `String.padStart(...)` | 1 | **未対応** |
| `String.trimStart()` | 5 | **未対応** |

**観察**:

- `Array.join / .map / .filter / .includes` と `Map.values()` は **1.5-3.5 (sugar) か 1.5-3 (型検証) と並行して入れるべき**。特に `.map((x) => ...)` は arrow + closure が前提なので、closure キャプチャの設計を 1.5-3.5 の中で必ず通る関門にする。
- closure キャプチャはレキシカルスコープの C 表現が必要。`__topaz_env_*` struct + arrow lifting でいけるが、設計が増える。
- 文字列メソッド群は self-hosting では少数で、頻度が高い `.length` 以外は手で書き直すのもアリ(`charCodeAt` は switch 分岐の比較関数で代替可)。

---

## 6. ES module の構成(1.5-2 の事前確認)

src 全体の import 関係:

```
parser.ts:
  - node:fs        (readFileSync)
  - typescript

cli.ts:
  - node:child_process (execFileSync)
  - node:fs            (mkdirSync, writeFileSync)
  - node:path          (basename, dirname, extname, join, resolve)
  - node:util          (parseArgs)
  - node:url           (fileURLToPath)
  - ./codegen.js
  - ./parser.js

codegen.ts:
  - typescript
```

**観察**:

- **循環は無し**(`parser ← cli → codegen` の DAG)。1.5-2 の循環検出は src/ では空振りするが、サンプル `examples/` で 2 ファイル分割 → 循環依存のケースをわざと書いて回帰テストにする方が良い。
- node:* / typescript の builtin module は parser 問題(§1)と地続き。**1.5-2 のスコープは「ユーザー定義 module の `./foo.js` import まで」に限定**し、`node:*` / npm パッケージ依存は parser 問題側で吸収する整理が良い。
- `cli.ts` の現状の `node:*` 依存は、self-hosting した時の CLI が「Node を呼ぶラッパ」になるのか「真のネイティブ CLI」になるのかを決めるまで残る大きな宿題。Phase 1.5-6 ではなく **Phase 2 (基本 I/O / std/fs / std/net)** に降ろすのが妥当。

---

## 7. generic method / generic interface の使用状況

| 機能 | src 内使用 |
|---|---|
| **generic method (`class C { f<U>(...) {} }`)** | **0 箇所** |
| **generic interface (`interface I<T> { ... }`)** | **0 箇所** |
| generic function | 0 箇所(generic class / function は `Map<K, V>` のような builtin 経由でのみ使用、ユーザー定義 generic は無し) |
| generic class(ユーザー定義) | 0 箇所 |

**観察**:

- **1.5-5 (generic method / generic interface) は self-hosting の前提ブロッカーではない**。
- MEMO §6 の仮置きで 1.5-5 が 1.5-6 の前にあるが、**self-hosting (1.5-6) に必要なのは「discriminated union」「`T | undefined`」「syntactic sugar」「ヒープ管理」**であり、generic method はその後ろでよい。
- ただし 1.5-3 の中で TopazType narrowing を入れるとき、内部実装で generic method が欲しくなる場面があり得る(自分の TypedAST を書く際に visitor pattern)。その時に判断を再帰させる。

---

## 8. 1.5-N の再ロードマップ(提案)

`MEMO.md §6` の仮置きに対し、以下の差分を反映することを提案する。
**仕様の確定ではなく、棚卸しから見えた現実的な順序**。

```
[x] 1.5-1  例外 (throw / try / catch)                                    ─ 完了
[ ] 1.5-2  ES module 静的解決 (ユーザー定義 module 限定)                  ─ MEMO §6 通り
[ ] 1.5-3  全プログラム型検証 + discriminated union narrowing
           + `T | undefined` narrowing + strict field init                ─ ★ MEMO の文面に
                                                                            「discriminated union /
                                                                             `T | undefined` narrowing」
                                                                             を明示
[ ] 1.5-3.5 syntactic sugar 集中投入 (新設)                                ─ ★ 新設
           ├─ for-of (Array / Map.values の iterator interface とセット)
           ├─ arrow function + closure キャプチャ
           ├─ template literal
           ├─ destructuring
           ├─ optional chaining (?.)
           ├─ nullish coalescing (??)
           ├─ non-null assertion (!) ← 1.5-3 の narrowing が
                                       カバーしきれない場合のみ
           ├─ spread (...x) (関数 args 渡しのみ)
           └─ Array.map / .filter / .join / .includes / .slice
              + Map.values()
[ ] 1.5-4  ヒープ管理 (arena, per-process)                                ─ MEMO §6 通り
[ ] 1.5-5  generic method / generic interface                             ─ ★ self-hosting の
                                                                            ブロッカーではないので
                                                                            1.5-6 の後ろに回しても良い
[ ] 1.5-6  self-hosting 通過 ─ ここで parser 戦略 (§1) を確定する          ─ MEMO §6 通り
[ ] 1.5-X  finally / try 内 return-break-continue                         ─ MEMO §6 通り
```

---

## 9. 未消化の宿題

- **parser 戦略**(§1): 1.5-6 で確定。それまではコンパイル戦略は Node 経由のままで OK。
- **closure キャプチャの設計**(§2、§5): 1.5-3.5 で arrow function を入れる時に環境 struct + lift をどう吐くか確定。
- **Iterator interface の最小形**(§5): `Map.values()` / `for-of` の両方が依存。専用の builtin interface + `Symbol.iterator` 代替プロトコルを用意するか、`for-of` ごとに容器型別にハードコード展開するかを 1.5-3.5 で決める。
- **`Array.length` の型 (`number`)**: 既に Topaz で動くはずだが、self-hosting で `for (let i = 0; i < arr.length; i++)` に書き戻すパターンが急増するため、回帰テストを 1.5-3.5 のサンプルに追加する。
- **`MEMO.md §9` の他 2 項目**(generic class 未対応領域 / generic 関数戻り値が `Array<T>` の monomorph slot): 別途、必要に応じて 1.5-N に組み込み。

---

## 10. Phase 1.5-6 prep 完了時点の追補 (2026-05-27)

Phase 1.5-1 から 1.5-6 prep 5 ステップ + 1.5-6a/b + 1.5-6e (parser harness) まで進んだ現状での再棚卸し結果。1.5-6e の codegen 入力切替本番(`ts.SourceFile` → `Topaz.Module`)に進む前に、残ブロッカーを確定するための棚卸し。

対象コミット: `022cdbd phase 1.5-6e: convertFromTsc oracle + parser harness`
src 規模: 計 11798 行(ast.ts 621 / cli.ts 127 / codegen.ts 7080 / convert_from_tsc.ts 1305 / lexer.ts 652 / loader.ts 148 / parser_check.ts 117 / parser.ts 13 / topaz_parser.ts 1735)。

### 10.1 §2 / §3 / §5 のうち解消済みブロッカー

| 旧棚卸しの構文 | 旧使用回数 | 解消した Phase |
|---|---:|---|
| template literal | 280 | 1.5-3.5a |
| `for-of` | 58 | 1.5-3.5b (Array) / g-mapset (Set / Map.values/keys) / g-iterator (`Iterator<T>`) / h-entries (`.entries()` pair destructuring) |
| arrow function + closure | 22 | 1.5-3.5e (fat pointer + by-value capture) |
| non-null `!` | 18 | 1.5-3.5c (`T \| undefined` 限定) |
| nullish coalescing `??` | 3 | 1.5-3.5c |
| optional chaining `?.` | 2 | 1.5-3.5d(`f?.()` optional call は引き続き reject) |
| spread `...x` in array literal | 4 | 1.5-3.5h-spread(`Array<T>` 源限定、call-arg / new-arg は引き続き reject) |
| access modifier (`private` / `public` / `protected` / `readonly`) | 84 | 1.5-6 prep-access(no-op、`static` / `abstract` / `override` は引き続き reject) |
| `void` 戻り値型 | — | 1.5-6 prep-void(非 return 位置は明示 reject) |
| field initializer (`x: T = init;`) | — | 1.5-6 prep-field-init(auto zero-arg ctor 含む) |
| type alias (`type X = T;`) | — | 1.5-6 prep-type-alias(generic alias は reject、circular detection あり) |
| object literal type / expression | — | 1.5-6 prep-object-literal(anonymous class lowering、structural dedupe) |
| discriminated union narrowing + `T \| undefined` narrowing | 中核 1 + 14+ ヘルパ | 1.5-3a/b/c/d/e/f(strict field init + union variant + flow narrowing + dunion + `catch unknown`) |
| per-process arena | — | 1.5-4(chunk-based bump、Array doubling / Map rehash の leak 回収) |
| `Array.map` / `.filter` / `.includes` / `.slice` / `.join` | 36+19+5+1+1 | 1.5-3.5f(callback fn は arrow + identifier 両対応) |
| `Map.values()` / `Set.values()` / `Map.keys()` | 4+ | 1.5-3.5g-mapset(direct hash walk)+ 1.5-3.5g-iterator(`Iterator<T>` 昇格) |
| `Array<fn>` storage | — | 1.5-3.5g-array-fn(`Map<scalar, fn>` / `Set<fn>` は引き続き reject) |

### 10.2 残ブロッカー(Phase 1.5-6 prep + 1.5-6a/b/e 完了時点)

実数を再 grep した結果、self-hosting (1.5-6) に向けて残るのは syntactic 4 個 + 1.5-6e flip の大型書き換え。

| 構文 | 使用回数 | 代表的な使用箇所 | 提案サブステップ |
|---|---:|---|---|
| `as` type assertion(中身は `as Extract<TopazType, { kind: "..." }>` 中心) | 39 | `codegen.ts:176` `typeEq` の dunion case ごとの strip、`parser_check.ts:21` の `as Record<string, unknown>` | **1.5-6e flip 後はほぼ消える**(dunion narrowing 経由で `switch (t.kind)` の case 内で自動 narrow、`as Extract` 11 件は書き換え対象) |
| object destructuring `const { a, b } = x` | 14 | `loader.ts:78` `const { line, character } = sf.getLineAndCharacterOfPosition(...)`、`codegen.ts:3865` `const { type, cName, initStr } = this.declareVar(...)` | **1.5-6 prep-destructuring (DONE)**(receiver の tmp snapshot + per-binding field 読み出し、class は `__tmp->f` / iface は `__tmp.vt->get_f(__tmp.data)`、property rename / default / rest / nested / pattern annotation / 空 pattern を reject、AST に `VarDestrDeclStmt` を追加、`parser_check` を「両 reject = OK」に格上げ) |
| optional parameter `param?: T`(関数 signature 内) | 2(実 fn sig)+ 9(型注釈総数) | `collectClassMembers(cls, infoOverride?: ClassInfo)`、`emitArrowFunction(arrow, expectedType?: TopazType)` | **1.5-6 prep-optional-param 新設**(`param?: T` を `param: T \| undefined` の syntactic sugar として受理、call site で省略時に undefined を auto-fill) |
| optional property type `f?: T`(object literal type 内) | 数件 | parser AST の `pos?: number` 等の表現 | **1.5-6 prep-optional-param と同サブステップで**(object literal type 側は `codegen.ts:2677` で現状 reject、optional-param と同じ `T \| undefined` 受理に統一) |

### 10.3 codegen.ts の typescript API 依存(1.5-6e flip 1 発で消える分)

| 依存 | 使用回数 | 解消経路 |
|---|---:|---|
| `import * as ts from "typescript"` | 1 | 1.5-6e flip で `import * as Topaz from "./ast"` に置換 |
| `ts.SyntaxKind.*` 参照 | 183 | `node.kind === "BinaryExpression"` の string literal discriminator に置換、1.5-3e の dunion narrowing が自動で効く |
| `ts.is*` 述語(unique 名) | 142 | 同上(`node.kind === "..."` 比較 + narrowing) |
| `ts.NodeFlags` enum | 数件 | `decl.flags` 文字列 set or boolean field に置換 |
| `(ts as any)` cast | 数件 | `Topaz.Module` の型定義に閉じ込めて消滅 |

これらは destructuring / optional-param が未対応のまま flip に挑むと、書き換え中に新規 `const { kind, ... } = node` パターンや `infoOverride?: ClassInfo` パターンを書けない制約が乗算的にコストを増やす。**先に 2 機能を地ならししてから 6e flip に入る**のが筋。

### 10.4 src/ で完全に未使用な構文(後回し可)

src/ で grep 実数を確認した結果、以下は 0 件 or reject 文言のみで、self-hosting 通過の前提ブロッカーではない:

- async / await: 7 件 = 全部 reject 文言(`throw this.err(m, "async functions are unsupported")` 等)
- generator function: 1 件(`asteriskToken` 検出 + reject)
- abstract / static class member / override modifier: 5 件 = lexer keyword 認識 + reject 文言のみ、実宣言 0
- enum 宣言: 0 件
- generic method / generic class(ユーザー定義): 0 件
- keyof / typeof type query / intersection (`&`): 0 件
- Partial / Pick / Omit: 0 件(Extract は `as Extract<...>` で 11 件 = §10.2 の as cast に含む)
- Record<K, V>: 5 件、全部 `parser_check.ts` の `Record<string, unknown>`(JSON tree walk 用、Map で代替可)
- decorator / getter / setter / static block: 0 件
- index signature `[k: string]: T`: 0 件
- conditional type / mapped type / index access type `T[K]` / this type: 0 件
- bigint / regex literal / tagged template / 関数 overload / default param value: 0 件

**1.5-5(generic method / generic interface)は引き続き self-hosting の前提ブロッカーではない**(旧 §7 の結論を維持)、`finally` / try 内 return/break/continue(1.5-X)も同じく。

### 10.5 1.5-6 後半の推奨実行順序

```
[x] 1.5-6 prep-access            access modifier no-op 受理 (84 hits)
[x] 1.5-6 prep-void              void 戻り値型 (35 hits)
[x] 1.5-6 prep-field-init        field initializer (34 hits)
[x] 1.5-6 prep-type-alias        type alias as thin substitution (13 hits)
[x] 1.5-6 prep-object-literal    object literal type / expression (anon class) (27+ hits)
[x] 1.5-6a                       Topaz 製 lexer (652 行)
[x] 1.5-6b                       Topaz 製 parser core + statement + declaration (1735 行)
[x] 1.5-6e (oracle)              convertFromTsc + parser_check harness (1305 + 117 行)
[x] 1.5-6 prep-destructuring     object destructuring `const { a, b } = x` (14 hits)
[x] 1.5-6 prep-optional-param    `param?: T` + object type `f?: T` (9 hits + 数件)
[ ] 1.5-6e (flip)                codegen 入力を `ts.SourceFile` → `Topaz.Module` に切替。
                                 convertFromTsc を本番経路に挟む。tests/smoke.sh pass で
                                 「codegen 挙動不変」を確認。ts.SyntaxKind 183 / ts.is* 142 /
                                 `as ts.X` / `as Extract<...>` の大半がここで消える。
[ ] 1.5-6f                       runtime / stdlib 拡張(fs / path / process / spawn /
                                 number_parse / string method)
[ ] 1.5-6g                       loader Topaz 化
[ ] 1.5-6h                       cli Topaz 化
[ ] 1.5-6i                       stage2 bootstrap
[ ] 1.5-6j                       bit-for-bit fixed point
```

**順序のキー判断**:

1. **destructuring → optional-param → 6e flip の順を強く推奨**。理由: codegen.ts 7080 行を `Topaz.Module` 経路に書き換える大手術中に「destructuring 使えない」「optional param 使えない」のを抱えると、書き換え自体が cascading に肥大化する(新規 `const { kind, name } = node` パターンや `infoOverride?: ClassInfo` パターンが書き換え中に増殖するため)。先に 2 機能を地ならししてから flip に入ると、書き換え中も Topaz サブセットで自由に書けて scope が安定する。

2. **`as Extract<TopazType, { kind: "..." }>` (11 件) は 1.5-3e の dunion narrowing が入った今、本来不要**(switch case 内で自動 narrow)。codegen.ts 全体に散在しているのを 6e flip 中に順次削除可能。ただし「`as Extract` を構文として受理する」ステップを別途切る必要は無い(削除対象)。

3. **`as ts.X` 系の cast(parser_check.ts の `as Record<string, unknown>` 5 件含む)** は flip では消えないので、(a) `Topaz.Module` の型定義を JSON tree walk 不要な discriminated union として設計、または (b) parser_check.ts 自体を Node 専用の dev tool として `dist/` に残しつつ Topaz サブセット外として扱う、のどちらかで吸収。後者が低コスト。

4. **call-arg spread (`f(...args)`) / `f?.()` optional call** は src/ で使われていないため、引き続き reject のまま 1.5-6 通過可能(将来 needed になったら別 step)。

## 11. Actual self-hosting epoch 入口の hit 棚卸し (2026-05-27, prep 7 ステップ完了直後)

`npm run build` 後に `node dist/cli.js src/<file>.ts --emit-c-only` を src/ 各ファイルに対して順番に叩いた実測結果。1.5-6e flip 着地前の現状確認。

### 11.1 ファイル別 first hit 一覧

| ファイル | 行数 | 最初の CodegenError / LoaderError | 種別 |
|---|---:|---|---|
| `ast.ts` | 12.4 KB | **✓ 通過**(C 出力成功、ast.c 生成) | — |
| `lexer.ts` | 21.6 KB | `lexer.ts:181: no Array monomorph for element type topaz_dunion_anon_0_or_..._anon_9`(`tokens: Array<Token> = []`、Token は 11 variant 構造的 dunion) | **NEW: container-of-dunion 未対応** |
| `loader.ts` | 5.6 KB | `loader.ts:1:28: non-relative module specifier 'node:fs' is unsupported` | 既知: §10.5 の 1.5-6f |
| `parser.ts` | 0.3 KB | `parser.ts:1:30: non-relative module specifier 'node:fs' is unsupported` | 既知: 1.5-6f |
| `cli.ts` | 4.5 KB | `cli.ts:2:30: non-relative module specifier 'node:child_process' is unsupported` | 既知: 1.5-6f |
| `parser_check.ts` | 4.5 KB | `parser_check.ts:13:10: import rename ('import { a as b }') is unsupported` | 既知: §10.5 で「Node 専用 dev tool として扱う」案 |
| `topaz_parser.ts` | 53.7 KB | `topaz_parser.ts:48:30: non-relative module specifier 'node:fs' is unsupported`(末尾 `parseFile` の `readFileSync` のみ) | 既知: 1.5-6f / または entry を別 file に分割 |
| `convert_from_tsc.ts` | 47.1 KB | `convert_from_tsc.ts:19:1: namespace import ('import * as X from "..."')` | **1.5-6e flip で消滅予定**(本ファイルごと oracle 用に Node 専用化で吸収可) |
| `codegen.ts` | 317.9 KB | `codegen.ts:1:1: namespace import ('import * as X from "..."')`(`import * as ts from "typescript"`) | **1.5-6e flip で消滅予定**(`import * as Topaz from "./ast"` に置換) |

### 11.2 NEW finding: container-of-dunion 未対応 = 1.5-6 prep #8 候補

§10.2 の「残 4 syntactic ブロッカー」では拾えていなかった本物の新規ブロッカー。`elemTag(t)` の `default` branch が `union` / `iter` 以外の不可型(=`dunion`)を struct-shape mismatch メッセージで落とすため、Topaz サブセット内で書かれた lexer / parser / codegen のいずれも「Array<discriminated union>」を踏んだ瞬間に止まる。

**根拠 — Array of dunion を使うサイト(grep 実測)**:

- `lexer.ts:181 tokens: Array<Token> = []`(Token = 11 variant dunion、即時 hit)
- `ast.ts:316 | { kind: "arrow_block_body"; stmts: Array<Stmt> }` 他、Stmt / Expr / Decl / ModuleItem / TypeNode / ClassMember / InterfaceMember 各々の `Array<*>` 18 箇所(ast.ts 自体は type-only なので未 hit、しかし parser / codegen がインスタンス化すれば全部 hit)
- `codegen.ts:227 const flat: TopazType[] = []` 他、`Array<TopazType>` を多数(`paramTypes` / `typeArgs` / `mangleMonomorph` args など 8 箇所、parser の `flat` 引数 / 内部 collect バッファとして実体化される)

**実装方針(初手見立て)**:

- elemTag に `dunion` case を追加: `topaz_dunion_<variants-sorted>` を `dunion_<variants-sorted>` などに短縮した tag を返し、Array / Map / Set の monomorph キーに混ぜる。
- storage 表現: dunion は variant ごとの class instance ポインタの「tagged pointer」より、現状の `topaz_class_<C> *` を `void *` で包んで `__topaz_class_tag` で discriminate するパターンが綺麗(field 読み書きは narrow 後の `instanceof` 経由を要求、union の field shape 不一致を type system が保証)。
- `recordArrayMonomorph` / `recordMapMonomorph` / `recordSetMonomorph` の dunion 受理ゲートを開ける(struct field 型は variant 共通の `void *`、emit ヘルパは既存の anon class 経路を再利用)。
- 制約: variant が同一 anon class shape 群か、または `instanceof` の右辺で narrow 可能な concrete class 群でのみ受理(generic class monomorph 同一性は引き続き concrete name で見る)。
- 並列で `for-of over Array<dunion>` の iteration が動くこと、`.map` / `.filter` などの higher-order に dunion elem を渡せること、`.push` / `[i] = v` の RHS が variant に対して narrowing なしで自動 widen することを check(class→iface coercion と同じ「dunion 内 variant への coercion」)。

**reject 維持されるべき形**:

- variant が `dunion` または `union` を含む再帰: depth 制限なしで mangle すると無限大になる → 「dunion variant に dunion / union を含むのは未対応」で reject。
- `Array<T | undefined>`(undefined-union): 引き続き reject(§10.2 の `T | undefined` storage と同じ別の話、別 step で扱う)。
- `Map<scalar, dunion>` の K に dunion: 既存の `Map` key が scalar 限定なので無関係(K 側は触らない)。

### 11.3 1.5-6e flip との順序判断

3 案 ある:

(A) **prep #8(container-of-dunion)→ 1.5-6e flip → prep #9(node:fs / path / process builtin gating)**: lexer.ts と codegen.ts の両方が prep #8 解禁で初めて Topaz サブセット内に収まる。flip 中は codegen.ts を書き換えるので `Array<TopazType>` を多用する書き換えで詰まらない。**推奨案**。

(B) **1.5-6e flip 先行 → prep #8 を flip 完了直後に**: 6e flip 自体は `ts.SourceFile` → `Topaz.Module` の置換が本質で、container-of-dunion は flip 完了後の self-host pass で初めて hit する。ただし flip 後の codegen.ts 自身が `Array<TopazType>` を多用するので、flip 完了 ≠ self-host 通過 になり、結局 prep #8 を挟む。順序が後ろにずれるだけ。

(C) **prep #8 を後回しにして src/ を node:* と namespace import なしの「コア」だけにスリム化**: lexer / parser / codegen のコア部分を `Array<dunion>` 不使用に書き換える(=タグごとに別配列を持つ手書き union)。コスト > 利益、却下。

**結論: (A) を採用**。1.5-6 prep #8 として container-of-dunion を着地させてから flip に入る。flip 直前にもう一度 `node dist/cli.js src/lexer.ts --emit-c-only` を叩いて lexer が syntactic に通ることを確認、それを self-hosting エポックの「最小通過確認」として記録する。

### 11.4 Phase 1.5-6f(stdlib 拡張)で扱う node:* 依存の確定リスト

| 依存元 | API | 用途 | Topaz 側でどう提供するか |
|---|---|---|---|
| `loader.ts:1` | `node:fs` の `existsSync` | import path 解決時の file 存在確認 | `topaz_fs_exists(path: string): boolean` |
| `loader.ts:2` | `node:path` の `dirname` / `resolve` | 相対 import の path 計算 | `topaz_path_dirname(p: string): string` / `topaz_path_resolve(base: string, rel: string): string` |
| `parser.ts:1` | `node:fs` の `readFileSync` | tsc parse 前のソース読み込み | `topaz_fs_read_text(path: string): string` |
| `cli.ts:1` | `node:child_process` の `execFileSync` | cc 呼び出し | `topaz_process_spawn(cmd: string, args: Array<string>): number` |
| `cli.ts:2` | `node:fs` の `mkdirSync` / `writeFileSync` | 出力 dir 作成 + .c ファイル書き込み | `topaz_fs_mkdir_p(path: string): void` / `topaz_fs_write_text(path: string, content: string): void` |
| `topaz_parser.ts:48` | `node:fs` の `readFileSync` | `parseFile` entry の便利関数(分割可能) | 1.5-6f で同上 builtin、または entry を CLI 側に外出し |

すべて Phase 1.5-6f の範囲。runtime.h に thin wrapper を追加し、loader が `node:*` specifier を「Topaz builtin module」として受理する gate を開ける(現状の reject は明示エラー、prep #9 として gate のみ追加でも可)。

### 11.5 prep #8 着地後の確認 (2026-05-27)

**完了**: container-of-dunion(Array / Map / Set の値 / 要素方向に dunion)の monomorph macro 拡張 + Set 要素の `.data` pointer identity 経路。`elemTag` / `cElemTypeForContainer` / `emitArrayMonomorphMacro` / `emitMapMonomorphMacro` / `emitSetMonomorphMacro` / `emitSetElemHelpers` の 6 chokepoint に dunion 分岐を追加、`arrayOf` / `mapOf` / `setOf` の gate に dunion を accepted kinds として追加。`examples/array_of_dunion.ts` 17 出力で push 経路 / for-of switch narrowing / `[i]` read/write / mixed array literal / discriminator 読み出し / `.pop` / reference identity / Map<scalar, dunion> の `.has` `.delete` `.size` `.set` / Set<dunion> reference identity を回帰。

**pass criterion 確認**: `node dist/cli.js src/lexer.ts --emit-c-only` → 新規 blocker = **module-level const hoisting**(`src/lexer.ts:102` で `unknown identifier 'CHAR_0'`)。これは prep #8 で解禁したかった container-of-dunion(lexer.ts:181 の `tokens: Array<Token> = [];` で Token が dunion なため)とは別の独立した hit。Token が discriminated union として読めるところまで container 経路は伸びている。

**deferred to 別 sub-step**: `dunion | undefined` への `!` / `??` narrowing(Map.get の戻り値が `dunion | V_absent_sentinel` になる経路)。array_of_dunion.ts の Map セクションは `.has` / `.delete` / `.size` のみで通している。

### 11.6 NEW finding: module-level const hoisting = 1.5-6 prep #9

`src/lexer.ts:102` で `unknown identifier 'CHAR_0'` が出る。原因は module-level の `const CHAR_0: number = 48;` 等が `main()` body 内に入ってしまい、同 module の `function isDigit` が C 側で `static topaz_boolean isDigit(...)` として emit されたとき body から `CHAR_0` が見えない。

**現状の挙動**: top-level `let` / `const` declaration は root module のみ受理、`main()` body の冒頭に入る。非 root module の top-level statement は明示エラー(`module_basic_*` の運用)。だが root module であっても、関数 declaration は C の file-static として emit されるため、関数 body から見ると CHAR_0 は scope 外。

**lower 戦略 候補**:
- (a) module-level `const` を C の file-static `static const <ty> <name>` として emit、main() body には declaration をそのまま入れず file-scope に hoist する(scalar literal 初期化子限定)。
- (b) initializer が string literal や container literal の場合は file-static const 化が難しい(C の static initializer 制約)。lexer.ts の `CHAR_0` 系は全て scalar number literal なので (a) で十分。
- (c) initializer が複雑な式(function call、object literal、`new`)の場合は main() body 内のまま、関数定義側を closure 化する選択肢もあるが、現状の codegen には closure 経路が無いので scope 拡張が必要。

**判断**: prep #9 として scalar literal 初期化子に限定して file-static 化を実装する。lexer.ts / parser.ts / codegen.ts の `const` 利用箇所のうち、scalar literal で初期化されているもののみ hoist 対象。string literal / object literal / `new` / 関数呼び出しは main() body 残置のまま(別途 closure 拡張 or 別 sub-step)。

### 11.7 prep #9 着地 (2026-05-27)

**完了**: module-level `const NAME: T = LIT;` を `static const T NAME = LIT;` に hoist。受理する initializer は (a) `NumericLiteral`、(b) `TrueKeyword` / `FalseKeyword`、(c) 単項 `+` / `-` を冠した `NumericLiteral` のみ(scalar 3 の `number` / `boolean` 限定、`string` リテラルは C の `topaz_string` compound literal 化が別 step なので main() body 残置)。`Emitter.tryHoistModuleConst` が判定 + (1) scope.stack[0] へ binding 登録、(2) `static const ...` 行を C 出力に追加、(3) main() body 走査時に hoisted statement を skip する 3 操作を 1 chokepoint で実施。出力 slot は `monomorphFwdSlot` の直後・interface vtable wrapper の前(全 static C 関数より前)に配置、annotation がある場合は inferred lit 型と EXACT 一致を要求(不一致なら hoist せず regular emitVarDecls 経路に落として通常の型エラーを surface)。`let` / 複数 declaration / destructuring / 非 scalar literal initializer / annotation 型不一致は全部 hoist 対象外で main() body に残るため、関数 body からの reference は引き続き `unknown identifier` で reject(`module_const_hoist_let_fail` / `module_const_hoist_nonscalar_fail` で回帰)。

**pass criterion 確認**: `node dist/cli.js src/lexer.ts --emit-c-only` → 新規 blocker = `unsupported method '.charCodeAt' on topaz_string` (lexer.ts:193)。`CHAR_0` 系の hoist は通り、`peek(offset)` メソッド body が runtime に存在しない string メソッドを叩いて落ちる位置まで前進。次の prep #10 は string 系メソッド(`.charCodeAt(i): number` / `.slice(s, e)?: string` 等)を runtime + codegen に追加。

