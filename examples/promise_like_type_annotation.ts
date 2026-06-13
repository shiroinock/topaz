/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;
type NestedLike = PromiseLike<Promise<number>>;
type NumberLikeArray = Array<NumberLike>;

class Holder {
  item: NumberLike;
  items: NumberLikeArray;

  constructor(item: NumberLike, items: NumberLikeArray) {
    this.item = item;
    this.items = items;
  }
}

function keepNumberLike(value: NumberLike): NumberLike {
  return value;
}

function keepNestedLike(value: NestedLike): NestedLike {
  return value;
}

function keepArray(value: NumberLikeArray): NumberLikeArray {
  return value;
}

function takesCallback(cb: (value: NumberLike) => NumberLike): string {
  return "callback";
}

console.log(takesCallback((value: NumberLike): NumberLike => keepNumberLike(value)));
