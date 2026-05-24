// Phase 1.5-3.5e: fn types cannot be stored in Array / Map / Set yet
// (1.5-3.5f, when Array.map / closures-in-containers land).
const fns: Array<(n: number) => number> = [];
fns.push((n) => n + 1);
