// Phase 1.5-3.5f-filter: Array.filter requires the callback to return a
// strict boolean. A callback whose return type infers to number (or any
// other non-boolean) is rejected — there is no JS-style truthy/falsy
// coercion.
const xs: Array<number> = [1, 2, 3];
const ys = xs.filter((x) => x);
