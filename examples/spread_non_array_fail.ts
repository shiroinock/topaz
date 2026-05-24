// Phase 1.5-3.5h-spread: spread source must be an `Array<T>`. A plain
// number isn't iterable in Topaz (no protocol).
const n: number = 5;
const arr: Array<number> = [...n];
console.log(arr.length);
