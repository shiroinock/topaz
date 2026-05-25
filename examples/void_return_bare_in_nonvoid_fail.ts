// Phase 1.5-6 prep: bare `return;` from a non-void function must reject.
function get(): number {
  return;
}

console.log(get());
