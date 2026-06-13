/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;
type NestedLike = PromiseLike<Promise<number>>;
type LikeMap = Map<string, NumberLike>;
type LikeSet = Set<NumberLike>;

class Holder {
  values: LikeMap;
  seen: LikeSet;

  constructor(values: LikeMap, seen: LikeSet) {
    this.values = values;
    this.seen = seen;
  }
}

function takeMap(values: LikeMap): string {
  return "map";
}

function takeSet(values: LikeSet): string {
  return "set";
}

function takeNested(values: Map<string, NestedLike>): string {
  return "nested";
}

const values: LikeMap = new Map<string, NumberLike>();
const seen: LikeSet = new Set<NumberLike>();
const holder = new Holder(values, seen);

console.log(takeMap(holder.values));
console.log(takeSet(holder.seen));
console.log(takeNested(new Map<string, NestedLike>()));
