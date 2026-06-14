/// <reference lib="es2015.promise" />

type Payload = { nested: { left: number; middle: number; right: number } };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  const payload: Payload = {
    nested: {
      left: await Promise.resolve(1),
      middle: mark("nested middle", 2),
      right: await Promise.resolve(3),
    },
  };
  return payload.nested.middle;
}

answer();
