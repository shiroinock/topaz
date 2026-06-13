/// <reference lib="es2015.promise" />

let savedExpr = 0;

const f: () => Promise<number> = async function (): Promise<number> {
  savedExpr = 1 + await Promise.resolve(1);
  return savedExpr;
};
