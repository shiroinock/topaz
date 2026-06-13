/// <reference lib="es2015.promise" />

async function rejectedStatic(): Promise<string> {
  const value: string = String.fromCharCode(await Promise.resolve(65));
  return value;
}

rejectedStatic();
