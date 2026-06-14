/// <reference lib="es2015.promise" />

async function answer(): Promise<void> {
  ({
    values: [
      await Promise.resolve(1),
      await Promise.resolve(2),
    ],
    label: 3,
  });
}

answer();
