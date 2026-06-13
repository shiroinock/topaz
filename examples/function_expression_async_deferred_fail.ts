/// <reference lib="es2015.promise" />

const f: () => Promise<number> = async function (): Promise<number> {
  return await Promise.resolve(1);
  console.log("unreachable");
};
