# 0151. class modifier diagnostic mapping (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0150](./0150-class-implements-anchors.md) moved the full graph self-host probe
to `src/codegen.ts:3016`, where class member modifier diagnostics used
`mod.charAt(0).toUpperCase() + mod.slice(1)` to reconstruct a TypeScript
`SyntaxKind`-style name. Topaz does not support `String.charAt` or
`String.toUpperCase`.

The same diagnostic also used the full class member object as its anchor.

## Decision

Replace dynamic capitalization with an explicit mapping for the rejected class
member modifiers that can reach codegen: `static`, `abstract`, and `override`.
Use `memberAnchor: { pos: number }` for the diagnostic.

Rejected alternative: adding `String.charAt` / `String.toUpperCase` support would
expand the string method surface just for diagnostic text generation.

## Implementation

- `src/codegen.ts:3013` creates a class member anchor.
- `src/codegen.ts:3017` maps rejected modifier strings to `Static`, `Abstract`,
  or `Override`.
- `src/codegen.ts:3024` reports the unsupported modifier diagnostic using the
  minimal member anchor.

## Consequences

- **Accepted**: modifier diagnostics keep the previous `StaticKeyword` style
  text without requiring more string methods.
- **Rejected**: no new string methods are added.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
