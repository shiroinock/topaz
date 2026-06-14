/// <reference lib="es2015.promise" />

async function rejected(source: Map<string, number>, useFirst: boolean): Promise<number> {
  const got: number | undefined = (await Promise.resolve(source)).get(
    useFirst ? await Promise.resolve("one") : await Promise.resolve("two"),
  );
  if (got !== undefined) {
    return got;
  }
  return 0;
}

rejected(new Map<string, number>(), true);
