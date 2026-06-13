/// <reference lib="es2018.promise" />

class SourceErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class CleanupErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

type CleanupTag = "alpha" | "beta";

function chooseTag(flag: boolean): CleanupTag {
  console.log("cleanup literal");
  if (flag) return "alpha";
  return "beta";
}

Promise.resolve(10).finally((): number => {
  console.log("cleanup number");
  return 99;
}).then((n: number): void => {
  console.log("fulfilled value");
  console.log(n);
});

const rejectedString: Promise<number> = Promise.reject(new SourceErr("source string"));
rejectedString.finally((): string => {
  console.log("cleanup string");
  return "ignored";
}).catch((e: unknown): number => {
  console.log("rejected string preserved");
  if (e instanceof SourceErr) {
    console.log(e.message);
  }
  return 2;
}).then((n: number): void => {
  console.log("string recovery");
  console.log(n);
});

const rejectedBool: Promise<number> = Promise.reject(new SourceErr("source bool"));
rejectedBool.finally((): boolean => {
  console.log("cleanup boolean");
  return true;
}).catch((e: unknown): number => {
  console.log("rejected bool preserved");
  if (e instanceof SourceErr) {
    console.log(e.message);
  }
  return 3;
}).then((n: number): void => {
  console.log("bool recovery");
  console.log(n);
});

Promise.resolve(5).finally((): CleanupTag => chooseTag(true)).then((n: number): void => {
  console.log("literal result");
  console.log(n);
});

const fifo: Promise<number> = Promise.resolve(7);
fifo.then((n: number): number => {
  console.log("fifo then");
  return n;
});
fifo.finally((): number => {
  console.log("fifo finally");
  return 123;
}).then((n: number): void => {
  console.log("fifo final then");
  console.log(n);
});

Promise.resolve(1).finally((): number => {
  console.log("cleanup throw");
  throw new CleanupErr(88);
  return 0;
}).catch((e: unknown): number => {
  console.log("override catch");
  if (e instanceof CleanupErr) {
    console.log(e.code);
  }
  return 0;
});

console.log("sync tail");
