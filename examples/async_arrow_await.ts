/// <reference lib="es2015.promise" />

const captured = 1;

const answer = async (base: number): Promise<number> => {
  console.log("before arrow await");
  const a = await Promise.resolve(20);
  console.log("between arrow awaits");
  let b = await Promise.resolve(captured + 19);
  console.log("after arrow await");
  return a + b + base + captured;
};

answer(1).then((n: number): void => {
  console.log("then arrow await");
  console.log(n);
});

console.log("sync tail");
