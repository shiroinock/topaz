class DeferredFunctionBox {
  saved: number = 0;
}

async function answer(): Promise<number> {
  const box = new DeferredFunctionBox();
  box.saved += await Promise.resolve(42);
  return box.saved;
}

answer();
