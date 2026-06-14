/// <reference lib="es2018.promise" />

class ChainErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class ThrowErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(1).then((n: number): PromiseLike<number> => {
  console.log("fulfilled callback");
  return Promise.resolve(n + 1);
}).then((n: number): void => {
  console.log("fulfilled result");
  console.log(n);
});

Promise.resolve(2).then((n: number): PromiseLike<number> => {
  console.log("rejected callback");
  const rejected: Promise<number> = Promise.reject(new ChainErr("returned"));
  return rejected;
}).catch((e: unknown): number => {
  console.log("returned rejection");
  if (e instanceof ChainErr) {
    console.log(e.message);
  }
  return 7;
}).then((n: number): void => {
  console.log("recovered result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

Promise.resolve(4).then((n: number): PromiseLike<number> => {
  console.log("throw callback");
  throw new ThrowErr(n + 5);
  return Promise.resolve(n);
}).catch((e: unknown): number => {
  console.log("throw rejection");
  if (e instanceof ThrowErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw result");
  console.log(n);
});

console.log("sync tail");
