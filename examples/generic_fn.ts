function identity<T>(x: T): T {
  return x;
}

function first<T>(xs: Array<T>): T {
  return xs[0];
}

function last<T>(xs: Array<T>): T {
  return xs[xs.length - 1];
}

function pickSecond<A, B>(a: A, b: B): B {
  return b;
}

function singleton<T>(x: T): Array<T> {
  let xs: Array<T> = [];
  xs.push(x);
  return xs;
}

function firstOfSingleton<T>(x: T): T {
  return first<T>(singleton<T>(x));
}

class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
  get(): number {
    return this.v;
  }
}

console.log(identity<number>(42));
console.log(identity(7));
console.log(identity<string>("hi"));
console.log(identity("yo"));
console.log(identity<boolean>(true));
console.log(identity(false));

let ns: Array<number> = [10, 20, 30];
console.log(first(ns));
console.log(last(ns));

let ss: Array<string> = ["alpha", "beta", "gamma"];
console.log(first(ss));
console.log(last(ss));

console.log(pickSecond<number, string>(1, "two"));
console.log(pickSecond("one", 2));

let xs: Array<number> = singleton(99);
console.log(xs.length);
console.log(xs[0]);

let ys: Array<string> = singleton<string>("solo");
console.log(ys[0]);
console.log(ys.length);

console.log(firstOfSingleton<number>(123));
console.log(firstOfSingleton("zzz"));

let boxes: Array<Box> = singleton<Box>(new Box(777));
console.log(boxes.length);
console.log(first<Box>(boxes).get());
console.log(identity<Box>(new Box(555)).get());
