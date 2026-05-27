# 0008 — dunion 初期化子 narrowing(`const x: U = <variant>`)

- **Status**: Accepted
- **Date**: 2026-05-28
- **Phase**: 1.5-6 prep #21

## Context

self-hosting の次 blocker は `src/topaz_parser.ts:233` の

```ts
const name: Token = this.expectIdent();        // expectIdent(): IdentToken
specifiers.push({ importedName: name.text, ... });  // ← .text は IdentToken 固有
```

`expectIdent()` は具体 variant `IdentToken` を返すが、宣言注釈 `Token`(dunion)が
binding をユニオン型に固定してしまい、variant 固有フィールド `.text` の読みが
「narrow it first」で reject される。tsc は `const` / `let` の初期化代入点で宣言型を
初期化子の静的型へ control-flow narrowing するので `name.text` を受理する
(`const tok: Token = getIdent(); tok.text` は tsc で no error)。lexer/parser は
`const t: Token = this.expectX()` の形を随所で使うため self-hosting に必須。
discriminator narrowing の基盤は [archive の 1.5-3e](../archive/implementation-log.md)、
carry narrowing は [0007](./0007-compound-carry-narrowing.md)。

## Decision

`declareVar` に初期化子 narrowing を追加する。型注釈が dunion で、初期化子の静的型が
その variant のひとつ(concrete class)なら、binding は dunion のまま宣言しつつ narrowing
overlay に variant を install する。C 変数は引き続き dunion fat struct を保持し
(`emitWithExpected` が coercion 済み)、後続の variant 固有読みは既存の
dunion→variant `.data` cast(identifier emit `src/codegen.ts:5458`)を素通りで再利用する。
**`const` 限定**: `let` の別 variant 再代入は narrowing を stale にするが、plain
assignment に narrowing 無効化フックがまだ無いため。object / array literal / arrow の
初期化子は contextual typing 専用で `inferType` が単独では型付けできず、かつ object
literal を dunion スロットに置く形は common-field write 検査が「未 narrow」前提なので、
これらは narrowing 対象から除外する。

却下案: (a) binding の宣言型自体を variant に差し替える = ユニオン期待位置での再利用に
毎回 coercion が要り、`let` で別 variant 代入時の型検査が tsc より厳しくなる。narrowing
overlay なら宣言型は `Token` のまま保て、既存 cast 機構をそのまま使える。(b) object
literal 初期化子も narrow = variant 同定ロジックの追加が要り blocker には不要。
common-field write の reject 例(`dunion_common_field_write_fail`)とも衝突するので
別 substep に回す。

副作用として、dunion 共通の discriminator フィールドを narrow 後の concrete instance
から読む経路が初めて到達可能になり、`string_literal` フィールド読みが
`console.log`(number 誤ディスパッチ)で壊れた。`inferType` の class フィールド読みで
`string_literal` → `string` に widen して修正(un-narrow dunion の discriminator 読みが
返す `T_STRING` と挙動を揃える / `src/codegen.ts:7305`)。

## Implementation

- `declareVar` に初期化子 narrowing(dunion 注釈 + concrete-variant 初期化子 + `const` +
  非 contextual 初期化子)。`scope.declare` 後に `scope.narrow(name, variant)`。
  `src/codegen.ts:4686-4708`
- `inferType` の class フィールド読み: `string_literal` フィールドは `T_STRING` に
  widen。`src/codegen.ts:7330-7341`
- 既存の dunion→variant `.data` cast(identifier emit `src/codegen.ts:5458`)/
  property-access(`src/codegen.ts:5517`)/ class→dunion coercion(`emitWithExpected`)は
  無変更で恩恵を受ける。

## Consequences

- **受理**: `const name: Token = this.expectIdent(); name.text`(call 初期化子)、
  `const c: Circle | Square = new Circle(2); c.radius`(`new` 初期化子、tsc と一致)。
  ユニオン期待位置(関数引数 / switch)では fat struct に再 wrap coercion。
  `topaz_parser.ts` の blocker が 233 → 310(別件: object literal property shorthand)へ前進。
- **reject**: `let id: Token = makeIdent(...); id.text`(`let` は narrow せず、未 narrow
  dunion field read として reject)。関数引数 `s: Circle | Square` の `s.radius`(真に
  未 narrow なユニオンは従来通り reject、tsc も同様)。
- **回帰**: positive `dunion_init_narrow`(call / `new` 初期化子 + ユニオン再利用)+ warnfree、
  fail `dunion_init_narrow_let_fail`(`let` は narrow されない)。既存
  `dunion_field_access_fail` は `const s = new Circle()` が narrow されるようになったため
  関数引数版に書き換え(未 narrow ユニオンの reject 意図を維持、tsc も reject)。
  177 → 180 ケース全 pass。
- **scope 外 / 次 blocker**: object / array literal 初期化子の dunion narrowing は未対応
  (variant 同定が要 / common-field write 例と衝突)。`let` の代入後 narrowing 無効化も
  未実装。次 blocker は `src/topaz_parser.ts:310` の object literal property shorthand。

## Notes

- 単項 / carry narrowing の基盤は [archive の 1.5-3d](../archive/implementation-log.md)、
  discriminator narrowing の `switch` 経路は [archive の 1.5-3e](../archive/implementation-log.md)、
  compound 条件の narrowing は [0006](./0006-compound-condition-narrowing.md) /
  [0007](./0007-compound-carry-narrowing.md)。
