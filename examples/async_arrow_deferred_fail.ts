/// <reference lib="es2015.promise" />

const answer = async (): Promise<number> => {
  const n = await Promise.resolve(42);
  return n;
};

answer();
