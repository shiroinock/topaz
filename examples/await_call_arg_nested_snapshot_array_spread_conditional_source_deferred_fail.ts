/// <reference lib="es2015.promise" />

type Box = { a: { b: Array<number> } };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function items(value: number): Array<number> {
  return [value];
}

function readBox(box: Box): number {
  return box.a.b[0];
}

async function bad(flag: boolean): Promise<number> {
  return readBox({
    a: {
      b: [...(flag ? items(await Promise.resolve(mark("inner", 2))) : [0])],
    },
  });
}

bad(true);
