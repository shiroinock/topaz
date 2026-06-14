/// <reference lib="es2015.promise" />

type Payload = { values: Array<number>; tail: number };

async function answer(): Promise<number> {
  let side = 0;
  const payload: Payload = {
    values: [
      await Promise.resolve(1),
      (side = side + 2),
      await Promise.resolve(3),
    ],
    tail: 4,
  };
  return payload.tail;
}

answer();
