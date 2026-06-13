/// <reference lib="es2015.promise" />

const answer = async (): Promise<number> => {
  return await Promise.resolve(42);
};

answer();
