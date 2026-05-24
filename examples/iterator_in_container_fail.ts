// Phase 1.5-3.5g-iterator negative: Iterator<T> is a single-pass, stateful
// value (its `state` field aliases arena memory and the slot index advances
// on every `.next()`). Storing it in Array<Iterator<T>> would need ownership
// semantics we don't model, so the container monomorph site (elemTag) rejects
// it with the same policy as fn values.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
const iters: Array<Iterator<number>> = [];
iters.push(m.values());
console.log(iters);
