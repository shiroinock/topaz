# 0286 - This expression infer current class guard

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0285](./0285-optional-method-call-argument-loop-cleanup.md) advanced the
self-host probe into `inferType(this_expr)`, where the compiler source used
`if (!this.currentClass)` before passing `this.currentClass` to `classOf`.
`currentClass` is `string | undefined`, and Topaz conditions are strict
`boolean`, so the guard itself became the next self-host blocker instead of a
class or `this` semantic issue.

## Decision

Reuse the same local-copy plus explicit undefined check shape already used by
`emitExpression(this_expr)`: bind `const currentClass = this.currentClass`,
reject `currentClass === undefined`, then return `classOf(currentClass)`.
Rejected alternatives: accepting truthy/falsy optional values in conditions was
rejected because it weakens the strict boolean subset; checking
`this.currentClass === undefined` and then returning `classOf(this.currentClass)`
was rejected because property narrowing is not the established
self-host-friendly pattern; sweeping unrelated `!this.*` sites was rejected as
broader than the current blocker.

## Implementation

- `src/codegen.ts:9665`: binds `this.currentClass` to a local before testing it.
- `src/codegen.ts:9666`: uses `currentClass === undefined` for the invalid
  `this` diagnostic path.
- `src/codegen.ts:9667`: reports the diagnostic through a `{ pos: expr.pos }`
  anchor, matching `emitExpression(this_expr)`.
- `src/codegen.ts:9672`: passes the narrowed local to `classOf`, preserving the
  current concrete-class inference behavior.

## Consequences

- **Accepted**: `this` in class methods and constructors continues to infer as
  the current concrete class.
- **Rejected**: `this` outside class methods or constructors keeps the existing
  `` `this` is only valid inside class methods or constructors `` diagnostic.
- **Regression**: no new examples were added because this is a self-hostability
  cleanup over existing `this` behavior. Existing class and invalid-`this`
  smoke coverage, plus the self-host probe, cover the boundary; `tests/smoke.sh`
  has 282 primary compile/run/fail checks including CLI failure checks.
- **Self-host**: the old `src/codegen.ts:9665:12` strict-boolean blocker is
  removed; the probe may now expose a later blocker.
- **Scope out**: broader truthiness support, property-narrowing changes, and
  unrelated optional guard rewrites remain out of scope.
