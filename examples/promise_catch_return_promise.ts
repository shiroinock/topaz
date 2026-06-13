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

Promise.resolve(40).catch((e: unknown): Promise<number> => {
  console.log("missed catch");
  return Promise.resolve(0);
}).then((n: number): void => {
  console.log("fulfilled bypass");
  console.log(n);
});

const recoverSource: Promise<number> = Promise.reject(new CatchErr("recover"));
recoverSource.catch((e: unknown): Promise<number> => {
  console.log("catch recover");
  if (e instanceof CatchErr) {
    console.log(e.message);
  }
  return Promise.resolve(7);
}).then((n: number): void => {
  console.log("recover result");
  console.log(n);
});

const rejectSource: Promise<number> = Promise.reject(new CatchErr("reject"));
rejectSource.catch((e: unknown): Promise<number> => {
  console.log("catch reject");
  return Promise.reject(new CatchErr("returned"));
}).catch((e: unknown): number => {
  console.log("catch returned rejection");
  if (e instanceof CatchErr) {
    console.log(e.message);
  }
  return 9;
}).then((n: number): void => {
  console.log("returned recovery");
  console.log(n);
});

const nestedSource: Promise<number> = Promise.reject(new CatchErr("nested"));
nestedSource.catch((e: unknown): Promise<number> => {
  console.log("catch nested");
  return Promise.resolve(2).then((n: number): number => {
    console.log("inner nested");
    return n + 3;
  });
}).then((n: number): void => {
  console.log("nested result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

const throwSource: Promise<number> = Promise.reject(new CatchErr("throw"));
throwSource.catch((e: unknown): Promise<number> => {
  console.log("catch throw");
  throw new ThrowErr(12);
  return Promise.resolve(0);
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
