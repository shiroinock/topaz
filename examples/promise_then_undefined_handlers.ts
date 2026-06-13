/// <reference lib="es2015.promise" />

class UndefinedThenErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

Promise.resolve(1).then(
  (n: number): number => {
    console.log("fulfilled explicit undefined");
    return n + 1;
  },
  undefined,
).then((n: number): void => {
  console.log("fulfilled result");
  console.log(n);
});

const rejected: Promise<number> = Promise.reject(new UndefinedThenErr("recover"));
rejected.then(
  undefined,
  (e: unknown): number => {
    console.log("rejected recovery");
    if (e instanceof UndefinedThenErr) {
      console.log(e.message);
    }
    return 7;
  },
).then((n: number): void => {
  console.log("rejected result");
  console.log(n);
});

Promise.resolve(3).then(
  undefined,
  (e: unknown): number => {
    console.log("missed recovery");
    return 0;
  },
).then((n: number): void => {
  console.log("fulfilled bypass");
  console.log(n);
});

const promiseRecovery: Promise<number> = Promise.reject(new UndefinedThenErr("promise recover"));
promiseRecovery.then(
  undefined,
  (e: unknown): Promise<number> => {
    console.log("promise recovery");
    if (e instanceof UndefinedThenErr) {
      console.log(e.message);
    }
    return Promise.resolve(11);
  },
).then((n: number): void => {
  console.log("promise recovery result");
  console.log(n);
});

Promise.resolve().then(
  (): void => {
    console.log("void fulfilled explicit undefined");
  },
  undefined,
).then((): void => {
  console.log("void fulfilled result");
});

const rejectedVoid: Promise<void> = Promise.reject(new UndefinedThenErr("void recover"));
rejectedVoid.then(
  undefined,
  (e: unknown): void => {
    console.log("void recovery");
    if (e instanceof UndefinedThenErr) {
      console.log(e.message);
    }
  },
).then((): void => {
  console.log("void recovery result");
});

console.log("sync tail");
