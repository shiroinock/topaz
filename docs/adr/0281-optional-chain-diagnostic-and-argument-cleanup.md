# 0281 - Optional chain diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0280](./0280-optional-chain-receiver-explicit-undefined-check.md) advanced the
self-host probe from optional receiver narrowing into optional index diagnostics.
The next blocker was `src/codegen.ts:9510:9`, where `resolveOptionalIndexType`
passed the full element-access AST node into `CodegenError`. That full node did
not match the minimal `{ pos: number }` diagnostic shape needed by the
self-hosting subset.

## Decision

Preserve optional chaining semantics exactly while anchoring optional-chain
diagnostics and lowering metadata on minimal `{ pos }` objects. Optional index
diagnostics now use a local `{ pos: expr.pos }` anchor, and the property, index,
and method lowering paths pass the same minimal anchor into `lowerOptionalChain`.
Optional method-call arity diagnostics also report through the local call anchor.
Rejected alternatives: adding optional call `f?.()` was rejected because this
phase only cleans the existing supported surface; extending optional index access
to Map, Set, or object-like receivers was rejected because optional index remains
Array-only; changing sentinel lowering, absent literals, result widening, or
argument type-checking was rejected to keep runtime behavior unchanged.

## Implementation

- `src/codegen.ts:9507`: `resolveOptionalIndexType` creates a local
  `exprAnchor: { pos: number }` before resolving the receiver.
- `src/codegen.ts:9511`: the optional index unsupported-receiver diagnostic now
  uses `exprAnchor` instead of the full element-access node.
- `src/codegen.ts:9550`: optional property lowering creates a local call-site
  anchor and passes it to `lowerOptionalChain`.
- `src/codegen.ts:9571`: optional element lowering passes the same minimal anchor
  while keeping Array-only element access unchanged.
- `src/codegen.ts:9590`: optional method-call lowering uses a local
  `exprAnchor` for both arity diagnostics and result coercion through
  `lowerOptionalChain`.

## Consequences

- **Accepted**: existing valid `optional_chain`, `optional_param`, and optional
  `Map.get` chain behavior is unchanged.
- **Rejected**: optional chains on non-optional receivers, `optional_call_fail`,
  optional index access on non-Array receivers, and wrong optional method-call
  arity remain rejected through existing diagnostics.
- **Regression**: no new examples were added because existing smoke coverage
  already covers the requested accept/reject surface. `tests/smoke.sh` remains
  at 277 primary compile/run/fail entries.
- **Self-host**: the old `src/codegen.ts:9510:9` blocker is removed; the probe
  now advances to the later `src/codegen.ts:9535:5` initializer-required blocker
  in `lowerOptionalChain`.
- **Scope out**: optional call support, runtime sentinel representation,
  optional-chain result widening, parser changes, and unrelated diagnostic
  anchors are unchanged.
