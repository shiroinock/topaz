const value = Promise.resolve(42);
value.then((n: number): number => n + 1);
