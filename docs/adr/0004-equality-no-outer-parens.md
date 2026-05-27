# 0004 — equality emits without redundant outer parens

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #17

## Context

汎用 binary emit (`src/codegen.ts`) は常に `(${lhs} ${op} ${rhs})` で包むため、`===` / `!==` を `if` / `while` / `for` / `do-while` の条件に直接書くと `if ((a == b))` となり cc が `-Wparentheses-equality` を出していた(実害なし、既存 `dunion_optional` 等で発生)。self-hosting の pass criterion「emit C が `cc -Wall -Wextra` で警告なし」に必要なため除去する。dev experience / codegen 品質改善カテゴリ([0003](./0003-parse-int-float.md) 後の地ならし)。

## Decision

汎用 binary emit で **op が `==` / `!=` のときだけ外側括弧を付けない** 分岐を入れた(MEMO の選択肢「equality を非括弧で吐く分岐」)。安全性の根拠: C の `==` / `!=` は TS の `===` / `!==` と同じ優先順位を持ち、TS の優先順位規則上 equality が高優先演算子の **非括弧** オペランドになることはない(ソースの明示括弧は `ParenthesizedExpression` として paren 分岐で再 wrap される)。よって外側括弧は常に冗長で、剥がしても意味が変わらない。オペランド自身は引き続き各々 wrap されるので、ネスト(`(a === b) === (b === c)` → `(a == b) == (b == c)`)や混在優先順位(`a === b && a < c`)も正しいまま。

却下した案: A=条件 emit 側で外側括弧を 1 枚剥がす(理由: 文字列レベルの balanced-paren スキャンが必要で、`({...})` GNU statement-expression(`??` / `instanceof` の lowering 結果)を誤って剥がさないガードと string literal 内の括弧スキップが要り fragile)/ B=equality を全位置で完全に括弧なしにする(今回と実質同じだが、relational `<` 等も剥がす案は `-Wparentheses-equality` の対象外で不要、変更を equality に限定した)。

## Implementation

- `src/codegen.ts:5673` — 汎用 binary emit の末尾。`op` が `==` / `!=` なら `${lhs} ${op} ${rhs}`、それ以外は従来どおり `(${lhs} ${op} ${rhs})`。string `===` / `=== undefined` / `instanceof` の各分岐は手前で早期 return するため無影響

## Consequences

- **受理**: `if (a === b)` → `if (a == b)`、`while`/`for`/`do-while` の equality 条件、ネスト `(a === b) === (b === c)`、`&&` / `||` / relational 混在も全て警告なし
- **divergence なし**: lowering の意味は不変、emit C のテキストから冗長括弧が消えるのみ
- **回帰**: positive `cond_equality.ts`(if/while/for/do-while + ネスト + 混在優先順位の実行時検証)+ 新ヘルパ `run_cc_warnfree_case`(emit-C を `cc -O2 -Iruntime -Wall -Wextra -c` し warning ゼロを assert)を `cond_equality` / `dunion_optional` に適用。164 → 167 ケース全 pass
- **scope 外**: relational `<` / `>` 等の冗長括弧(`-Wparentheses-equality` 非対象なので放置)、全 example への `-Wall -Wextra` gate 一括導入(別途、警告総ざらいの session で)
