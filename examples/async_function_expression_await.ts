/// <reference lib="es2015.promise" />

const captured = 1;

const answer: (base: number) => Promise<number> = async function (base: number): Promise<number> {
  console.log("before function await");
  const a = await Promise.resolve(20);
  console.log("between function awaits");
  let b = await Promise.resolve(captured + 19);
  console.log("after function await");
  return a + b + base + captured;
};

answer(1).then((n: number): void => {
  console.log("then function await");
  console.log(n);
});

console.log("sync tail");
