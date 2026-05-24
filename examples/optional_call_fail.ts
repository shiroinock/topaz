// Phase 1.5-3.5d: optional call `f?.()` is unsupported — only `a?.b`,
// `a?.b()`, and `a?.[i]` are lowered in this phase. (Lowering it would
// require modeling function-valued bindings as `T | undefined`, which
// pulls in arrow-function reference identity we haven't designed yet.)
function f(): number {
  return 42;
}

console.log(f?.());
