---
name: topaz-orchestrator
description: Topaz の topaz-phase を Codex background thread で連続実行する無人オーケストレーター。開始時に MEMO §6 と emergent blocker を棚卸しして MAX を決める。各 NN は orchestrator 自身が scout(目標同定+設計分析)し、設計 fork があればユーザーと解決して brief に確定し、確定済み実装だけを fresh Codex worker thread に降ろす(plan/execute 分離)。worker が brief 通りに commit できなかった場合・test 失敗・回数上限で必ず止めてユーザーに引き継ぐ。Ghostty/Claude セッションは使わない。
---

# Topaz Orchestrator For Codex

`topaz-phase`(1 worker thread = 1 サブステップ = 1 commit)を連続実行する。**設計は orchestrator thread でユーザーと詰めて確定し、実装だけを Codex background worker thread に降ろす**。Ghostty / interactive Claude / Claude Stop hook / `scripts/orch/spawn-phase.sh` は legacy 経路なので通常は使わない。

## Core Invariant

worker thread の結末は `.topaz-orch/<NN>.json` で判定する。schema:

```json
{
  "phase": "07",
  "committed": true,
  "timed_out": false,
  "commit": "abcdef1",
  "commit_subject": "phase 1.5-6f: ...",
  "last_msg": "short summary or blocker"
}
```

- `committed:true` → 1 commit 着地。orchestrator 側で test gate へ。
- `committed:false` → brief 通りに実装できなかった / 設計 fork を見落とした / worker が詰まった。停止して `last_msg` をユーザーに引き継ぐ。
- `timed_out:true` → worker が長時間終わらない。停止して thread id と状況をユーザーに渡す。

worker は成功・失敗どちらでも JSON を書く。orchestrator は worker の final message だけに依存しない。

## Startup

1. 起点 HEAD を控える:

   ```sh
   git rev-parse HEAD
   ```

2. 残タスクを棚卸しする:

   - `MEMO.md §6 ロードマップ` の critical path 上の未チェック `[ ]` サブ項目を数える。
   - `オプション` / `self-hosting (1.5-6) の前提ではない` / `Phase 2 に降ろす` は除外。
   - `node dist/cli.js src/cli.ts --emit-c-only` を一度走らせ、最初の `CodegenError` / `LoaderError` を emergent blocker として記録する。
   - 各項目を `実装のみ` / `設計判断を含みそう` に色分けする。

3. MAX を決める:

   - ユーザー明示があればそれを使う。
   - 無ければ未チェック実装タスク数を天井 10 で cap した値。
   - MAX は「人間レビューまでに無人で積んでよい commit 数」。design gate / test 失敗 / worker blocked では MAX 未満でも止まる。

4. 起動メッセージを一度出す:

   - 起点 HEAD
   - 棚卸し結果(列挙タスク + 色分け)
   - emergent blocker
   - 採用 MAX と根拠

## Loop

`NN=01,02,...` を MAX まで回す。既存 `.topaz-orch/<NN>.json` がある再開時は、次の未完了 NN から始める。ハンドオフで NN が指定されていればそれを優先する。

### 1. scout

orchestrator 自身がこのサブステップの `topaz-phase §1/§2` 相当を行う。spawn しない。

- 目標: emergent blocker、または棚卸しの critical path 先頭から 1 つに絞る。
- 関連コードと隣接 ADR 1〜2 件を読む。
- 受理する形 / reject する形を列挙する。
- 代替案と却下理由を作る。
- C 表現を選ぶ(scalar typedef / fat struct / pointer / header helper 等)。
- emit-site / runtime / loader / CLI のどこを触るかを具体化する。
- fork(設計判断の分岐)があるか判定する。

### 2. design gate

- 明確な fork がある、または実装だけでよいか曖昧 → worker を作らずユーザーに確認する。離散選択肢なら具体案と trade-off を出す。open-ended なら分析を提示して相談する。
- fork がなく単一路線 → brief へ進む。

設計判断を独断で決めない。迷ったら止める。

### 3. brief

`.topaz-orch/<NN>.brief.md` を書く。内容:

- 目標
- 採用案
- 却下案と理由
- 受理・reject 形
- 触るファイル
- 追加する positive / fail 回帰
- pass criterion
- ADR に転記すべき Context / Decision の素材

`.topaz-orch/<NN>.before` に現在 HEAD を記録する。

### 4. spawn Codex worker thread

`tool_search` で `create_thread` / `read_thread` / `send_message_to_thread` を見つけ、`codex_app.create_thread` が使えるならそれを使う。Ghostty / shell 経由の interactive agent は起動しない。

worker は同じ Topaz project の local environment で作る。create_thread の project id が不明で、thread tool から現在 project を特定できない場合は停止してユーザーに project selection を依頼する。

worker prompt template:

```text
Use the topaz-phase workflow for /Users/shiroino/git/topaz.

You are worker phase <NN>. The design is already fixed in:
.topaz-orch/<NN>.brief.md

Read AGENTS.md, the topaz-phase skill if available, and that brief. Do not redo topaz-phase §1 goal selection or §2 design decision except to detect that the brief is impossible. Implement only the brief.

Required flow:
1. Read .topaz-orch/<NN>.brief.md and .topaz-orch/<NN>.before.
2. Implement the scoped change.
3. Add examples and tests/smoke.sh regressions from the brief.
4. Add one ADR in docs/adr/ using the next number.
5. Run npm run build and npm test.
6. Commit exactly one commit if green.
7. Write .topaz-orch/<NN>.json before final response.

Outcome JSON:
- On success: {"phase":"<NN>","committed":true,"timed_out":false,"commit":"<hash>","commit_subject":"<subject>","last_msg":"<short summary>"}
- On blocked/failure: {"phase":"<NN>","committed":false,"timed_out":false,"commit":null,"commit_subject":null,"last_msg":"<why no commit>"}

If the brief is wrong, too broad, or needs a design decision, do not improvise. Write committed:false and explain the question in last_msg.
Do not push.
```

Record the returned `threadId` in `.topaz-orch/<NN>.thread` for resumption.

### 5. wait / monitor

Poll both:

- `.topaz-orch/<NN>.json`
- `codex_app.read_thread(threadId, includeOutputs=true)` for status and final summary

Recommended cadence: about 30 seconds between checks. Give short user updates while waiting.

If no JSON appears after the chosen timeout(既定 3600 秒), write or treat outcome as:

```json
{"phase":"<NN>","committed":false,"timed_out":true}
```

Then stop and report the worker thread id. Do not start another phase.

### 6. judge

Read `.topaz-orch/<NN>.json`.

- `timed_out:true` → stop. Tell the user which phase and thread id stalled.
- `committed:false` → stop. Summarize `last_msg` and the design/implementation question.
- `committed:true` → record `commit_subject`, then run test gate.

### 7. test gate

After worker success, orchestrator itself runs:

```sh
npm run build
npm test
```

- failure → stop. Report phase, commit hash, and failing command output. Do not fix it in the orchestrator thread.
- pass → increment NN and continue.

### 8. limit / completion

At MAX, stop and summarize:

- start HEAD
- landed phase count
- commit subjects
- current HEAD
- any next blocker observed

## Notifications

At each stop point, final response must include a short status and next action. If local notification is available and approval is appropriate, optionally send:

```sh
osascript -e 'display notification "<reason>" with title "topaz-orchestrator" sound name "Glass"'
```

Do not require notification for correctness.

## Guardrails

- Do not implement code in the orchestrator thread. The orchestrator may read, analyze, write `.topaz-orch/*.brief.md`, and run verification gates. Code edits, tests, ADR, and commit are worker responsibilities.
- Do not fix a worker's failed test in the orchestrator. Stop and report.
- Do not push.
- Do not use `scripts/orch/spawn-phase.sh` / `wait-phase.sh` unless the user explicitly asks for the legacy Claude/Ghostty executor.
- Do not escalate permissions just to mimic the old `--permission-mode auto`; Codex workers use normal Codex approval behavior.
- Respect dirty worktrees. If unrelated changes exist before spawning, stop or ask unless the user has explicitly accepted sharing the local worktree.

## Legacy Notes

The repo may still contain:

- `scripts/orch/spawn-phase.sh`
- `scripts/orch/wait-phase.sh`
- `scripts/orch/stop-hook.sh`

These were for the old Claude Code + Ghostty executor. They are useful as historical reference for outcome JSON shape, but they are not the Codex default path.
