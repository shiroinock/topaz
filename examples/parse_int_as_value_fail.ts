// parseInt is recognized only at the call site — there is no `parseInt`
// binding, so using it as a value falls to "unknown identifier".
const f = parseInt;
console.log(f("10", 16));
