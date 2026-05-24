// Phase 1.5-3.5h-spread: spread in `new` arguments is rejected too,
// for the same positional-argument invariant emitCall relies on.
class Pair {
  a: number;
  b: number;
  constructor(a: number, b: number) {
    this.a = a;
    this.b = b;
  }
}
const xs: Array<number> = [10, 20];
const p: Pair = new Pair(...xs);
console.log(p.a);
