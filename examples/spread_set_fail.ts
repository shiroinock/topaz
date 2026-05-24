// Phase 1.5-3.5h-spread: Set / Iterator sources are rejected. Only
// `Array<T>` sources are accepted at array-literal spread sites.
const s: Set<number> = new Set<number>();
s.add(1);
s.add(2);
const arr: Array<number> = [...s];
console.log(arr.length);
