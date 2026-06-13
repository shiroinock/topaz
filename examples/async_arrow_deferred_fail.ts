/// <reference lib="es2015.promise" />

const answer = async (): Promise<number> => {
  if (true) {
    return await Promise.resolve(42);
  }
  return 0;
};

answer();
