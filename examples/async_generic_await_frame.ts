/// <reference lib="es2015.promise" />

function echo<T>(value: T): T {
  console.log("echo");
  return value;
}

async function id<T>(value: Promise<T>): Promise<T> {
  console.log("id before");
  return await value;
}

async function bind<T>(value: Promise<T>): Promise<T> {
  console.log("bind before");
  const resolved: T = await value;
  console.log("bind after");
  return resolved;
}

async function callArg<T>(value: Promise<T>): Promise<T> {
  console.log("call before");
  return echo<T>(await value);
}

id<number>(Promise.resolve(42)).then((value: number): void => {
  console.log("then number");
  console.log(value);
});

id<string>(Promise.resolve("ready")).then((value: string): void => {
  console.log("then string");
  console.log(value);
});

bind<boolean>(Promise.resolve(true)).then((value: boolean): void => {
  console.log("then boolean");
  console.log(value);
});

callArg<number>(Promise.resolve(7)).then((value: number): void => {
  console.log("then call");
  console.log(value);
});

console.log("sync tail");
