/// <reference lib="es2015.promise" />

type Payload = { nested: { left: number; middle: number; right: number } };

async function answer(): Promise<number> {
  let side = 0;
  const payload: Payload = {
    nested: {
      left: await Promise.resolve(1),
      middle: (side = side + 2),
      right: await Promise.resolve(3),
    },
  };
  return payload.nested.middle;
}

answer();
