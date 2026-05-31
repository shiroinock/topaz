# CLAUDE.md

TypeScript 構文を frontend にした AOT ネイティブコンパイラ。JS セマンティクスは切り捨てる方針。

## 参照ドキュメント

- `MEMO.md` — 設計検討資料 / ロードマップ / 落とし穴 / 残タスク
- `docs/adr/` — 新規の決定ログ(1 ファイル = 1 決定、`NNNN-slug.md`)。テンプレは `0000-template.md`
- `docs/archive/implementation-log.md` — Phase 1.5-6 prep #15 までの決定ログ(凍結)。**それ以前の各機能の lowering 詳細・回帰ケース・未対応理由はここを見る**(根拠を CLAUDE.md に転記しない)
- `docs/parser-choice.md` — パーサ選定根拠 / SWC・oxc 乗り換え条件
- `docs/archive/self-hosting-inventory.md` — 1.5-2 着手前の self-hosting 棚卸し

## Commands

- `pnpm install` — 依存関係セットアップ
- `pnpm run build` — `tsc` で `src/` → `dist/`
- `pnpm test` — `tests/smoke.sh`。`examples/*.ts` を順にコンパイル→実行して期待値検証。新しいサンプルを足したら `run_case` 行を追加
- `pnpm run topaz <input.ts> [-o out]` — CLI 起動(pnpm 越し)
- `node dist/cli.js <input.ts> [-o out] [--emit-c-only]` — 直接起動。`--emit-c-only` は cc を呼ばずに生成 C を残す

cc のパス / フラグ変更は `src/cli.ts` の `execFileSync("cc", ...)` を直接編集。

## Pipeline

```
*.ts ──loader (DFS + cycle detect)──▶ ts.SourceFile[] ──codegen──▶ C source ──cc -O2 -Iruntime──▶ native binary
```

パーサは tsc API(型チェッカー不使用)、codegen は `Emitter` 1 インスタンスで multi-module の宣言 / monomorph を共有、runtime は header-only な `runtime/runtime.h`。

## 作業ルール

- **未対応構文は `CodegenError` で `file:line:col` 付きで投げて止める**。「禁止」ではなく「未対応」。`any` 禁止リンターは作らない。多態 / 構造的型の発散を検出したら諦める(`MEMO §3.1`)
- **型注釈は信用せずヒント扱い**(`MEMO §3.2`)。式単位の `inferType` が型不一致 / `const` 再代入を reject する
- **新機能を入れたら `examples/` に回帰サンプルを追加** + `tests/smoke.sh` に `run_case` / `run_module_case` / `run_fail_case` を足す
- **新規の決定ログは `docs/adr/NNNN-<slug>.md` に 1 ファイル = 1 決定で追記**(テンプレは `docs/adr/0000-template.md`、CLAUDE.md / MEMO.md には書かない)。`docs/archive/implementation-log.md` は凍結 archive
- **「コンパイラが自分自身をコンパイルできる範囲」がサブセットの下限**(`MEMO §3.3`)

## JS / TS との主な divergence(コードからは読めない)

文法面:
- 条件式(`if` / `while` / `for` / `do-while`)は厳格 `boolean`。truthy / falsy は型エラー
- `==` / `!=` は reject(`===` / `!==` を使えと案内)
- `let` / `const` は初期化必須、`var` は未対応、`const` 再代入は reject
- for-init は単一宣言まで(複数変数は外で宣言)
- `for-of` の RHS は `Array<T>` / `Set<T>` / `Map.values()` / `Map.keys()` / `Set.values()` / `Set.keys()` / `Map.entries()` / `Set.entries()` / `Iterator<T>`。Map bare RHS / `for-in` / `for await` は reject

実行時:
- `string` は immutable・ASCII 限定・`.length` は UTF-8 バイト長(JS の UTF-16 code units と divergence、非 ASCII リテラルは codegen 段で reject)
- ヒープは per-process arena、`free` は no-op、プロセス終了で OS 一括回収。realloc は alloc + memcpy なので peak は 2× まで膨らむ
- Set / Map の iteration order は hash 順(JS の insertion order と divergence、`OrderedMap<K, V>` は将来別 type で)
- Set / Map の class / interface / dunion 要素 / 値の等値は reference identity(`.data` ポインタ比較)
- Map の key 同値性は SameValueZero(NaN === NaN、-0 === +0、`===` の NaN !== NaN とは意図的 divergence、JS Map に整合)
- `Map.get(k)` は `V | undefined`(narrowing 必須で bare read は型エラー)、`Map.set` / `Set.add` は void 扱いで chain 不可
- class インスタンスは `arena_calloc` 確保のため未初期化フィールドは zero-init(scalar = 0 / false / 空 string、reference = NULL)。`verifyDefiniteFieldInit` が ctor body の top-level 代入を集めて未初期化を reject(制御フロー内は無代入扱い、flow-sensitive 化は 1.5-3d 以降の宿題)
- interface は EXACT 構造的一致(covariant return / contravariant param なし)。interface field 代入は vtable setter 経由で void を返すので chain 不可、class field 代入は C lvalue で chain 可能
- 例外の throw 値は class instance 限定(JS の任意値と divergence)、`finally` / try body 内の `return` / `break` / `continue` は未対応、uncaught は `topaz: uncaught exception` + `abort`(stack trace 無し)
- `instanceof` は左辺 class / `unknown`、右辺 concrete class 識別子限定(interface / dunion / generic class / 動的式は未対応)
- `topaz_number_to_string` は `snprintf("%.*e") + strtod` ラウンドトリップで ECMA-262 ToString 一致だが Ryu より 1〜2 桁遅い(Phase 2 で差し替え)
