# 0002 — `T | undefined` for T = dunion + Map<scalar, dunion>.get narrowing

- **Status**: Accepted
- **Date**: 2026-05-27 頃(prep #15 着地時点)
- **Phase**: 1.5-6 prep-dunion-optional

## Context

[0001](./0001-recursive-type-alias.md) 着地後、self-host 経路の次の blocker は `cTypeName: 'T | undefined' requires T to be a scalar, reference (array/map/set/class), or interface; got topaz_dunion_anon_0_or_anon_1_or_...`。`src/ast.ts` の `TypeNode | undefined`(関数戻り値 / Map V / class field)で頻発、`TypeNode` が dunion なので `cTypeName` の union 分岐が dunion を inner に持つ T を拒否していた。

prep #8(Array<dunion>)で Map V の dunion は `.has` / `.delete` / `.size` / `.set` のみ動かして `.get` narrowing を「`dunion | undefined` への `!` / `??` 対応とセットで別 sub-step」として deferred していた。ここを一気に着地させて prep #8 残を消化しつつ `src/ast.ts` も通すのが狙い。

## Decision

dunion は既に `{ topaz_string kind; void *data; }` の fat struct で iface と同 shape。**absent sentinel は `.data == NULL`** を採用(全 field zero-initialized = `{0}`、class instance ポインタは `calloc` 由来で常に non-NULL なので衝突なし)。iface fat pointer の `.data == NULL` policy と完全に揃え、`===` / `!==` / `!` / `??` の emit branch は iface と統合。

## Implementation

- **`cTypeName` union branch 拡張** (`src/codegen.ts:431-482`): 従来 `isReferenceType(inner) || inner.kind === "iface"` のみ受理していた T を `inner.kind === "dunion"` も accept。C 型は `cTypeName(inner)` をそのまま返す(scalar 時の `topaz_opt_<T>` のような typedef は不要、`{0}` で absent を表現)
- **`emitUndefinedLiteral` dunion branch** (`src/codegen.ts:7951-7982`): `((${typeIdent(inner)}){0})` の compound literal を返す
- **`===` / `!==` undefined 統合** (`src/codegen.ts:5625-5650`): iface と同 branch で `.data ${op} NULL`
- **narrowed identifier emit の widening** (`src/codegen.ts:5330+`): switch / if narrowing で base が `dunion | undefined`、narrowed が concrete class のとき、`withoutUndefined(base.type)` で union 中の dunion を抜き出してから `((topaz_class_<C> *)(<id>).data)` を吐く(従来は `base.type.kind === "dunion"` の直接 case しか拾えず `Tok | undefined` の中の dunion で不正 C を生成していた)
- **`!` for dunion** (`src/codegen.ts:5433-5453`): iface と同 branch、`({ <ct> __t = <val>; if (__t.data == NULL) { panic } __t; })`。`inferType !` の operand check に `stripped.kind !== "dunion"` を gate 追加(non-optional dunion への `!` を reject)
- **`??` for dunion** (`src/codegen.ts:5585-5604`): 同じく iface と同 branch、`({ <lct> __t = <lhs>; __t.data != NULL ? __t : (<rhs>); })`。RHS は `emitWithExpected` 経由で class→dunion / anon→dunion coercion が自動
- **Map<scalar, dunion>.get 自動接続**: prep #8 の `topaz_opt_passthrough` macro + `((typeIdent(v)){0})` absent literal 経路が既に入っていたため、`cTypeName` / `emitUndefinedLiteral` 拡張だけで `.get` narrowing がそのまま走る

## Consequences

- **受理**: ① `let cur: T | undefined = new Variant(...)`、② `cur = undefined` / 再代入、③ `if (cur !== undefined) switch (cur.kind) { ... }`、④ `if (cur === undefined)`、⑤ 関数 param / 戻り値で `T | undefined`、⑥ `Map<scalar, T>.get` で `T | undefined`、⑦ `!` 強制、⑧ `??` fallback、⑨ `??` chain、⑩ reference identity 保存(同 `.get(k)` 2 回が同 underlying instance を wrap)
- **reject**: ① narrow 無しの `.kind` / field 読み出し、② 既に `T` 型に `!`、③ 既に `T` に `??`、④ `dunion | undefined` を Array / Map / Set 要素に詰める(monomorph 未整備、Set は `.data` identity を absent と区別する hash 戦略が要る)
- **回帰**: positive `dunion_optional.ts`(9 シナリオ / 17 出力)+ fail `dunion_optional_unnarrowed_fail.ts`、`_non_optional_bang_fail.ts`、`_non_optional_coalesce_fail.ts`。155 → 159 ケース全 pass
- **pass criterion**: `node dist/cli.js src/ast.ts --emit-c-only -o /tmp/ast` で 1473 行 emit、`cc -O2 -Iruntime -c /tmp/ast.c` も警告なし

## scope 外 / 将来課題

- `Array<dunion | undefined>` / `Map<scalar, dunion | undefined>` / `Set<dunion | undefined>`(`elemTag` の dispatch に union branch なし)
- `Iterator<dunion | undefined>` / `for-of` binding に `T | undefined`
- `switch (cur?.kind)` の optional chain + switch(`?.` は scalar / class / iface / Array index に限定)
- `(a ?? b).kind` の chain 末尾 + 直接 field 参照(narrowed binding の lifetime が `??` の RHS に閉じない、`const x = a ?? b; switch (x.kind)` で回避)
