/// <reference lib="es2018.promise" />

class SourceErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class CleanupErr {
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

Promise.resolve(1).finally((): Promise<void> => {
  console.log("cleanup fulfilled preserve");
  return Promise.resolve();
}).then((n: number): void => {
  console.log("fulfilled value");
  console.log(n);
});

const rejectedPreserve: Promise<number> = Promise.reject(new SourceErr("source"));
rejectedPreserve.finally((): Promise<void> => {
  console.log("cleanup rejected preserve");
  return Promise.resolve();
}).catch((e: unknown): number => {
  console.log("preserved rejection");
  if (e instanceof SourceErr) {
    console.log(e.message);
  }
  return 0;
});

Promise.resolve(3).finally((): Promise<void> => {
  console.log("cleanup fulfilled override");
  return Promise.reject(new CleanupErr("fulfilled cleanup"));
}).catch((e: unknown): number => {
  console.log("fulfilled override");
  if (e instanceof CleanupErr) {
    console.log(e.message);
  }
  return 0;
});

const rejectedOverride: Promise<number> = Promise.reject(new SourceErr("original"));
rejectedOverride.finally((): Promise<void> => {
  console.log("cleanup rejected override");
  return Promise.reject(new CleanupErr("rejected cleanup"));
}).catch((e: unknown): number => {
  console.log("rejected override");
  if (e instanceof CleanupErr) {
    console.log(e.message);
  }
  return 0;
});

Promise.resolve(5).finally((): Promise<void> => {
  console.log("nested cleanup start");
  return Promise.resolve().then((): void => {
    console.log("nested cleanup inner");
  });
}).then((n: number): void => {
  console.log("nested result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker");
});

Promise.resolve(6).finally((): Promise<void> => {
  console.log("cleanup throw before promise");
  throw new ThrowErr(66);
  return Promise.resolve();
}).catch((e: unknown): number => {
  console.log("throw override");
  if (e instanceof ThrowErr) {
    console.log(e.code);
  }
  return 0;
});

console.log("sync tail");
