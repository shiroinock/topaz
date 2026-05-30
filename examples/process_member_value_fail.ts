// Phase 1.5-6 prep #26: only process.argv reads as a value; process.pid etc.
// are unsupported (exit / stdout.write / stderr.write are call-only).
const pid: number = process.pid;
console.log(pid);
