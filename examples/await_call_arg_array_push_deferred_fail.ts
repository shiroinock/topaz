/// <reference lib="es2015.promise" />

async function bad(xs: Array<number>): Promise<void> {
  const r = xs.push(await Promise.resolve(1));
  console.log(r);
}

bad([]);
