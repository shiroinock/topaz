/// <reference lib="es2015.promise" />

class ThenErr {
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
    console.log("fulfilled branch");
    console.log(n + 1);
    return n + 1;
  },
  (e: unknown): number => {
    console.log("missed rejected branch");
    return 0;
  },
).then((n: number): void => {
  console.log("fulfilled then");
  console.log(n);
});

const rejected: Promise<number> = Promise.reject(new ThenErr("recover"));
rejected.then(
  (n: number): number => {
    console.log("missed fulfilled branch");
    return n + 1;
  },
  (e: unknown): number => {
    console.log("rejected branch");
    if (e instanceof ThenErr) {
      console.log(e.message);
    }
    return 7;
  },
).then((n: number): void => {
  console.log("rejected then");
  console.log(n);
});

Promise.resolve().then(
  (): void => {
    console.log("void fulfilled");
  },
  (e: unknown): void => {
    console.log("missed void rejected");
  },
).then((): void => {
  console.log("void then");
});

Promise.resolve(5).then(
  (n: number): number => {
    console.log("throwing fulfilled");
    throw new ThrowErr(n + 4);
    return n;
  },
  (e: unknown): number => 0,
).catch((e: unknown): number => {
  console.log("throw recovery");
  if (e instanceof ThrowErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw then");
  console.log(n);
});

console.log("sync tail");
