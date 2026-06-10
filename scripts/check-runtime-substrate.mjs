#!/usr/bin/env node
import fs from "node:fs";

const runtimePath = process.argv[2] ?? "runtime/runtime.h";

const CATEGORY = {
  HEADER: "header/types/option wrappers",
  ALLOC: "arena/raw memory/string allocation primitives",
  BIGINT: "bigint limb storage/arithmetic/formatting",
  STRING: "string allocation or host-backed primitives",
  HOST: "fs/process/url/child_process host wrappers",
  NUMBER: "number/parse/libm formatting substrate",
  CONSOLE: "console IO helpers",
  CONTAINER: "container macro families / hash / key equality",
  EXCEPTION: "exception setjmp/longjmp substrate",
};

const inventory = {
  TOPAZ_RUNTIME_H: {
    category: CATEGORY.HEADER,
    reason: "runtime header include guard for the embedded C substrate.",
  },
  topaz_opt_wrap_number: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
  },
  topaz_opt_wrap_boolean: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
  },
  topaz_opt_wrap_string: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined optional wrapper used by Map.get lowering.",
  },
  topaz_opt_absent_number: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
  },
  topaz_opt_absent_boolean: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
  },
  topaz_opt_absent_string: {
    category: CATEGORY.HEADER,
    reason: "scalar T | undefined absent sentinel used by Map.get lowering.",
  },
  topaz_opt_passthrough: {
    category: CATEGORY.HEADER,
    reason: "reference optional identity wrapper for class/interface Map values.",
  },

  topaz_arena_alloc: {
    category: CATEGORY.ALLOC,
    reason: "process-lifetime arena allocation primitive.",
  },
  topaz_arena_calloc: {
    category: CATEGORY.ALLOC,
    reason: "zero-initializing arena allocation primitive for generated storage.",
  },
  topaz_arena_realloc: {
    category: CATEGORY.ALLOC,
    reason: "arena grow primitive used by strings and containers.",
  },

  topaz_bigint_alloc: {
    category: CATEGORY.BIGINT,
    reason: "raw limb storage allocation for bigint values.",
  },
  topaz_bigint_zero: {
    category: CATEGORY.BIGINT,
    reason: "canonical bigint zero constructor.",
  },
  topaz_bigint_normalize: {
    category: CATEGORY.BIGINT,
    reason: "canonicalizes raw bigint limb/sign representation.",
  },
  topaz_bigint_copy_abs: {
    category: CATEGORY.BIGINT,
    reason: "limb-copy helper for bigint arithmetic.",
  },
  topaz_bigint_cmp_abs: {
    category: CATEGORY.BIGINT,
    reason: "absolute limb comparator for bigint arithmetic.",
  },
  topaz_bigint_mul_small_in_place: {
    category: CATEGORY.BIGINT,
    reason: "decimal parser limb multiply step.",
  },
  topaz_bigint_add_small_in_place: {
    category: CATEGORY.BIGINT,
    reason: "decimal parser limb add step.",
  },
  topaz_bigint_from_decimal_cstr: {
    category: CATEGORY.BIGINT,
    reason: "bootstrap parser literal bridge from C strings to bigint limbs.",
  },
  topaz_bigint_neg: {
    category: CATEGORY.BIGINT,
    reason: "sign manipulation over raw bigint representation.",
  },
  topaz_bigint_add_abs: {
    category: CATEGORY.BIGINT,
    reason: "absolute limb addition core.",
  },
  topaz_bigint_sub_abs: {
    category: CATEGORY.BIGINT,
    reason: "absolute limb subtraction core.",
  },
  topaz_bigint_add: {
    category: CATEGORY.BIGINT,
    reason: "public bigint addition lowering target.",
  },
  topaz_bigint_sub: {
    category: CATEGORY.BIGINT,
    reason: "public bigint subtraction lowering target.",
  },
  topaz_bigint_mul: {
    category: CATEGORY.BIGINT,
    reason: "public bigint multiplication lowering target.",
  },
  topaz_bigint_cmp: {
    category: CATEGORY.BIGINT,
    reason: "public bigint ordering lowering target.",
  },
  topaz_bigint_eq: {
    category: CATEGORY.BIGINT,
    reason: "public bigint equality lowering target.",
  },
  topaz_bigint_to_string: {
    category: CATEGORY.BIGINT,
    reason: "bigint formatting over raw limb storage.",
  },

  topaz_string_concat: {
    category: CATEGORY.STRING,
    reason: "string allocation primitive for compiler-owned concatenation.",
  },
  topaz_string_eq: {
    category: CATEGORY.CONTAINER,
    reason: "string key equality substrate for Map/Set monomorphs.",
  },
  TOPAZ_STRING_REPEAT_MAX_BYTES: {
    category: CATEGORY.STRING,
    reason: "string repeat allocation guard.",
  },
  topaz_string_repeat: {
    category: CATEGORY.STRING,
    reason: "string allocation primitive until string-buffer intrinsics exist.",
  },
  topaz_string_char_code_at: {
    category: CATEGORY.STRING,
    reason: "byte-oriented string primitive used by runtime prelude helpers.",
  },
  topaz_slice_normalize: {
    category: CATEGORY.STRING,
    reason: "slice index normalization shared by string allocation primitive.",
  },
  topaz_string_slice: {
    category: CATEGORY.STRING,
    reason: "string allocation primitive delegated to by migrated prelude helpers.",
  },
  topaz_string_from_char_code: {
    category: CATEGORY.STRING,
    reason: "string allocation primitive for String.fromCharCode lowering.",
  },

  topaz_fmod: {
    category: CATEGORY.NUMBER,
    reason: "libm-backed modulo substrate.",
  },
  topaz_parse_int: {
    category: CATEGORY.NUMBER,
    reason: "host strtod/strtol-adjacent parse substrate for parseInt.",
  },
  topaz_parse_float: {
    category: CATEGORY.NUMBER,
    reason: "host strtod substrate for parseFloat.",
  },
  topaz_number_to_string: {
    category: CATEGORY.NUMBER,
    reason: "snprintf/strtod round-trip formatting substrate.",
  },

  topaz_stdout_write: {
    category: CATEGORY.CONSOLE,
    reason: "process.stdout.write substrate.",
  },
  topaz_stderr_write: {
    category: CATEGORY.CONSOLE,
    reason: "process.stderr.write substrate.",
  },

  topaz_fs_read_text_file: {
    category: CATEGORY.HOST,
    reason: "filesystem read host wrapper.",
  },
  topaz_fs_exists: {
    category: CATEGORY.HOST,
    reason: "filesystem access host wrapper.",
  },
  topaz_fs_write_text_file: {
    category: CATEGORY.HOST,
    reason: "filesystem write host wrapper.",
  },
  topaz_fs_mkdir_p: {
    category: CATEGORY.HOST,
    reason: "filesystem mkdir host wrapper.",
  },
  topaz_process_cwd: {
    category: CATEGORY.HOST,
    reason: "getcwd fallback for path.resolve prelude helper.",
  },
  topaz_runtime_init_argv: {
    category: CATEGORY.HOST,
    reason: "native argv capture for generated main.",
  },
  topaz_process_argv: {
    category: CATEGORY.HOST,
    reason: "process.argv host wrapper.",
  },
  topaz_process_exit: {
    category: CATEGORY.HOST,
    reason: "process.exit host wrapper.",
  },
  topaz_child_exec_inherit: {
    category: CATEGORY.HOST,
    reason: "fork/exec/waitpid child_process host wrapper.",
  },
  topaz_url_file_url_to_path: {
    category: CATEGORY.HOST,
    reason: "file URL path conversion host-backed helper.",
  },
  topaz_runtime_module_url: {
    category: CATEGORY.HOST,
    reason: "runtime module URL host wrapper for the release compiler.",
  },

  TOPAZ_ARRAY_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized array macro family.",
  },
  TOPAZ_HASH_SLOT_EMPTY: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
  },
  TOPAZ_HASH_SLOT_OCCUPIED: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
  },
  TOPAZ_HASH_SLOT_TOMBSTONE: {
    category: CATEGORY.CONTAINER,
    reason: "open-addressing hash state marker.",
  },
  topaz_hash_number: {
    category: CATEGORY.CONTAINER,
    reason: "number key hashing with SameValueZero normalization.",
  },
  topaz_key_eq_number: {
    category: CATEGORY.CONTAINER,
    reason: "number key equality with SameValueZero semantics.",
  },
  topaz_hash_boolean: {
    category: CATEGORY.CONTAINER,
    reason: "boolean key hashing.",
  },
  topaz_hash_pointer: {
    category: CATEGORY.CONTAINER,
    reason: "reference identity hashing for class/interface keys.",
  },
  topaz_key_eq_boolean: {
    category: CATEGORY.CONTAINER,
    reason: "boolean key equality.",
  },
  topaz_hash_string: {
    category: CATEGORY.CONTAINER,
    reason: "byte string key hashing.",
  },
  TOPAZ_MAP_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized Map macro family.",
  },
  TOPAZ_SET_DEFINE: {
    category: CATEGORY.CONTAINER,
    reason: "monomorphized Set macro family.",
  },

  topaz_try_push: {
    category: CATEGORY.EXCEPTION,
    reason: "setjmp frame stack push.",
  },
  topaz_try_pop: {
    category: CATEGORY.EXCEPTION,
    reason: "setjmp frame stack pop.",
  },
  topaz_throw: {
    category: CATEGORY.EXCEPTION,
    reason: "longjmp exception dispatch substrate.",
  },
};

function extractSymbols(source) {
  const discovered = new Map();
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("##")) continue;

    const macro = line.match(/^\s*#\s*define\s+((?:TOPAZ_[A-Za-z0-9_]+|topaz_opt_[A-Za-z0-9_]+))\b/);
    if (macro) {
      discovered.set(macro[1], { kind: "macro", line: i + 1 });
      continue;
    }

    const helper = line.match(
      /^\s*static(?:\s+inline)?\s+[A-Za-z_][A-Za-z0-9_\s]*\s+\*?\s*(topaz_[A-Za-z0-9_]+)\s*\(/,
    );
    if (helper) {
      discovered.set(helper[1], { kind: "helper", line: i + 1 });
    }
  }
  return discovered;
}

function validateInventory() {
  const invalid = [];
  for (const [name, entry] of Object.entries(inventory)) {
    if (!entry.category || !entry.reason) {
      invalid.push(name);
    }
  }
  return invalid;
}

let source;
try {
  source = fs.readFileSync(runtimePath, "utf8");
} catch (err) {
  console.error(`runtime substrate inventory: could not read ${runtimePath}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const invalidInventory = validateInventory();
if (invalidInventory.length > 0) {
  console.error("runtime substrate inventory has entries without category/reason:");
  for (const name of invalidInventory.sort()) {
    console.error(`  ${name}`);
  }
  process.exit(1);
}

const discovered = extractSymbols(source);
const unclassified = [...discovered.entries()]
  .filter(([name]) => inventory[name] === undefined)
  .sort(([a], [b]) => a.localeCompare(b));
const stale = Object.keys(inventory)
  .filter((name) => !discovered.has(name) && !inventory[name].exempt)
  .sort();

if (unclassified.length > 0 || stale.length > 0) {
  if (unclassified.length > 0) {
    console.error("runtime substrate inventory: unclassified discovered symbols:");
    for (const [name, meta] of unclassified) {
      console.error(`  ${name} (${meta.kind}, ${runtimePath}:${meta.line})`);
    }
  }
  if (stale.length > 0) {
    console.error("runtime substrate inventory: stale classified symbols:");
    for (const name of stale) {
      console.error(`  ${name}`);
    }
  }
  process.exit(1);
}

const categoryCounts = new Map();
for (const name of discovered.keys()) {
  const category = inventory[name].category;
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
}

console.log(`runtime substrate inventory ok: ${discovered.size} symbols classified`);
for (const [category, count] of [...categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${category}: ${count}`);
}
