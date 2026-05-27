# 0003 — global parseInt / parseFloat

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #16

## Context

self-hosting の次 blocker は `src/topaz_parser.ts:1797` の `parseInt(text.slice(2), 16)`(`parseNumberLiteral` が hex `0x` / binary `0b` literal を radix 指定で、それ以外を `parseFloat` で数値化する)。`parseInt` / `parseFloat` はグローバル関数だが Topaz は scope に登録していないため `unknown identifier` で停止していた。lexer が吐く number token を AST literal の `number` 値へ変換するのに必須。

## Decision

`String.fromCharCode` / `readFileSync`([0000 系の prep #12/#13])と同じ **call-site 限定の syntactic shortcut** として受理する。`parseInt` / `parseFloat` という binding は作らないので、`const f = parseInt;` は従来どおり `unknown identifier` に落ちる(value 化を防ぐ)。`parseInt` は **radix を必須**にした(1 引数 auto-radix は base 自動判定が footgun で `src/` でも未使用)。lowering 先は libc の `strtoll` / `strtod` を呼ぶ runtime helper。

却下した案: A=`Math` 同様の名前空間オブジェクトを模す(理由: グローバル 2 関数のためだけに binding/型を増やすのは過剰、既存 shortcut パターンと不整合) / B=codegen 内で手書き桁ループに展開(理由: libc の正しく丸める `strtod` に乗る方が `topaz_number_to_string` の roundtrip 方針と整合、桁あふれ・符号処理を自前で持たない)。

## Implementation

- runtime: `topaz_parse_int(topaz_string, topaz_number)` / `topaz_parse_float(topaz_string)`(`runtime/runtime.h:220+`)。arena バッファへコピーして NUL 終端を保証してから `strtoll` / `strtod`、`endptr == begin`(桁未消費)と bad radix(0 でなく `[2,36]` 外)は `NaN` を返す
- codegen emit: `emitCall` の identifier 分岐に `parseInt` / `parseFloat` 分岐 + `emitParseInt` / `emitParseFloat` / `checkParseIntArgs` / `checkParseFloatArgs`(`src/codegen.ts:6133+`, `6571+`)
- codegen infer: `inferType` の CallExpression identifier 分岐に同 2 関数(両方 `number`)を追加し emit と reject を lockstep 化(`src/codegen.ts:7560+`)
- parser 変更なし(regular CallExpression として topaz_parser / convertFromTsc が既に同一に扱う)

## Consequences

- **受理**: `parseInt(s: string, radix: number): number`(radix 必須)、`parseFloat(s: string): number`。call-site のみ
- **reject**: 1 引数 `parseInt` / 第 1 引数 非 string / radix 非 number / `parseFloat` の余剰引数 / bare value 化
- **divergence**: 桁未消費・radix 範囲外は JS の NaN 規則と概ね一致するが、JS の leading-whitespace skip / 部分一致は `strtoll`/`strtod` の prefix parse 任せ(`runtime.h` コメント参照)。f64 にしか載らない大整数は精度欠落
- **回帰**: positive `parse_number.ts`(parser pattern + 各種 radix + NaN)+ fail `parse_int_arity_fail` / `parse_int_arg_type_fail` / `parse_int_radix_type_fail` / `parse_float_arity_fail` / `parse_int_as_value_fail`。159 → 165 ケース全 pass
- **次 blocker**: `topaz_parser.ts:90` の `t.pos`(全 variant 共通フィールドを `switch (x.kind)` なしで参照)= dunion 共通フィールドアクセスの narrowing 不要化。次セッションの出発点
- **scope 外**: 1 引数 auto-radix parseInt、`Number()` / `Number.parseInt`、`Math` 名前空間
