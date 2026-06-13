/// <reference lib="es2015.promise" />

class MixedErr {
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

Promise.resolve(1).then(
  (n: number): number => {
    console.log("fulfilled value branch");
    return n + 1;
  },
  (e: unknown): Promise<number> => {
    console.log("missed rejected promise branch");
    return Promise.resolve(0);
  },
).then((n: number): void => {
  console.log("fulfilled value result");
  console.log(n);
});

const rejectedSource: Promise<number> = Promise.reject(new MixedErr("recover"));
rejectedSource.then(
  (n: number): Promise<number> => {
    console.log("missed fulfilled promise branch");
    return Promise.resolve(n);
  },
  (e: unknown): number => {
    console.log("rejected value branch");
    if (e instanceof MixedErr) {
      console.log(e.message);
    }
    return 7;
  },
).then((n: number): void => {
  console.log("rejected value result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

Promise.resolve(3).then(
  (n: number): Promise<number> => {
    console.log("fulfilled promise reject branch");
    return Promise.reject(new MixedErr("forwarded"));
  },
  (e: unknown): number => {
    console.log("missed rejected value recovery");
    return 0;
  },
).catch((e: unknown): number => {
  console.log("forwarded rejection");
  if (e instanceof MixedErr) {
    console.log(e.message);
  }
  return 11;
}).then((n: number): void => {
  console.log("forwarded recovery");
  console.log(n);
});

Promise.resolve(4).then(
  (n: number): number => {
    console.log("throw value branch");
    throw new ThrowErr(n + 5);
    return n;
  },
  (e: unknown): Promise<number> => {
    console.log("missed throw recovery");
    return Promise.resolve(0);
  },
).catch((e: unknown): number => {
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
