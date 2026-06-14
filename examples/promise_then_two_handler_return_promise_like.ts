/// <reference lib="es2018.promise" />

class TwoHandlerErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

class TwoHandlerThrowErr {
  code: number;

  constructor(code: number) {
    this.code = code;
  }
}

Promise.resolve(1).then(
  (n: number): PromiseLike<number> => {
    console.log("both like fulfilled callback");
    return Promise.resolve(n + 1);
  },
  (e: unknown): PromiseLike<number> => {
    console.log("missed both like rejected callback");
    return Promise.resolve(0);
  },
).then((n: number): void => {
  console.log("both like fulfilled result");
  console.log(n);
});

const bothLikeRejectSource: Promise<number> = Promise.reject(new TwoHandlerErr("both like source"));
bothLikeRejectSource.then(
  (n: number): PromiseLike<number> => {
    console.log("missed both like fulfilled callback");
    return Promise.resolve(n);
  },
  (e: unknown): PromiseLike<number> => {
    console.log("both like rejected callback");
    if (e instanceof TwoHandlerErr) {
      console.log(e.message);
    }
    return Promise.resolve(12);
  },
).then((n: number): void => {
  console.log("both like rejected result");
  console.log(n);
});

const valueThenLikeSource: Promise<number> = Promise.reject(new TwoHandlerErr("value like source"));
valueThenLikeSource.then(
  (n: number): number => {
    console.log("missed value branch");
    return n + 20;
  },
  (e: unknown): PromiseLike<number> => {
    console.log("value like rejected callback");
    if (e instanceof TwoHandlerErr) {
      console.log(e.message);
    }
    return Promise.resolve(23);
  },
).then((n: number): void => {
  console.log("value like result");
  console.log(n);
});

Promise.resolve(30).then(
  (n: number): PromiseLike<number> => {
    console.log("like value fulfilled callback");
    return Promise.resolve(n + 4);
  },
  (e: unknown): number => {
    console.log("missed rejected value branch");
    return 0;
  },
).then((n: number): void => {
  console.log("like value result");
  console.log(n);
});

const promiseThenLikeSource: Promise<number> = Promise.reject(new TwoHandlerErr("promise like source"));
promiseThenLikeSource.then(
  (n: number): Promise<number> => {
    console.log("missed promise branch");
    return Promise.resolve(n);
  },
  (e: unknown): PromiseLike<number> => {
    console.log("promise like rejected callback");
    if (e instanceof TwoHandlerErr) {
      console.log(e.message);
    }
    return Promise.resolve(45);
  },
).then((n: number): void => {
  console.log("promise like result");
  console.log(n);
});

const likeThenPromiseSource: Promise<number> = Promise.reject(new TwoHandlerErr("like promise source"));
likeThenPromiseSource.then(
  (n: number): PromiseLike<number> => {
    console.log("missed like branch");
    return Promise.resolve(n);
  },
  (e: unknown): Promise<number> => {
    console.log("like promise rejected callback");
    if (e instanceof TwoHandlerErr) {
      console.log(e.message);
    }
    return Promise.resolve(56);
  },
).then((n: number): void => {
  console.log("like promise result");
  console.log(n);
});

Promise.resolve(70).then(
  (n: number): PromiseLike<number> => {
    console.log("returned rejected like callback");
    const rejected: Promise<number> = Promise.reject(new TwoHandlerErr("returned rejection"));
    return rejected;
  },
  (e: unknown): number => {
    console.log("missed returned rejected handler");
    return 0;
  },
).catch((e: unknown): number => {
  console.log("returned rejection observed");
  if (e instanceof TwoHandlerErr) {
    console.log(e.message);
  }
  return 79;
}).then((n: number): void => {
  console.log("returned recovery result");
  console.log(n);
});

const throwSource: Promise<number> = Promise.reject(new TwoHandlerErr("throw source"));
throwSource.then(
  (n: number): PromiseLike<number> => {
    console.log("missed throw fulfilled callback");
    return Promise.resolve(n);
  },
  (e: unknown): PromiseLike<number> => {
    console.log("throw rejected callback");
    throw new TwoHandlerThrowErr(88);
    return Promise.resolve(0);
  },
).catch((e: unknown): number => {
  console.log("throw rejection observed");
  if (e instanceof TwoHandlerThrowErr) {
    console.log(e.code);
    return e.code;
  }
  return 0;
}).then((n: number): void => {
  console.log("throw recovery result");
  console.log(n);
});

Promise.resolve().then((): void => {
  console.log("fifo marker two handler");
});

console.log("sync tail");
