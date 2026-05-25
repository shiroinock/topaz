// Phase 1.5-6 prep: `return <expr>;` from a void function must reject.
function shout(s: string): void {
  console.log(s);
  return s;
}

shout("hi");
