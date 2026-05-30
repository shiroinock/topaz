// Phase 1.5-6f: startsWith / endsWith are supported, but indexOf stays out
// of scope. Other JS String methods are explicitly rejected.
const s: string = "hello";
console.log(s.indexOf("l"));
