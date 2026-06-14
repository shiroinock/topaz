/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  ({
    nested: {
      left: await Promise.resolve(1),
      right: await Promise.resolve(2),
    },
  });
}

answer();
