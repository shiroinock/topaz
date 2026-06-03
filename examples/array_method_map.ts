// Phase 1.5-3.5f: Array.map. callback is a fn value (arrow with contextual
// param type from the source element, or an identifier of fn type). Result
// elem type comes from the callback's return type — body-inferred for
// expression bodies, annotation-required for block bodies.

// --- basic map on scalar array ---
const xs: Array<number> = [1, 2, 3];
const doubled: Array<number> = xs.map((x) => x * 2);
console.log(doubled[0]);  // 2
console.log(doubled[1]);  // 4
console.log(doubled[2]);  // 6

// --- annotated callback (explicit params + return) ---
const tripled: Array<number> = xs.map((x: number): number => x * 3);
console.log(tripled[0]);  // 3
console.log(tripled[2]);  // 9

// --- callback bound to a fn-typed variable ---
const addOne: (n: number) => number = (n) => n + 1;
const incd: Array<number> = xs.map(addOne);
console.log(incd[0]);  // 2
console.log(incd[2]);  // 4

// --- elem-type change: number -> string via template literal ---
const labels: Array<string> = xs.map((x) => `n=${x}`);
console.log(labels[0]);  // n=1
console.log(labels[2]);  // n=3

// --- elem-type change: number -> boolean ---
const isOdd: Array<boolean> = xs.map((x) => x % 2 === 1);
console.log(isOdd[0]);  // true
console.log(isOdd[1]);  // false

// --- captures outer scalar by value ---
const factor: number = 10;
const scaled: Array<number> = xs.map((x) => x * factor);
console.log(scaled[0]);  // 10
console.log(scaled[2]);  // 30

// --- callback constructs a class instance per element ---
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}
const boxes: Array<Box> = xs.map((x) => new Box(x * 100));
console.log(boxes[0].value);  // 100
console.log(boxes[2].value);  // 300

// --- map a class array back to a scalar by extracting a field ---
const values: Array<number> = boxes.map((b) => b.value);
console.log(values[2]);  // 300

// --- empty array stays empty ---
const empty: Array<number> = [];
const mappedEmpty: Array<number> = empty.map((x) => x + 1);
console.log(mappedEmpty.length);  // 0

// --- chained .map (each intermediate Array<U> lives in the arena) ---
const chained: Array<number> = xs.map((x) => x + 1).map((y) => y * 10);
console.log(chained[0]);  // 20
console.log(chained[2]);  // 40

// --- callback with explicit annotation matching element type ---
const stripped: Array<number> = boxes.map((b: Box): number => b.value + 1);
console.log(stripped[0]);  // 101
console.log(stripped[2]);  // 301

// --- callback can receive the zero-based index ---
const indexed: Array<number> = [10, 20, 30].map((x, i) => x + i);
console.log(indexed[0]);  // 10
console.log(indexed[1]);  // 21
console.log(indexed[2]);  // 32

// --- fn-valued callback can also receive the index ---
const addIndex: (n: number, i: number) => number = (n, i) => n + i;
const indexedFn: Array<number> = xs.map(addIndex);
console.log(indexedFn[0]);  // 1
console.log(indexedFn[1]);  // 3
console.log(indexedFn[2]);  // 5
