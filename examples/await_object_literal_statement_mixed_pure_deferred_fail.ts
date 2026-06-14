/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  const stable = 2;
  ({
    left: await Promise.resolve(1),
    middle: stable,
    right: await Promise.resolve(3),
  });
}

answer();
