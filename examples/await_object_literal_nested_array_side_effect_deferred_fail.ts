/// <reference lib="es2015.promise" />

type Payload = { values: Array<number>; tail: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  const payload: Payload = {
    values: [
      await Promise.resolve(1),
      mark("nested middle", 2),
      await Promise.resolve(3),
    ],
    tail: 4,
  };
  return payload.tail;
}

answer();
