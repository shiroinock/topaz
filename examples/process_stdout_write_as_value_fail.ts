// Phase 1.5-6 prep #26: process.stdout.write returns void; value use rejected.
const ok: boolean = process.stdout.write("hi");
console.log(ok);
