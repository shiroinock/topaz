// Phase 1.5-6 prep: `void` cannot be a container element type.
function bad(): Array<void> {
  return [];
}

console.log(bad().length);
