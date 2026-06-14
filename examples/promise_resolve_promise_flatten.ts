/// <reference lib="es2018.promise" />

type NumberLike = PromiseLike<number>;

class FlattenErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

function bridgeLike(value: NumberLike): Promise<number> {
  return Promise.resolve(value);
}

const nested: Promise<number> = Promise.resolve(Promise.resolve(10));
nested.then((n: number): void => {
  console.log("nested flattened");
  console.log(n + 1);
});

const rejectedSource: Promise<number> = Promise.reject(new FlattenErr("native rejected"));
const rejectedForwarded: Promise<number> = Promise.resolve(rejectedSource);
rejectedForwarded.catch((e: unknown): number => {
  console.log("rejected forwarded");
  if (e instanceof FlattenErr) {
    console.log(e.message);
  }
  return 20;
}).then((n: number): void => {
  console.log("rejected recovery");
  console.log(n + 2);
});

const fulfilledSource: Promise<number> = Promise.resolve(30);
fulfilledSource.then((n: number): void => {
  console.log("fulfilled source");
  console.log(n + 3);
});

const fulfilledForwarded: Promise<number> = Promise.resolve(fulfilledSource);
fulfilledForwarded.then((n: number): void => {
  console.log("fulfilled forwarded");
  console.log(n + 4);
});

const like: NumberLike = Promise.resolve(40);
bridgeLike(like).then((n: number): void => {
  console.log("like bridge");
  console.log(n + 5);
});

Promise.resolve(50).then((n: number): void => {
  console.log("scalar preserved");
  console.log(n + 6);
});

console.log("sync tail");
