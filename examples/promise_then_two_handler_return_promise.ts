/// <reference lib="es2015.promise" />

class ThenAssimErr {
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
  (n: number): Promise<number> => {
    console.log("fulfilled branch");
    return Promise.resolve(n + 1);
  },
  (e: unknown): Promise<number> => {
    console.log("missed rejected branch");
    return Promise.resolve(0);
  },
).then((n: number): void => {
  console.log("fulfilled result");
  console.log(n);
});

const rejectedSource: Promise<number> = Promise.reject(new ThenAssimErr("recover"));
rejectedSource.then(
  (n: number): Promise<number> => {
    console.log("missed fulfilled branch");
    return Promise.resolve(n);
  },
  (e: unknown): Promise<number> => {
    console.log("rejected branch");
    if (e instanceof ThenAssimErr) {
      console.log(e.message);
    }
    return Promise.resolve(7);
  },
).then((n: number): void => {
  console.log("rejected result");
  console.log(n);
});

Promise.resolve(3).then(
  (n: number): Promise<number> => {
    console.log("fulfilled reject branch");
    return Promise.reject(new ThenAssimErr("fulfilled returned"));
  },
  (e: unknown): Promise<number> => {
    console.log("missed rejected recovery");
    return Promise.resolve(0);
  },
).catch((e: unknown): number => {
  console.log("fulfilled returned rejection");
  if (e instanceof ThenAssimErr) {
    console.log(e.message);
  }
  return 11;
}).then((n: number): void => {
  console.log("fulfilled recovery");
  console.log(n);
});

const returnedRejectSource: Promise<number> = Promise.reject(new ThenAssimErr("reject"));
returnedRejectSource.then(
  (n: number): Promise<number> => {
    console.log("missed fulfilled recovery");
    return Promise.resolve(n);
  },
  (e: unknown): Promise<number> => {
    console.log("rejected reject branch");
    return Promise.reject(new ThenAssimErr("rejected returned"));
  },
).catch((e: unknown): number => {
  console.log("rejected returned rejection");
  if (e instanceof ThenAssimErr) {
    console.log(e.message);
  }
  return 13;
}).then((n: number): void => {
  console.log("rejected recovery");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

Promise.resolve(4).then(
  (n: number): Promise<number> => {
    console.log("throw branch");
    throw new ThrowErr(n + 5);
    return Promise.resolve(n);
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
