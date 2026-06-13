/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function rejectedStatic(): Promise<string> {
  const value: string = String.fromCharCode(mark("pre", 60) + await Promise.resolve(5));
  return value;
}

rejectedStatic();
