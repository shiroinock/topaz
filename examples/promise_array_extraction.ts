/// <reference lib="es2018.promise" />

type NumberPromise = Promise<number>;
type NumberLike = PromiseLike<number>;

function countPromises(values: Array<NumberPromise>): number {
  let count = 0;
  for (const value of values) {
    const current: NumberPromise = value;
    count = count + 1;
  }
  return count;
}

function countLikes(values: Array<NumberLike>): number {
  let count = 0;
  for (const value of values) {
    const current: NumberLike = value;
    count = count + 1;
  }
  return count;
}

const first: NumberPromise = Promise.resolve(1);
const second: NumberPromise = Promise.resolve(2);
const promises: Array<NumberPromise> = [first];
promises.push(second);

const slot: NumberPromise = promises[1];
const copied: Array<NumberPromise> = [slot];
const nested: Array<Array<NumberPromise>> = [promises];

const likes: Array<NumberLike> = [];

console.log(countPromises(promises));
console.log(promises.length);
console.log(copied.length);
console.log(nested[0].length);
console.log(countLikes(likes));
