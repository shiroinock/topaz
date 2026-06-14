/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  const middle = 2;
  ({
    left: await Promise.resolve(1),
    middle,
    right: await Promise.resolve(3),
  });
}

answer();
