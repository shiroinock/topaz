# 0323 - bigint staged design

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.4a

## Context

Phase 2 has finished the baseline hygiene, benchmark, stdlib surface, and
post-selfhost cleanup decisions through [0322](./0322-break-continue-cleanup-labels.md).
The next umbrella item grouped async, regexp, and bigint, but bigint needs a
small staged plan before product code changes because its representation affects
literal parsing, operator typing, runtime helpers, stringification, and
container hashing/equality.

## Decision

Adopt a true arbitrary-precision `bigint` primitive value family distinct from
`number`. Runtime values should be immutable arena-allocated reference objects
such as `topaz_bigint *`, fitting the existing header-only runtime direction and
avoiding external native dependencies. Decimal bigint literal text must be
preserved and never parsed through JS `Number`; unary minus is a prefix operator
over a bigint expression rather than part of a signed literal. No implicit
number/bigint coercion is allowed, so mixed arithmetic and comparison must fail
with clear diagnostics.

The first implementation stages should split frontend/type recognition from
runtime/codegen operators. The skeleton stage accepts `bigint` annotations and
decimal `123n` literals while rejecting non-decimal bigint literals if they are
not explicitly implemented. The first runtime/codegen stage then covers binary
`+`, `-`, `*`, unary `-`, relational `<`, `<=`, `>`, `>=`, equality `===` /
`!==`, `console.log`, and template literal stringification through runtime
helpers. String concatenation with bigint remains rejected unless a later ADR
permits it, and strict boolean condition rules continue to reject bigint
truthiness.

Rejected alternatives: an `int64`-backed placeholder was rejected because it is
semantically false and would create ABI and test churn; a broad ECMAScript-like
BigInt surface up front was rejected because it is too large for the next small
phase; treating bigint as `number` / `double` or allowing mixed coercion was
rejected because it violates Topaz's explicit typed subset direction; vendoring
GMP or requiring another native bigint library was rejected because it conflicts
with the simple repo-local/header-compatible runtime model.

## Implementation

- `MEMO.md:244` replaces the umbrella `2.4 async / regexp / bigint` roadmap
  item with completed `2.4a` design plus `2.4b` frontend/type skeleton,
  `2.4c` arithmetic/comparison runtime, `2.4d` regexp design, and `2.4e` async
  design follow-ups.
- No `src/`, `runtime/`, `examples/`, or `tests/` product behavior changes are
  made in this design-only phase.
- BigInt helpers should be emitted or linked only when bigint is referenced if
  practical. If conditional helper emission is deferred, document that as a
  staging point in the implementation ADR rather than broadening this phase.

## Consequences

- **Accepted**: after implementation, `const x: bigint = 123n`, `123n + 2n`,
  `-x`, `x < 10n`, `x === 123n`, `console.log(x)`, and `` `${x}` `` are the
  intended initial accepted forms.
- **Rejected**: initial stages reject `1n + 2`, `1 + 2n`, `1n / 2n`,
  `1n % 2n`, `1n << 2n`, `BigInt("1")`, `0x10n`, `Array<bigint>`,
  `Map<bigint, string>`, `Set<bigint>`, and `if (1n) {}`.
- **Regression**: no new smoke cases are added by this design-only phase;
  `pnpm run build` and `pnpm test` cover unchanged behavior.
- **Scope out**: division, modulo, bitwise operators, shifts, constructor APIs,
  `.toString()`, non-decimal literals, bigint containers, hashing, and parsing
  or formatting performance remain later ADRs.
