# dept: 339

依存ライブラリが最新版からどれだけ遅れているか。最新版までに出たリリースを major / minor / patch に分けて数え、重みを掛けて足したもの([スコアの定義](https://github.com/shiroinock/dept#スコアの定義))。

- 合計 **339** = major 5 × 30 + minor 29 × 3 + patch 102 × 1
- 2 / 2 パッケージが遅れている、0.9 libyears
- ロックファイル:`./pnpm-lock.yaml`

| SCORE | PACKAGE | CURRENT | LATEST | MAJ | MIN | PAT | LIBYEAR | KIND |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 278 | `@types/node` | 22.20.5 | 26.6.7 | 3 | 29 | 101 | 0.1 | dev |
| 61 | `typescript` | 5.9.3 | 7.0.2 | 2 | 0 | 1 | 0.8 | prod |

---

[dept](https://github.com/shiroinock/dept) で作成
