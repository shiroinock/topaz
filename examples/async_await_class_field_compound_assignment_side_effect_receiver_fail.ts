/// <reference lib="es2015.promise" />

class SideEffectReceiverBox {
  saved: number = 0;
}

function makeSideEffectReceiverBox(): SideEffectReceiverBox {
  return new SideEffectReceiverBox();
}

async function answer(): Promise<number> {
  makeSideEffectReceiverBox().saved += await Promise.resolve(1);
  return 0;
}

answer();
