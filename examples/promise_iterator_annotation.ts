/// <reference lib="es2018.promise" />

type NumberPromise = Promise<number>;
type NumberLike = PromiseLike<number>;

function countPromises(values: Iterator<NumberPromise>): number {
  let count = 0;
  // @ts-expect-error Topaz accepts Iterator<T> as a for-of source.
  for (const value of values) {
    count = count + 1;
  }
  return count;
}

function countLikes(values: Iterator<NumberLike>): number {
  let count = 0;
  // @ts-expect-error Topaz accepts Iterator<T> as a for-of source.
  for (const value of values) {
    count = count + 1;
  }
  return count;
}

const p1: NumberPromise = Promise.resolve(1);
const p2: NumberPromise = Promise.resolve(2);
const promises = new Set<NumberPromise>();
promises.add(p1);
promises.add(p2);

const promiseMap = new Map<string, NumberPromise>();
promiseMap.set("one", p1);
promiseMap.set("two", p2);

const likeMap: Map<string, NumberLike> = new Map<string, NumberLike>();
const likeIter: Iterator<NumberLike> = likeMap.values();
// @ts-expect-error Topaz accepts Iterator<T> in Set<T>(source).
const copiedLikes = new Set<NumberLike>(likeIter);

const promiseIter: Iterator<NumberPromise> = promiseMap.values();
// @ts-expect-error Topaz accepts Iterator<T> in Set<T>(source).
const copiedPromises = new Set<NumberPromise>(promiseIter);

let directPromiseSetCount = 0;
// @ts-expect-error The standalone tsc gate does not inherit tsconfig target.
for (const value of promises) {
  directPromiseSetCount = directPromiseSetCount + 1;
}

let directMapValueCount = 0;
// @ts-expect-error The standalone tsc gate does not inherit tsconfig target.
for (const value of promiseMap.values()) {
  directMapValueCount = directMapValueCount + 1;
}

let directEntryKeyLength = 0;
// @ts-expect-error The standalone tsc gate does not inherit tsconfig target.
for (const [key, value] of promiseMap.entries()) {
  directEntryKeyLength = directEntryKeyLength + key.length;
}

console.log(directPromiseSetCount);
console.log(directMapValueCount);
console.log(directEntryKeyLength);
console.log(copiedPromises.has(p1));
console.log(countPromises(copiedPromises.values()));
console.log(countLikes(copiedLikes.values()));
