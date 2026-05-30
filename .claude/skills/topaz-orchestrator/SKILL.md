---
name: topaz-orchestrator
description: topaz-phase を新規 Ghostty ペインの fresh claude セッションで連続実行する無人オーケストレーター。各フェーズの結末(commit 前進 / 設計判断要で停止)を検出し、実装タスクが積み上がっているうちは自動で次フェーズを spawn する。設計判断が要る所・test 失敗・回数上限で必ず止めてユーザーに引き継ぐ。
---

# Topaz オーケストレーター

`topaz-phase`(1 セッション = 1 サブステップ = 1 commit)を、**設計議論の余地がなく実装タスクだけが積み上がっているうち**は無人で連続実行する。あなた自身がオーケストレーター claude で、各フェーズは **別 Ghostty ウィンドウの fresh claude セッション**として走らせる(新ウィンドウ = 新セッション = クリアされたコンテキスト = ユーザーが手で打っていた `/clear`)。

各実装セッションは既定で `--permission-mode auto` で起動する。ルーチンな開発アクション(node / cc / npm test / git)は自動承認され、本当に危険なアクションは classifier が deny する(deny されても claude は halt せず適応する)。

## 不変条件(これが停止判定の根拠)

無人の対話セッションでは `topaz-phase` は次のどちらかでしか止まらない:

- **commit を 1 個増やして終わる** → そのサブステップは着地した → **次へ進む**
- **commit せずユーザーに質問して止まる** → 設計判断が要る/詰まった → **オーケストレーションを止めてユーザーに引き継ぐ**

`.topaz-orch/<NN>.json` の `committed` がこの判定そのもの。ペインの中身を読む必要はない。

## ループ

`MAX`(既定 10)まで、`NN` = `01, 02, ...`(ゼロ埋め 2 桁)で:

### 1. spawn

```sh
scripts/orch/spawn-phase.sh <NN>
```

新しい Ghostty ウィンドウで `claude --permission-mode auto "/topaz-phase"` が起動する。`before` HEAD が記録され、そのセッションは `TOPAZ_ORCH_PHASE=<NN>` でタグ付けされる(その値で Stop hook が `<NN>.json` を書く)。

### 2. 終了を待つ

```sh
scripts/orch/wait-phase.sh <NN> 3600
```

**必ず Bash ツールの `run_in_background: true` で起動する**(フェーズは数分〜十数分かかる。前景だと Bash ツールの上限に当たる)。完了通知が来たら出力 JSON を読む。

### 3. 結末を判定

`wait-phase.sh` の JSON を見る:

- `timed_out: true` → セッションが詰まった(classifier が答えられず権限プロンプトで待っている等)。**停止**してユーザーに通知(どのフェーズで何分待ったか)。
- `committed: false` → そのセッションは**ユーザーに質問して止まっている**。`last_msg` を読み、設計判断の論点を要約して**停止**+通知。該当ウィンドウはその質問を表示したまま残っているので、ユーザーはそこで直接答えられる。
- `committed: true` → 着地。`commit_subject` をログに残し、**test ゲート**へ。

### 4. test ゲート(committed 時のみ)

オーケストレーター自身のシェルで、共有ワーキングツリー(その commit の状態)に対して:

```sh
npm run build && npm test
```

- **失敗** → 回帰がすり抜けた。**停止**してユーザーに通知(失敗した内容 + フェーズ NN + commit hash)。自分で勝手に直しに行かない。
- **全 pass** → `NN` をインクリメントして 1 へ戻る。

### 5. 上限・終了

`MAX` に達したら停止し、サマリ(着地したフェーズ数 + 各 `commit_subject`)を通知。

## 通知

各停止点で **ユーザーがすぐ状況を掴める短いサマリ**を最終メッセージに出す。加えてシステム通知を 1 本:

```sh
osascript -e 'display notification "<理由>" with title "topaz-orchestrator" sound name "Glass"'
```

通知に必ず入れる: 停止理由(設計判断要 / test 失敗 / 上限 / 詰まり)・フェーズ NN・次の一手(該当ウィンドウで答える / 失敗を見る 等)。

## やらないこと

- **設計判断を自分で代行しない**。`committed: false` で止まったら、その論点はユーザーのもの。要約して引き継ぐだけ。
- **test 失敗を自分で修正しない**。停止して報告する。
- **push しない**。各フェーズの commit はローカルのまま。
- **権限をエスカレートしない**。既定の `--permission-mode auto` を勝手に bypass へ上げない(ユーザーが `TOPAZ_ORCH_PERM` で明示した時のみ)。

## 開始時

1. `git -C . rev-parse HEAD` で起点 HEAD を控える(サマリ用)。
2. `MAX` を確認(ユーザー指定が無ければ 10)。
3. `NN=01` から spawn → wait(background)→ judge → gate のループを回す。
