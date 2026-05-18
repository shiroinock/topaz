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
