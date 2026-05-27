// Phase 1.5-6 prep #9: only `const` with scalar literal initializer is
// hoisted. `let` stays in main() body, so a function body that references
// it sees nothing in scope.stack[0] and surfaces "unknown identifier".
// This documents the limitation: mutable module-level state requires
// either using `const` (immutable) or passing the value as a parameter.

let counter: number = 0;

function bump(): number {
  return counter + 1;
}

console.log(bump());
