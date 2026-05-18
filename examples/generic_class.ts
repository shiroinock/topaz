class Box<T> {
  value: T;
  constructor(v: T) {
    this.value = v;
  }
  get(): T {
    return this.value;
  }
  replace(v: T): T {
    const old: T = this.value;
    this.value = v;
    return old;
  }
}

const bn: Box<number> = new Box<number>(42);
console.log(bn.get());
const old: number = bn.replace(99);
console.log(old);
console.log(bn.get());

const bs: Box<string> = new Box<string>("hello");
console.log(bs.get());

const bb = new Box<boolean>(true);
console.log(bb.get());

class Pair<A, B> {
  first: A;
  second: B;
  constructor(a: A, b: B) {
    this.first = a;
    this.second = b;
  }
  swapToString(): string {
    return this.second;
  }
}

const p = new Pair<number, string>(1, "one");
console.log(p.first);
console.log(p.swapToString());

// Array<Box<number>>: generic class as array element type.
const boxes: Array<Box<number>> = [new Box<number>(10), new Box<number>(20), new Box<number>(30)];
console.log(boxes.length);
const second: Box<number> = boxes[1];
console.log(second.get());

// Generic function with explicit and inferred Box<T> argument.
function unwrap<T>(b: Box<T>): T {
  return b.get();
}
console.log(unwrap<number>(bn));
console.log(unwrap(bs));

