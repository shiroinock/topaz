const value = Promise.resolve(42);
value.then((n: number): Promise<number> => Promise.resolve(n + 1));
