/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  console.log("before a");
  const a = await Promise.resolve(20);
  console.log("between");
  let b = await Promise.resolve(22);
  console.log("after b");
  return a + b;
}

answer().then((n: number): void => {
  console.log("then sum");
  console.log(n);
});

console.log("sync tail");
