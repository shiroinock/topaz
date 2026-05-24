// Phase 1.5-3.5d: applying `?.` to an already-non-optional receiver erases
// the operator's intent (the short-circuit can never fire). TS surfaces this
// only as a warning; Topaz upgrades it to a compile-time error.
class Node {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}

const n: Node = new Node(7);
console.log(n?.value);
