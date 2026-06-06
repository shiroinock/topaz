# 0324 - bigint value skeleton

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.4b

## Context

[0323](./0323-bigint-staged-design.md) fixed bigint as a true primitive value
family distinct from `number`, represented as an arena-allocated immutable
runtime object rather than an `int64` or `double` placeholder. The next small
step is to make `bigint` annotations and decimal `123n` literals usable as
ordinary values while leaving arithmetic, comparison, and stringification to
2.4c.

## Decision

Implement option B: a minimal value skeleton. Decimal bigint literal source text
is preserved through the frontend and lowered to a `topaz_bigint *` object whose
runtime payload copies the canonical decimal bytes into the arena. `bigint` is
not treated as a scalar shortcut, so Array/Map/Set monomorphs remain rejected.
All bigint operators, equality/comparison, console logging, template
substitution, and string concatenation stay explicitly deferred to 2.4c.

Rejected alternatives: an `int64`/`double` placeholder was rejected because it
would truncate large literals and violate ADR 0323; implementing arithmetic and
stringification now was rejected as too broad for this skeleton phase; allowing
container monomorphs was rejected because hashing/equality for bigint is not
designed yet.

## Implementation

- `src/ast.ts:125` adds `bigint_lit`; `src/lexer.ts:18` and
  `src/topaz_parser.ts:1417` carry decimal `123n` spelling through the self
  parser while `src/lexer.ts:300` rejects non-decimal bigint forms.
- `src/convert_from_tsc.ts:1021` converts tsc BigInt literals with the same
  decimal-only rule, and `src/convert_from_tsc.ts:1330` maps
  `BigIntKeyword` to `type_ref bigint`.
- `runtime/runtime.h:83` adds `topaz_bigint` and
  `topaz_bigint_from_decimal_cstr`, copying literal digits into arena storage.
- `src/codegen.ts:72`, `src/codegen.ts:3739`, and `src/codegen.ts:7757` add
  the `bigint` type, annotation lowering, and literal emission as
  `topaz_bigint *`.
- `src/codegen.ts:8810`, `src/codegen.ts:10536`, and `src/codegen.ts:10862`
  reject console/template/operator paths before C emission can treat bigint as
  pointer data.
- `MEMO.md:245` marks 2.4b complete and leaves 2.4c open.

## Consequences

- **Accepted**: `const x: bigint = 123n`, assignment, function arguments,
  returns, and class field storage of bigint values compile and run.
- **Rejected**: mixed number/bigint arithmetic, bigint arithmetic,
  equality/comparison, console/template stringification, non-decimal literals,
  and `Array<bigint>` remain unsupported with focused diagnostics.
- **Regression**: `bigint_value_skeleton` plus seven fail cases are added in
  `tests/smoke.sh:210`; cumulative smoke entries: 323.
- **Scope out**: arithmetic limbs, parsing/formatting performance, `BigInt()`,
  `.toString()`, non-decimal literals, hashing/equality, and bigint containers
  remain future work.
