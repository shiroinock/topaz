---
name: topaz-orchestrator
description: topaz-phase を新規 Ghostty ウィンドウの fresh claude セッションで連続実行する無人オーケストレーター。開始時に MEMO §6 の残タスクを棚卸しして MAX を決める(ユーザー明示が無ければ未チェック実装タスク数を天井 10 で cap)。各 NN は orchestrator 自身が scout(目標同定+設計分析)し、設計 fork があればユーザーと解決して brief に確定させ、確定した実装だけを spawn する(plan/execute 分離)。各セッションは Stop 到達時にウィンドウを自動クローズ。spawn 先が brief 通りに着地できなかった場合・test 失敗・回数上限で必ず止めてユーザーに引き継ぐ。
---

# Topaz オーケストレーター

`topaz-phase`(1 セッション = 1 サブステップ = 1 commit)を連続実行する。**設計はオーケストレーター段階でユーザーと詰めて確定させ、確定した実装だけを fresh セッションに降ろす**(plan/execute 分離)。あなた自身がオーケストレーター claude で、各実装フェーズは **別 Ghostty ウィンドウの fresh claude セッション**として走らせる(新ウィンドウ = 新セッション = クリアされたコンテキスト = ユーザーが手で打っていた `/clear`)。

各実装セッションは既定で `--permission-mode auto` で起動する。ルーチンな開発アクション(node / cc / npm test / git)は自動承認され、本当に危険なアクションは classifier が deny する(deny されても claude は halt せず適応する)。

## 不変条件(これが停止判定の根拠)

無人の対話セッションでは spawn した `topaz-phase` は次のどちらかでしか止まらない:

- **commit を 1 個増やして終わる** → そのサブステップは着地した → **次へ進む**
- **commit せずユーザーに質問して止まる** → brief 通りに実装できなかった(scout が fork を見落とした)/ 詰まった → **オーケストレーションを止めてユーザーに引き継ぐ**

`.topaz-orch/<NN>.json` の `committed` がこの判定そのもの。ウィンドウの中身を読む必要はない。設計を spawn 前に確定させる運用なので、`committed:false` は**例外イベント**(安全網)であって常態ではない。

## ループ

`MAX`(「開始時」の棚卸しで決める。ユーザー明示が無ければ未チェック実装タスク数を天井 10 で cap)まで、`NN` = `01, 02, ...`(ゼロ埋め 2 桁)で:

**基本方針 — 設計は orchestrator 段階で確定させ、実装だけを spawn する。** spawn したフェーズが設計の壁に当たって `committed:false` で空振りするのを事前に潰す。各 NN は「scout(設計を詰める)→ 必要なら design gate(ユーザーと解決)→ brief 確定 → 実装だけ spawn」の順で進める。`committed:false` は **scout が fork を見落とした時の安全網**(常態ではない)。

### 1. scout — 目標同定 + 設計分析(spawn しない、orchestrator 自身が行う)

このフェーズで着地させるサブステップを 1 つに絞り、`topaz-phase` の §1 目標同定 + §2 設計判断を **orchestrator 自身が深く** 行う:

- **目標**: `node dist/cli.js src/cli.ts --emit-c-only 2>&1 | head -30` の最初の blocker、または棚卸しの critical path 先頭。
- **設計分析(§2 相当を自分で詰める)**: 関連コード(`src/codegen.ts` 周辺)と隣接 ADR 1〜2 件を読み、**受理する形 / reject する形の列挙・代替案 + 却下理由・C 表現の選択(scalar typedef vs fat struct vs pointer 等)・emit-site 網羅・runtime か codegen か** を具体的に組み立てる。
- ここで **fork(設計判断の分岐)があるか** を見極める。

### 2. design gate — fork があればユーザーと解決(無ければ素通り)

- **明確な fork がある / 実装のみか設計要かが曖昧** → **ユーザーと解決してから先へ**。離散の選択肢なら `AskUserQuestion` で **scout で詰めた具体案(各案の trade-off 付き)** を出す。open-ended なら分析を提示して相談。**独断で決めない。** 曖昧な時は spawn せず必ず確認する(安全側)。
- **明確に実装のみ(fork 無し・単一の自明な道)** → 素通りして brief へ。

### 3. brief 確定 → spawn(実装だけ降ろす)

確定した設計を `.topaz-orch/<NN>.brief.md` に書く(gitignore 済みのスクラッチ)。内容: **目標 / 採用案 + 却下案と理由 / 受理・reject 形 / 触るファイル / 追加する回帰サンプル**(= topaz-phase §6 ADR の Context・Decision の素)。書いたら:

```sh
scripts/orch/spawn-phase.sh <NN>
```

新しい Ghostty ウィンドウで fresh claude が起動する。`<NN>.brief.md` があれば spawn-phase.sh は **「設計は brief に確定済み、§3 実装以降を回せ」** という prompt で起動する(topaz-phase は §1/§2 を再検討せず実装に入る)。`before` HEAD が記録され、`TOPAZ_ORCH_PHASE=<NN>` でタグ付けされる。セッションが Stop に達すると Stop hook が outcome を書いた後にその claude を終了させ、**ウィンドウは自動で閉じる**(手動クローズ不要。例外は権限プロンプト待ちで Stop しない `timed_out` のみ)。

### 4. 終了を待つ

```sh
scripts/orch/wait-phase.sh <NN> 3600
```

**必ず Bash ツールの `run_in_background: true` で起動する**(フェーズは数分〜十数分かかる。前景だと Bash ツールの上限に当たる)。完了通知が来たら出力 JSON を読む。

### 5. 結末を判定

`wait-phase.sh` の JSON を見る:

- `timed_out: true` → セッションが詰まった(classifier が答えられず権限プロンプトで待っている等)。この場合 Stop が発火しないのでウィンドウは**開いたまま残る**(ユーザーがそのプロンプトに答える必要がある)。**停止**してユーザーに通知(どのフェーズで何分待ったか・該当ウィンドウで権限に答える旨)。
- `committed: false` → **scout が見落とした設計判断/詰まり**(brief 通りに実装できなかった)。Stop hook が outcome を書いた後にウィンドウは自動で閉じるので、**論点は `last_msg` から読む**(ウィンドウは残らない)。論点を要約して**停止**+通知。ユーザーは orchestrator の会話で答え、必要なら brief を直して再 spawn する。
- `committed: true` → 着地。`commit_subject` をログに残し、ウィンドウは自動で閉じる。**test ゲート**へ。

### 6. test ゲート(committed 時のみ)

オーケストレーター自身のシェルで、共有ワーキングツリー(その commit の状態)に対して:

```sh
npm run build && npm test
```

- **失敗** → 回帰がすり抜けた。**停止**してユーザーに通知(失敗した内容 + フェーズ NN + commit hash)。自分で勝手に直しに行かない。
- **全 pass** → `NN` をインクリメントして **1(scout)** へ戻る。

### 7. 上限・終了

`MAX` に達したら停止し、サマリ(着地したフェーズ数 + 各 `commit_subject`)を通知。

## 通知

各停止点で **ユーザーがすぐ状況を掴める短いサマリ**を最終メッセージに出す。加えてシステム通知を 1 本:

```sh
osascript -e 'display notification "<理由>" with title "topaz-orchestrator" sound name "Glass"'
```

通知に必ず入れる: 停止理由(設計判断要 / test 失敗 / 上限 / 詰まり)・フェーズ NN・次の一手(該当ウィンドウで答える / 失敗を見る 等)。

## やらないこと

- **設計判断を独断で決めない**。scout で fork を詰めるのは良いが、決定は**ユーザーと解決してから** brief に固める。曖昧な時は spawn せず確認する(安全側)。`committed:false` で止まったら、その論点もユーザーのもの。要約して引き継ぐ。
- **実装を自分でやらない**。orchestrator がやるのは scout(設計分析)+ design gate + brief 確定まで。コード編集・回帰追加・commit は spawn 先のフェーズの仕事。
- **test 失敗を自分で修正しない**。停止して報告する。
- **push しない**。各フェーズの commit はローカルのまま。
- **権限をエスカレートしない**。既定の `--permission-mode auto` を勝手に bypass へ上げない(ユーザーが `TOPAZ_ORCH_PERM` で明示した時のみ)。

## 開始時 — 棚卸し → MAX 決定 → ループ

1. `git -C . rev-parse HEAD` で起点 HEAD を控える(サマリ用)。

2. **残タスクの棚卸し**(ループ開始前に 1 回)。次の 2 つを突き合わせて「無人で積めそうな実装タスクが今いくつ並んでいるか」を出す:
   - **列挙済み backlog**: `MEMO.md §6 ロードマップ` を読み、いま着手すべき critical path 上の未チェック `[ ]` サブ項目を数える。`オプション` / `self-hosting (1.5-6) の前提ではない` / `Phase 2 に降ろす` と明示された項目は **除外**(無人連続実行の対象ではない)。例: 現状 self-host の critical path は `1.5-6a〜6j` の 10 サブステップ。
   - **emergent な次の blocker**: `node dist/cli.js src/cli.ts --emit-c-only 2>&1 | head -30` を 1 回走らせ、最初に出る `CodegenError` / `LoaderError` を確認する。これが **次に topaz-phase が実際に掴む目標**(列挙 backlog の「先頭」の実体)。出なければ self-host 経路はもう通っている。
   - 各列挙項目を一言で **`実装のみ` / `設計判断を含みそう`** に色分けする(lexer/parser の新規大物・型表現の追加・C 表現の選択を含むものは後者)。

3. **MAX 決定**:
   - ユーザーが MAX を**明示**していればそれを使う(最優先)。
   - 明示が無ければ、棚卸しの **未チェック実装タスク数を MAX に採用**(天井 10 で cap。`min(count, 10)`)。
   - ただし **MAX は「タスク数」ではなく「人間レビューまでに無人で積んでよい commit 数(安全予算)」** であることを忘れない。新フローでは orchestrator は **scout 時の design gate**(設計 fork でユーザーに確認)で止まるほか、test 失敗 / `committed:false`(scout の見落とし)/ timeout でも止まる。`設計判断を含みそう` な項目が並ぶ局面では MAX に達する前に design gate で何度もユーザーに戻ることになる(それが正しい)。その旨を起動メッセージに明記する。

4. **起動メッセージ**(ループ開始前にユーザーへ 1 度出す): 起点 HEAD・棚卸し結果(列挙タスク数 + 各項目の `実装のみ`/`設計判断含みそう` ラベル + 現在の emergent blocker)・採用した MAX とその根拠、を短くまとめる。

5. `NN=01` から scout → design gate → brief → spawn → wait(background)→ judge → gate のループを回す。
