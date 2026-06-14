/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;
type NestedLike = PromiseLike<Promise<number>>;

class AdapterError {
  constructor() {
  }
}

class LikeBox {
  current: NumberLike;

  constructor(current: NumberLike) {
    this.current = current;
  }
}

function takeLike(value: NumberLike): string {
  const kept: Array<NumberLike> = [];
  kept.push(value);
  return "param";
}

function makeLike(value: number): NumberLike {
  return Promise.resolve(value);
}

function keepNested(value: Promise<Promise<number>>): string {
  const nestedValues: Array<NestedLike> = [];
  nestedValues.push(value);
  return "nested";
}

const local: NumberLike = Promise.resolve(1);
console.log(takeLike(Promise.resolve(2)));

const returned: NumberLike = makeLike(3);
console.log("return");

const values: Array<NumberLike> = [];
values.push(Promise.resolve(4));
values.push(local);
console.log("array");

const mapped = new Map<string, NumberLike>();
mapped.set("value", Promise.resolve(5));
console.log("map");

const seen = new Set<NumberLike>();
seen.add(Promise.resolve(6));
console.log("set");

const box = new LikeBox(Promise.resolve(7));
box.current = returned;
console.log("field");

const nestedPromise: Promise<Promise<number>> = Promise.reject(new AdapterError());
console.log(keepNested(nestedPromise));
