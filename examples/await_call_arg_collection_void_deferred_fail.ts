/// <reference lib="es2015.promise" />

async function rejectedValuePosition(m: Map<string, number>): Promise<void> {
  const chained = m.set(await Promise.resolve("one"), 1);
  console.log(chained);
}

rejectedValuePosition(new Map<string, number>());
