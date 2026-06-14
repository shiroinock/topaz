/// <reference lib="es2015.promise" />

class KeyBox {
  key(value: string): string {
    return value;
  }
}

function identity(box: KeyBox): KeyBox {
  return box;
}

const map: Map<string, number> = new Map<string, number>();
map.set("one", 1);

async function fail(source: Map<string, number>): Promise<number> {
  const got: number | undefined = (await Promise.resolve(source)).get(
    identity(await Promise.resolve(new KeyBox())).key(await Promise.resolve("one")),
  );
  if (got !== undefined) {
    return got;
  }
  return 0;
}

fail(map);
