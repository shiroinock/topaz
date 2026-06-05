# 0307 - execFileSync stdio literal optional narrowing

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 274

## Context

After [0306](./0306-number-literal-base-emission.md), the full graph
self-host probe could emit C for `src/cli.ts`, but the generated object gate
failed in `checkNodeChildProcessExecFileSyncArgs`. The compiler source compared
the `string | undefined` result of `stringLitText(init)` directly with the
string literal `"inherit"`, which lowered to an invalid generated-C comparison
between `topaz_opt_string` and `topaz_string`.

## Decision

Keep the language/runtime subset unchanged and normalize the compiler source to
the existing explicit optional-narrowing pattern used by
`checkNodeFsReadFileSyncArgs`: reject `undefined` immediately, then compare the
narrowed string literal value with `"inherit"`.

Rejected alternatives: adding general `T | undefined` versus `T` equality
lowering was rejected because it is broader language work than this self-host
cleanup needs; changing `stringLitText` to throw was rejected because the helper
is a reusable extractor and should not own every call-site's validation policy;
rewriting validation around `init.kind` was rejected because it duplicates the
helper's accepted literal forms.

## Implementation

- `src/codegen.ts:9058` still extracts the option value through
  `stringLitText(init)`.
- `src/codegen.ts:9059` rejects a non-string-literal `stdio` value before any
  string comparison.
- `src/codegen.ts:9065` keeps the existing wrong-literal rejection after the
  optional value has been narrowed to `string`.

## Consequences

- **Accepted**: `execFileSync(cmd, args, { stdio: "inherit" })` remains the only
  accepted child-process option shape.
- **Rejected**: non-string-literal `stdio` values and string literals other than
  `"inherit"` keep the same diagnostic.
- **Regression**: existing `node_child_process_exec` positive and fail smoke
  cases continue to cover the public behavior; no new standalone example is
  needed because this is a compiler-source cleanup. The suite remains at 287
  smoke entries.
- **Self-host**: the old optional-string generated-C comparison blocker is
  removed from the object gate. The next observed object-gate blocker is an
  independent captured-`this` arrow helper error where `__topaz_this` is
  undeclared inside generated arrow functions.
- **Scope out**: broader optional equality lowering remains future language
  work.
