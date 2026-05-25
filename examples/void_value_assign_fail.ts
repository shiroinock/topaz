// Phase 1.5-6 prep: a void-returning call cannot be stored in a binding.
function shout(s: string): void {
  console.log(s);
}

const x = shout("hi");
console.log(x);
