---
name: topaz-phase
description: Topaz の 1 サブステップ(機能追加 / lowering / runtime 拡張)をセッション内で着地させるサイクル。目標同定 → 設計判断 → 実装 → 回帰 → ADR 起票 → 1 commit、までを 1 セッションで回す。
---

# Topaz サブステップ Workflow

Topaz は **1 セッション = 1 サブステップ = 1 commit** の運用で前進する。この skill はその一周を再現するための手順とポイントをまとめたもの。Phase 番号や具体的な目標(self-host、ベンチマーク整備、ランタイム差し替え 等)が変わってもこのサイクルは共通。

## 0. セッション開始

まず `CLAUDE.md` を読んで現状仕様の固定点(divergence・作業ルール)を確認する。`MEMO.md` の現行ロードマップで残タスクのうちどこを着地させるかを決める。

**過去の実装経緯を知りたい時**:
- 新しい決定は `docs/adr/NNNN-<slug>.md` を直接 read or grep。タイトル / Context だけで分かるよう書いてあるので、関連を探す時は `ls docs/adr/` + `grep -l <keyword> docs/adr/*.md`
- それ以前(古い記録)は `docs/archive/implementation-log.md`(凍結 archive)を該当見出しで検索

ADR を全部読む必要はない。**着手するサブステップに隣接する 1〜2 件** だけ拾えば十分。

## 1. 目標の同定

その session でどのサブステップを着地させるかを 1 つに絞る。タイプ別の典型的な決め方:

- **言語機能追加 / self-host 経路の前進**:
  ```sh
  node dist/cli.js src/<target>.ts --emit-c-only
  ```
  で最初に出る `CodegenError` / `LoaderError` の `file:line:col` が次の blocker。`MEMO` の残タスクと突き合わせて、最も短い lowering で済むもの 1 つを選ぶ
- **runtime 差し替え / 性能改善**: ベンチを取って一番効くものから
- **既存機能の divergence 解消 / 仕様強化**: `CLAUDE.md` の「既知の divergence」または fail サンプルから 1 つ
- **dev experience 改善**: エラーメッセージ / CLI flag / build 周り

複数の候補がある時は **scope が小さく、ロールバックしやすいもの** から手をつける。

## 2. 設計判断のポイント

### 2.1 strict subset の境界を先に決める

新機能を入れる時、最初にやるのは **「受理する形」と「reject する形」の列挙**。JS / TS のフル仕様を再現しようとしない:

- 多態 / 構造的型の発散を見たら諦める(MEMO §3.1)
- 「未対応構文は `CodegenError` で `file:line:col` 付きで止める」— 禁止ではなく未対応。後で解禁できる
- サブセットの下限は **「コンパイラが自分自身をコンパイルできる範囲」**(MEMO §3.3)。それを超えない範囲で広げる

機能追加以外(runtime / 性能)の時も同じ姿勢で、「今回扱う範囲」と「scope 外として明示的に切り捨てるもの」を最初に決める。

### 2.2 代替案を列挙して却下理由を残す

複数のアプローチが考えられる時は、必ず採用案だけでなく **却下案 + 却下理由** を出す。ADR の Decision セクションに後で書く材料になる。

典型的な軸:
- **C 表現の選択**(scalar typedef vs fat struct vs pointer)
- **emit 経路の統合 vs 分離**(同種の機能を既存 branch に統合するか別 branch にするか)
- **pre-allocation / monomorph の範囲**(全件 vs 関連 SCC のみ vs 単一対象のみ)
- **runtime vs codegen**(どちらに lowering の責務を置くか)

### 2.3 型注釈はヒント、`inferType` が真

`Emitter` 内の式単位 `inferType` が型不一致 / `const` 再代入を reject する。型注釈は信用せずヒント扱い(MEMO §3.2)。新しい型や operator を扱う時は `cTypeName` / `typeIdent` / `typeEq` / `inferType` の挙動を必ず通す。

### 2.4 emit-site の網羅

`emitWithExpected(expr, expectedType)` を経由する **4 サイト + container 要素** を全部通すこと:
- 変数初期化 / 関数引数 / `return` / 代入 RHS
- `Array.push` / `Map.set` / `Set.add` / `[i] = v`

class→interface / class→dunion / anon→dunion などの coercion はここに集約してある。新しい coercion / 新しい型を入れたらこの全サイトでテストする。

## 3. 実装

- 触るファイルは多くの場合 `src/codegen.ts` 単独。`Emitter` の関連メソッド(`cTypeName` / `emitUndefinedLiteral` / `emit<Construct>` / `infer<Op>` / 必要なら `tryMake<X>`)を編集
- runtime 側の追加が要る時は `runtime/runtime.h`(header-only / arena 経由 / `free` no-op を維持)
- loader / CLI 変更は `src/loader.ts` / `src/cli.ts`
- 未対応 case はその場で `CodegenError(node, "<feature> requires ...")` で止める。後段で「なんかおかしい」になるのを避ける

## 4. 回帰サンプル

`examples/<slug>.ts` を追加 + `tests/smoke.sh` に行を足す:

```sh
run_case <slug> "<expected stdout>"             # positive
run_module_case <label> <root.ts> "<expected>"  # multi-module 用
run_fail_case <label> <root.ts> "<substr>"      # コンパイル時エラー回帰
```

`npm test` で **全件 pass** を確認(累計ケース数が前 ADR の数字 + 今回の新規分になっているはず)。

**positive と fail を両方書く**。fail サンプルは「reject されるべき形」を明示的に固める意味で重要。

runtime / 性能改善の session でも、可能なら observable な差分を回帰サンプルに落とす(出力が変わらないなら既存サンプルが全 pass することで担保)。

## 5. pass criterion 確認

サブステップの種類に応じて確認内容を切り替える:

- **言語機能 / self-host 経路**: 旧 blocker(その session 前のもの)が **消えていること** を `node dist/cli.js src/<target>.ts --emit-c-only -o /tmp/out` で確認。新 blocker が出るならそれを記録(次の session の出発点になる)。emit された C が `cc -O2 -Iruntime -c /tmp/out.c` で警告なくオブジェクト化すること
- **runtime / 性能**: ベンチ数値 before / after を ADR に残す
- **既存仕様の強化**: 該当 fail サンプルが意図通り reject されること

## 6. ADR 起票

`docs/adr/0000-template.md` をコピーして `docs/adr/NNNN-<slug>.md` に書き起こす(NNNN は既存 ADR の最大番号 + 1、zero-padded 4 桁)。

含める内容:
- **Status**: 通常 `Accepted`
- **Context**: 直前の状態、何故これを今やるか
- **Decision**: 採用案を 1 段落 + 却下案 (理由付き)
- **Implementation**: 主な変更点に **file:line 参照**(コード断片は最小限、長い code block は貼らない)
- **Consequences**: 受理 / reject / 回帰サンプル名 + 累計ケース数 / scope 外
- 関連する先行 ADR は `[link](./NNNN-other.md)` で参照

長さの目安は **30〜50 行**。MEMO.md / CLAUDE.md には書かない(凍結 archive である `docs/archive/implementation-log.md` にも追記しない)。

## 7. Commit

**1 session = 1 commit** の運用。複数のサブステップを跨ぐ場合は分けて commit する。

メッセージ形式は **`git log` で直近の commit を確認して当時の慣行に合わせる**。現時点(2026-05)の形式:

```
<phase 識別子>: <slug> (<mechanism1> + <mechanism2> + ...)
```

例(自然言語のサマリではなく、機構名を `+` 区切りで列挙する形):
- `phase 1.5-6 prep: T | undefined for T = dunion (cTypeName + emitUndefinedLiteral + narrowed identifier widening + Map.get auto-connect)`

Phase 識別子は時期によって変わる(`phase 2: ...` / `runtime: ...` / `cli: ...` 等)。**直近 5〜10 commit の prefix と書式を真似る** のが最も安全。

include に入れるもの:
- 実装変更(`src/<file>.ts`、`runtime/runtime.h` 等)
- `examples/<slug>.ts` + 関連 fail サンプル
- `tests/smoke.sh`(`run_case` 追加分)
- `docs/adr/NNNN-<slug>.md`(新規)
- `MEMO.md`(`[ ]` → `[x]` への更新があれば)

CLAUDE.md はサブステップの進捗管理を持たない方針なので原則触らない。divergence / 作業ルールが本質的に変わった時のみ。

ユーザーが明示的に指示するまで `push` しない。

## チェックリスト(session 終了時)

- [ ] `npm test` 全 pass
- [ ] 該当する pass criterion(blocker 解消 / ベンチ改善 / fail サンプル reject 等)を確認
- [ ] `examples/<slug>.ts` の positive + fail サンプル(必要に応じて複数)を追加
- [ ] `tests/smoke.sh` に `run_case` / `run_fail_case` 行を追加
- [ ] `docs/adr/NNNN-<slug>.md` を作成(template 準拠、30〜50 行)
- [ ] `MEMO.md` の `[ ]` 項目を `[x]` に更新(該当があれば)
- [ ] 1 commit にまとめる(直近 commit と書式を揃える、push は明示指示まで待つ)
