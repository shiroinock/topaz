// Phase 1.5-6 prep: `void` is only allowed in function / method return slots.
function bad(x: void): number {
  return 1;
}

console.log(bad(undefined));
