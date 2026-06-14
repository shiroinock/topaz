/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function rejectedStatic(): Promise<string> {
  const value: string = String.fromCharCode(
    await Promise.resolve(5) + mark("mixed", 1) + await Promise.resolve(mark("post", 60)),
  );
  return value;
}

rejectedStatic();
