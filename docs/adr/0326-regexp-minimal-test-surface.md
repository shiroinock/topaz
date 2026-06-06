# 0326 - regexp minimal test surface

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.4d

## Context

[0035](./0035-cli-subset-argv-parser.md) deliberately removed the compiler's
own regexp literal and kept `/` lexing in the subset small enough for
self-hosting. Phase 2.4 has already split bigint into a design step followed by
frontend/runtime implementation steps in [0323](./0323-bigint-staged-design.md),
[0324](./0324-bigint-value-skeleton.md), and
[0325](./0325-bigint-limb-runtime-operations.md). Regexp should follow the same
pattern: fix the first accepted surface before changing lexer, parser, codegen,
or runtime behavior. Existing Topaz strings are ASCII-only, so the first regexp
runtime must inherit that limitation instead of promising ECMAScript unicode
semantics.

## Decision

Adopt regexp as a distinct reference family, eventually represented by an
arena-owned `topaz_regexp *`. The first implementation surface should accept
regexp literal syntax `/pattern/`, `new RegExp("pattern")`, and
`RegExp.prototype.test(input: string): boolean`. Regexp values remain rejected
as strict boolean conditions, and they stay out of Array/Map/Set monomorphs
until equality, hashing, and ownership semantics are separately designed.

The first pattern grammar is intentionally small: literal ASCII characters,
`.`, anchors `^` and `$`, and quantifiers `*`, `+`, and `?`. Character classes,
ranges, grouping, alternation, captures, backreferences, lookaround, unicode
classes, named groups, replacement semantics, `match`, `replace`, and `split`
are deferred. No flags are accepted initially; `g`, `i`, `m`, `s`, `u`, `y`,
`d`, and any non-empty flag list must be rejected until a later ADR defines
their semantics. The lexer/parser should recognize regexp literals only in
expression-start positions and must preserve `/` and `/=` as arithmetic or
assignment operators in operator positions.

Rejected alternatives: a string helper only was rejected because it would not
settle the regexp literal/parser direction; literal plus `test` plus `match`
was rejected because nullable return shapes, capture arrays, group metadata,
and allocation rules need a separate design; permanently delegating semantics
to libc/POSIX regex was rejected as platform-dependent, though a temporary
backend may be used if Topaz still owns the subset semantics; ECMAScript
compatibility upfront was rejected as too broad for Phase 2's staged work.

## Implementation

- `MEMO.md:247` marks 2.4d complete and points the roadmap at this ADR.
- `examples/regexp_literal_deferred_fail.ts:1` records that `/abc/` is still
  rejected before the lexer/parser implementation phase.
- `examples/regexp_constructor_deferred_fail.ts:1` records that
  `new RegExp("abc")` is still rejected before runtime/type support exists.
- `examples/regexp_string_test_deferred_fail.ts:1` records that `.test` is not
  a string-only placeholder API.
- `tests/smoke.sh:226` adds the three fail regressions without changing product
  parser, codegen, or runtime files.

## Consequences

- **Accepted**: a later implementation phase should accept `/pattern/`,
  `new RegExp("pattern")`, and `re.test("input")` over ASCII strings.
- **Rejected**: current behavior remains rejected for regexp literals,
  constructor values, string `.test`, flags, containers, match-like APIs,
  captures, alternation, grouping, backreferences, lookaround, replacement, and
  unicode semantics.
- **Regression**: `regexp_literal_deferred_fail`,
  `regexp_constructor_deferred_fail`, and `regexp_string_test_deferred_fail`;
  the smoke suite now has 327 explicit run entries.
- **Scope out**: no product regexp acceptance, parser/codegen/runtime support,
  flag semantics, or POSIX/backend choice is implemented in this design-only
  phase.
