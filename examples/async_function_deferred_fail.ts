interface DeferredFunctionCounter {
  saved: number;
}

class DeferredFunctionBox implements DeferredFunctionCounter {
  saved: number = 0;
}

async function answer(): Promise<number> {
  const counter: DeferredFunctionCounter = new DeferredFunctionBox();
  counter.saved += await Promise.resolve(42);
  return counter.saved;
}

answer();
