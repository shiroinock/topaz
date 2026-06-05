// Phase 275: arrows inside class members capture lexical `this` through the
// ordinary arrow env, including transitive capture through nested arrows.

class Counter {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  makeAdder(delta: number): () => number {
    return () => this.value + delta;
  }

  makeNestedAdder(): () => number {
    return () => {
      const inner: () => number = () => this.value + 1;
      return inner();
    };
  }
}

const c: Counter = new Counter(10);
const add5: () => number = c.makeAdder(5);
console.log(add5());

c.value = 20;
console.log(add5());

const nested7: () => number = c.makeNestedAdder();
console.log(nested7());

c.value = 30;
console.log(nested7());
