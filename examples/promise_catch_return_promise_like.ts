/// <reference lib="es2018.promise" />

class CatchLikeErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class ThrowLikeErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(40).catch((e: unknown): PromiseLike<number> => {
  console.log("missed catch");
  return Promise.resolve(0);
}).then((n: number): void => {
  console.log("fulfilled bypass");
  console.log(n);
});

const recoverSource: Promise<number> = Promise.reject(new CatchLikeErr("recover like"));
recoverSource.catch((e: unknown): PromiseLike<number> => {
  console.log("catch recover like");
  if (e instanceof CatchLikeErr) {
    console.log(e.message);
  }
  return Promise.resolve(7);
}).then((n: number): void => {
  console.log("recover like result");
  console.log(n);
});

const rejectSource: Promise<number> = Promise.reject(new CatchLikeErr("reject like"));
rejectSource.catch((e: unknown): PromiseLike<number> => {
  console.log("catch reject like");
  const returned: Promise<number> = Promise.reject(new CatchLikeErr("returned like"));
  return returned;
}).catch((e: unknown): number => {
  console.log("catch returned like rejection");
  if (e instanceof CatchLikeErr) {
    console.log(e.message);
  }
  return 9;
}).then((n: number): void => {
  console.log("returned like recovery");
  console.log(n);
});

const nestedSource: Promise<number> = Promise.reject(new CatchLikeErr("nested like"));
nestedSource.catch((e: unknown): PromiseLike<number> => {
  console.log("catch nested like");
  const nested: PromiseLike<number> = Promise.resolve(2).then((n: number): number => {
    console.log("inner nested like");
    return n + 3;
  });
  return nested;
}).then((n: number): void => {
  console.log("nested like result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker like");
});

const throwSource: Promise<number> = Promise.reject(new CatchLikeErr("throw like"));
throwSource.catch((e: unknown): PromiseLike<number> => {
  console.log("catch throw like");
  throw new ThrowLikeErr(12);
  return Promise.resolve(0);
}).catch((e: unknown): number => {
  console.log("throw like rejection");
  if (e instanceof ThrowLikeErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw like result");
  console.log(n);
});

console.log("sync tail");
