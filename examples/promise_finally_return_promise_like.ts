/// <reference lib="es2018.promise" />

class SourceLikeErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class CleanupLikeErr {
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

Promise.resolve(1).finally((): PromiseLike<void> => {
  console.log("cleanup like fulfilled preserve");
  return Promise.resolve();
}).then((n: number): void => {
  console.log("fulfilled like value");
  console.log(n);
});

const rejectedPreserveLike: Promise<number> = Promise.reject(new SourceLikeErr("source like"));
rejectedPreserveLike.finally((): PromiseLike<void> => {
  console.log("cleanup like rejected preserve");
  return Promise.resolve();
}).catch((e: unknown): number => {
  console.log("preserved like rejection");
  if (e instanceof SourceLikeErr) {
    console.log(e.message);
  }
  return 0;
});

Promise.resolve(3).finally((): PromiseLike<void> => {
  console.log("cleanup like fulfilled override");
  const cleanup: Promise<void> = Promise.reject(new CleanupLikeErr("fulfilled cleanup like"));
  return cleanup;
}).catch((e: unknown): number => {
  console.log("fulfilled like override");
  if (e instanceof CleanupLikeErr) {
    console.log(e.message);
  }
  return 0;
});

const rejectedOverrideLike: Promise<number> = Promise.reject(new SourceLikeErr("original like"));
rejectedOverrideLike.finally((): PromiseLike<void> => {
  console.log("cleanup like rejected override");
  const cleanup: Promise<void> = Promise.reject(new CleanupLikeErr("rejected cleanup like"));
  return cleanup;
}).catch((e: unknown): number => {
  console.log("rejected like override");
  if (e instanceof CleanupLikeErr) {
    console.log(e.message);
  }
  return 0;
});

Promise.resolve(5).finally((): PromiseLike<void> => {
  console.log("nested like cleanup start");
  const nested: PromiseLike<void> = Promise.resolve().then((): void => {
    console.log("nested like cleanup inner");
  });
  return nested;
}).then((n: number): void => {
  console.log("nested like result");
  console.log(n);
});

Promise.resolve(6).finally((): PromiseLike<number> => {
  console.log("cleanup like number");
  return Promise.resolve(123);
}).then((n: number): void => {
  console.log("number like result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo like marker");
});

Promise.resolve(7).finally((): PromiseLike<void> => {
  console.log("cleanup like throw before promise");
  throw new ThrowLikeErr(77);
  return Promise.resolve();
}).catch((e: unknown): number => {
  console.log("throw like override");
  if (e instanceof ThrowLikeErr) {
    console.log(e.code);
  }
  return 0;
});

console.log("sync tail");
