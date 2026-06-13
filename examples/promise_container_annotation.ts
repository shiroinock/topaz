/// <reference lib="es2018.promise" />

type NumberPromise = Promise<number>;
type NestedPromise = Promise<Promise<number>>;
type PromiseList = Array<NumberPromise>;
type PromiseMap = Map<string, NumberPromise>;
type PromiseSet = Set<NumberPromise>;

class Holder {
  list: PromiseList;
  table: PromiseMap;
  seen: PromiseSet;

  constructor(list: PromiseList, table: PromiseMap, seen: PromiseSet) {
    this.list = list;
    this.table = table;
    this.seen = seen;
  }
}

function takeList(values: PromiseList): number {
  return values.length;
}

function takeMap(values: PromiseMap): boolean {
  return values.has("one");
}

function takeSet(values: PromiseSet, value: NumberPromise): boolean {
  return values.has(value);
}

function takeNested(values: Map<string, NestedPromise>): string {
  return "nested";
}

const first: NumberPromise = Promise.resolve(1);
const second: NumberPromise = Promise.resolve(2);
const list: PromiseList = [first, second];
const table: PromiseMap = new Map<string, NumberPromise>();
const seen: PromiseSet = new Set<NumberPromise>();

table.set("one", first);
seen.add(first);

const holder = new Holder(list, table, seen);

console.log(takeList(holder.list));
console.log(takeMap(holder.table));
console.log(takeSet(holder.seen, first));
console.log(takeNested(new Map<string, NestedPromise>()));
