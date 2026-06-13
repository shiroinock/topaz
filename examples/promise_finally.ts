/// <reference lib="es2018.promise" />

class SourceErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class OverrideErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(1).finally((): void => {
  console.log("cleanup fulfilled");
}).then((n: number): void => {
  console.log("fulfilled value");
  console.log(n);
});

const rejected: Promise<number> = Promise.reject(new SourceErr("source"));
rejected.finally((): void => {
  console.log("cleanup rejected");
}).catch((e: unknown): number => {
  console.log("rejected preserved");
  if (e instanceof SourceErr) {
    console.log(e.message);
  }
  return 2;
}).then((n: number): void => {
  console.log("rejected recovery");
  console.log(n);
});

Promise.resolve().finally((): void => {
  console.log("cleanup void");
}).then((): void => {
  console.log("void then");
});

const fifo: Promise<number> = Promise.resolve(5);
fifo.then((n: number): number => {
  console.log("fifo then");
  return n;
});
fifo.finally((): void => {
  console.log("fifo finally");
}).then((n: number): void => {
  console.log("fifo final then");
  console.log(n);
});

Promise.resolve(9).finally((): void => {
  console.log("cleanup throw");
  throw new OverrideErr(77);
}).catch((e: unknown): number => {
  console.log("override catch");
  if (e instanceof OverrideErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("override then");
  console.log(n);
});

console.log("sync tail");
