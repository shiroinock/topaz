/// <reference lib="es2015.promise" />

async function rejectedStatic(): Promise<string> {
  const value: string = String.fromCharCode(60 + await Promise.resolve(5));
  return value;
}

rejectedStatic();
