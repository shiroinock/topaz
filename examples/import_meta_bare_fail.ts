// Phase 1.5-6 prep #25: bare `import.meta` (without `.url`) must be
// rejected — only `import.meta.url` is wired up.
const m = import.meta;
console.log(m);
