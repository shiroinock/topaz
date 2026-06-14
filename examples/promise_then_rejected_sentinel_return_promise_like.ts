/// <reference lib="es2018.promise" />

class RejectedSentinelErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class RejectedSentinelThrowErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(20).then(
  undefined,
  (e: unknown): PromiseLike<number> => {
    console.log("missed undefined rejected callback");
    return Promise.resolve(0);
  },
).then((n: number): void => {
  console.log("fulfilled undefined bypass");
  console.log(n);
});

Promise.resolve(30).then(
  null,
  (e: unknown): PromiseLike<number> => {
    console.log("missed null rejected callback");
    return Promise.resolve(0);
  },
).then((n: number): void => {
  console.log("fulfilled null bypass");
  console.log(n);
});

const recoverUndefinedSource: Promise<number> = Promise.reject(new RejectedSentinelErr("recover undefined"));
recoverUndefinedSource.then(
  undefined,
  (e: unknown): PromiseLike<number> => {
    console.log("undefined rejected callback");
    if (e instanceof RejectedSentinelErr) {
      console.log(e.message);
    }
    return Promise.resolve(7);
  },
).then((n: number): void => {
  console.log("undefined recovery result");
  console.log(n);
});

const recoverNullSource: Promise<number> = Promise.reject(new RejectedSentinelErr("recover null"));
recoverNullSource.then(
  null,
  (e: unknown): PromiseLike<number> => {
    console.log("null rejected callback");
    if (e instanceof RejectedSentinelErr) {
      console.log(e.message);
    }
    return Promise.resolve(8);
  },
).then((n: number): void => {
  console.log("null recovery result");
  console.log(n);
});

const returnedRejectSource: Promise<number> = Promise.reject(new RejectedSentinelErr("return like"));
returnedRejectSource.then(
  undefined,
  (e: unknown): PromiseLike<number> => {
    console.log("returned rejected callback");
    const returned: Promise<number> = Promise.reject(new RejectedSentinelErr("returned rejection"));
    return returned;
  },
).catch((e: unknown): number => {
  console.log("returned rejection observed");
  if (e instanceof RejectedSentinelErr) {
    console.log(e.message);
  }
  return 9;
}).then((n: number): void => {
  console.log("returned recovery result");
  console.log(n);
});

const throwSource: Promise<number> = Promise.reject(new RejectedSentinelErr("throw source"));
throwSource.then(
  null,
  (e: unknown): PromiseLike<number> => {
    console.log("throw rejected callback");
    throw new RejectedSentinelThrowErr(11);
    return Promise.resolve(0);
  },
).catch((e: unknown): number => {
  console.log("throw rejection observed");
  if (e instanceof RejectedSentinelThrowErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw recovery result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker rejected sentinel");
});

console.log("sync tail");
