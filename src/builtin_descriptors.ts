export type BuiltinEffect = string;

export type BuiltinStatus = "public" | "compat" | "synthetic_compat";

export type BuiltinImportDescriptor = {
  kind: "import";
  specifier: string;
  importedName: string;
  semanticName: string;
  status: BuiltinStatus;
  effects: BuiltinEffect[];
  explanation: string;
};

export type BuiltinSyntheticGlobalDescriptor = {
  kind: "synthetic_global";
  globalName: string;
  semanticName: string;
  status: BuiltinStatus;
  effects: BuiltinEffect[];
  explanation: string;
};

export type BuiltinDescriptor = BuiltinImportDescriptor | BuiltinSyntheticGlobalDescriptor;

export function builtinEffectVocabulary(): Array<BuiltinEffect> {
  return [
    "fs.read",
    "fs.metadata",
    "fs.write",
    "process.argv",
    "process.exit",
    "io.stdout",
    "io.stderr",
    "process.spawn",
  ];
}

export function builtinEffectDescription(effect: BuiltinEffect): string {
  switch (effect) {
    case "fs.read":
      return "allows reading filesystem contents";
    case "fs.metadata":
      return "allows reading filesystem metadata";
    case "fs.write":
      return "allows creating or writing filesystem entries";
    case "process.argv":
      return "allows reading process argument values";
    case "process.exit":
      return "allows terminating the current process";
    case "io.stdout":
      return "allows writing to standard output";
    case "io.stderr":
      return "allows writing to standard error";
    case "process.spawn":
      return "allows spawning child processes";
  }
  return "unknown capability";
}

function nodePathExplanation(): string {
  return "compatibility path helper backed by the Topaz path builtin";
}

function stdPathExplanation(): string {
  return "public path helper backed by the Topaz path builtin";
}

function stdFsExplanation(): string {
  return "public filesystem helper backed by the Topaz filesystem builtin";
}

function stdProcessExplanation(): string {
  return "public process/stdio helper backed by the Topaz process builtin";
}

export function builtinImportDescriptors(): Array<BuiltinImportDescriptor> {
  return [
    {
      kind: "import",
      specifier: "node:fs",
      importedName: "readFileSync",
      semanticName: "fs.readFileSync",
      status: "compat",
      effects: ["fs.read"],
      explanation: "compatibility filesystem read helper",
    },
    {
      kind: "import",
      specifier: "node:fs",
      importedName: "existsSync",
      semanticName: "fs.existsSync",
      status: "compat",
      effects: ["fs.metadata"],
      explanation: "compatibility filesystem metadata helper",
    },
    {
      kind: "import",
      specifier: "node:fs",
      importedName: "writeFileSync",
      semanticName: "fs.writeFileSync",
      status: "compat",
      effects: ["fs.write"],
      explanation: "compatibility filesystem write helper",
    },
    {
      kind: "import",
      specifier: "node:fs",
      importedName: "mkdirSync",
      semanticName: "fs.mkdirSync",
      status: "compat",
      effects: ["fs.write"],
      explanation: "compatibility filesystem directory creation helper",
    },
    {
      kind: "import",
      specifier: "std/fs",
      importedName: "readFileSync",
      semanticName: "fs.readFileSync",
      status: "public",
      effects: ["fs.read"],
      explanation: stdFsExplanation(),
    },
    {
      kind: "import",
      specifier: "std/fs",
      importedName: "existsSync",
      semanticName: "fs.existsSync",
      status: "public",
      effects: ["fs.metadata"],
      explanation: stdFsExplanation(),
    },
    {
      kind: "import",
      specifier: "std/fs",
      importedName: "writeFileSync",
      semanticName: "fs.writeFileSync",
      status: "public",
      effects: ["fs.write"],
      explanation: stdFsExplanation(),
    },
    {
      kind: "import",
      specifier: "std/fs",
      importedName: "mkdirSync",
      semanticName: "fs.mkdirSync",
      status: "public",
      effects: ["fs.write"],
      explanation: stdFsExplanation(),
    },
    {
      kind: "import",
      specifier: "std/process",
      importedName: "argv",
      semanticName: "process.argv",
      status: "public",
      effects: ["process.argv"],
      explanation: stdProcessExplanation(),
    },
    {
      kind: "import",
      specifier: "std/process",
      importedName: "exit",
      semanticName: "process.exit",
      status: "public",
      effects: ["process.exit"],
      explanation: stdProcessExplanation(),
    },
    {
      kind: "import",
      specifier: "std/process",
      importedName: "writeStdout",
      semanticName: "process.stdout.write",
      status: "public",
      effects: ["io.stdout"],
      explanation: stdProcessExplanation(),
    },
    {
      kind: "import",
      specifier: "std/process",
      importedName: "writeStderr",
      semanticName: "process.stderr.write",
      status: "public",
      effects: ["io.stderr"],
      explanation: stdProcessExplanation(),
    },
    {
      kind: "import",
      specifier: "std/process",
      importedName: "writeError",
      semanticName: "console.error",
      status: "public",
      effects: ["io.stderr"],
      explanation: stdProcessExplanation(),
    },
    {
      kind: "import",
      specifier: "node:path",
      importedName: "dirname",
      semanticName: "path.dirname",
      status: "compat",
      effects: [],
      explanation: nodePathExplanation(),
    },
    {
      kind: "import",
      specifier: "node:path",
      importedName: "resolve",
      semanticName: "path.resolve",
      status: "compat",
      effects: [],
      explanation: nodePathExplanation(),
    },
    {
      kind: "import",
      specifier: "node:path",
      importedName: "basename",
      semanticName: "path.basename",
      status: "compat",
      effects: [],
      explanation: nodePathExplanation(),
    },
    {
      kind: "import",
      specifier: "node:path",
      importedName: "extname",
      semanticName: "path.extname",
      status: "compat",
      effects: [],
      explanation: nodePathExplanation(),
    },
    {
      kind: "import",
      specifier: "node:path",
      importedName: "join",
      semanticName: "path.join",
      status: "compat",
      effects: [],
      explanation: nodePathExplanation(),
    },
    {
      kind: "import",
      specifier: "std/path",
      importedName: "dirname",
      semanticName: "path.dirname",
      status: "public",
      effects: [],
      explanation: stdPathExplanation(),
    },
    {
      kind: "import",
      specifier: "std/path",
      importedName: "resolve",
      semanticName: "path.resolve",
      status: "public",
      effects: [],
      explanation: stdPathExplanation(),
    },
    {
      kind: "import",
      specifier: "std/path",
      importedName: "basename",
      semanticName: "path.basename",
      status: "public",
      effects: [],
      explanation: stdPathExplanation(),
    },
    {
      kind: "import",
      specifier: "std/path",
      importedName: "extname",
      semanticName: "path.extname",
      status: "public",
      effects: [],
      explanation: stdPathExplanation(),
    },
    {
      kind: "import",
      specifier: "std/path",
      importedName: "join",
      semanticName: "path.join",
      status: "public",
      effects: [],
      explanation: stdPathExplanation(),
    },
    {
      kind: "import",
      specifier: "node:child_process",
      importedName: "execFileSync",
      semanticName: "process.execFileSync",
      status: "compat",
      effects: ["process.spawn"],
      explanation: "compatibility child process spawn helper",
    },
    {
      kind: "import",
      specifier: "node:url",
      importedName: "fileURLToPath",
      semanticName: "url.fileURLToPath",
      status: "compat",
      effects: [],
      explanation: "compatibility file URL conversion helper",
    },
  ];
}

export function builtinSyntheticGlobalDescriptors(): Array<BuiltinSyntheticGlobalDescriptor> {
  return [
    {
      kind: "synthetic_global",
      globalName: "process.argv",
      semanticName: "process.argv",
      status: "synthetic_compat",
      effects: ["process.argv"],
      explanation: "compatibility process argument vector",
    },
    {
      kind: "synthetic_global",
      globalName: "process.exit",
      semanticName: "process.exit",
      status: "synthetic_compat",
      effects: ["process.exit"],
      explanation: "compatibility process exit helper",
    },
    {
      kind: "synthetic_global",
      globalName: "process.stdout.write",
      semanticName: "process.stdout.write",
      status: "synthetic_compat",
      effects: ["io.stdout"],
      explanation: "compatibility stdout write helper",
    },
    {
      kind: "synthetic_global",
      globalName: "process.stderr.write",
      semanticName: "process.stderr.write",
      status: "synthetic_compat",
      effects: ["io.stderr"],
      explanation: "compatibility stderr write helper",
    },
    {
      kind: "synthetic_global",
      globalName: "console.log",
      semanticName: "console.log",
      status: "synthetic_compat",
      effects: ["io.stdout"],
      explanation: "compatibility console stdout helper",
    },
    {
      kind: "synthetic_global",
      globalName: "console.error",
      semanticName: "console.error",
      status: "synthetic_compat",
      effects: ["io.stderr"],
      explanation: "compatibility console stderr helper",
    },
    {
      kind: "synthetic_global",
      globalName: "import.meta.url",
      semanticName: "import.meta.url",
      status: "synthetic_compat",
      effects: [],
      explanation: "compatibility current module URL value",
    },
  ];
}

export function builtinDescriptors(): Array<BuiltinDescriptor> {
  return [...builtinImportDescriptors(), ...builtinSyntheticGlobalDescriptors()];
}

export function isBuiltinImportSpecifier(spec: string): boolean {
  for (const desc of builtinImportDescriptors()) {
    if (desc.specifier === spec) return true;
  }
  return false;
}

export function isAllowedBuiltinImport(spec: string, name: string): boolean {
  for (const desc of builtinImportDescriptors()) {
    if (desc.specifier === spec && desc.importedName === name) return true;
  }
  return false;
}

export function allowedBuiltinImportNames(spec: string): string {
  let out = "";
  for (const desc of builtinImportDescriptors()) {
    if (desc.specifier !== spec) continue;
    if (out !== "") out += ", ";
    out += desc.importedName;
  }
  return out;
}
