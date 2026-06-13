/// <reference lib="es2015.promise" />

class CatchErr {
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

Promise.resolve(1).then((n: number): number => {
  console.log("fifo then");
  return n + 1;
});

const fifoRejected: Promise<number> = Promise.reject(new CatchErr("fifo"));
fifoRejected.catch((e: unknown): number => {
  if (e instanceof CatchErr) {
    console.log("fifo catch");
    console.log(e.message);
  }
  return 2;
});

const rejectedNumber: Promise<number> = Promise.reject(new CatchErr("number"));
const recoveredNumber: Promise<number> = rejectedNumber.catch((e: unknown): number => {
  console.log("catch number");
  if (e instanceof CatchErr) {
    console.log(e.message);
  }
  return 10;
});

recoveredNumber.then((n: number): void => {
  console.log("then number");
  console.log(n);
});

Promise.resolve(20).catch((e: unknown): number => {
  console.log("missed catch");
  return 0;
}).then((n: number): void => {
  console.log("fulfilled bypass");
  console.log(n);
});

const rejectedString: Promise<string> = Promise.reject(new CatchErr("string"));
rejectedString.catch((e: unknown): string => {
  console.log("catch string");
  if (e instanceof CatchErr) {
    return e.message;
  }
  return "other";
}).then((s: string): void => {
  console.log("then string");
  console.log(s);
});

const rejectedVoid: Promise<void> = Promise.reject(new CatchErr("void"));
rejectedVoid.catch((e: unknown): void => {
  if (e instanceof CatchErr) {
    console.log("catch void");
    console.log(e.message);
  }
}).then((): void => {
  console.log("then void");
});

const rejectedForThrow: Promise<number> = Promise.reject(new CatchErr("throw"));
rejectedForThrow.catch((e: unknown): number => {
  console.log("catch throw");
  throw new ThrowErr(7);
  return 0;
}).catch((e: unknown): number => {
  console.log("catch second");
  if (e instanceof ThrowErr) {
    console.log(e.code);
    return 99;
  }
  return 0;
}).then((n: number): void => {
  console.log("then throw recovery");
  console.log(n);
});

console.log("sync tail");
