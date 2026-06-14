/// <reference lib="es2018.promise" />

class SentinelErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class SentinelThrowErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(1).then(
  (n: number): PromiseLike<number> => {
    console.log("undefined fulfilled callback");
    return Promise.resolve(n + 1);
  },
  undefined,
).then((n: number): void => {
  console.log("undefined fulfilled result");
  console.log(n);
});

Promise.resolve(2).then(
  (n: number): PromiseLike<number> => {
    console.log("null fulfilled callback");
    return Promise.resolve(n + 1);
  },
  null,
).then((n: number): void => {
  console.log("null fulfilled result");
  console.log(n);
});

const sourceRejected: Promise<number> = Promise.reject(new SentinelErr("source"));
sourceRejected.then(
  (n: number): PromiseLike<number> => {
    console.log("missed fulfilled callback");
    return Promise.resolve(n + 1);
  },
  undefined,
).catch((e: unknown): number => {
  console.log("sentinel source rejection");
  if (e instanceof SentinelErr) {
    console.log(e.message);
  }
  return 7;
}).then((n: number): void => {
  console.log("sentinel recovery result");
  console.log(n);
});

Promise.resolve(4).then(
  (n: number): PromiseLike<number> => {
    console.log("returned rejection callback");
    const rejected: Promise<number> = Promise.reject(new SentinelErr("returned"));
    return rejected;
  },
  undefined,
).catch((e: unknown): number => {
  console.log("returned rejection");
  if (e instanceof SentinelErr) {
    console.log(e.message);
  }
  return 9;
}).then((n: number): void => {
  console.log("returned recovery result");
  console.log(n);
});

Promise.resolve(5).then(
  (n: number): PromiseLike<number> => {
    console.log("throw callback");
    throw new SentinelThrowErr(n + 4);
    return Promise.resolve(0);
  },
  null,
).catch((e: unknown): number => {
  console.log("throw rejection");
  if (e instanceof SentinelThrowErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw recovery result");
  console.log(n);
});

console.log("sync tail");
