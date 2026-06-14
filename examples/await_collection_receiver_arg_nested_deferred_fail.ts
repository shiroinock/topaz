/// <reference lib="es2015.promise" />

function wrap(value: string): string {
  return value;
}

const map: Map<string, number> = new Map<string, number>();
map.set("one", 1);

async function fail(source: Map<string, number>): Promise<number> {
  const got: number | undefined = (await Promise.resolve(source)).get(wrap(wrap(await Promise.resolve("one"))));
  if (got !== undefined) {
    return got;
  }
  return 0;
}

fail(map);
