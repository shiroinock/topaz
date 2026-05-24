// Phase 1.5-4: stress test for the per-process arena. Exercises the four
// allocation paths (Array reserve, class new, string concat, Map rehash) at
// volumes that span multiple arena chunks (initial chunk is 64KB). Success
// criterion is the program completing and printing the expected values — if
// the arena were misaligned or chunk handover were broken, this would
// segfault or corrupt one of the intermediate buffers.

class Node {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

const a: Array<number> = [];
let i = 0;
while (i < 1000) {
  a.push(i);
  i = i + 1;
}
console.log(a.length);
console.log(a[0]);
console.log(a[999]);

const nodes: Array<Node> = [];
let j = 0;
while (j < 1000) {
  nodes.push(new Node(j));
  j = j + 1;
}
console.log(nodes.length);
console.log(nodes[42].v);

let s = "";
let k = 0;
while (k < 200) {
  s = s + "abcdef";
  k = k + 1;
}
console.log(s.length);

const m: Map<number, number> = new Map<number, number>();
let n = 0;
while (n < 500) {
  m.set(n, n * 2);
  n = n + 1;
}
console.log(m.size);
console.log(m.has(250));
const v = m.get(250);
if (v !== undefined) {
  console.log(v);
}
