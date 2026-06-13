/// <reference lib="es2018.promise" />

class PassthroughErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

Promise.resolve(10).then(undefined, undefined).then((n: number): void => {
  console.log("then fulfilled");
  console.log(n);
});

const rejectedThen: Promise<number> = Promise.reject(new PassthroughErr("then rejected"));
rejectedThen.then(undefined, undefined).catch((e: unknown): number => {
  console.log("then rejected");
  if (e instanceof PassthroughErr) {
    console.log(e.message);
  }
  return 20;
}).then((n: number): void => {
  console.log("then recovery");
  console.log(n);
});

Promise.resolve(30).catch(undefined).then((n: number): void => {
  console.log("catch fulfilled");
  console.log(n);
});

const rejectedCatch: Promise<number> = Promise.reject(new PassthroughErr("catch rejected"));
rejectedCatch.catch(undefined).catch((e: unknown): number => {
  console.log("catch rejected");
  if (e instanceof PassthroughErr) {
    console.log(e.message);
  }
  return 40;
}).then((n: number): void => {
  console.log("catch recovery");
  console.log(n);
});

Promise.resolve(50).finally(undefined).then((n: number): void => {
  console.log("finally fulfilled");
  console.log(n);
});

const rejectedFinally: Promise<number> = Promise.reject(new PassthroughErr("finally rejected"));
rejectedFinally.finally(undefined).catch((e: unknown): number => {
  console.log("finally rejected");
  if (e instanceof PassthroughErr) {
    console.log(e.message);
  }
  return 60;
}).then((n: number): void => {
  console.log("finally recovery");
  console.log(n);
});

Promise.resolve().then(undefined, undefined).then((): void => {
  console.log("void then fulfilled");
});

console.log("sync tail");
