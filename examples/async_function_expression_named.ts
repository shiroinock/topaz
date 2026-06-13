/// <reference lib="es2015.promise" />

const captured = 1;

const noAwait: () => Promise<number> = async function namedNoAwait(): Promise<number> {
  console.log("named no-await body");
  return 6;
};

const withAwait: (base: number) => Promise<number> = async function namedWithAwait(base: number): Promise<number> {
  console.log("before named await");
  const a = await Promise.resolve(20);
  console.log("after named await");
  return a + base + captured;
};

function invoke(fn: () => Promise<number>): Promise<number> {
  return fn();
}

invoke(async function namedCallback(): Promise<number> {
  return 7;
}).then((value: number): void => {
  console.log("then named callback");
  console.log(value);
});

noAwait().then((value: number): void => {
  console.log("then named no-await");
  console.log(value);
});

withAwait(21).then((value: number): void => {
  console.log("then named await");
  console.log(value);
});

console.log("sync tail");
