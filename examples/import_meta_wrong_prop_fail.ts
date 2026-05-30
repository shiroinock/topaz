// Phase 1.5-6 prep #25: only `import.meta.url` is accepted — other
// `import.meta.X` forms must be rejected.
const r: string = import.meta.resolve;
console.log(r);
