# 0264 - special call callee local narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0263](./0263-call-front-door-diagnostic-anchors.md) advanced the self-host
probe to `src/codegen.ts:7961:7`. The reached blocker was special-call
detection in `emitCall`: compound conditions checked `callee.kind ===
"prop_access"` plus nested receiver shapes, then read `callee.name`. The
self-host subset does not carry discriminated-union narrowing through those
compound property paths.

## Decision

Preserve special-call semantics and express the existing dispatch through
explicit narrowed locals. `emitCall` and the infer-side `call_expr` branch now
bind a `prop` local after `callee.kind === "prop_access"` and use nested
receiver locals before reading `.name`. Rejected alternatives: teaching broad
compound-condition property-path narrowing was rejected as a larger
language/type-system feature; changing optional-call, console, process, or
String behavior was rejected as unrelated; replacing the whole call dispatcher
with a new abstraction was rejected as too broad for this source-shape blocker.

## Implementation

- `src/codegen.ts:7958`: emit-side special-call dispatch now narrows `callee` to
  `prop` once, handles `console.log` / `console.error`, `process.exit`,
  `String.fromCharCode`, and `process.stdout/stderr.write` through `receiver`
  and `receiverProp` locals, then falls through to regular method dispatch.
- `src/codegen.ts:8011`: regular array/map/set/string/class/interface method
  lowering still infers the receiver type and calls the same method emitters,
  but passes the narrowed `prop` local.
- `src/codegen.ts:9965`: infer-side optional method calls now resolve through a
  narrowed `prop` local before returning `R | undefined`.
- `src/codegen.ts:9978`: infer-side special void/static/method return handling
  mirrors the emit-side local narrowing shape and leaves return types unchanged.

## Consequences

- **Accepted**: `console.log`, `console.error`, `process.exit`,
  `process.stdout.write`, `process.stderr.write`, `String.fromCharCode`, and
  regular method calls keep the same lowering and inference behavior.
- **Accepted**: optional method calls `a?.b()` keep the existing widened return
  type behavior.
- **Rejected**: optional call `f?.()` remains unsupported.
- **Regression**: no examples were added because observable behavior and
  diagnostics are unchanged; build, self-host probe, and smoke tests remain the
  guard.
- **Self-host**: the old `src/codegen.ts:7961:7` callee-narrowing blocker is
  removed. The next blocker is `src/codegen.ts:7970:23` on `expr.args[0]!`
  after console arity validation.
- **Scope out**: broader compound-condition narrowing and call-argument
  non-null assertion cleanup remain for later phases.
