/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  console.log("before await");
  const n = await Promise.resolve(41);
  console.log("after await");
  return n + 1;
}

answer().then((n: number): void => {
  console.log("then answer");
  console.log(n);
});

console.log("sync tail");
