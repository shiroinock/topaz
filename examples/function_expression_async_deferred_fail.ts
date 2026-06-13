/// <reference lib="es2015.promise" />

const f: () => Promise<number> = async function (): Promise<number> {
  plusOne(await Promise.resolve(1));
  return 2;
};

function plusOne(n: number): number {
  return n + 1;
}
