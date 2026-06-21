/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  let side = 0;
  ({
    nested: {
      left: await Promise.resolve(1),
      middle: (side = side + 2),
      right: await Promise.resolve(3),
    },
  });
  console.log(side);
}

answer();
