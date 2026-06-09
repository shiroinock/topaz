# 0340 - array spread element coercion

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.12

## Context

After [0339](./0339-string-literal-union-value-representation.md), the
self-host probe advanced to `src/builtin_descriptors.ts:334:14`. The descriptor
combiner returns `[...builtinImportDescriptors(), ...builtinSyntheticGlobalDescriptors()]`
as `Array<BuiltinDescriptor>`, where each source array has a concrete variant
element type and the destination is a discriminated union. Fixed array elements
already flow through `emitWithExpected`, but spread sources still required exact
element type equality.

## Decision

Allow array-literal spread when the source element type is assignable to the
destination element type, and coerce each copied element through `applyCoercion`
before pushing it into the destination array. Rejected alternatives: keeping
exact element equality was rejected because it makes spread less capable than
fixed elements in the same literal; rewriting `builtin_descriptors.ts` to avoid
spread was rejected because class-to-dunion spread is a useful source shape;
adding Set/Iterator spread or call-argument spread was rejected as unrelated.

## Implementation

- `src/codegen.ts:8394` updates the array-spread invariant from exact element
  matching to assignable element flow.
- `src/codegen.ts:8423` records each spread source element type beside its
  temporary array.
- `src/codegen.ts:8436` accepts spread sources whose element type is assignable
  to the destination element type.
- `src/codegen.ts:8458` applies element coercion before pushing copied spread
  elements into the destination array.
- `examples/array_of_dunion.ts:119` covers spreading `Array<Circle>` into an
  `Array<Shape>`.
- `tests/smoke.sh:445` extends `array_of_dunion` expected output.
- `MEMO.md:267` records the next current self-host blocker.

## Consequences

- **Accepted**: array-literal spread now matches fixed-element behavior for
  class-to-interface, class-to-dunion, wider dunion, and other existing
  assignability/coercion paths.
- **Accepted**: the previous self-host blocker in `src/builtin_descriptors.ts`
  is cleared.
- **Current blocker**: `pnpm run test:selfhost` now advances to `src/codegen.ts`,
  where a template literal substitution has type `string | undefined`.
- **Rejected**: Set/Iterator spread, call-argument spread, and unrelated spread
  semantics remain out of scope.
- **Regression**: `array_of_dunion` now covers array spread from a concrete
  variant array into a discriminated-union array.
