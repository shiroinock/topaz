#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build > /dev/null
pnpm run check:runtime-header > /dev/null
echo "PASS [runtime_header_fresh]"
pnpm run check:runtime-prelude > /dev/null
echo "PASS [runtime_prelude_fresh]"
builtin_effect_out=$(pnpm run check:builtin-effects)
if [[ "${builtin_effect_out}" != *"builtin effect inventory ok"* ]]; then
  echo "FAIL [builtin_effect_inventory]: missing ok summary" >&2
  printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.metadata fs.write process.argv process.exit io.stdout io.stderr process.spawn; do
  if [[ "${builtin_effect_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [builtin_effect_inventory]: missing effect vocabulary entry ${effect}" >&2
    printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
for status in public compat synthetic_compat; do
  if [[ "${builtin_effect_out}" != *"  ${status}: "* ]]; then
    echo "FAIL [builtin_effect_inventory]: missing status summary ${status}" >&2
    printf '%s\n' "${builtin_effect_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
mkdir -p build
tmp_builtin_effects="build/builtin_effect_unknown_probe.mjs"
printf '%s\n' \
  'export function builtinDescriptors() {' \
  '  return [' \
  '    {' \
  '      kind: "import",' \
  '      specifier: "std/fs",' \
  '      importedName: "readFileSync",' \
  '      semanticName: "fs.readFileSync",' \
  '      status: "public",' \
  '      effects: ["fs.delete"],' \
  '      explanation: "probe descriptor"' \
  '    }' \
  '  ];' \
  '}' > "${tmp_builtin_effects}"
if builtin_effect_err=$(node scripts/check-builtin-effects.mjs "${tmp_builtin_effects}" 2>&1); then
  echo "FAIL [builtin_effect_inventory]: expected unknown effect failure" >&2
  exit 1
fi
if [[ "${builtin_effect_err}" != *"unknown effect 'fs.delete'"* ]]; then
  echo "FAIL [builtin_effect_inventory]: missing unknown effect diagnostic" >&2
  printf '%s\n' "${builtin_effect_err}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [builtin_effect_inventory]"
effect_provenance_out=$(pnpm run check:effect-provenance)
if [[ "${effect_provenance_out}" != *"effect provenance ok:"* ]]; then
  echo "FAIL [effect_provenance]: missing ok summary" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${effect_provenance_out}" != *" | ${effect} | "* ]]; then
    echo "FAIL [effect_provenance]: missing effect ${effect}" >&2
    printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${effect_provenance_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [effect_provenance]: missing console.warn detail" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_provenance_out}" == *"path.join"* ]]; then
  echo "FAIL [effect_provenance]: pure std/path leaked into provenance" >&2
  printf '%s\n' "${effect_provenance_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [effect_provenance]"
effect_report_out=$(pnpm run check:effect-report)
if [[ "${effect_report_out}" != *"effect report ok:"* ]]; then
  echo "FAIL [effect_report]: missing ok summary" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" != *"topaz builtin effect report: build/effect_report/main.ts"* ]]; then
  echo "FAIL [effect_report]: missing stable heading" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${effect_report_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [effect_report]: missing effect summary ${effect}" >&2
    printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${effect_report_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [effect_report]: missing console.warn detail" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" != *$'effects: none\nrequirements: none'* ]]; then
  echo "FAIL [effect_report]: missing no-effect report" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${effect_report_out}" == *"path.join"* || "${effect_report_out}" == *"std/path"* || "${effect_report_out}" == *"join(...)"* ]]; then
  echo "FAIL [effect_report]: pure std/path leaked into report" >&2
  printf '%s\n' "${effect_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [effect_report]"
manifest_requirements_out=$(pnpm run check:manifest-requirements)
if [[ "${manifest_requirements_out}" != *"manifest requirements ok:"* ]]; then
  echo "FAIL [manifest_requirements]: missing ok summary" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${manifest_requirements_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [manifest_requirements]: missing effect group ${effect}" >&2
    printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${manifest_requirements_out}" != *"build/manifest_requirements/main.ts:6:14"* ]]; then
  echo "FAIL [manifest_requirements]: missing file:line:col occurrence" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_requirements_out}" != *"empty requirements: none"* ]]; then
  echo "FAIL [manifest_requirements]: missing empty requirement summary" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_requirements_out}" == *"path.join"* || "${manifest_requirements_out}" == *"std/path"* || "${manifest_requirements_out}" == *"join(...)"* ]]; then
  echo "FAIL [manifest_requirements]: pure std/path leaked into requirements" >&2
  printf '%s\n' "${manifest_requirements_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [manifest_requirements]"
manifest_policy_out=$(pnpm run check:manifest-policy)
if [[ "${manifest_policy_out}" != *"manifest policy ok:"* ]]; then
  echo "FAIL [manifest_policy]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "filename: strict-ts.json" "valid capabilities: fs.read, io.stdout" "empty capabilities: none" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate diagnostic: duplicate capability 'fs.read'"; do
  if [[ "${manifest_policy_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy]"
manifest_policy_parse_out=$(pnpm run check:manifest-policy-parse)
if [[ "${manifest_policy_parse_out}" != *"manifest policy parse ok:"* ]]; then
  echo "FAIL [manifest_policy_parse]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_parse_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "valid capabilities: fs.read, io.stdout" "empty object: none" "extra keys ignored: fs.read" "invalid syntax diagnostic: expected string" "non-array diagnostic: 'capabilities' must be an array" "non-string diagnostic: 'capabilities' entries must be strings" "duplicate key diagnostic: duplicate top-level key 'capabilities'" "invalid number diagnostic: invalid number" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate diagnostic: duplicate capability 'fs.read'"; do
  if [[ "${manifest_policy_parse_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy_parse]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_parse_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy_parse]"
manifest_policy_load_out=$(pnpm run check:manifest-policy-load)
if [[ "${manifest_policy_load_out}" != *"manifest policy load ok:"* ]]; then
  echo "FAIL [manifest_policy_load]: missing ok summary" >&2
  printf '%s\n' "${manifest_policy_load_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "missing file: found=false" "valid capability file: fs.read, io.stdout" "non-object diagnostic: top-level value must be an object" "unknown diagnostic: unknown capability 'fs.delete'" "duplicate key diagnostic: duplicate top-level key 'capabilities'"; do
  if [[ "${manifest_policy_load_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_policy_load]: missing ${required}" >&2
    printf '%s\n' "${manifest_policy_load_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_policy_load]"
manifest_check_out=$(pnpm run check:manifest-check)
if [[ "${manifest_check_out}" != *"manifest check ok:"* ]]; then
  echo "FAIL [manifest_check]: missing ok summary" >&2
  printf '%s\n' "${manifest_check_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "pure missing policy: ok" "effectful missing policy: failed" "full policy: ok" "partial policy: missing fs.write" "invalid diagnostic: top-level value must be an object" "unknown diagnostic: unknown capability 'fs.delete'"; do
  if [[ "${manifest_check_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_check]: missing ${required}" >&2
    printf '%s\n' "${manifest_check_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_check]"
manifest_generate_out=$(pnpm run check:manifest-generate)
if [[ "${manifest_generate_out}" != *"manifest generate ok:"* ]]; then
  echo "FAIL [manifest_generate]: missing ok summary" >&2
  printf '%s\n' "${manifest_generate_out}" | sed 's/^/    /' >&2
  exit 1
fi
for required in "pure capabilities: none" "effectful capabilities: fs.read, fs.write, io.stdout" "duplicate fs.read occurrences: 3" "round-trip capabilities: fs.read, fs.write, io.stdout"; do
  if [[ "${manifest_generate_out}" != *"${required}"* ]]; then
    echo "FAIL [manifest_generate]: missing ${required}" >&2
    printf '%s\n' "${manifest_generate_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [manifest_generate]"
doctor_report_out=$(pnpm run check:doctor-report)
if [[ "${doctor_report_out}" != *"doctor report ok:"* ]]; then
  echo "FAIL [doctor_report]: missing ok summary" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *"topaz doctor report: build/doctor_report/main.ts"* ]]; then
  echo "FAIL [doctor_report]: missing stable heading" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
for effect in fs.read fs.write process.argv io.stdout io.stderr; do
  if [[ "${doctor_report_out}" != *"  ${effect}: "* ]]; then
    echo "FAIL [doctor_report]: missing capability summary ${effect}" >&2
    printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
if [[ "${doctor_report_out}" != *"build/doctor_report/main.ts:6:14"* ]]; then
  echo "FAIL [doctor_report]: missing file:line:col occurrence" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *"console.warn(...)"* ]]; then
  echo "FAIL [doctor_report]: missing console.warn detail" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" != *$'capabilities: none\nrequirements: none'* ]]; then
  echo "FAIL [doctor_report]: missing no-effect report" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_report_out}" == *"path.join"* || "${doctor_report_out}" == *"std/path"* || "${doctor_report_out}" == *"join(...)"* ]]; then
  echo "FAIL [doctor_report]: pure std/path leaked into report" >&2
  printf '%s\n' "${doctor_report_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [doctor_report]"
doctor_selfhost_out=$(pnpm run check:doctor-selfhost)
if [[ "${doctor_selfhost_out}" != *"doctor selfhost ok:"* ]]; then
  echo "FAIL [doctor_selfhost]: missing ok summary" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_selfhost_out}" != *"src/doctor_report.ts"* ]]; then
  echo "FAIL [doctor_selfhost]: missing doctor report target" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${doctor_selfhost_out}" != *"literal union source/status template blocker cleared"* ]]; then
  echo "FAIL [doctor_selfhost]: missing former literal-union blocker text" >&2
  printf '%s\n' "${doctor_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [doctor_selfhost]"
mkdir -p build/capability_explain_selfhost
if ! capability_explain_selfhost_err=$(node dist/cli.js src/capability_explain.ts --emit-c-only -o build/capability_explain_selfhost/capability_explain 2>&1); then
  echo "FAIL [capability_explain_selfhost]: expected capability explain C emission" >&2
  printf '%s\n' "${capability_explain_selfhost_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ ! -f build/capability_explain_selfhost/capability_explain.c ]]; then
  echo "FAIL [capability_explain_selfhost]: missing emitted C" >&2
  exit 1
fi
cc -O2 -Iruntime -Wall -Wextra -c build/capability_explain_selfhost/capability_explain.c -o build/capability_explain_selfhost/capability_explain.o
echo "PASS [capability_explain_selfhost] literal-union descriptor status template blocker cleared"
manifest_selfhost_out=$(pnpm run check:manifest-selfhost)
if [[ "${manifest_selfhost_out}" != *"manifest selfhost ok:"* ]]; then
  echo "FAIL [manifest_selfhost]: missing ok summary" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_requirements.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest requirements target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_policy.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest policy target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_check.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest check target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"src/manifest_generate.ts"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest generate target" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"Map<string, Array"* ]]; then
  echo "FAIL [manifest_selfhost]: missing former Map<string, Array blocker text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"capability policy array validator + text parser + file loader"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest policy selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"strict-ts policy coverage evaluator"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest check selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${manifest_selfhost_out}" != *"strict-ts manifest suggestion renderer"* ]]; then
  echo "FAIL [manifest_selfhost]: missing manifest generate selfhost text" >&2
  printf '%s\n' "${manifest_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [manifest_selfhost]"
effect_selfhost_out=$(pnpm run check:effect-selfhost)
if [[ "${effect_selfhost_out}" != *"effect selfhost ok:"* ]]; then
  echo "FAIL [effect_selfhost]: missing ok summary" >&2
  printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
for target in src/effect_provenance.ts src/effect_report.ts; do
  if [[ "${effect_selfhost_out}" != *"${target}"* ]]; then
    echo "FAIL [effect_selfhost]: missing target ${target}" >&2
    printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
for former_blocker in "unknown template escape" "default import from stdlib specifier 'node:path'"; do
  if [[ "${effect_selfhost_out}" != *"${former_blocker}"* ]]; then
    echo "FAIL [effect_selfhost]: missing former blocker ${former_blocker}" >&2
    printf '%s\n' "${effect_selfhost_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [effect_selfhost]"
cli_selfhost_out=$(pnpm run check:cli-selfhost)
if [[ "${cli_selfhost_out}" != *"cli selfhost ok:"* ]]; then
  echo "FAIL [cli_selfhost]: missing ok summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"src/cli.ts"* ]]; then
  echo "FAIL [cli_selfhost]: missing CLI target" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"src/cli.ts -> build/cli_selfhost/topaz"* ]]; then
  echo "FAIL [cli_selfhost]: missing generated CLI summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${cli_selfhost_out}" != *"examples/fib.ts -> build/cli_selfhost/fib"* ]]; then
  echo "FAIL [cli_selfhost]: missing generated fib summary" >&2
  printf '%s\n' "${cli_selfhost_out}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [cli_selfhost]"
release_workflow=".github/workflows/release-artifact.yml"
if ! grep -Fq 'release_flags=(--draft)' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing draft release flag baseline" >&2
  exit 1
fi
if ! grep -Fq 'if [[ "${tag}" == *"-rc."* ]]; then' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing RC tag prerelease branch" >&2
  exit 1
fi
if ! grep -Fq 'release_flags+=(--prerelease)' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: missing RC prerelease flag" >&2
  exit 1
fi
if ! grep -Fq '"${release_flags[@]}"' "${release_workflow}"; then
  echo "FAIL [release_workflow_prerelease]: release creation does not use computed flags" >&2
  exit 1
fi
echo "PASS [release_workflow_prerelease]"
release_script="scripts/build-release.sh"
release_skill=".agents/skills/topaz-release/SKILL.md"
release_notes_v0_1_3="docs/releases/v0.1.3.md"
release_notes_v0_2_0="docs/releases/v0.2.0.md"
release_readiness_v0_1_3="docs/releases/v0.1.3-readiness.md"
release_state_handoff_v0_1_3="docs/releases/v0.1.3-release-state-handoff.md"
pre_v0_2_checkpoint="docs/releases/pre-v0.2.0-checkpoint.md"
release_readiness_v0_2_0="docs/releases/v0.2.0-rc-readiness.md"
runtime_migration_doc="docs/runtime-ts-migration.md"
phase_5_0_adr="docs/adr/0467-post-v0-2-typescript-compatibility-priorities.md"
phase_5_82_adr="docs/adr/0549-promise-like-bridge-boundary.md"
for fragment in \
  'pnpm run check:runtime-header' \
  'pnpm run check:runtime-prelude' \
  'pnpm run check:runtime-substrate -- --details'; do
  if ! grep -Fq "${fragment}" "${release_script}"; then
    echo "FAIL [release_build_runtime_gate_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_build_runtime_gate_contract]"
for fragment in \
  'RELEASE [smoke ${artifact} guidance]' \
  'release_guidance_smoke' \
  'topaz doctor <entry.ts>' \
  'topaz check <entry.ts>' \
  'topaz manifest init <entry.ts>' \
  'topaz explain capability <name>' \
  'topaz explain std/<module>' \
  'doctor "${guidance_entry}"' \
  'check "${guidance_entry}"' \
  'manifest init "${guidance_entry}"' \
  'release_guidance_manifest_init' \
  'policy_before=$(cat "${guidance_policy}")' \
  'manifest init changed existing policy fixture' \
  'release_guidance_write_smoke' \
  'manifest init --write "${guidance_write_entry}"' \
  'release_guidance_manifest_init_write' \
  'wrote ${expected_guidance_write_policy}' \
  'guidance_write_expected=$' \
  '"fs.write"' \
  '"io.stdout"' \
  'release_guidance_manifest_init_write_check' \
  'missing capabilities: none' \
  '"capabilities"' \
  '"fs.read"' \
  '"fs.write"' \
  '"io.stdout"' \
  'explain capability fs.read' \
  'explain std/fs' \
  'status: ok'; do
  if ! grep -Fq "${fragment}" "${release_script}"; then
    echo "FAIL [release_guidance_smoke_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if grep -Fq 'writeFileSync("build/release_guidance_write_smoke/out.txt", text, "utf8");' "${release_script}"; then
  echo "FAIL [release_guidance_smoke_contract]: stale three-argument writeFileSync fixture" >&2
  exit 1
fi
echo "PASS [release_guidance_smoke_contract]"
runtime_prelude_release_section=$(awk '
  /RELEASE \[smoke \$\{artifact\} runtime prelude\]/ { in_section = 1 }
  in_section { print }
  /RELEASE \[sha256\]/ { if (in_section) { exit } }
' "${release_script}")
if [[ -z "${runtime_prelude_release_section}" ]]; then
  echo "FAIL [release_runtime_prelude_smoke_contract]: missing runtime prelude smoke section" >&2
  exit 1
fi
for fragment in \
  'RELEASE [smoke ${artifact} runtime prelude]' \
  'runtime_prelude_smoke.ts' \
  '( cd "${tmp_dir}"' \
  './${artifact}" runtime_prelude_smoke.ts -o runtime_prelude_smoke' \
  '.slice(' \
  '.charCodeAt(' \
  '.startsWith(' \
  'release_runtime_prelude_expected=$' \
  'prelude+check\n112\ntrue' \
  'FAIL [release_runtime_prelude binary-only]'; do
  if [[ "${runtime_prelude_release_section}" != *"${fragment}"* ]]; then
    echo "FAIL [release_runtime_prelude_smoke_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if [[ "${runtime_prelude_release_section}" == *"examples/fib.ts"* ]]; then
  echo "FAIL [release_runtime_prelude_smoke_contract]: runtime prelude smoke must use its own temp fixture" >&2
  exit 1
fi
echo "PASS [release_runtime_prelude_smoke_contract]"
for fragment in \
  'readFileSync("guidance-smoke/input.txt", "utf8")' \
  'writeFileSync("guidance-smoke/out.txt", text);' \
  '`doctor` reports `fs.read`, `fs.write`, and `io.stdout`'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [release_guidance_skill_fixture]: missing ${fragment}" >&2
    exit 1
  fi
done
if grep -Fq 'writeFileSync("guidance-smoke/out.txt", text, "utf8");' "${release_skill}"; then
  echo "FAIL [release_guidance_skill_fixture]: stale three-argument writeFileSync fixture" >&2
  exit 1
fi
echo "PASS [release_guidance_skill_fixture]"
for fragment in \
  '## Tag Head Guard' \
  'git rev-parse HEAD' \
  'git rev-parse "${tag}^{commit}"' \
  'STALE TAG:' \
  'existing tag points at the intended release `HEAD`' \
  'Do not push stale tags' \
  'force-move or delete remote tags' \
  'Choose a new RC tag' \
  'explicit approval before changing local-only' \
  'tags. If the tag is absent, create the annotated tag at the current `HEAD`'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [release_tag_head_guard_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_tag_head_guard_contract]"
release_skill_runtime_prelude_section=$(awk '
  /For `v0\.1\.3` release candidates, also run a downloaded-artifact/ { in_section = 1 }
  in_section { print }
  /For `v0\.2\.0` release candidates/ { if (in_section) { exit } }
' "${release_skill}")
if [[ -z "${release_skill_runtime_prelude_section}" ]]; then
  echo "FAIL [release_skill_runtime_prelude_handoff_contract]: missing v0.1.3 runtime-prelude handoff section" >&2
  exit 1
fi
for fragment in \
  'v0.1.3' \
  'runtime-prelude' \
  'runtime-prelude-smoke.ts' \
  './topaz-darwin-arm64 runtime-prelude-smoke.ts -o ./runtime-prelude-smoke' \
  '.slice(' \
  '.charCodeAt(' \
  '.startsWith(' \
  'prelude+check' \
  '112' \
  'true'; do
  if [[ "${release_skill_runtime_prelude_section}" != *"${fragment}"* ]]; then
    echo "FAIL [release_skill_runtime_prelude_handoff_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if [[ "${release_skill_runtime_prelude_section}" == *"examples/fib.ts"* ]]; then
  echo "FAIL [release_skill_runtime_prelude_handoff_contract]: v0.1.3 runtime-prelude handoff must not reuse examples/fib.ts" >&2
  exit 1
fi
echo "PASS [release_skill_runtime_prelude_handoff_contract]"
if [[ ! -f "${release_notes_v0_1_3}" ]]; then
  echo "FAIL [release_v0_1_3_notes_contract]: missing ${release_notes_v0_1_3}" >&2
  exit 1
fi
for fragment in \
  '## Changes' \
  '## Assets' \
  '## Verification' \
  '## Notes' \
  'runtime TS prelude checkpoint' \
  'topaz-darwin-arm64' \
  'SHA256SUMS' \
  'shasum -a 256 -c SHA256SUMS' \
  'examples/fib.ts' \
  'runtime-prelude-smoke.ts' \
  './topaz-darwin-arm64 runtime-prelude-smoke.ts -o ./runtime-prelude-smoke' \
  'prelude+check' \
  '112' \
  'true'; do
  if ! grep -Fq "${fragment}" "${release_notes_v0_1_3}"; then
    echo "FAIL [release_v0_1_3_notes_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if ! grep -Eq 'does not expand the public language surface or runtime semantics|public language surface / runtime semantics (are )?not expanded' "${release_notes_v0_1_3}"; then
  echo "FAIL [release_v0_1_3_notes_contract]: missing no-public-surface note" >&2
  exit 1
fi
if grep -Fq 'Draft native compiler artifact release' "${release_notes_v0_1_3}"; then
  echo "FAIL [release_v0_1_3_notes_contract]: workflow placeholder leaked into notes" >&2
  exit 1
fi
for fragment in \
  'docs/releases/v0.1.3.md' \
  'gh release edit v0.1.3 --notes-file docs/releases/v0.1.3.md'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [release_v0_1_3_notes_contract]: release skill missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_v0_1_3_notes_contract]"
if [[ ! -f "${release_readiness_v0_1_3}" ]]; then
  echo "FAIL [release_v0_1_3_readiness_contract]: missing ${release_readiness_v0_1_3}" >&2
  exit 1
fi
for fragment in \
  'v0.1.3 final readiness' \
  'git status --short --branch' \
  'pnpm run build' \
  'pnpm test' \
  'pnpm run build:release' \
  'tag="v0.1.3"' \
  'git rev-parse HEAD' \
  'git rev-parse "${tag}^{commit}"' \
  'if [[ "${tag_commit}" != "${head_commit}" ]]; then' \
  'Stop. Do not push a stale tag' \
  'force-move a remote tag' \
  'delete a remote tag' \
  'auto-publish' \
  'shasum -a 256 -c SHA256SUMS' \
  'examples/fib.ts' \
  'runtime-prelude-smoke.ts' \
  './topaz-darwin-arm64 runtime-prelude-smoke.ts -o ./runtime-prelude-smoke' \
  'gh release edit v0.1.3 --notes-file docs/releases/v0.1.3.md'; do
  if ! grep -Fq "${fragment}" "${release_readiness_v0_1_3}"; then
    echo "FAIL [release_v0_1_3_readiness_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'docs/releases/v0.1.3-readiness.md' \
  'Before pushing or trusting the final `v0.1.3` tag' \
  'no-push/no-publish boundary'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [release_v0_1_3_readiness_contract]: release skill missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_v0_1_3_readiness_contract]"
if [[ ! -f "${release_state_handoff_v0_1_3}" ]]; then
  echo "FAIL [release_v0_1_3_state_handoff_contract]: missing ${release_state_handoff_v0_1_3}" >&2
  exit 1
fi
for fragment in \
  'v0.1.3 release state handoff' \
  'pnpm run build' \
  'pnpm test' \
  'pnpm run build:release' \
  'git rev-parse HEAD' \
  'git rev-parse "${tag}^{commit}"' \
  'STALE FINAL TAG' \
  'Do not push' \
  'Do not reuse the draft Release' \
  'Do not silently switch to v0.1.4' \
  'explicit human approval' \
  'new patch/RC release vehicle' \
  'defer publication'; do
  if ! grep -Fq "${fragment}" "${release_state_handoff_v0_1_3}"; then
    echo "FAIL [release_v0_1_3_state_handoff_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if ! grep -Fq "${release_state_handoff_v0_1_3}" "${release_skill}"; then
  echo "FAIL [release_v0_1_3_state_handoff_contract]: release skill missing handoff link" >&2
  exit 1
fi
if ! grep -Fq "${release_state_handoff_v0_1_3}" "${pre_v0_2_checkpoint}"; then
  echo "FAIL [release_v0_1_3_state_handoff_contract]: pre-v0.2 checkpoint missing handoff link" >&2
  exit 1
fi
echo "PASS [release_v0_1_3_state_handoff_contract]"
if [[ ! -f "${pre_v0_2_checkpoint}" ]]; then
  echo "FAIL [pre_v0_2_0_checkpoint_contract]: missing ${pre_v0_2_checkpoint}" >&2
  exit 1
fi
for fragment in \
  'pre-v0.2.0 transition checkpoint' \
  'v0.1.3 is the runtime TS prelude checkpoint' \
  'docs/releases/v0.1.3.md' \
  'docs/releases/v0.1.3-readiness.md' \
  'pnpm run build' \
  'pnpm test' \
  'pnpm run build:release' \
  'runtime header freshness' \
  'runtime prelude freshness' \
  'runtime substrate inventory' \
  'runtime prelude intrinsic boundary smoke' \
  'libc-libm-boundary: 3' \
  'host-abi-boundary: 12' \
  'raw-memory-boundary: 3' \
  'exception-boundary: 4' \
  'c-abi-type-boundary: 8' \
  'container-monomorph-boundary: 13' \
  'string-buffer-intrinsic-family: 5' \
  'bigint-limb-intrinsic-family: 8' \
  'pnpm run check:runtime-substrate -- --details' \
  'topaz_string_eq' \
  '__topaz_string_eq' \
  'topaz_hash_boolean' \
  '__topaz_boolean_hash' \
  'topaz_key_eq_boolean' \
  '__topaz_boolean_key_eq' \
  'topaz_key_eq_number' \
  '__topaz_number_key_eq' \
  'topaz_hash_number' \
  'topaz_hash_string' \
  'topaz_hash_pointer' \
  'residual C substrate' \
  'runtime_prelude_intrinsic_boundary_guard' \
  'StringBuffer' \
  'BigIntBuffer' \
  'representative `__topaz_*` intrinsics' \
  'compiler-owned `runtime/prelude.ts` path' \
  'public Topaz source' \
  '56-symbol `runtime/runtime.h`' \
  'topaz doctor <entry.ts>' \
  'topaz manifest init <entry.ts>' \
  'topaz manifest init --write <entry.ts>' \
  'topaz check <entry.ts>' \
  'topaz explain capability <name>' \
  'topaz explain std/<module>' \
  'compile-time policy enforcement' \
  'runtime sandboxing' \
  'schema expansion' \
  'richer policy discovery'; do
  if ! grep -Fq "${fragment}" "${pre_v0_2_checkpoint}"; then
    echo "FAIL [pre_v0_2_0_checkpoint_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if ! grep -Fq "${pre_v0_2_checkpoint}" "${runtime_migration_doc}"; then
  echo "FAIL [pre_v0_2_0_checkpoint_contract]: runtime migration doc missing checkpoint link" >&2
  exit 1
fi
if ! grep -Fq "${pre_v0_2_checkpoint}" "${release_skill}"; then
  echo "FAIL [pre_v0_2_0_checkpoint_contract]: release skill missing checkpoint link" >&2
  exit 1
fi
for fragment in \
  'Phase 4.46' \
  'runtime-prelude intrinsic-boundary handoff'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [pre_v0_2_0_checkpoint_contract]: release skill missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'Phase 4.47 is a release-handoff sync, not runtime migration' \
  'runtime_prelude_intrinsic_boundary_guard' \
  '56-symbol `runtime/runtime.h`' \
  'substrate saturation guard' \
  'compiler-owned `runtime/prelude.ts`' \
  'intrinsic access guard' \
  'does not move helpers' \
  'expose hidden pseudo types and `__topaz_*` intrinsics as public source'; do
  if ! grep -Fq "${fragment}" "${runtime_migration_doc}"; then
    echo "FAIL [pre_v0_2_0_checkpoint_contract]: runtime migration doc missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [pre_v0_2_0_checkpoint_contract]"
if [[ ! -f "${release_readiness_v0_2_0}" ]]; then
  echo "FAIL [release_v0_2_0_rc_readiness_contract]: missing ${release_readiness_v0_2_0}" >&2
  exit 1
fi
for fragment in \
  'v0.2.0 RC readiness' \
  'git status --short --branch' \
  'pnpm run check:runtime-prelude' \
  'pnpm run check:runtime-header' \
  'pnpm run check:runtime-substrate -- --details' \
  'pnpm run build' \
  'pnpm test' \
  'runtime_prelude_intrinsic_boundary_guard' \
  'compiler-owned `runtime/prelude.ts` intrinsic boundary' \
  'distinct from `pnpm run check:runtime-substrate -- --details`' \
  '56-symbol `runtime/runtime.h` substrate saturation' \
  'counts' \
  'pnpm run build:release' \
  'tag="v0.2.0-rc.1"' \
  'git rev-parse HEAD' \
  'git rev-parse "${tag}^{commit}"' \
  'Do not push' \
  'Do not publish' \
  'shasum -a 256 -c SHA256SUMS' \
  './topaz-darwin-arm64 --help' \
  'doctor guidance-smoke/effectful.ts' \
  'manifest init guidance-smoke/effectful.ts' \
  'manifest init --write guidance-smoke/effectful.ts' \
  'check guidance-smoke/effectful.ts' \
  'explain capability fs.read' \
  'explain std/fs' \
  'fs.read' \
  'fs.write' \
  'io.stdout' \
  'missing capabilities: none' \
  'status: ok' \
  'compile-time policy enforcement' \
  'runtime sandboxing' \
  'schema expansion' \
  'richer policy discovery'; do
  if ! grep -Fq "${fragment}" "${release_readiness_v0_2_0}"; then
    echo "FAIL [release_v0_2_0_rc_readiness_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if ! grep -Fq "${release_readiness_v0_2_0}" "${release_skill}"; then
  echo "FAIL [release_v0_2_0_rc_readiness_contract]: release skill missing readiness link" >&2
  exit 1
fi
if ! grep -Fq "${release_readiness_v0_2_0}" "${pre_v0_2_checkpoint}"; then
  echo "FAIL [release_v0_2_0_rc_readiness_contract]: pre-v0.2 checkpoint missing readiness link" >&2
  exit 1
fi
echo "PASS [release_v0_2_0_rc_readiness_contract]"
if [[ ! -f "${release_notes_v0_2_0}" ]]; then
  echo "FAIL [release_v0_2_0_notes_contract]: missing ${release_notes_v0_2_0}" >&2
  exit 1
fi
for fragment in \
  'v0.2.0' \
  '## Changes' \
  '## Assets' \
  '## Verification' \
  '## Notes' \
  'capability' \
  'manifest init' \
  'topaz doctor' \
  'topaz check' \
  'topaz explain capability' \
  'topaz explain std/fs' \
  'post-4.42 runtime boundary' \
  'bridge/residual hash split' \
  'pnpm run check:runtime-substrate -- --details' \
  'pre-v0.2 runtime prelude intrinsic boundary' \
  'hidden pseudo types' \
  '`__topaz_*` intrinsics' \
  'runtime_prelude_intrinsic_boundary_guard' \
  'StringBuffer' \
  'BigIntBuffer' \
  'compiler-owned `runtime/prelude.ts` affordances' \
  'public Topaz' \
  'topaz_string_eq' \
  'topaz_hash_boolean' \
  'topaz_key_eq_boolean' \
  'topaz_key_eq_number' \
  'topaz_hash_number' \
  'topaz_hash_string' \
  'topaz_hash_pointer' \
  'residual C substrate' \
  'topaz-darwin-arm64' \
  'SHA256SUMS' \
  'shasum -a 256 -c SHA256SUMS' \
  './topaz-darwin-arm64 --help' \
  'doctor guidance-smoke/effectful.ts' \
  'manifest init guidance-smoke/effectful.ts' \
  'manifest init --write guidance-smoke/effectful.ts' \
  'check guidance-smoke/effectful.ts' \
  'explain capability fs.read' \
  'explain std/fs' \
  'fs.read' \
  'fs.write' \
  'io.stdout' \
  'missing capabilities: none' \
  'status: ok' \
  'zero-config' \
  'compile-time policy enforcement' \
  'runtime sandboxing' \
  'schema expansion' \
  'richer policy discovery'; do
  if ! grep -Fq "${fragment}" "${release_notes_v0_2_0}"; then
    echo "FAIL [release_v0_2_0_notes_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if grep -Fq 'Draft native compiler artifact release' "${release_notes_v0_2_0}"; then
  echo "FAIL [release_v0_2_0_notes_contract]: workflow placeholder leaked into notes" >&2
  exit 1
fi
for fragment in \
  'docs/releases/v0.2.0.md' \
  'gh release edit v0.2.0 --notes-file docs/releases/v0.2.0.md'; do
  if ! grep -Fq "${fragment}" "${release_skill}"; then
    echo "FAIL [release_v0_2_0_notes_contract]: release skill missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [release_v0_2_0_notes_contract]"
if [[ ! -f "${phase_5_0_adr}" ]]; then
  echo "FAIL [phase_5_0_typescript_compatibility_priority_contract]: missing ${phase_5_0_adr}" >&2
  exit 1
fi
for fragment in \
  'post-v0.2 TypeScript compatibility priorities' \
  'async/await compatibility' \
  'PromiseLike' \
  'controlled static thenable assimilation' \
  'Node-compatible single-thread' \
  'Topaz-owned parallel scheduler' \
  'branded / brand / opaque / nominal / `unique symbol`' \
  'erasable type-only patterns' \
  'enum' \
  'low priority'; do
  if ! grep -Fq "${fragment}" "${phase_5_0_adr}" MEMO.md; then
    echo "FAIL [phase_5_0_typescript_compatibility_priority_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [phase_5_0_typescript_compatibility_priority_contract]"
if [[ ! -f "${phase_5_82_adr}" ]]; then
  echo "FAIL [promise_like_bridge_boundary_contract]: missing ${phase_5_82_adr}" >&2
  exit 1
fi
for fragment in \
  'PromiseLike<T>' \
  'explicit bridge' \
  'Promise.resolve' \
  'controlled static thenable assimilation' \
  'Node-compatible single-thread' \
  'Topaz-owned parallel scheduler' \
  'storage-only'; do
  if ! grep -Fq "${fragment}" "${phase_5_82_adr}" MEMO.md; then
    echo "FAIL [promise_like_bridge_boundary_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [promise_like_bridge_boundary_contract]"
mvp_doc="docs/mvp.md"
for fragment in \
  './topaz-darwin-arm64 --help' \
  'doctor guidance-smoke/effectful.ts' \
  'manifest init guidance-smoke/effectful.ts' \
  'test ! -e guidance-smoke/strict-ts.json' \
  'manifest init --write guidance-smoke/effectful.ts' \
  'test -f guidance-smoke/strict-ts.json' \
  'check guidance-smoke/effectful.ts' \
  'explain capability fs.read' \
  'explain std/fs' \
  'readFileSync("guidance-smoke/input.txt", "utf8")' \
  'writeFileSync("guidance-smoke/out.txt", text);' \
  'fs.read' \
  'fs.write' \
  'io.stdout' \
  'missing capabilities: none' \
  'status: ok'; do
  if ! grep -Fq "${fragment}" "${mvp_doc}"; then
    echo "FAIL [mvp_guidance_handoff_contract]: missing ${fragment}" >&2
    exit 1
  fi
done
if grep -Fq 'writeFileSync("guidance-smoke/out.txt", text, "utf8");' "${mvp_doc}"; then
  echo "FAIL [mvp_guidance_handoff_contract]: stale three-argument writeFileSync fixture" >&2
  exit 1
fi
echo "PASS [mvp_guidance_handoff_contract]"
substrate_out=$(pnpm run check:runtime-substrate)
if [[ "${substrate_out}" != *"migration lanes:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing migration lane summary" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"closed migration lanes:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed migration lane summary" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"needs-string-buffer-intrinsics: closed"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: string buffer migration lane is not closed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"needs-bigint-limb-intrinsics: closed"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: bigint migration lane is not closed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"raw-memory-boundary: 3"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: raw memory substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"libc-libm-boundary: 3"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: libc/libm number substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"host-abi-boundary: 12"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: host ABI substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"container-monomorph-boundary: 13"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: container monomorph substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"exception-boundary: 4"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: exception substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"c-abi-type-boundary: 8"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: C ABI type substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"promise-value-boundary: 3"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: Promise value substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"promise-continuation-boundary: 19"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: Promise continuation substrate lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"bigint-limb-intrinsic-family: 8"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: active bigint intrinsic-family lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_out}" != *"string-buffer-intrinsic-family: 5"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: active string buffer intrinsic-family lane count changed" >&2
  printf '%s\n' "${substrate_out}" | sed 's/^/    /' >&2
  exit 1
fi
substrate_detail_out=$(pnpm run check:runtime-substrate -- --details)
if [[ "${substrate_detail_out}" != *"details:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing detail report" >&2
  printf '%s\n' "${substrate_detail_out}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${substrate_detail_out}" != *"runtime/runtime.h:"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing detail source location" >&2
  printf '%s\n' "${substrate_detail_out}" | sed 's/^/    /' >&2
  exit 1
fi
for fragment in \
  'TOPAZ_RUNTIME_H (macro,' \
  'migration=c-abi-type-boundary' \
  'topaz_arena_alloc (helper,' \
  'migration=raw-memory-boundary' \
  'topaz_string_eq (helper,' \
  'migration=container-monomorph-boundary' \
  'topaz_hash_number (helper,' \
  'uint64_t' \
  'NaN' \
  '-0 normalization' \
  'topaz_hash_string (helper,' \
  'FNV-1a' \
  'unsigned overflow' \
  'hash-order iteration' \
  'topaz_hash_pointer (helper,' \
  'pointer-bit reference identity hashing' \
  'topaz_number_to_string (helper,' \
  'migration=libc-libm-boundary' \
  'topaz_stdout_write (helper,' \
  'migration=host-abi-boundary' \
  'topaz_promise_resolve_copy (helper,' \
  'migration=promise-value-boundary' \
  'topaz_promise_then (helper,' \
  'topaz_promise_then_into (helper,' \
  'topaz_promise_forward_into (helper,' \
  'topaz_promise_like_from_promise (helper,' \
  'topaz_promise_like_to_promise (helper,' \
  'topaz_promise_finally_cleanup_into (helper,' \
  'topaz_promise_finally_cleanup_settlement (helper,' \
  'topaz_promise_catch (helper,' \
  'migration=promise-continuation-boundary' \
  'topaz_try_push (helper,' \
  'migration=exception-boundary' \
  'topaz_string_buffer_new (helper,' \
  'migration=string-buffer-intrinsic-family' \
  'topaz_bigint_buffer_new (helper,' \
  'migration=bigint-limb-intrinsic-family'; do
  if [[ "${substrate_detail_out}" != *"${fragment}"* ]]; then
    echo "FAIL [runtime_substrate_inventory]: missing detail fragment ${fragment}" >&2
    printf '%s\n' "${substrate_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
for fragment in \
  'runtime substrate inventory ok: 78 symbols classified' \
  'bigint-limb-intrinsic-family: 8' \
  'c-abi-type-boundary: 8' \
  'container-monomorph-boundary: 13' \
  'exception-boundary: 4' \
  'host-abi-boundary: 12' \
  'libc-libm-boundary: 3' \
  'promise-continuation-boundary: 19' \
  'promise-value-boundary: 3' \
  'raw-memory-boundary: 3' \
  'string-buffer-intrinsic-family: 5' \
  'needs-bigint-limb-intrinsics: closed' \
  'needs-string-buffer-intrinsics: closed' \
  'topaz_hash_string (helper,' \
  'reason=residual C substrate for FNV-1a string byte hashing with unsigned overflow and the container size_t hash ABI.' \
  'topaz_key_eq_number (helper,' \
  'reason=C bridge for Map/Set macro number key equality delegating SameValueZero equality to the runtime prelude.'; do
  if [[ "${substrate_detail_out}" != *"${fragment}"* ]]; then
    echo "FAIL [runtime_substrate_saturation_guard]: missing saturation fragment ${fragment}" >&2
    printf '%s\n' "${substrate_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
done
echo "PASS [runtime_substrate_saturation_guard]"
codegen_runtime_prelude_guard=$(awk '
  /if \(this\.isCompilingRuntimePrelude\(\)\) \{/ { in_guard = 1 }
  in_guard { print }
  /if \(callee\.name === "readFileSync"\)/ && in_guard { in_guard = 0 }
' src/codegen.ts)
for fragment in \
  '__topaz_string_buffer_new' \
  'emitInternalPreludeStringBufferNew' \
  'checkInternalPreludeStringBufferNewArgs' \
  'return T_STRING_BUFFER' \
  '__topaz_bigint_buffer_new' \
  'emitInternalPreludeBigIntBufferNew' \
  'checkInternalPreludeBigIntBufferNewArgs' \
  'return T_BIGINT_BUFFER'; do
  if [[ "${codegen_runtime_prelude_guard}" != *"${fragment}"* ]]; then
    echo "FAIL [runtime_prelude_intrinsic_boundary_guard]: codegen guard missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'if (refName === "StringBuffer" && sf.isInternalModule && sf.stableModuleId === "runtime_prelude")' \
  'if (refName === "BigIntBuffer" && sf.isInternalModule && sf.stableModuleId === "runtime_prelude")'; do
  if ! grep -Fq "${fragment}" src/codegen.ts; then
    echo "FAIL [runtime_prelude_intrinsic_boundary_guard]: codegen pseudo type guard missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'const buffer: StringBuffer = __topaz_string_buffer_new' \
  '__topaz_string_buffer_to_string(buffer)' \
  'const buffer: BigIntBuffer = __topaz_bigint_buffer_new' \
  '__topaz_bigint_buffer_to_bigint(buffer' \
  '__topaz_bigint_limb(value'; do
  if ! grep -Fq "${fragment}" runtime/prelude.ts; then
    echo "FAIL [runtime_prelude_intrinsic_boundary_guard]: runtime prelude missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'run_fail_case runtime_prelude_string_buffer_hidden_fail' \
  "unknown identifier '__topaz_string_buffer_new'" \
  'run_fail_case runtime_prelude_bigint_buffer_hidden_fail' \
  "unknown identifier '__topaz_bigint_buffer_new'"; do
  if ! grep -Fq "${fragment}" tests/smoke.sh; then
    echo "FAIL [runtime_prelude_intrinsic_boundary_guard]: hidden-helper smoke missing ${fragment}" >&2
    exit 1
  fi
done
for fragment in \
  'string-buffer-intrinsic-family: 5' \
  'bigint-limb-intrinsic-family: 8' \
  'closed legacy `needs-*` lanes' \
  '`needs-string-buffer-intrinsics`' \
  '`needs-bigint-limb-intrinsics`' \
  'compiler-owned `StringBuffer` pseudo type' \
  '`__topaz_string_buffer_*`' \
  'compiler-owned `BigIntBuffer` pseudo type' \
  '`__topaz_bigint_*`'; do
  if ! grep -Fq "${fragment}" docs/runtime-ts-migration.md; then
    echo "FAIL [runtime_prelude_intrinsic_boundary_guard]: migration doc missing ${fragment}" >&2
    exit 1
  fi
done
echo "PASS [runtime_prelude_intrinsic_boundary_guard]"
mkdir -p build
tmp_runtime_substrate="build/runtime_substrate_probe.h"
cp runtime/runtime.h "${tmp_runtime_substrate}"
printf '\nstatic inline topaz_number topaz_unclassified_probe(void) { return 0; }\n' >> "${tmp_runtime_substrate}"
if substrate_err=$(node scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate}" 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected unclassified helper failure" >&2
  exit 1
fi
if [[ "${substrate_err}" != *"topaz_unclassified_probe"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing unclassified helper name" >&2
  printf '%s\n' "${substrate_err}" | sed 's/^/    /' >&2
  exit 1
fi
tmp_runtime_substrate_checker="build/runtime_substrate_closed_lane_probe.mjs"
cp scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate_checker}"
perl -0pi -e 's/migration: MIGRATION\.C_ABI_TYPE,/migration: MIGRATION.STRING_BUFFER_INTRINSICS,/' "${tmp_runtime_substrate_checker}"
if closed_lane_err=$(node "${tmp_runtime_substrate_checker}" runtime/runtime.h 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected closed migration lane failure" >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"needs-string-buffer-intrinsics: TOPAZ_RUNTIME_H"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed lane diagnostic" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"Closed after the completed StringBuffer prelude migration"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing string buffer closed lane guidance" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
tmp_runtime_substrate_checker="build/runtime_substrate_closed_bigint_lane_probe.mjs"
cp scripts/check-runtime-substrate.mjs "${tmp_runtime_substrate_checker}"
perl -0pi -e 's/migration: MIGRATION\.C_ABI_TYPE,/migration: MIGRATION.BIGINT_LIMB_INTRINSICS,/' "${tmp_runtime_substrate_checker}"
if closed_lane_err=$(node "${tmp_runtime_substrate_checker}" runtime/runtime.h 2>&1); then
  echo "FAIL [runtime_substrate_inventory]: expected closed BigInt migration lane failure" >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"needs-bigint-limb-intrinsics: TOPAZ_RUNTIME_H"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing closed BigInt lane diagnostic" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" != *"Closed after the completed BigInt prelude migration"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: missing BigInt closed lane guidance" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
if [[ "${closed_lane_err}" == *"Needs explicit bigint limb storage and arithmetic intrinsics"* ]]; then
  echo "FAIL [runtime_substrate_inventory]: stale BigInt closed lane guidance leaked" >&2
  printf '%s\n' "${closed_lane_err}" | sed 's/^/    /' >&2
  exit 1
fi
echo "PASS [runtime_substrate_inventory]"

# Phase 1.5-6e: topaz_parser を oracle (tsc + convertFromTsc) と JSON 等価比較。
# 全 example が一致しないと codegen 側のテストを走らせる意味が無いのでここで止める。
node dist/parser_check.js examples/*.ts > build/parser_check.log 2>&1 || {
  echo "FAIL [parser_check]: topaz_parser diverged from oracle" >&2
  cat build/parser_check.log >&2
  exit 1
}
echo "PASS [parser_check]"

run_case() {
  local name="$1"
  local expected="$2"
  node dist/cli.js "examples/$name.ts" -o "build/$name" > /dev/null
  local out
  out=$(./build/$name)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$name]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$name]"
}

# Phase 1.5-2: multi-module ケースは root を指定 (loader が依存を解決)。
# label と root path を分けて受ける。
run_module_case() {
  local label="$1"
  local root="$2"
  local expected="$3"
  node dist/cli.js "$root" -o "build/$label" > /dev/null
  local out
  out=$(./build/$label)
  if [[ "$out" != "$expected" ]]; then
    echo "FAIL [$label]:" >&2
    echo "  expected:" >&2
    printf '%s\n' "$expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

# Phase 1.5-2: コンパイル時にエラーで落ちることを期待するケース。
# 標準エラー出力に `expected_substring` が含まれていることをチェック。
run_fail_case() {
  local label="$1"
  local root="$2"
  local expected_substring="$3"
  local err
  if err=$(node dist/cli.js "$root" -o "build/$label" 2>&1); then
    echo "FAIL [$label]: expected compile error, got success" >&2
    echo "  stdout:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

run_tsc_bridge_fail_case() {
  local label="$1"
  local root="$2"
  local expected_substring="$3"
  local err
  if err=$(node --input-type=module -e '
import { parseFile } from "./dist/parser.js";
import { convertFromTsc } from "./dist/convert_from_tsc.js";

const file = process.argv[1];
try {
  convertFromTsc(parseFile(file));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
' "$root" 2>&1); then
    echo "FAIL [$label]: expected tsc-bridge convert error, got success" >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

# Phase 1.5-6 prep: assert the emitted C compiles clean under `-Wall -Wextra`.
# The self-hosting pass criterion requires warning-free emission; this gate
# defends specific constructs (e.g. equality conditions, which used to emit
# `if ((a == b))` and trip -Wparentheses-equality) against regressions.
run_cc_warnfree_case() {
  local name="$1"
  node dist/cli.js "examples/$name.ts" --emit-c-only -o "build/$name" > /dev/null
  local warn
  warn=$(cc -O2 -Iruntime -Wall -Wextra -c "build/$name.c" -o "build/$name.o" 2>&1)
  if [[ -n "$warn" ]]; then
    echo "FAIL [$name cc-warnfree]: emitted C is not warning-free under -Wall -Wextra" >&2
    printf '%s\n' "$warn" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$name cc-warnfree]"
}

assert_no_byte_code_string_substrate() {
  local file="$1"
  local label="$2"
  if grep -Eq "static inline topaz_string topaz_string_from_byte_codes\s*\(" "$file"; then
    echo "FAIL [$label]: stale byte-code string helper definition embedded" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" "$file"; then
    echo "FAIL [$label]: stale byte-code string helper call emitted" >&2
    exit 1
  fi
}

run_cli_fail_case() {
  local label="$1"
  local expected_substring="$2"
  shift 2
  local err
  if err=$(node dist/cli.js "$@" 2>&1); then
    echo "FAIL [$label]: expected CLI error, got success" >&2
    echo "  stdout:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$err" != *"$expected_substring"* ]]; then
    echo "FAIL [$label]: error did not contain expected substring" >&2
    echo "  expected substring: $expected_substring" >&2
    echo "  got:" >&2
    printf '%s\n' "$err" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [$label]"
}

run_cli_smoke() {
  local help
  help=$(node dist/cli.js --help)
  if [[ "$help" != *"usage: topaz <input.ts>"* ]]; then
    echo "FAIL [cli_help]: missing usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"--emit-c-only"* ]]; then
    echo "FAIL [cli_help]: missing --emit-c-only" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz doctor <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing doctor usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz check <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing check usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz manifest init <entry.ts>"* ]]; then
    echo "FAIL [cli_help]: missing manifest init usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"--write"*"strict-ts.json"* ]]; then
    echo "FAIL [cli_help]: missing manifest init --write help" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz explain capability <name>"* ]]; then
    echo "FAIL [cli_help]: missing explain capability usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"topaz explain std/<module>"* ]]; then
    echo "FAIL [cli_help]: missing explain std module usage" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" != *"--parse-only"*"unsupported/reserved"* ]]; then
    echo "FAIL [cli_help]: --parse-only is not described as unsupported/reserved" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$help" == *"dump AST as JSON"* ]]; then
    echo "FAIL [cli_help]: --parse-only still promises a JSON AST dump" >&2
    printf '%s\n' "$help" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_help]"

  local doctor_entry
  doctor_entry="$(pwd)/build/doctor_report/main.ts"
  local doctor_cli_out
  doctor_cli_out=$(node dist/cli.js doctor build/doctor_report/main.ts)
  if [[ "$doctor_cli_out" != *"topaz doctor report: ${doctor_entry}"* ]]; then
    echo "FAIL [cli_doctor_report]: missing public doctor heading" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for effect in fs.read fs.write process.argv io.stdout io.stderr; do
    if [[ "$doctor_cli_out" != *"  ${effect}: "* ]]; then
      echo "FAIL [cli_doctor_report]: missing capability summary ${effect}" >&2
      printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  if [[ "$doctor_cli_out" != *"${doctor_entry}:6:14"* ]]; then
    echo "FAIL [cli_doctor_report]: missing file:line:col occurrence" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$doctor_cli_out" != *"console.warn(...)"* ]]; then
    echo "FAIL [cli_doctor_report]: missing console.warn detail" >&2
    printf '%s\n' "$doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_doctor_report]"

  local pure_doctor_entry
  pure_doctor_entry="$(pwd)/build/doctor_report/pure.ts"
  local pure_doctor_cli_out
  pure_doctor_cli_out=$(node dist/cli.js doctor build/doctor_report/pure.ts)
  if [[ "$pure_doctor_cli_out" != $'topaz doctor report: '"${pure_doctor_entry}"$'\ncapabilities: none\nrequirements: none' ]]; then
    echo "FAIL [cli_doctor_pure]: missing empty doctor report contract" >&2
    printf '%s\n' "$pure_doctor_cli_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_doctor_pure]"

  run_cli_fail_case cli_doctor_emit_c_flag "topaz: doctor does not accept compile option --emit-c-only" doctor --emit-c-only build/doctor_report/main.ts
  run_cli_fail_case cli_doctor_output_flag "topaz: doctor does not accept compile option -o" doctor build/doctor_report/main.ts -o build/doctor_report/out

  rm -rf build/manifest_cli_check
  mkdir -p build/manifest_cli_check/pure_missing
  mkdir -p build/manifest_cli_check/effectful_missing
  mkdir -p build/manifest_cli_check/full_policy
  mkdir -p build/manifest_cli_check/partial_policy
  mkdir -p build/manifest_cli_check/invalid_policy
  mkdir -p build/manifest_cli_check/write_policy
  mkdir -p build/manifest_cli_check/write_policy_before_entry
  printf '%s\n' \
    'import { join } from "std/path";' \
    '' \
    'const out = join("build", "pure.txt");' \
    'out;' \
    > build/manifest_cli_check/pure_missing/pure.ts
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/effectful_missing/main.ts
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/full_policy/main.ts
  printf '%s\n' '{ "capabilities": ["fs.read", "fs.write", "io.stdout"] }' > build/manifest_cli_check/full_policy/strict-ts.json
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/partial_policy/main.ts
  printf '%s\n' '{ "capabilities": ["fs.read", "io.stdout"] }' > build/manifest_cli_check/partial_policy/strict-ts.json
  printf '%s\n' \
    'import { readFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'console.log(data);' \
    > build/manifest_cli_check/invalid_policy/main.ts
  printf '%s\n' '[]' > build/manifest_cli_check/invalid_policy/strict-ts.json
  printf '%s\n' \
    'import { readFileSync, writeFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'writeFileSync("build/manifest_cli_check/out.txt", data);' \
    'console.log(data);' \
    > build/manifest_cli_check/write_policy/main.ts
  printf '%s\n' \
    'import { readFileSync } from "std/fs";' \
    '' \
    'const data = readFileSync("input.txt", "utf8");' \
    'data;' \
    > build/manifest_cli_check/write_policy_before_entry/main.ts

  local cli_check_pure_entry
  cli_check_pure_entry="$(pwd)/build/manifest_cli_check/pure_missing/pure.ts"
  local cli_check_pure_policy
  cli_check_pure_policy="$(pwd)/build/manifest_cli_check/pure_missing/strict-ts.json"
  local cli_check_pure_out
  cli_check_pure_out=$(node dist/cli.js check build/manifest_cli_check/pure_missing/pure.ts)
  for required in "topaz check report: ${cli_check_pure_entry}" "policy: ${cli_check_pure_policy} (missing)" "missing capabilities: none" "status: ok"; do
    if [[ "$cli_check_pure_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_pure_missing_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_pure_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_pure_missing_policy]"

  local cli_check_effectful_out
  if cli_check_effectful_out=$(node dist/cli.js check build/manifest_cli_check/effectful_missing/main.ts 2>&1); then
    echo "FAIL [cli_check_effectful_missing_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_effectful_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for required in "policy: $(pwd)/build/manifest_cli_check/effectful_missing/strict-ts.json (missing)" "  fs.read: " "  fs.write: " "  io.stdout: " "status: failed"; do
    if [[ "$cli_check_effectful_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_effectful_missing_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_effectful_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_effectful_missing_policy]"

  local cli_check_full_out
  cli_check_full_out=$(node dist/cli.js check build/manifest_cli_check/full_policy/main.ts)
  for required in "policy: $(pwd)/build/manifest_cli_check/full_policy/strict-ts.json (found)" "missing capabilities: none" "status: ok"; do
    if [[ "$cli_check_full_out" != *"$required"* ]]; then
      echo "FAIL [cli_check_full_policy]: missing ${required}" >&2
      printf '%s\n' "$cli_check_full_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_check_full_policy]"

  local cli_check_partial_out
  if cli_check_partial_out=$(node dist/cli.js check build/manifest_cli_check/partial_policy/main.ts 2>&1); then
    echo "FAIL [cli_check_partial_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_partial_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$cli_check_partial_out" != *"  fs.write: "* || "$cli_check_partial_out" != *"status: failed"* ]]; then
    echo "FAIL [cli_check_partial_policy]: missing ungranted fs.write failure" >&2
    printf '%s\n' "$cli_check_partial_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_check_partial_policy]"

  local cli_check_invalid_out
  if cli_check_invalid_out=$(node dist/cli.js check build/manifest_cli_check/invalid_policy/main.ts 2>&1); then
    echo "FAIL [cli_check_invalid_policy]: expected failed status" >&2
    printf '%s\n' "$cli_check_invalid_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$cli_check_invalid_out" != *"top-level value must be an object"* || "$cli_check_invalid_out" != *"status: failed"* ]]; then
    echo "FAIL [cli_check_invalid_policy]: missing invalid policy diagnostic" >&2
    printf '%s\n' "$cli_check_invalid_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_check_invalid_policy]"

  run_cli_fail_case cli_check_missing_entry "topaz: check expects <entry.ts>" check
  run_cli_fail_case cli_check_emit_c_flag "topaz: check does not accept compile option --emit-c-only" check build/manifest_cli_check/effectful_missing/main.ts --emit-c-only
  run_cli_fail_case cli_check_output_flag "topaz: check does not accept compile option -o" check build/manifest_cli_check/effectful_missing/main.ts -o build/manifest_cli_check/out
  run_cli_fail_case cli_check_output_long_flag "topaz: check does not accept compile option --output" check build/manifest_cli_check/effectful_missing/main.ts --output build/manifest_cli_check/out
  run_cli_fail_case cli_check_lex_flag "topaz: check does not accept compile option --lex-only" check build/manifest_cli_check/effectful_missing/main.ts --lex-only
  run_cli_fail_case cli_check_parse_flag "topaz: check does not accept compile option --parse-only" check build/manifest_cli_check/effectful_missing/main.ts --parse-only
  run_cli_fail_case cli_check_unknown_option "topaz: check does not accept option --unknown" check build/manifest_cli_check/effectful_missing/main.ts --unknown
  run_cli_fail_case cli_check_extra_positional "topaz: unexpected positional argument other.ts" check build/manifest_cli_check/effectful_missing/main.ts other.ts

  local cli_manifest_effectful_expected
  cli_manifest_effectful_expected=$'{\n  "capabilities": [\n    "fs.read",\n    "fs.write",\n    "io.stdout"\n  ]\n}'
  local cli_manifest_effectful_out
  cli_manifest_effectful_out=$(node dist/cli.js manifest init build/manifest_cli_check/effectful_missing/main.ts)
  if [[ "$cli_manifest_effectful_out" != "$cli_manifest_effectful_expected" ]]; then
    echo "FAIL [cli_manifest_init_effectful]: manifest suggestion mismatch" >&2
    echo "  expected:" >&2
    printf '%s\n' "$cli_manifest_effectful_expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$cli_manifest_effectful_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ -e build/manifest_cli_check/effectful_missing/strict-ts.json ]]; then
    echo "FAIL [cli_manifest_init_effectful]: preview unexpectedly created strict-ts.json" >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_effectful]"

  local cli_manifest_pure_expected
  cli_manifest_pure_expected=$'{\n  "capabilities": []\n}'
  local cli_manifest_pure_out
  cli_manifest_pure_out=$(node dist/cli.js manifest init build/manifest_cli_check/pure_missing/pure.ts)
  if [[ "$cli_manifest_pure_out" != "$cli_manifest_pure_expected" ]]; then
    echo "FAIL [cli_manifest_init_pure]: manifest suggestion mismatch" >&2
    echo "  expected:" >&2
    printf '%s\n' "$cli_manifest_pure_expected" | sed 's/^/    /' >&2
    echo "  got:" >&2
    printf '%s\n' "$cli_manifest_pure_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_pure]"

  local cli_manifest_write_policy
  cli_manifest_write_policy="$(pwd)/build/manifest_cli_check/write_policy/strict-ts.json"
  local cli_manifest_write_out
  cli_manifest_write_out=$(node dist/cli.js manifest init build/manifest_cli_check/write_policy/main.ts --write)
  if [[ "$cli_manifest_write_out" != "wrote ${cli_manifest_write_policy}" ]]; then
    echo "FAIL [cli_manifest_init_write]: missing write success line" >&2
    printf '%s\n' "$cli_manifest_write_out" | sed 's/^/    /' >&2
    exit 1
  fi
  local cli_manifest_written_text
  cli_manifest_written_text=$(cat build/manifest_cli_check/write_policy/strict-ts.json)
  if [[ "$cli_manifest_written_text" != "$cli_manifest_effectful_expected" ]]; then
    echo "FAIL [cli_manifest_init_write]: written manifest mismatch" >&2
    printf '%s\n' "$cli_manifest_written_text" | sed 's/^/    /' >&2
    exit 1
  fi
  local cli_manifest_write_check_out
  cli_manifest_write_check_out=$(node dist/cli.js check build/manifest_cli_check/write_policy/main.ts)
  if [[ "$cli_manifest_write_check_out" != *"policy: ${cli_manifest_write_policy} (found)"* || "$cli_manifest_write_check_out" != *"status: ok"* ]]; then
    echo "FAIL [cli_manifest_init_write]: written policy did not pass check" >&2
    printf '%s\n' "$cli_manifest_write_check_out" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_write]"

  local cli_manifest_write_before_policy
  cli_manifest_write_before_policy="$(pwd)/build/manifest_cli_check/write_policy_before_entry/strict-ts.json"
  local cli_manifest_write_before_expected
  cli_manifest_write_before_expected=$'{\n  "capabilities": [\n    "fs.read"\n  ]\n}'
  local cli_manifest_write_before_out
  cli_manifest_write_before_out=$(node dist/cli.js manifest init --write build/manifest_cli_check/write_policy_before_entry/main.ts)
  if [[ "$cli_manifest_write_before_out" != "wrote ${cli_manifest_write_before_policy}" ]]; then
    echo "FAIL [cli_manifest_init_write_before_entry]: missing write success line" >&2
    printf '%s\n' "$cli_manifest_write_before_out" | sed 's/^/    /' >&2
    exit 1
  fi
  local cli_manifest_write_before_text
  cli_manifest_write_before_text=$(cat build/manifest_cli_check/write_policy_before_entry/strict-ts.json)
  if [[ "$cli_manifest_write_before_text" != "$cli_manifest_write_before_expected" ]]; then
    echo "FAIL [cli_manifest_init_write_before_entry]: written manifest mismatch" >&2
    printf '%s\n' "$cli_manifest_write_before_text" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [cli_manifest_init_write_before_entry]"

  local cli_manifest_existing_before
  cli_manifest_existing_before=$(cat build/manifest_cli_check/full_policy/strict-ts.json)
  run_cli_fail_case cli_manifest_init_write_existing "topaz: manifest init refuses to overwrite" manifest init build/manifest_cli_check/full_policy/main.ts --write
  local cli_manifest_existing_after
  cli_manifest_existing_after=$(cat build/manifest_cli_check/full_policy/strict-ts.json)
  if [[ "$cli_manifest_existing_after" != "$cli_manifest_existing_before" ]]; then
    echo "FAIL [cli_manifest_init_write_existing]: existing policy changed" >&2
    exit 1
  fi
  run_cli_fail_case cli_manifest_init_write_repeated "topaz: manifest init refuses repeated --write" manifest init --write build/manifest_cli_check/effectful_missing/main.ts --write
  run_cli_fail_case cli_doctor_write_flag "topaz: doctor does not accept option --write" doctor build/doctor_report/main.ts --write
  run_cli_fail_case cli_check_write_flag "topaz: check does not accept option --write" check build/manifest_cli_check/full_policy/main.ts --write
  run_cli_fail_case cli_explain_write_flag "topaz: explain does not accept option --write" explain capability fs.read --write
  run_cli_fail_case cli_compile_write_flag "topaz: unknown option --write" --write examples/fib.ts

  run_cli_fail_case cli_manifest_init_missing_subcommand "topaz: manifest expects init <entry.ts>" manifest
  run_cli_fail_case cli_manifest_init_compile_flag "topaz: manifest init does not accept compile option --emit-c-only" manifest init build/manifest_cli_check/effectful_missing/main.ts --emit-c-only

  local explain_fs_read_out
  explain_fs_read_out=$(node dist/cli.js explain capability fs.read)
  if [[ "$explain_fs_read_out" != *"topaz capability: fs.read"* ]]; then
    echo "FAIL [cli_explain_capability_fs_read]: missing heading" >&2
    printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "$explain_fs_read_out" != *"description: allows reading filesystem contents"* ]]; then
    echo "FAIL [cli_explain_capability_fs_read]: missing description" >&2
    printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
    exit 1
  fi
  for required in "std/fs.readFileSync" "node:fs.readFileSync" "semantic: fs.readFileSync" "status: public" "status: compat"; do
    if [[ "$explain_fs_read_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_capability_fs_read]: missing ${required}" >&2
      printf '%s\n' "$explain_fs_read_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_capability_fs_read]"

  local explain_stderr_out
  explain_stderr_out=$(node dist/cli.js explain capability io.stderr)
  for required in "topaz capability: io.stderr" "std/process.writeStderr" "std/process.writeError" "synthetic console.error" "status: synthetic_compat"; do
    if [[ "$explain_stderr_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_capability_stderr]: missing ${required}" >&2
      printf '%s\n' "$explain_stderr_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_capability_stderr]"

  run_cli_fail_case cli_explain_unknown "topaz: unknown capability path.resolve; known capabilities: fs.read, fs.metadata, fs.write, process.argv, process.exit, io.stdout, io.stderr, process.spawn" explain capability path.resolve
  run_cli_fail_case cli_explain_missing "topaz: explain capability expects <name>" explain capability
  run_cli_fail_case cli_explain_emit_c_flag "topaz: explain does not accept compile option --emit-c-only" explain capability fs.read --emit-c-only
  run_cli_fail_case cli_explain_output_flag "topaz: explain does not accept compile option -o" explain capability fs.read -o build/explain/out
  run_cli_fail_case cli_explain_lex_flag "topaz: explain does not accept compile option --lex-only" explain capability fs.read --lex-only
  run_cli_fail_case cli_explain_parse_flag "topaz: explain does not accept compile option --parse-only" explain capability fs.read --parse-only

  local explain_std_fs_out
  explain_std_fs_out=$(node dist/cli.js explain std/fs)
  for required in "topaz builtin module: std/fs" "readFileSync" "semantic: fs.readFileSync" "effects: fs.read" "status: public"; do
    if [[ "$explain_std_fs_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_std_fs]: missing ${required}" >&2
      printf '%s\n' "$explain_std_fs_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_std_fs]"

  local explain_std_path_out
  explain_std_path_out=$(node dist/cli.js explain std/path)
  for required in "topaz builtin module: std/path" "join" "semantic: path.join" "effects: none" "status: public"; do
    if [[ "$explain_std_path_out" != *"$required"* ]]; then
      echo "FAIL [cli_explain_std_path]: missing ${required}" >&2
      printf '%s\n' "$explain_std_path_out" | sed 's/^/    /' >&2
      exit 1
    fi
  done
  echo "PASS [cli_explain_std_path]"

  run_cli_fail_case cli_explain_std_unknown "topaz: unknown builtin module std/unknown; known module specifiers:" explain std/unknown
  run_cli_fail_case cli_explain_std_emit_c_flag "topaz: explain does not accept compile option --emit-c-only" explain std/fs --emit-c-only

  node dist/cli.js examples/fib.ts --emit-c-only -o build/cli_emit_probe > /dev/null
  if [[ ! -f build/cli_emit_probe.c ]]; then
    echo "FAIL [cli_emit_c_only]: expected build/cli_emit_probe.c" >&2
    exit 1
  fi
  echo "PASS [cli_emit_c_only]"

  node dist/cli.js examples/fib.ts --emit-c-only -o build/runtime_prelude_embedded > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_runtime_prelude_init" build/runtime_prelude_embedded.c; then
    echo "FAIL [runtime_prelude_embedded]: missing stable prelude init symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_embedded.c -o build/runtime_prelude_embedded
  local prelude_out
  prelude_out=$(./build/runtime_prelude_embedded)
  if [[ "$prelude_out" != "5702887" ]]; then
    echo "FAIL [runtime_prelude_embedded]:" >&2
    echo "  expected: 5702887" >&2
    echo "  got: $prelude_out" >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_embedded]"

  node dist/cli.js examples/parse_number.ts --emit-c-only -o build/runtime_prelude_parse_int > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_parse_int" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: missing stable parseInt prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_parse_float" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: missing parseFloat C substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_parse_int\s*\(" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: stale parseInt C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_parse_int\s*\(" build/runtime_prelude_parse_int.c; then
    echo "FAIL [runtime_prelude_parse_int]: stale parseInt C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_parse_int.c -o build/runtime_prelude_parse_int
  local parse_int_prelude_out
  parse_int_prelude_out=$(./build/runtime_prelude_parse_int)
  if [[ "$parse_int_prelude_out" != $'255\n16\n5\n10\n3.14\n42\n0\n100\n123\n-123\n15\n1295\n511\n10\n123\n8\n16\n15\n2.5\n100\nNaN\nNaN' ]]; then
    echo "FAIL [runtime_prelude_parse_int]:" >&2
    echo "  expected parse_number output" >&2
    printf '%s\n' "$parse_int_prelude_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_parse_int]"

  node dist/cli.js examples/string_from_char_code.ts --emit-c-only -o build/runtime_prelude_string_from_char_code > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_from_char_code.c runtime_prelude_string_from_char_code
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_from_char_code" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: missing stable fromCharCode prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_char_code\s*\(" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: stale fromCharCode C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_from_char_code\s*\(" build/runtime_prelude_string_from_char_code.c; then
    echo "FAIL [runtime_prelude_string_from_char_code]: stale fromCharCode C helper definition embedded" >&2
    exit 1
  fi
  local from_char_code_body
  from_char_code_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_from_char_code\(topaz_number n\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_from_char_code.c)
  if ! grep -q "topaz_string_buffer_" <<< "$from_char_code_body"; then
    echo "FAIL [runtime_prelude_string_from_char_code]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$from_char_code_body"; then
    echo "FAIL [runtime_prelude_string_from_char_code]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_from_char_code.c -o build/runtime_prelude_string_from_char_code
  local from_char_code_out
  from_char_code_out=$(./build/runtime_prelude_string_from_char_code)
  if [[ "$from_char_code_out" != $'A\na\n0\nz\nB\n1\n72\nHello\n5\nA\nz\nmark=!\n1\n1\n127\nA\nA\nD\nZ\nabcde' ]]; then
    echo "FAIL [runtime_prelude_string_from_char_code]:" >&2
    echo "  expected string_from_char_code output" >&2
    printf '%s\n' "$from_char_code_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_from_char_code]"

  node dist/cli.js examples/string_method.ts --emit-c-only -o build/runtime_prelude_string_char_code_at > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_char_code_at.c runtime_prelude_string_char_code_at
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_char_code_at" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: missing stable String.charCodeAt prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_byte_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale raw string byte-read substrate call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_string_byte_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale raw string byte-read substrate definition embedded" >&2
    exit 1
  fi
  if ! grep -Fq ".data[(size_t)" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: missing direct topaz_string byte read" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_char_code_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale charCodeAt C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_string_char_code_at\s*\(" build/runtime_prelude_string_char_code_at.c; then
    echo "FAIL [runtime_prelude_string_char_code_at]: stale charCodeAt C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_char_code_at.c -o build/runtime_prelude_string_char_code_at
  local string_char_code_at_out
  string_char_code_at_out=$(./build/runtime_prelude_string_char_code_at)
  if [[ "$string_char_code_at_out" != $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef\n0\n2\n-1\n0\n1' ]]; then
    echo "FAIL [runtime_prelude_string_char_code_at]:" >&2
    echo "  expected string_method output" >&2
    printf '%s\n' "$string_char_code_at_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_char_code_at]"

  node dist/cli.js examples/string_method.ts --emit-c-only -o build/runtime_prelude_string_slice > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_slice.c runtime_prelude_string_slice
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_slice" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: missing stable String.slice prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_slice\s*\(" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: stale String.slice C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_slice\s*\(" build/runtime_prelude_string_slice.c; then
    echo "FAIL [runtime_prelude_string_slice]: stale String.slice C helper definition embedded" >&2
    exit 1
  fi
  local string_slice_body
  string_slice_body=$(awk '
    /topaz_fn_runtime_prelude___topaz_string_slice\(topaz_string s, topaz_number rawStart, topaz_number rawEnd\)/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_string_slice.c)
  if [[ -z "$string_slice_body" ]]; then
    echo "FAIL [runtime_prelude_string_slice]: could not extract generated String.slice body" >&2
    exit 1
  fi
  if ! grep -q "topaz_string_buffer_" <<<"$string_slice_body"; then
    echo "FAIL [runtime_prelude_string_slice]: generated String.slice body does not use StringBuffer" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<<"$string_slice_body"; then
    echo "FAIL [runtime_prelude_string_slice]: generated String.slice body still materializes byte codes" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_slice.c -o build/runtime_prelude_string_slice
  local string_slice_out
  string_slice_out=$(./build/runtime_prelude_string_slice)
  if [[ "$string_slice_out" != $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef\n0\n2\n-1\n0\n1' ]]; then
    echo "FAIL [runtime_prelude_string_slice]:" >&2
    printf '%s\n' "$string_slice_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_slice]"

  node dist/cli.js examples/string_method.ts --emit-c-only -o build/runtime_prelude_string_index_of > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_index_of" build/runtime_prelude_string_index_of.c; then
    echo "FAIL [runtime_prelude_string_index_of]: missing stable String.indexOf prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_index_of\s*\(" build/runtime_prelude_string_index_of.c; then
    echo "FAIL [runtime_prelude_string_index_of]: stale String.indexOf C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_number topaz_string_index_of\s*\(" build/runtime_prelude_string_index_of.c; then
    echo "FAIL [runtime_prelude_string_index_of]: stale String.indexOf C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_index_of.c -o build/runtime_prelude_string_index_of
  local string_index_of_out
  string_index_of_out=$(./build/runtime_prelude_string_index_of)
  if [[ "$string_index_of_out" != $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef\n0\n2\n-1\n0\n1' ]]; then
    echo "FAIL [runtime_prelude_string_index_of]:" >&2
    printf '%s\n' "$string_index_of_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_index_of]"

  node dist/cli.js examples/array_method_slice.ts --emit-c-only -o build/runtime_prelude_array_slice_normalize > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_slice_normalize" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: missing stable Array.slice normalize prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_slice_normalize\s*\(" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: stale Array.slice normalize C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline size_t topaz_slice_normalize\s*\(" build/runtime_prelude_array_slice_normalize.c; then
    echo "FAIL [runtime_prelude_array_slice_normalize]: stale Array.slice normalize C helper definition embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_array_slice_normalize.c -o build/runtime_prelude_array_slice_normalize
  local array_slice_normalize_out
  array_slice_normalize_out=$(./build/runtime_prelude_array_slice_normalize)
  if [[ "$array_slice_normalize_out" != $'3\n20\n40\n3\n30\n50\n5\n10\n50\n2\n40\n50\n4\n10\n40\n2\n30\n40\n0\n0\n2\n40\n50\n0\n2\nbeta\ngamma\n1\n99\n777\n2\n20\n30\n2\n20\n30\n3\n4\n99' ]]; then
    echo "FAIL [runtime_prelude_array_slice_normalize]:" >&2
    echo "  expected array_method_slice output" >&2
    printf '%s\n' "$array_slice_normalize_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_array_slice_normalize]"

  node dist/cli.js examples/template_literal.ts --emit-c-only -o build/runtime_prelude_string_concat > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_concat.c runtime_prelude_string_concat
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_concat" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: missing stable string concat prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_concat\s*\(" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: stale string concat C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_concat\s*\(" build/runtime_prelude_string_concat.c; then
    echo "FAIL [runtime_prelude_string_concat]: stale string concat C helper definition embedded" >&2
    exit 1
  fi
  local string_concat_body
  string_concat_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_concat\(topaz_string a, topaz_string b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_concat.c)
  if ! grep -q "topaz_string_buffer_" <<< "$string_concat_body"; then
    echo "FAIL [runtime_prelude_string_concat]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$string_concat_body"; then
    echo "FAIL [runtime_prelude_string_concat]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_concat.c -o build/runtime_prelude_string_concat
  local string_concat_out
  string_concat_out=$(./build/runtime_prelude_string_concat)
  if [[ "$string_concat_out" != $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]' ]]; then
    echo "FAIL [runtime_prelude_string_concat]:" >&2
    echo "  expected template_literal output" >&2
    printf '%s\n' "$string_concat_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_concat]"

  node dist/cli.js examples/string_repeat.ts --emit-c-only -o build/runtime_prelude_string_repeat > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_string_repeat.c runtime_prelude_string_repeat
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_repeat" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: missing stable String.repeat prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_repeat\s*\(" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat C helper call emitted" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_repeat\s*\(" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat C helper definition embedded" >&2
    exit 1
  fi
  if grep -q "TOPAZ_STRING_REPEAT_MAX_BYTES" build/runtime_prelude_string_repeat.c; then
    echo "FAIL [runtime_prelude_string_repeat]: stale String.repeat max macro embedded" >&2
    exit 1
  fi
  local string_repeat_body
  string_repeat_body=$(awk '
    /^static __attribute__\(\(unused\)\) topaz_string topaz_fn_runtime_prelude___topaz_string_repeat\(topaz_string s, topaz_number count\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}$/ { exit }
  ' build/runtime_prelude_string_repeat.c)
  if ! grep -q "topaz_string_buffer_" <<< "$string_repeat_body"; then
    echo "FAIL [runtime_prelude_string_repeat]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<< "$string_repeat_body"; then
    echo "FAIL [runtime_prelude_string_repeat]: old byte-code materialization helper still used" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_repeat.c -o build/runtime_prelude_string_repeat
  local string_repeat_out
  string_repeat_out=$(./build/runtime_prelude_string_repeat)
  if [[ "$string_repeat_out" != $'xxx\n3\n0\ntrue\naa\npre-haha\nqq' ]]; then
    echo "FAIL [runtime_prelude_string_repeat]:" >&2
    echo "  expected string_repeat output" >&2
    printf '%s\n' "$string_repeat_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_repeat]"

  node dist/cli.js examples/string_starts_ends_with.ts --emit-c-only -o build/runtime_prelude_starts_with > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_starts_with" build/runtime_prelude_starts_with.c; then
    echo "FAIL [runtime_prelude_starts_with]: missing stable startsWith prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_starts_with\\(" build/runtime_prelude_starts_with.c; then
    echo "FAIL [runtime_prelude_starts_with]: migrated startsWith helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_starts_with.c -o build/runtime_prelude_starts_with
  local starts_with_out
  starts_with_out=$(./build/runtime_prelude_starts_with)
  if [[ "$starts_with_out" != $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother' ]]; then
    echo "FAIL [runtime_prelude_starts_with]:" >&2
    echo "  expected string_starts_ends_with output" >&2
    printf '%s\n' "$starts_with_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_starts_with]"

  node dist/cli.js examples/template_literal.ts --emit-c-only -o build/runtime_prelude_boolean_to_string > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_to_string" build/runtime_prelude_boolean_to_string.c; then
    echo "FAIL [runtime_prelude_boolean_to_string]: missing stable boolean-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_boolean_to_string\\(" build/runtime_prelude_boolean_to_string.c; then
    echo "FAIL [runtime_prelude_boolean_to_string]: migrated boolean-to-string helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_boolean_to_string.c -o build/runtime_prelude_boolean_to_string
  local boolean_to_string_out
  boolean_to_string_out=$(./build/runtime_prelude_boolean_to_string)
  if [[ "$boolean_to_string_out" != $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]' ]]; then
    echo "FAIL [runtime_prelude_boolean_to_string]:" >&2
    echo "  expected template_literal output" >&2
    printf '%s\n' "$boolean_to_string_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_boolean_to_string]"

  cat > build/runtime_prelude_console_boolean.ts <<'TOPAZ'
function truthy(): boolean {
  return true;
}

console.log(truthy());
console.error(!truthy());
console.warn(truthy() === true);
TOPAZ
  node dist/cli.js build/runtime_prelude_console_boolean.ts --emit-c-only -o build/runtime_prelude_console_boolean > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_to_string" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: missing stable boolean-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_boolean\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: old boolean console helper still emitted" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_prelude_console_boolean.c || ! grep -Eq "\btopaz_stderr_write\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: missing raw stdout/stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_string\b" build/runtime_prelude_console_boolean.c; then
    echo "FAIL [runtime_prelude_console_boolean]: old string console helper still emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_console_boolean.c -o build/runtime_prelude_console_boolean
  ./build/runtime_prelude_console_boolean > build/runtime_prelude_console_boolean.stdout 2> build/runtime_prelude_console_boolean.stderr
  local console_boolean_stdout
  console_boolean_stdout=$(< build/runtime_prelude_console_boolean.stdout)
  local console_boolean_stderr
  console_boolean_stderr=$(< build/runtime_prelude_console_boolean.stderr)
  if [[ "$console_boolean_stdout" != "true" ]]; then
    echo "FAIL [runtime_prelude_console_boolean stdout]:" >&2
    printf '%s\n' "$console_boolean_stdout" | sed 's/^/  got: /' >&2
    exit 1
  fi
  if [[ "$console_boolean_stderr" != $'false\ntrue' ]]; then
    echo "FAIL [runtime_prelude_console_boolean stderr]:" >&2
    printf '%s\n' "$console_boolean_stderr" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_console_boolean]"

  cat > build/runtime_numeric_console_string.ts <<'TOPAZ'
function n(): number {
  return 123;
}

console.log(n());
console.error(1.5);
console.warn(2);
console.log(123n);
console.error(-5n);
console.warn(0n);
TOPAZ
  node dist/cli.js build/runtime_numeric_console_string.ts --emit-c-only -o build/runtime_numeric_console_string > /dev/null
  if ! grep -Eq "\btopaz_number_to_string\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing number stringification helper" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_to_string" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing stable bigint-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_to_string\s*\(" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: stale standalone bigint stringification helper emitted or defined" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_numeric_console_string.c || ! grep -Eq "\btopaz_stderr_write\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: missing raw stdout/stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error|warn)_(string|number|bigint)\b" build/runtime_numeric_console_string.c; then
    echo "FAIL [runtime_numeric_console_string]: old numeric console helper still emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_numeric_console_string.c -o build/runtime_numeric_console_string
  ./build/runtime_numeric_console_string > build/runtime_numeric_console_string.stdout 2> build/runtime_numeric_console_string.stderr
  local numeric_console_stdout
  numeric_console_stdout=$(< build/runtime_numeric_console_string.stdout)
  local numeric_console_stderr
  numeric_console_stderr=$(< build/runtime_numeric_console_string.stderr)
  if [[ "$numeric_console_stdout" != $'123\n123' ]]; then
    echo "FAIL [runtime_numeric_console_string stdout]:" >&2
    printf '%s\n' "$numeric_console_stdout" | sed 's/^/  got: /' >&2
    exit 1
  fi
  if [[ "$numeric_console_stderr" != $'1.5\n2\n-5\n0' ]]; then
    echo "FAIL [runtime_numeric_console_string stderr]:" >&2
    printf '%s\n' "$numeric_console_stderr" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_numeric_console_string]"

  node dist/cli.js examples/bigint_large_limb.ts --emit-c-only -o build/runtime_prelude_bigint_to_string > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_to_string" build/runtime_prelude_bigint_to_string.c; then
    echo "FAIL [runtime_prelude_bigint_to_string]: missing stable bigint-to-string prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_to_string\s*\(" build/runtime_prelude_bigint_to_string.c; then
    echo "FAIL [runtime_prelude_bigint_to_string]: stale standalone bigint stringification helper emitted or defined" >&2
    exit 1
  fi
  local bigint_to_string_body
  bigint_to_string_body=$(awk '
    /^static .* topaz_fn_runtime_prelude___topaz_bigint_to_string\(topaz_bigint \* value\) \{/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_bigint_to_string.c)
  if ! grep -q "topaz_string_buffer_" <<< "$bigint_to_string_body"; then
    echo "FAIL [runtime_prelude_bigint_to_string]: missing string buffer intrinsic substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_number_to_string\s*\(" <<< "$bigint_to_string_body"; then
    echo "FAIL [runtime_prelude_bigint_to_string]: bigint formatting depends on number formatting" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_to_string.c -o build/runtime_prelude_bigint_to_string
  local bigint_to_string_out
  bigint_to_string_out=$(./build/runtime_prelude_bigint_to_string)
  if [[ "$bigint_to_string_out" != $'123456789012345678901234567890\n1111111110111111111011111111100\n864197532086419753208641975320\n1234567890123456789012345678900\ntrue\ntrue\n123456789012345678901234567890:987654321098765432109876543210' ]]; then
    echo "FAIL [runtime_prelude_bigint_to_string]:" >&2
    printf '%s\n' "$bigint_to_string_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_to_string]"

  node dist/cli.js examples/bigint_large_limb.ts --emit-c-only -o build/runtime_prelude_bigint_buffer > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_clone" build/runtime_prelude_bigint_buffer.c; then
    echo "FAIL [runtime_prelude_bigint_buffer]: missing stable bigint clone prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_buffer_new \
    topaz_bigint_buffer_to_bigint \
    topaz_bigint_buffer_len \
    topaz_bigint_buffer_get_limb \
    topaz_bigint_buffer_set_limb \
    topaz_bigint_limb_len \
    topaz_bigint_limb \
    topaz_bigint_sign; do
    if ! grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_buffer.c; then
      echo "FAIL [runtime_prelude_bigint_buffer]: missing ${symbol} call" >&2
      exit 1
    fi
  done
  for symbol in topaz_bigint_alloc topaz_bigint_normalize; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_buffer.c; then
      echo "FAIL [runtime_prelude_bigint_buffer]: stale standalone ${symbol} emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra -c build/runtime_prelude_bigint_buffer.c -o build/runtime_prelude_bigint_buffer.o
  echo "PASS [runtime_prelude_bigint_buffer]"

  node dist/cli.js examples/bigint_equality.ts --emit-c-only -o build/runtime_prelude_bigint_eq > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_eq" build/runtime_prelude_bigint_eq.c; then
    echo "FAIL [runtime_prelude_bigint_eq]: missing stable bigint equality prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_eq\s*\(" build/runtime_prelude_bigint_eq.c; then
    echo "FAIL [runtime_prelude_bigint_eq]: stale bigint equality C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_eq.c -o build/runtime_prelude_bigint_eq
  local bigint_eq_out
  bigint_eq_out=$(./build/runtime_prelude_bigint_eq)
  if [[ "$bigint_eq_out" != $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue' ]]; then
    echo "FAIL [runtime_prelude_bigint_eq]:" >&2
    printf '%s\n' "$bigint_eq_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_eq]"

  node dist/cli.js examples/bigint_ordering.ts --emit-c-only -o build/runtime_prelude_bigint_cmp > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_cmp" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: missing stable bigint comparison prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_cmp\s*\(" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: stale bigint comparison C helper call or definition emitted" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_cmp_abs\s*\(" build/runtime_prelude_bigint_cmp.c; then
    echo "FAIL [runtime_prelude_bigint_cmp]: stale bigint absolute comparison C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_cmp.c -o build/runtime_prelude_bigint_cmp
  local bigint_cmp_out
  bigint_cmp_out=$(./build/runtime_prelude_bigint_cmp)
  if [[ "$bigint_cmp_out" != $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue' ]]; then
    echo "FAIL [runtime_prelude_bigint_cmp]:" >&2
    printf '%s\n' "$bigint_cmp_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_cmp]"

  node dist/cli.js examples/bigint_unary_negation.ts --emit-c-only -o build/runtime_prelude_bigint_neg > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_neg" build/runtime_prelude_bigint_neg.c; then
    echo "FAIL [runtime_prelude_bigint_neg]: missing stable bigint negation prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_bigint_neg\s*\(" build/runtime_prelude_bigint_neg.c; then
    echo "FAIL [runtime_prelude_bigint_neg]: stale bigint negation C helper call or definition emitted" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_neg.c -o build/runtime_prelude_bigint_neg
  local bigint_neg_out
  bigint_neg_out=$(./build/runtime_prelude_bigint_neg)
  if [[ "$bigint_neg_out" != $'-12\n34\n0\ntrue\n-123456789012345678901234567890\n42' ]]; then
    echo "FAIL [runtime_prelude_bigint_neg]:" >&2
    printf '%s\n' "$bigint_neg_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_neg]"

  node dist/cli.js examples/bigint_add_sub_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_add_sub > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_add" build/runtime_prelude_bigint_add_sub.c; then
    echo "FAIL [runtime_prelude_bigint_add_sub]: missing stable bigint addition prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_sub" build/runtime_prelude_bigint_add_sub.c; then
    echo "FAIL [runtime_prelude_bigint_add_sub]: missing stable bigint subtraction prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_add \
    topaz_bigint_sub \
    topaz_bigint_add_abs \
    topaz_bigint_sub_abs \
    topaz_bigint_copy_abs; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_add_sub.c; then
      echo "FAIL [runtime_prelude_bigint_add_sub]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_add_sub.c -o build/runtime_prelude_bigint_add_sub
  local bigint_add_sub_out
  bigint_add_sub_out=$(./build/runtime_prelude_bigint_add_sub)
  if [[ "$bigint_add_sub_out" != $'579\n333\n-333\n0\n18446744073709551617\n18446744073709551613\n123456789000000000\n42' ]]; then
    echo "FAIL [runtime_prelude_bigint_add_sub]:" >&2
    printf '%s\n' "$bigint_add_sub_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_add_sub]"

  node dist/cli.js examples/bigint_mul_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_mul > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_mul" build/runtime_prelude_bigint_mul.c; then
    echo "FAIL [runtime_prelude_bigint_mul]: missing stable bigint multiplication prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_mul \
    topaz_bigint_zero; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_mul.c; then
      echo "FAIL [runtime_prelude_bigint_mul]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_bigint_mul.c -o build/runtime_prelude_bigint_mul
  local bigint_mul_out
  bigint_mul_out=$(./build/runtime_prelude_bigint_mul)
  if [[ "$bigint_mul_out" != $'0\n-408\n408\n56088\n18446744065119617025\n281474976710657' ]]; then
    echo "FAIL [runtime_prelude_bigint_mul]:" >&2
    printf '%s\n' "$bigint_mul_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_bigint_mul]"

  node dist/cli.js examples/bigint_decimal_parse_prelude.ts --emit-c-only -o build/runtime_prelude_bigint_decimal > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_bigint_from_decimal" build/runtime_prelude_bigint_decimal.c; then
    echo "FAIL [runtime_prelude_bigint_decimal]: missing stable bigint decimal parser prelude symbol" >&2
    exit 1
  fi
  for symbol in \
    topaz_bigint_from_decimal_cstr \
    topaz_bigint_mul_small_in_place \
    topaz_bigint_add_small_in_place; do
    if grep -Eq "\b${symbol}\s*\(" build/runtime_prelude_bigint_decimal.c; then
      echo "FAIL [runtime_prelude_bigint_decimal]: stale ${symbol} helper call or definition emitted" >&2
      exit 1
    fi
  done
  cc -O2 -Iruntime -Wall -Wextra -c build/runtime_prelude_bigint_decimal.c -o build/runtime_prelude_bigint_decimal.o
  echo "PASS [runtime_prelude_bigint_decimal]"

  cat > build/runtime_console_warn_string.ts <<'TOPAZ'
console.warn("careful");
console.warn(true);
console.warn(2.5);
console.warn(0n);
TOPAZ
  node dist/cli.js build/runtime_console_warn_string.ts --emit-c-only -o build/runtime_console_warn_string > /dev/null
  if ! grep -Eq "\btopaz_stderr_write\b" build/runtime_console_warn_string.c; then
    echo "FAIL [runtime_console_warn_string]: missing stderr write substrate for console.warn" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(warn|error)_string\b" build/runtime_console_warn_string.c; then
    echo "FAIL [runtime_console_warn_string]: stale console string wrapper emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_console_warn_string.c -o build/runtime_console_warn_string
  ./build/runtime_console_warn_string > build/runtime_console_warn_string.stdout 2> build/runtime_console_warn_string.stderr
  if [[ -s build/runtime_console_warn_string.stdout ]]; then
    echo "FAIL [runtime_console_warn_string stdout]: expected empty stdout" >&2
    sed 's/^/  got: /' build/runtime_console_warn_string.stdout >&2
    exit 1
  fi
  printf 'careful\ntrue\n2.5\n0\n' > build/runtime_console_warn_string.expected_stderr
  if ! cmp -s build/runtime_console_warn_string.expected_stderr build/runtime_console_warn_string.stderr; then
    echo "FAIL [runtime_console_warn_string stderr]:" >&2
    sed 's/^/  expected: /' build/runtime_console_warn_string.expected_stderr >&2
    sed 's/^/  got: /' build/runtime_console_warn_string.stderr >&2
    exit 1
  fi
  echo "PASS [runtime_console_warn_string]"

  cat > build/runtime_console_line_io_wrappers.ts <<'TOPAZ'
import { writeError } from "std/process";

console.log("out");
console.log(true);
console.error("err");
console.warn(3);
writeError("line");
process.stdout.write("raw");
process.stdout.write("\n");
process.stderr.write("rawerr\n");
TOPAZ
  node dist/cli.js build/runtime_console_line_io_wrappers.ts --emit-c-only -o build/runtime_console_line_io_wrappers > /dev/null
  if ! grep -Eq "\btopaz_stdout_write\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: missing stdout write substrate" >&2
    exit 1
  fi
  if ! grep -Eq "\btopaz_stderr_write\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: missing stderr write substrate" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_console_(log|error)_string\b" build/runtime_console_line_io_wrappers.c; then
    echo "FAIL [runtime_console_line_io_wrappers]: stale console line wrapper emitted or defined" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_console_line_io_wrappers.c -o build/runtime_console_line_io_wrappers
  ./build/runtime_console_line_io_wrappers > build/runtime_console_line_io_wrappers.stdout 2> build/runtime_console_line_io_wrappers.stderr
  printf 'out\ntrue\nraw\n' > build/runtime_console_line_io_wrappers.expected_stdout
  printf 'err\n3\nline\nrawerr\n' > build/runtime_console_line_io_wrappers.expected_stderr
  if ! cmp -s build/runtime_console_line_io_wrappers.expected_stdout build/runtime_console_line_io_wrappers.stdout; then
    echo "FAIL [runtime_console_line_io_wrappers stdout]:" >&2
    sed 's/^/  expected: /' build/runtime_console_line_io_wrappers.expected_stdout >&2
    sed 's/^/  got: /' build/runtime_console_line_io_wrappers.stdout >&2
    exit 1
  fi
  if ! cmp -s build/runtime_console_line_io_wrappers.expected_stderr build/runtime_console_line_io_wrappers.stderr; then
    echo "FAIL [runtime_console_line_io_wrappers stderr]:" >&2
    sed 's/^/  expected: /' build/runtime_console_line_io_wrappers.expected_stderr >&2
    sed 's/^/  got: /' build/runtime_console_line_io_wrappers.stderr >&2
    exit 1
  fi
  echo "PASS [runtime_console_line_io_wrappers]"

  node dist/cli.js examples/string_basic.ts --emit-c-only -o build/runtime_prelude_string_eq > /dev/null
  local string_eq_calls
  string_eq_calls=$(grep -c "topaz_fn_runtime_prelude___topaz_string_eq(" build/runtime_prelude_string_eq.c || true)
  if (( string_eq_calls < 4 )); then
    echo "FAIL [runtime_prelude_string_eq]: missing string equality prelude call sites" >&2
    echo "  found calls: $string_eq_calls" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_eq.c -o build/runtime_prelude_string_eq
  local string_eq_out
  string_eq_out=$(./build/runtime_prelude_string_eq)
  if [[ "$string_eq_out" != $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof' ]]; then
    echo "FAIL [runtime_prelude_string_eq]:" >&2
    echo "  expected string_basic output" >&2
    printf '%s\n' "$string_eq_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_eq]"

  node dist/cli.js examples/array_method_includes.ts --emit-c-only -o build/runtime_prelude_string_includes > /dev/null
  local string_includes_calls
  string_includes_calls=$(grep -c "topaz_fn_runtime_prelude___topaz_string_eq(" build/runtime_prelude_string_includes.c || true)
  if (( string_includes_calls < 3 )); then
    echo "FAIL [runtime_prelude_string_includes]: missing string includes prelude call site" >&2
    echo "  found calls: $string_includes_calls" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_string_includes.c -o build/runtime_prelude_string_includes
  local string_includes_out
  string_includes_out=$(./build/runtime_prelude_string_includes)
  if [[ "$string_includes_out" != $'true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse' ]]; then
    echo "FAIL [runtime_prelude_string_includes]:" >&2
    echo "  expected array_method_includes output" >&2
    printf '%s\n' "$string_includes_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_string_includes]"

  node dist/cli.js examples/map_set_basic.ts --emit-c-only -o build/runtime_substrate_string_map_set > /dev/null
  if ! grep -q "TOPAZ_MAP_DEFINE(string_.*topaz_string_eq" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate string map equality helper" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_SET_DEFINE(string,.*topaz_string_eq" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate string set equality helper" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_MAP_DEFINE(boolean_.*topaz_hash_boolean, topaz_key_eq_boolean" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate boolean map hash/equality helpers" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_SET_DEFINE(boolean,.*topaz_hash_boolean, topaz_key_eq_boolean" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate boolean set hash/equality helpers" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_MAP_DEFINE(number_.*topaz_hash_number,  topaz_key_eq_number" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate number map hash/equality helpers" >&2
    exit 1
  fi
  if ! grep -q "TOPAZ_SET_DEFINE(number,.*topaz_hash_number,  topaz_key_eq_number" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing substrate number set hash/equality helpers" >&2
    exit 1
  fi
  local string_eq_forward_line
  local string_eq_bridge_line
  string_eq_forward_line=$(grep -nF "static __attribute__((unused)) topaz_boolean topaz_fn_runtime_prelude___topaz_string_eq(topaz_string a, topaz_string b);" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  string_eq_bridge_line=$(grep -nF "static inline topaz_boolean topaz_string_eq(topaz_string a, topaz_string b) {" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  if [[ -z "${string_eq_forward_line}" || -z "${string_eq_bridge_line}" || "${string_eq_forward_line}" -ge "${string_eq_bridge_line}" ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: missing prelude string equality forward declaration before bridge" >&2
    exit 1
  fi
  local string_eq_bridge_body
  string_eq_bridge_body=$(awk '
    /^static inline topaz_boolean topaz_string_eq\(topaz_string a, topaz_string b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}/ { exit }
  ' build/runtime_substrate_string_map_set.c)
  if [[ "${string_eq_bridge_body}" != *"return topaz_fn_runtime_prelude___topaz_string_eq(a, b);"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_string_eq does not delegate to runtime prelude string equality" >&2
    printf '%s\n' "${string_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_bridge_body}" == *"memcmp(a.data, b.data, a.len)"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_string_eq still embeds old memcmp byte equality" >&2
    printf '%s\n' "${string_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  local boolean_hash_forward_line
  local boolean_hash_bridge_line
  local boolean_key_eq_forward_line
  local boolean_key_eq_bridge_line
  boolean_hash_forward_line=$(grep -nF "static __attribute__((unused)) topaz_number topaz_fn_runtime_prelude___topaz_boolean_hash(topaz_boolean value);" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  boolean_hash_bridge_line=$(grep -nF "static inline size_t topaz_hash_boolean(topaz_boolean b) {" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  boolean_key_eq_forward_line=$(grep -nF "static __attribute__((unused)) topaz_boolean topaz_fn_runtime_prelude___topaz_boolean_key_eq(topaz_boolean a, topaz_boolean b);" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  boolean_key_eq_bridge_line=$(grep -nF "static inline topaz_boolean topaz_key_eq_boolean(topaz_boolean a, topaz_boolean b) {" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  if [[ -z "${boolean_hash_forward_line}" || -z "${boolean_hash_bridge_line}" || "${boolean_hash_forward_line}" -ge "${boolean_hash_bridge_line}" ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: missing prelude boolean hash forward declaration before bridge" >&2
    exit 1
  fi
  if [[ -z "${boolean_key_eq_forward_line}" || -z "${boolean_key_eq_bridge_line}" || "${boolean_key_eq_forward_line}" -ge "${boolean_key_eq_bridge_line}" ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: missing prelude boolean key equality forward declaration before bridge" >&2
    exit 1
  fi
  local boolean_hash_bridge_body
  boolean_hash_bridge_body=$(awk '
    /^static inline size_t topaz_hash_boolean\(topaz_boolean b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}/ { exit }
  ' build/runtime_substrate_string_map_set.c)
  if [[ "${boolean_hash_bridge_body}" != *"return (size_t)topaz_fn_runtime_prelude___topaz_boolean_hash(b);"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_hash_boolean does not delegate to runtime prelude boolean hash" >&2
    printf '%s\n' "${boolean_hash_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${boolean_hash_bridge_body}" == *"return b ? 1u : 0u;"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_hash_boolean still embeds old boolean hash" >&2
    printf '%s\n' "${boolean_hash_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  local boolean_key_eq_bridge_body
  boolean_key_eq_bridge_body=$(awk '
    /^static inline topaz_boolean topaz_key_eq_boolean\(topaz_boolean a, topaz_boolean b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}/ { exit }
  ' build/runtime_substrate_string_map_set.c)
  if [[ "${boolean_key_eq_bridge_body}" != *"return topaz_fn_runtime_prelude___topaz_boolean_key_eq(a, b);"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_key_eq_boolean does not delegate to runtime prelude boolean key equality" >&2
    printf '%s\n' "${boolean_key_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${boolean_key_eq_bridge_body}" == *"return a == b;"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_key_eq_boolean still embeds old boolean equality" >&2
    printf '%s\n' "${boolean_key_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  local number_key_eq_forward_line
  local number_key_eq_bridge_line
  number_key_eq_forward_line=$(grep -nF "static __attribute__((unused)) topaz_boolean topaz_fn_runtime_prelude___topaz_number_key_eq(topaz_number a, topaz_number b);" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  number_key_eq_bridge_line=$(grep -nF "static inline topaz_boolean topaz_key_eq_number(topaz_number a, topaz_number b) {" build/runtime_substrate_string_map_set.c | head -n1 | cut -d: -f1 || true)
  if [[ -z "${number_key_eq_forward_line}" || -z "${number_key_eq_bridge_line}" || "${number_key_eq_forward_line}" -ge "${number_key_eq_bridge_line}" ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: missing prelude number key equality forward declaration before bridge" >&2
    exit 1
  fi
  local number_key_eq_bridge_body
  number_key_eq_bridge_body=$(awk '
    /^static inline topaz_boolean topaz_key_eq_number\(topaz_number a, topaz_number b\) \{/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^}/ { exit }
  ' build/runtime_substrate_string_map_set.c)
  if [[ "${number_key_eq_bridge_body}" != *"return topaz_fn_runtime_prelude___topaz_number_key_eq(a, b);"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_key_eq_number does not delegate to runtime prelude number key equality" >&2
    printf '%s\n' "${number_key_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${number_key_eq_bridge_body}" == *"if (a == b) return true;"* || "${number_key_eq_bridge_body}" == *"if (a != a && b != b) return true;"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: topaz_key_eq_number still embeds old SameValueZero equality" >&2
    printf '%s\n' "${number_key_eq_bridge_body}" | sed 's/^/    /' >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_hash(topaz_boolean value) {" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing runtime prelude boolean hash generated definition" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_boolean_key_eq(topaz_boolean a, topaz_boolean b) {" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing runtime prelude boolean key equality generated definition" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_number_key_eq(topaz_number a, topaz_number b) {" build/runtime_substrate_string_map_set.c; then
    echo "FAIL [runtime_substrate_string_map_set]: missing runtime prelude number key equality generated definition" >&2
    exit 1
  fi
  local string_eq_detail_out
  string_eq_detail_out=$(pnpm run check:runtime-substrate -- --details)
  if [[ "${string_eq_detail_out}" != *"topaz_string_eq (helper,"* || "${string_eq_detail_out}" != *"migration=container-monomorph-boundary"* || "${string_eq_detail_out}" != *"runtime prelude"* || "${string_eq_detail_out}" != *"C bridge for Map/Set macro string key equality"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details do not describe topaz_string_eq as a prelude bridge in the container lane" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_hash_boolean (helper,"* || "${string_eq_detail_out}" != *"C bridge for Map/Set macro boolean key hashing"* || "${string_eq_detail_out}" != *"__topaz_boolean_hash"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details do not describe topaz_hash_boolean as a prelude bridge in the container lane" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_key_eq_boolean (helper,"* || "${string_eq_detail_out}" != *"C bridge for Map/Set macro boolean key equality"* || "${string_eq_detail_out}" != *"__topaz_boolean_key_eq"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details do not describe topaz_key_eq_boolean as a prelude bridge in the container lane" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_key_eq_number (helper,"* || "${string_eq_detail_out}" != *"C bridge for Map/Set macro number key equality"* || "${string_eq_detail_out}" != *"runtime prelude"* || "${string_eq_detail_out}" != *"__topaz_number_key_eq"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details do not describe topaz_key_eq_number as a prelude bridge in the container lane" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_hash_number (helper,"* || "${string_eq_detail_out}" != *"residual C substrate for number key hashing"* || "${string_eq_detail_out}" != *"uint64_t"* || "${string_eq_detail_out}" != *"size_t"* || "${string_eq_detail_out}" != *"NaN"* || "${string_eq_detail_out}" != *"-0 normalization"* || "${string_eq_detail_out}" != *"migration=container-monomorph-boundary"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details no longer prove topaz_hash_number remains C substrate" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_hash_string (helper,"* || "${string_eq_detail_out}" != *"residual C substrate for FNV-1a string byte hashing"* || "${string_eq_detail_out}" != *"unsigned overflow"* || "${string_eq_detail_out}" != *"hash-order iteration"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details no longer prove topaz_hash_string remains residual C substrate" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  if [[ "${string_eq_detail_out}" != *"topaz_hash_pointer (helper,"* || "${string_eq_detail_out}" != *"pointer-bit reference identity hashing"* || "${string_eq_detail_out}" != *"Topaz-level pointer value model"* ]]; then
    echo "FAIL [runtime_substrate_string_map_set]: substrate details no longer prove topaz_hash_pointer remains residual C substrate" >&2
    printf '%s\n' "${string_eq_detail_out}" | sed 's/^/    /' >&2
    exit 1
  fi
  echo "PASS [runtime_substrate_string_map_set]"

  node dist/cli.js examples/string_starts_ends_with.ts --emit-c-only -o build/runtime_prelude_ends_with > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_ends_with" build/runtime_prelude_ends_with.c; then
    echo "FAIL [runtime_prelude_ends_with]: missing stable endsWith prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_ends_with\\(" build/runtime_prelude_ends_with.c; then
    echo "FAIL [runtime_prelude_ends_with]: migrated endsWith helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_ends_with.c -o build/runtime_prelude_ends_with
  local ends_with_out
  ends_with_out=$(./build/runtime_prelude_ends_with)
  if [[ "$ends_with_out" != $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother' ]]; then
    echo "FAIL [runtime_prelude_ends_with]:" >&2
    echo "  expected string_starts_ends_with output" >&2
    printf '%s\n' "$ends_with_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_ends_with]"

  node dist/cli.js examples/string_trim_start.ts --emit-c-only -o build/runtime_prelude_trim_start > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_string_trim_start" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: missing stable trimStart prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_string_trim_start\\(" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: migrated trimStart helper definition still embedded" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_boolean topaz_string_is_trim_start_byte\\(" build/runtime_prelude_trim_start.c; then
    echo "FAIL [runtime_prelude_trim_start]: stale trimStart byte helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_trim_start.c -o build/runtime_prelude_trim_start
  local trim_start_out
  trim_start_out=$(./build/runtime_prelude_trim_start)
  if [[ "$trim_start_out" != $'topaz\n5\nok\n2\nready\n5\n0\ntrue\npre-value\nbc\nxxx\nname' ]]; then
    echo "FAIL [runtime_prelude_trim_start]:" >&2
    echo "  expected string_trim_start output" >&2
    printf '%s\n' "$trim_start_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_trim_start]"

  node dist/cli.js examples/node_path_extname.ts --emit-c-only -o build/runtime_prelude_path_extname > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_extname" build/runtime_prelude_path_extname.c; then
    echo "FAIL [runtime_prelude_path_extname]: missing stable path extname prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_extname.c -o build/runtime_prelude_path_extname
  local path_extname_out
  path_extname_out=$(./build/runtime_prelude_path_extname)
  if [[ "$path_extname_out" != $'.html\n.md\n.\ntrue\ntrue\n.md\n.ts\ntrue\n.gz\ntrue\ntrue\ntrue\n.tsx' ]]; then
    echo "FAIL [runtime_prelude_path_extname]:" >&2
    echo "  expected node_path_extname output" >&2
    printf '%s\n' "$path_extname_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_extname]"

  node dist/cli.js examples/node_path_basic.ts --emit-c-only -o build/runtime_prelude_path_dirname > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_dirname" build/runtime_prelude_path_dirname.c; then
    echo "FAIL [runtime_prelude_path_dirname]: missing stable path dirname prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_dirname.c -o build/runtime_prelude_path_dirname
  local path_dirname_out
  path_dirname_out=$(./build/runtime_prelude_path_dirname)
  if [[ "$path_dirname_out" != $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue' ]]; then
    echo "FAIL [runtime_prelude_path_dirname]:" >&2
    echo "  expected node_path_basic output" >&2
    printf '%s\n' "$path_dirname_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_dirname]"

  node dist/cli.js examples/node_path_basename.ts --emit-c-only -o build/runtime_prelude_path_basename > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_basename" build/runtime_prelude_path_basename.c; then
    echo "FAIL [runtime_prelude_path_basename]: missing stable path basename prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_basename_ext" build/runtime_prelude_path_basename.c; then
    echo "FAIL [runtime_prelude_path_basename]: missing stable path basename ext prelude symbol" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_basename.c -o build/runtime_prelude_path_basename
  local path_basename_out
  path_basename_out=$(./build/runtime_prelude_path_basename)
  if [[ "$path_basename_out" != $'baz.ts\nbar\nbar\nfoo\nfoo\n\ntrue\nbaz\nfoo\nmain\nbar.ts\ntrue\nindex' ]]; then
    echo "FAIL [runtime_prelude_path_basename]:" >&2
    echo "  expected node_path_basename output" >&2
    printf '%s\n' "$path_basename_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_basename]"

  node dist/cli.js examples/node_path_join.ts --emit-c-only -o build/runtime_prelude_path_join > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_join_segments" build/runtime_prelude_path_join.c; then
    echo "FAIL [runtime_prelude_path_join]: missing stable path join prelude symbol" >&2
    exit 1
  fi
  if grep -Eq "topaz_path_join\\([0-9]" build/runtime_prelude_path_join.c; then
    echo "FAIL [runtime_prelude_path_join]: unexpected topaz_path_join call site" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_join.c -o build/runtime_prelude_path_join
  local path_join_out
  path_join_out=$(./build/runtime_prelude_path_join)
  if [[ "$path_join_out" != $'.\n.\nfoo/bar\n/foo/bar\n/bar\n../b\na/b/c/\na\n/\n.\n..\n/a/b/c\nfoo/bar\n/pkg/src/index' ]]; then
    echo "FAIL [runtime_prelude_path_join]:" >&2
    echo "  expected node_path_join output" >&2
    printf '%s\n' "$path_join_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_join]"

  node dist/cli.js examples/node_path_basic.ts --emit-c-only -o build/runtime_prelude_path_resolve > /dev/null
  if ! grep -q "topaz_fn_runtime_prelude___topaz_path_resolve_segments" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: missing stable path resolve prelude symbol" >&2
    exit 1
  fi
  if ! grep -q "topaz_process_cwd(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: missing cwd substrate helper" >&2
    exit 1
  fi
  if grep -q "topaz_path_resolve(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: unexpected old path resolve call site" >&2
    exit 1
  fi
  if grep -Eq "static inline topaz_string topaz_path_(resolve|normalize_string)\\(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_prelude_path_resolve]: old path resolve helper definition still embedded" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_path_resolve.c -o build/runtime_prelude_path_resolve
  local path_resolve_out
  path_resolve_out=$(./build/runtime_prelude_path_resolve)
  if [[ "$path_resolve_out" != $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue' ]]; then
    echo "FAIL [runtime_prelude_path_resolve]:" >&2
    echo "  expected node_path_basic output" >&2
    printf '%s\n' "$path_resolve_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_path_resolve]"
  if grep -Eq "static inline topaz_string topaz_path_(dirname|basename|basename_ext|extname|join|resolve|normalize_string)\\(" build/runtime_prelude_path_resolve.c; then
    echo "FAIL [runtime_header_path_helper_cleanup]: migrated path helper definition still embedded" >&2
    exit 1
  fi
  echo "PASS [runtime_header_path_helper_cleanup]"

  node dist/cli.js examples/node_url_basic.ts --emit-c-only -o build/runtime_prelude_file_url > /dev/null
  assert_no_byte_code_string_substrate build/runtime_prelude_file_url.c runtime_prelude_file_url
  if ! grep -q "topaz_fn_runtime_prelude___topaz_url_file_url_to_path" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: missing stable fileURLToPath prelude symbol" >&2
    exit 1
  fi
  local file_url_body
  file_url_body=$(awk '
    /topaz_fn_runtime_prelude___topaz_url_file_url_to_path\(topaz_string url\)/ { in_fn = 1; depth = 0 }
    in_fn {
      print
      for (i = 1; i <= length($0); i++) {
        ch = substr($0, i, 1)
        if (ch == "{") depth++
        else if (ch == "}") depth--
      }
      if (depth == 0 && $0 ~ /}/) in_fn = 0
    }
  ' build/runtime_prelude_file_url.c)
  if [[ -z "$file_url_body" ]]; then
    echo "FAIL [runtime_prelude_file_url]: could not extract generated fileURLToPath body" >&2
    exit 1
  fi
  if ! grep -q "topaz_string_buffer_" <<<"$file_url_body"; then
    echo "FAIL [runtime_prelude_file_url]: generated fileURLToPath body does not use StringBuffer" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_string_from_byte_codes\s*\(" <<<"$file_url_body"; then
    echo "FAIL [runtime_prelude_file_url]: generated fileURLToPath body still materializes byte codes" >&2
    exit 1
  fi
  if grep -Eq "\btopaz_url_file_url_to_path\s*\(" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: old fileURLToPath helper still emitted" >&2
    exit 1
  fi
  if ! grep -q "topaz_runtime_module_url" build/runtime_prelude_file_url.c; then
    echo "FAIL [runtime_prelude_file_url]: missing import.meta.url substrate" >&2
    exit 1
  fi
  cc -O2 -Iruntime -Wall -Wextra build/runtime_prelude_file_url.c -o build/runtime_prelude_file_url
  local file_url_out
  file_url_out=$(./build/runtime_prelude_file_url)
  if [[ "$file_url_out" != $'true\ntrue\ntrue\ntrue\nruntime_prelude_file_url\ntrue\ntrue\n/tmp/a b/c/d\n/etc/hosts\n7\n0\n255' ]]; then
    echo "FAIL [runtime_prelude_file_url]:" >&2
    echo "  expected node_url_basic output" >&2
    printf '%s\n' "$file_url_out" | sed 's/^/  got: /' >&2
    exit 1
  fi
  echo "PASS [runtime_prelude_file_url]"

  node dist/cli.js examples/fib.ts --output build/cli_output_probe > /dev/null
  local out
  out=$(./build/cli_output_probe)
  if [[ "$out" != "5702887" ]]; then
    echo "FAIL [cli_output_long_flag]:" >&2
    echo "  expected: 5702887" >&2
    echo "  got: $out" >&2
    exit 1
  fi
  echo "PASS [cli_output_long_flag]"

  run_cli_fail_case cli_unknown_option "unknown option --bogus" --bogus examples/fib.ts
  run_cli_fail_case cli_missing_output_value "-o expects a value" examples/fib.ts -o
}

run_case fib "5702887"
run_cli_smoke
run_case loop_sum "5050"
run_case while_count "10"
run_case for_infinite $'10\n24\n4\n25'
run_cc_warnfree_case for_infinite
run_fail_case for_nonbool_cond_fail examples/for_nonbool_cond_fail.ts "expected topaz_boolean, got topaz_number"

run_case ternary $'10\nno\n42\n-1\nneg\nzero\npos\n8\n77\n100\n1\n2\n9\n33\n-7'
run_cc_warnfree_case ternary
run_fail_case ternary_nonbool_cond_fail examples/ternary_nonbool_cond_fail.ts "expected topaz_boolean"
run_fail_case ternary_incompatible_branches_fail examples/ternary_incompatible_branches_fail.ts "branches have incompatible types"

run_case iife_contextual_return $'30\ntwo\n7\n5\n9\n0\n7'
run_cc_warnfree_case iife_contextual_return
run_fail_case iife_no_context_fail examples/iife_no_context_fail.ts "arrow function requires an explicit return type annotation"

run_case iife_closure_narrowing $'42\n30\n42\n10\n42\n3'
run_cc_warnfree_case iife_closure_narrowing
run_fail_case iife_closure_unnarrowed_fail examples/iife_closure_unnarrowed_fail.ts "narrow it first with"

run_case boolean_print $'true\nfalse\ntrue\ntrue'
run_case mod_check $'1\n1\n-1\n1.5'
run_case switch_check $'1699\n22'
run_case switch_case_block_exit $'10\n30\n99'
run_fail_case switch_case_block_fallthrough_fail examples/switch_case_block_fallthrough_fail.ts "case body must end with"
run_case number_format $'3.14\n0.30000000000000004\n1.5\n-1.5\n1e+21\n1e-7\n0.000001\n100000000000000000'
run_case number_to_string $'123\n0\n-12\n1e+21\n3.14\n0.30000000000000004\n42\nn=42\n4\n3\nnumber descriptor recv\n8'
run_fail_case number_to_string_arity_fail examples/number_to_string_arity_fail.ts "Number.toString expects no arguments"
run_fail_case number_unsupported_method_fail examples/number_unsupported_method_fail.ts "unsupported method '.toFixed' on topaz_number"
run_case string_basic $'hello, topaz!\n13\nabcdef\ntrue\ntrue\nwoof'
run_case array_basic $'3\n10\n30\n5\n40\n50\n99\n50\n4\n189\ntrue\nfalse\nalpha\ngamma\n3\n1\n7'
run_case array_nested $'1\n7\n2\n9\n2\n7\n1\n42\n2\n100'
run_case map_set_basic $'3\n2\ntrue\nfalse\n10\ntrue\n2\nfalse\n3\ntrue\nfalse\ntrue\n2\nfalse\nyes\nno\n2\ntrue\nfalse\ntrue\n50\n250\n490\n7'
run_case set_constructor_iterable $'3\ntrue\nfalse\n3\nfalse\ntrue\n4\ntrue\n2\ntrue\n1\ntrue'
run_case class_basic $'3\n4\n7\n30\n40\n99\n100\n555\n101\n557\n110\n575\nhello, topaz\nhello, topaz\n2'
run_case interface_basic $'circle\n36\nsquare\n25\n16\nrenamed\n6\n144\n8\n64\n4\n4'
run_case array_class_iface $'3\n1\n12\n12\n4\n99\n99\n3\n500\n2\nsquare\n9\ncircle\n16\n16\ncircle\n100\n0\n7\ncircle\n4'
run_case map_set_class_iface $'3\n2\n11\n11\ntrue\nfalse\n2\nfalse\n2\nsquare\n9\ncircle\n100\ncircle\n16\n2\ntrue\ntrue\nfalse\n1\nfalse\n2\ntrue\ntrue\nfalse\n1\nfalse\n60\n99\n1'
run_case generic_fn $'42\n7\nhi\nyo\ntrue\nfalse\n10\n30\nalpha\ngamma\ntwo\n2\n1\n99\nsolo\n1\n123\nzzz\n1\n777\n555'
run_case generic_class $'42\n42\n99\nhello\ntrue\n1\none\n3\n20\n99\nhello'
run_case try_catch_basic $'boom\n1\nnegative\n42\n10\n7\n100\n9\nrewrapped\n2\n0\n999'
run_case try_return $'10\n-1\n3\n99\n107\n10\nboom'
run_case try_finally $'try-normal\nfinally-normal\nnormal\ntry-throw\nfinally-throw\nboom\ntry-override\nfinally-override\ncleanup'
run_case try_finally_return $'try-value\nfinally-value\n5\ntry-void\nfinally-void\nfinally-ret-throw\nret-boom'
run_case try_catch_finally $'try-normal\nfinally-normal\nnormal\nafter-normal\ntry-caught\ncatch-caught\ntry boom\nfinally-caught\nafter-caught\ntry-catch-throw\noriginal\nfinally-catch-throw\ncatch throw\ntry-callee-throw\nouter\nfinally-callee-throw\ncallee throw\ntry-finally-override\nhandled\nfinally-override\nfinally throw'
run_case try_finally_break_continue $'1\n101\n201\n102\n3\n103\n203\n104\n4\n401\n302\n402\n502\n403\n422\n44\n21'
run_fail_case try_break_fail examples/try_break_fail.ts "\`break\` inside a \`try\` body is unsupported"
run_fail_case try_finally_return_in_finally_fail examples/try_finally_return_in_finally_fail.ts "\`return\` inside a \`finally\` block is unsupported"
run_fail_case try_finally_nested_return_fail examples/try_finally_nested_return_fail.ts "nested return through multiple finally cleanup contexts is unsupported"
run_fail_case try_catch_finally_return_fail examples/try_catch_finally_return_fail.ts "\`return\` inside a \`try/catch/finally\` try body is unsupported"
run_fail_case try_catch_finally_catch_return_fail examples/try_catch_finally_catch_return_fail.ts "\`return\` inside a \`try/catch/finally\` catch body is unsupported"
run_fail_case try_catch_finally_break_fail examples/try_catch_finally_break_fail.ts "\`break\` inside a \`try/catch/finally\` try body is unsupported"
run_fail_case try_finally_switch_continue_fail examples/try_finally_switch_continue_fail.ts "\`continue\` inside \`switch\` is unsupported"

run_case optional_basic $'false\ntrue\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue'
run_case optional_narrow $'10\n0\n10\n-1\n10\n0\n16\n7\n20\n99'
run_case optional_map_get $'10\n-1\n7\n0\nalpha\nabsent\n21\n-777'

run_case dunion_basic $'12\n9\ncircle\nsquare\ncircle\nsquare\n5\n7'
run_case dunion_common_field $'num a@0 num(42)\nop b@3 op(+)\neof c@5 eof\nb=3'
run_case compound_narrow $'false\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\nfalse'
run_case compound_carry_narrow $'(\n<mismatch>\n<mismatch>\nparen-(\n<other>\n<other>'
run_case dunion_init_narrow $'foo@3\n42@7\nident foo\nnum 42'
run_case dunion_widen $'12\n9\n12\n9'
run_case dunion_optional_object_literal $'ident x\npair a,b\nnone'
run_case string_literal_union $'stop\nskip\nstop'

run_case catch_unknown $'kaboom\n42\nfizz\nrethrow\ntrue\n99\nfalse'

run_case arena_stress $'1000\n0\n999\n1000\n42\n1200\n500\ntrue\n500'

run_case template_literal $'hello, topaz!\ntopaz is 42\nflag=true\ntopaz\ntopaz/42\n42true\npi=3.14\nsum=0.30000000000000004\nbig=1e+21\ntiny=1e-7\ntwice(42)=84\nlen(topaz)=5\nn+1=43\nanswer=7\n?=7\n(3, 4)\nnorm=25\nq="topaz"\ntab\there\n[0][1][2][3][4]'

run_case bigint_value_skeleton ""
run_case bigint_arithmetic $'579\n333\n-333\n56088\n-123\n123:-456\ntrue\ntrue\ntrue\ntrue'
run_case bigint_equality $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_case bigint_ordering $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_case bigint_unary_negation $'-12\n34\n0\ntrue\n-123456789012345678901234567890\n42'
run_case bigint_add_sub_prelude $'579\n333\n-333\n0\n18446744073709551617\n18446744073709551613\n123456789000000000\n42'
run_case bigint_mul_prelude $'0\n-408\n408\n56088\n18446744065119617025\n281474976710657'
run_case bigint_decimal_parse_prelude $'0\n12345\n340282366920938463463374607431768211455\n340282366920938463463374607431768211456\n121932631112635269'
run_case bigint_large_limb $'123456789012345678901234567890\n1111111110111111111011111111100\n864197532086419753208641975320\n1234567890123456789012345678900\ntrue\ntrue\n123456789012345678901234567890:987654321098765432109876543210'
run_case bigint_sign_zero $'0\n0\n0\ntrue\ntrue\ntrue\ntrue\n0\n30\n-30'
run_fail_case bigint_mixed_arithmetic_fail examples/bigint_mixed_arithmetic_fail.ts "mixed number/bigint operators are unsupported"
run_fail_case bigint_mixed_left_arithmetic_fail examples/bigint_mixed_left_arithmetic_fail.ts "mixed number/bigint operators are unsupported"
run_fail_case bigint_division_fail examples/bigint_division_fail.ts "bigint operator '/' is unsupported"
run_fail_case bigint_modulo_fail examples/bigint_modulo_fail.ts "bigint operator '%' is unsupported"
run_fail_case bigint_bitwise_fail examples/bigint_bitwise_fail.ts "expected expression"
run_fail_case bigint_shift_fail examples/bigint_shift_fail.ts "expected expression"
run_fail_case bigint_string_concat_fail examples/bigint_string_concat_fail.ts "string concatenation involving bigint is unsupported"
run_fail_case bigint_condition_fail examples/bigint_condition_fail.ts "expected topaz_boolean, got topaz_bigint"
run_fail_case bigint_non_decimal_fail examples/bigint_non_decimal_fail.ts "only decimal bigint literals are supported"
run_fail_case bigint_array_deferred_fail examples/bigint_array_deferred_fail.ts "no Array monomorph for element type topaz_bigint"
run_fail_case bigint_map_deferred_fail examples/bigint_map_deferred_fail.ts "no Map monomorph for key=topaz_string, value=topaz_bigint"
run_fail_case bigint_set_deferred_fail examples/bigint_set_deferred_fail.ts "no Set monomorph for element type topaz_bigint"
run_fail_case runtime_prelude_bigint_buffer_hidden_fail examples/runtime_prelude_bigint_buffer_hidden_fail.ts "unknown identifier '__topaz_bigint_buffer_new'"
run_fail_case regexp_literal_deferred_fail examples/regexp_literal_deferred_fail.ts "expected expression"
run_fail_case regexp_constructor_deferred_fail examples/regexp_constructor_deferred_fail.ts "\`new RegExp\` is unsupported"
run_fail_case regexp_string_test_deferred_fail examples/regexp_string_test_deferred_fail.ts "unsupported method '.test' on topaz_string"
run_case promise_type_annotation $'promise annotations\nready'
run_case promise_resolve_value $'number promise\nstring promise\nnumber promise\nstring promise\nresolve values\n42'
run_case promise_reject_value $'void rejection\nnumber rejection\nstring rejection\nreject values'
run_case promise_then_fulfilled $'sync\npromise returned\nthen number\n42\nthen string\nready'
run_case promise_catch_rejected $'sync tail\nfifo then\nfifo catch\nfifo\ncatch number\nnumber\nfulfilled bypass\n20\ncatch string\ncatch void\nvoid\ncatch throw\nthen number\n10\nthen string\nstring\nthen void\ncatch second\n7\nthen throw recovery\n99'
run_case promise_then_on_rejected $'sync tail\nfulfilled branch\n2\nrejected branch\nrecover\nvoid fulfilled\nthrowing fulfilled\nfulfilled then\n2\nrejected then\n7\nvoid then\nthrow recovery\n9\nthrow then\n9'
run_case promise_finally $'sync tail\ncleanup fulfilled\ncleanup rejected\ncleanup void\nfifo then\nfifo finally\ncleanup throw\nfulfilled value\n1\nrejected preserved\nsource\nvoid then\nfifo final then\n5\noverride catch\n77\nrejected recovery\n2\noverride then\n77'
run_case promise_then_return_promise $'sync tail\nfulfilled callback\nrejected callback\nouter callback\nfifo marker\nthrow callback\ninner callback\nthrow rejection\n9\nfulfilled result\n2\nreturned rejection\nreturned\nthrow result\n9\nrecovered result\n7\nouter result\n14'
run_case promise_then_return_promise_like $'sync tail\nfulfilled callback\nrejected callback\nfifo marker\nthrow callback\nthrow rejection\n9\nthrow result\n9\nfulfilled result\n2\nreturned rejection\nreturned\nrecovered result\n7'
run_case promise_catch_return_promise $'sync tail\nfulfilled bypass\n40\ncatch recover\nrecover\ncatch reject\ncatch nested\nfifo marker\ncatch throw\ninner nested\nthrow rejection\n12\nrecover result\n7\ncatch returned rejection\nreturned\nthrow result\n12\nreturned recovery\n9\nnested result\n5'
run_case promise_catch_return_promise_like $'sync tail\nfulfilled bypass\n40\ncatch recover like\nrecover like\ncatch reject like\ncatch nested like\nfifo marker like\ncatch throw like\ninner nested like\nthrow like rejection\n12\nthrow like result\n12\nrecover like result\n7\ncatch returned like rejection\nreturned like\nreturned like recovery\n9\nnested like result\n5'
run_case promise_then_two_handler_return_promise $'sync tail\nfulfilled branch\nrejected branch\nrecover\nfulfilled reject branch\nrejected reject branch\nfifo marker\nthrow branch\nthrow rejection\n9\nfulfilled result\n2\nrejected result\n7\nfulfilled returned rejection\nfulfilled returned\nrejected returned rejection\nrejected returned\nthrow result\n9\nfulfilled recovery\n11\nrejected recovery\n13'
run_case promise_then_two_handler_mixed_return $'sync tail\nfulfilled value branch\nrejected value branch\nrecover\nfifo marker\nfulfilled promise reject branch\nthrow value branch\nfulfilled value result\n2\nrejected value result\n7\nthrow rejection\n9\nforwarded rejection\nforwarded\nthrow result\n9\nforwarded recovery\n11'
run_case promise_then_undefined_handlers $'sync tail\nfulfilled explicit undefined\nrejected recovery\nrecover\nfulfilled bypass\n3\npromise recovery\npromise recover\nvoid fulfilled explicit undefined\nvoid recovery\nvoid recover\nfulfilled result\n2\nrejected result\n7\nvoid fulfilled result\nvoid recovery result\npromise recovery result\n11'
run_case promise_undefined_passthrough_handlers $'sync tail\nthen fulfilled\n10\nthen rejected\nthen rejected\ncatch fulfilled\n30\ncatch rejected\ncatch rejected\nfinally fulfilled\n50\nfinally rejected\nfinally rejected\nvoid then fulfilled\nthen recovery\n20\ncatch recovery\n40\nfinally recovery\n60'
run_case promise_handler_sentinel_normalization $'7\n8\n9\n10\n11\n12\n13\n14\n15'
run_case promise_like_type_annotation "callback"
run_case promise_like_container_annotation $'map\nset\nnested'
run_case promise_like_native_adapter $'param\nreturn\narray\nmap\nset\nfield\nnested'
run_case promise_container_annotation $'2\ntrue\ntrue\nnested'
run_case promise_iterator_annotation $'2\n2\n6\ntrue\n2\n0'
run_case promise_optional_extraction $'promise hit\npromise miss\npromise coalesce\npromise bang\nlike miss\nlike still missing\nexplicit absent\nexplicit coalesce'
run_case promise_array_extraction $'2\n2\n1\n2\n0'
run_case promise_field_extraction $'sync tail\nbox before\n10\nbox after\n20\nslot before\n30\nslot after\n40'
run_fail_case promise_iterator_nested_container_deferred_fail examples/promise_iterator_nested_container_deferred_fail.ts "Iterator<T>: element type topaz_array_promise_number is unsupported"
run_case promise_finally_return_promise $'sync tail\ncleanup fulfilled preserve\ncleanup rejected preserve\ncleanup fulfilled override\ncleanup rejected override\nnested cleanup start\nfifo marker\ncleanup throw before promise\nnested cleanup inner\nthrow override\n66\nfulfilled value\n1\npreserved rejection\nsource\nfulfilled override\nfulfilled cleanup\nrejected override\nrejected cleanup\nnested result\n5'
run_case promise_finally_return_promise_like $'sync tail\ncleanup like fulfilled preserve\ncleanup like rejected preserve\ncleanup like fulfilled override\ncleanup like rejected override\nnested like cleanup start\ncleanup like number\nfifo like marker\ncleanup like throw before promise\nnested like cleanup inner\nthrow like override\n77\nfulfilled like value\n1\npreserved like rejection\nsource like\nfulfilled like override\nfulfilled cleanup like\nrejected like override\nrejected cleanup like\nnumber like result\n6\nnested like result\n5'
run_case promise_finally_ignored_return $'sync tail\ncleanup number\ncleanup string\ncleanup boolean\ncleanup literal\nfifo then\nfifo finally\ncleanup throw\nfulfilled value\n10\nrejected string preserved\nsource string\nrejected bool preserved\nsource bool\nliteral result\n5\nfifo final then\n7\noverride catch\n88\nstring recovery\n2\nbool recovery\n3'
run_case async_function_no_await $'async body\nasync void body\nsync after calls\nthen answer\n42\nthen void'
run_case async_generic_no_await $'id body\nid body\nid body\nid body\npick body\npick body\nsync tail\nthen number\n42\nthen string\nready\nthen boolean\ntrue\nthen box\n7\nthen explicit second\n99\nthen inferred second\ninferred'
run_case async_generic_await_frame $'id before\nid before\nbind before\ncall before\nsync tail\nbind after\necho\nthen number\n42\nthen string\nready\nthen boolean\ntrue\nthen call\n7'
run_case async_arrow_no_await $'arrow body\nsync tail\nthen block\n42\nthen expr\n42'
run_case async_await_basic $'before await\nsync tail\nafter await\nthen answer\n42'
run_case async_await_two_bindings $'before a\nsync tail\nbetween\nafter b\nthen sum\n42'
run_case async_arrow_await $'before arrow await\nsync tail\nbetween arrow awaits\nafter arrow await\nthen arrow await\n42'
run_case async_method_no_await $'method body\nsync tail\nthen method\n42'
run_case async_method_await $'method before await\nsync tail\nmethod between awaits\nmethod after await\nthen method await\n42'
run_case async_return_await_terminal $'sync tail\ndeclared\n10\nmethod\n8\nexpr\n5\narrow\n22'
run_case async_return_await_expression $'sync tail\ndeclared\n42\nmethod\n9\nexpr\n10\narrow\n23'
run_case async_await_initializer_expression $'sync tail\narrow\n22\nmethod\n12\nexpr\n8\ndeclared\n42'
run_case async_await_initializer_binary_multiple $'decl left\narrow left\nmethod left\nexpr left\nsync tail\ndecl right\narrow right\nmethod right\nexpr right\ndecl after\n11\narrow after\n22\nmethod after\nm!\nexpr after\nxy\ndecl then\n11\narrow then\n22\nmethod then\nm!\nexpr then\nxy'
run_case async_return_binary_multiple_await $'decl left\narrow left\nmethod left\nexpr left\nsync tail\ndecl right\narrow right\nmethod right\nexpr right\ndecl then\n11\narrow then\n22\nmethod then\nm!\nexpr then\nxy'
run_case async_expression_statement_binary_multiple_await $'decl left\narrow left\nmethod left\nexpr left\nsync tail\ndecl right\narrow right\nmethod right\nexpr right\ndecl done\narrow done\nmethod done\nexpr done\ndecl then\narrow then\nmethod then\nexpr then'
run_case async_binary_operator_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit right\nreturn right\nstmt right\ninit result\n42\nstmt done\ninit then\n42\nreturn then\ntrue\nstmt then'
run_case async_binary_tree_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit middle\nreturn middle\nstmt middle\ninit right\nreturn right\nstmt right\ninit result\n6\nstmt done\ninit then\n6\nreturn then\n38\nstmt then'
run_case async_binary_mixed_pure_multiple_await $'init left\nreturn left\nstmt left\ncall left\nsync tail\ninit right\nreturn right\nstmt right\ncall right\ninit value\n15\nstmt done\nconsume\n42\ninit then\n15\nreturn then\n45\nstmt then\ncall then'
run_case async_binary_side_effect_snapshot_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit middle\ninit right\nreturn middle\nreturn right\nstmt middle\nstmt right\ninit value\n6\nstmt done\ninit then\n6\nreturn then\n60\nstmt then'
run_case async_array_side_effect_snapshot_multiple_await $'init first\nreturn first\nstmt first\nsync tail\ninit middle\ninit second\nreturn middle\nreturn second\nstmt middle\nstmt second\ninit result\n6\nstmt done\ninit then\n6\nreturn then\n60\nstmt then'
run_case async_object_side_effect_snapshot_multiple_await $'init left\nreturn left\nsync tail\ninit middle\ninit right\nreturn middle\nreturn right\ninit tail\ninit result\n10\nreturn tail\ninit then\n10\nreturn then\n100'
run_case async_object_nested_side_effect_snapshot_multiple_await $'init array left\nreturn array left\nsync tail\ninit array middle\ninit array right\nreturn array middle\nreturn array right\ninit object left\nreturn object left\ninit object middle\ninit object right\nreturn object middle\nreturn object right\ninit result\n66\ninit then\n66\nreturn then\n6600'
run_case async_array_literal_multiple_await $'init first\nreturn first\nstmt first\nsync tail\ninit second\nreturn second\nstmt second\ninit third\nreturn third\nstmt done\ninit fourth\nstmt then\ninit result\n10\nreturn then\n60\ninit then\n10'
run_case async_array_literal_mixed_pure_multiple_await $'init first\nreturn first\nstmt first\nsync tail\ninit second\nreturn second\nstmt second\ninit result\n21\nstmt done\ninit then\n21\nreturn then\n91\nstmt then'
run_case async_object_literal_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit right\nreturn right\nstmt right\ninit result\n3\nstmt done\ninit then\n3\nreturn then\n30\nstmt then'
run_case async_object_literal_mixed_pure_multiple_await $'init left\nreturn middle\nsync tail\ninit right\nreturn tail\ninit result\n16\ninit then\n16\nreturn then\n111'
run_case async_object_literal_shorthand_multiple_await $'init left\nreturn head\nsync tail\ninit right\nreturn tail\ninit result\n8\ninit then\n8\nreturn then\n110'
run_case async_object_literal_nested_array_multiple_await $'init first\nreturn first\nsync tail\ninit second\nreturn second\ninit result\n18\ninit then\n18\nreturn then\n100'
run_case async_object_literal_nested_object_multiple_await $'init left\nreturn head\nsync tail\ninit right\nreturn tail\ninit result\n8\ninit then\n8\nreturn then\n60'
run_case async_await_call_arg_binary_multiple $'stmt left\ninit left\nreturn left\nsync tail\nstmt post\ninit right\nreturn right\nstmt call\n3\ninit result\n7\nreturn call\n30\nstmt then\ninit then\n7\nreturn then\n30'
run_case async_call_arg_binary_side_effect_snapshot_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit middle\ninit right\nreturn middle\nreturn right\nstmt middle\nstmt right\ninit tail\ninit call\n10\nreturn tail\nstmt tail\nstmt call\n30\ninit then\n10\nreturn then\nA\nstmt then'
run_case async_call_arg_binary_snapshot_sibling_multiple_await $'init left\nreturn left\nstmt left\nsync tail\ninit tail\ninit between\ninit right\nreturn tail\nreturn between\nreturn right\nstmt tail\nstmt between\nstmt right\ninit call\n10\nreturn call\n100\nstmt call\n26\ninit then\n10\nreturn then\n100\nstmt then'
run_case async_call_arg_multiple_binary_snapshot_arguments $'init left\nreturn left\nstmt left\nsync tail\ninit tail\ninit between\ninit right\nreturn tail\nreturn between\nreturn right\nstmt tail\nstmt between\nstmt right\ninit right tail\ninit far\nreturn right tail\nreturn far\nstmt right tail\nstmt far\ninit direct\nreturn direct\nstmt direct\ninit call\n28\nreturn call\n280\nstmt call\n2800\ninit then\n28\nreturn then\n280\nstmt then'
run_case async_call_arg_nested_call_descriptor_await $'init left\nreturn left\nstmt left\nsync tail\ninit wrap\ninit right\nreturn wrap\nreturn right\nstmt wrap\nstmt right\ninit tail\ninit direct\nreturn tail\nreturn direct\nstmt tail\nstmt direct\ninit call\n20\nreturn call\n110\nstmt call\n1010\ninit then\n20\nreturn then\n110\nstmt then'
run_case async_await_synthetic_binary_call_arg $'char left\nparse left\njoin left\nsync tail\nchar right\nparse right\njoin right\nchar value\nA\njoin discarded\nchar then\nA\nparse then\n12\njoin then'
run_case async_await_call_arg_initializer $'declared pre\narrow pre\nmethod pre\nexpr pre\nsync tail\ndeclared post\ndeclared call\ndeclared read\n123\narrow post\narrow call\narrow read\n456\nmethod post\nmethod call\nmethod read\n789\nexpr post\nexpr call\nexpr read\n234\ndeclared then\n123\narrow then\n456\nmethod then\n789\nexpr then\n234'
run_case async_await_method_call_arg_initializer $'declared recv\ndeclared pre\narrow recv\narrow pre\nmethod recv\nmethod pre\nexpr recv\nexpr pre\nsync tail\ndeclared post\ndeclared call\ndeclared read\n1123\narrow post\narrow call\narrow read\n2456\nmethod post\nmethod call\nmethod read\n3789\nexpr post\nexpr call\nexpr read\n4234\ndeclared then\n1123\narrow then\n2456\nmethod then\n3789\nexpr then\n4234'
run_case async_return_call_arg_await $'declared pre\narrow pre\nmethod recv\nmethod pre\nexpr recv\nexpr pre\nsync tail\ndeclared post\ndeclared call\narrow post\narrow call\nmethod post\nmethod call\nexpr post\nexpr call\ndeclared then\n123\narrow then\n456\nmethod then\n3789\nexpr then\n4234'
run_case call_lowering_descriptor_baseline $'bare call\n3\ngeneric call\n4\nfn value call\n8\nclass method call\nclass method body\n12\ninterface method call\ninterface method body\n23\nasync pre\nsync tail\nasync read\n12\nasync then\n12'
run_case async_await_map_set_call_arg $'declared get recv\narrow has recv\nmethod has recv\nexpr return recv\ndelete return recv\nsync tail\ndeclared after\n10\narrow after\ntrue\nmethod after\ntrue\ndeclared then\n10\narrow then\ntrue\nmethod then\ntrue\nexpr then\ntrue\ndelete then\ntrue'
run_case async_await_string_call_arg $'declared char recv\narrow slice recv\nmethod slice recv\nmethod pre\nexpr repeat recv\nstarts recv\nreturn slice recv\nsync tail\ndeclared after\n98\narrow after\ncdef\nmethod after\nbcd\nexpr after\nxyxyxy\nstarts after\ntrue\ndeclared then\n98\narrow then\ncdef\nmethod then\nbcd\nexpr then\nxyxyxy\nstarts then\ntrue\nreturn then\ndef'
run_case async_await_expression_statement $'declared pre\narrow pre\nmethod pre\nexpr pre\nsync tail\ndeclared middle\narrow post\nmethod post\nexpr post\ndeclared post\narrow then\n22\nmethod then\n8\nexpr then\n8\ndeclared then\n11'
run_case async_await_call_statement $'declared pre\narrow pre\nmethod recv\nmethod pre\nexpr recv\nmap key recv\nmap value recv\nmap value pre\nset recv\nstring recv\nstring pre\nsync tail\ndeclared post\ndeclared call\n123\narrow call\n45\nmethod post\nmethod call\n789\nexpr call\n6\nmap key post\ndeclared then\narrow then\nmethod then\nexpr then\nmap key then\n20\nmap value then\n30\nset then\ntrue\nstring then'
run_case async_await_synthetic_call_arg $'declared pre\narrow pre\nmethod pre\nexpr pre\ninitializer pre\ndiscard pre\nsync tail\ndeclared log\ndeclared after\narrow after\nmethod after\ninitializer char\nB\ndiscard after\ndeclared then\narrow then\nmethod then\nexpr then\nA\ninitializer then\nB\ndiscard then'
run_case async_await_flat_builtin_call_arg $'declared pre\narrow pre\nmethod pre\nexpr pre\ndiscard pre\nsync tail\ndeclared parsed\n123\narrow parsed\n255\nmethod parsed\n2.5\ndiscard after\ndeclared then\n123\narrow then\n255\nmethod then\n2.5\nexpr then\n6.25\ndiscard then'
run_case async_await_path_url_call_arg $'declared pre\narrow pre\nmethod pre\nexpr pre\ndiscard pre\nsync tail\ndeclared dir\n/a\narrow base\nmain\nmethod ext\n.mjs\ndiscard after\ndeclared then\n/a\narrow then\nmain\nmethod then\n.mjs\nexpr then\n/tmp/a b.ts\ndiscard then'
run_case async_await_path_variadic_call_arg $'declared pre\narrow pre\nmethod pre\nexpr pre\ndiscard pre\ndiscard segment pre\nsync tail\ndeclared path\n/tmp/x\narrow path\n/tmp/pkg\nmethod path\na/b\ndiscard segment post\ndiscard after\ndeclared then\n/tmp/x\narrow then\n/tmp/pkg\nmethod then\na/b\nexpr then\na/b/c\ndiscard then'
run_case async_await_fs_read_metadata_call_arg $'declared pre\ndeclared path\narrow pre\narrow path\nmethod pre\nmethod path\nexpr pre\nexpr path\ndiscard pre\ndiscard path\nsync tail\ndeclared read\nhello\narrow exists\ntrue\ndiscard after\ndeclared then\nhello\narrow then\ntrue\nmethod then\nhello\nexpr then\ntrue\ndiscard then'
run_case async_await_fs_write_mkdir_call_arg $'declared pre\ndeclared path\narrow pre\narrow content\nmethod pre\nmethod path\nexpr pre\nexpr path\nsync tail\ndeclared wrote\narrow wrote\nmethod mkdir\nexpr wrote\ndeclared then\ndeclared text\narrow then\narrow text\nmethod then\ntrue\nexpr then\nexpr text'
run_case async_await_child_process_exec_call_arg $'declared pre\ndeclared cmd\narrow pre\narrow args\nmethod pre\nmethod cmd\nexpr pre\nexpr args\nsync tail\ndeclared child\ndeclared after\narrow child\narrow after\nmethod child\nmethod after\nexpr child\nexpr after\ndeclared then\narrow then\nmethod then\nexpr then'
run_case async_await_process_write_call_arg $'declared pre\ndeclared payload\narrow pre\narrow payload\nmethod raw pre\nmethod raw payload\nmethod public pre\nmethod public payload\nexpr pre\nexpr payload\nsync tail\ndeclared out\ndeclared after\narrow out\narrow after\nmethod raw after\nmethod public after\nexpr after\ndeclared then\narrow then\nmethod raw then\nmethod public then\nexpr then'
run_case async_await_array_method_call_arg $'declared recv\narrow recv\nmethod recv\nexpr recv\ndiscard recv\nsync tail\ndeclared after\ntrue\narrow after\n2\n2\n3\nmethod after\nred|blue|green\ndiscard after\ndeclared then\ntrue\narrow then\n2\nmethod then\nred|blue|green\nexpr then\n2\n3\ndiscard then\ntrue'
run_case async_await_array_callback_method_call_arg $'map recv\nmap await\nfilter recv\nfilter await\nreturn recv\nreturn await\ndiscard recv\ndiscard await\nsync tail\nmap after\n4\n11\n14\nfilter after\n2\n3\ndiscard after\nmap then\n4\nfilter then\n2\nreturn then\n4\n2\ndiscard then'
run_case async_await_array_receiver_callback_arg $'map receiver\nfilter receiver\nreturn receiver\ndiscard receiver\nsync tail\nmap callback wait\nfilter callback wait\nreturn callback wait\ndiscard callback wait\nmap callback\nmap callback\nmap callback\nmap callback\nmap after\n4\n11\n14\nfilter callback\nfilter callback\nfilter callback\nfilter callback\nfilter after\n2\n3\nmap callback\nmap callback\nmap callback\nmap callback\nfilter callback\nfilter callback\nfilter callback\nfilter callback\ndiscard after\nmap then\n4\nfilter then\n2\nreturn then\n4\n2\ndiscard then'
run_case async_await_string_receiver_index_of $'decl recv\narrow recv\nmethod recv\ndiscard recv\nsync tail\ndecl search\narrow search\nmethod search\ndiscard search\ndecl result\n1\nmethod result\n2\ndiscard after\ndecl then\n1\narrow then\n2\nmethod then\n2\ndiscard then'
run_case async_await_collection_receiver_arg $'decl recv\narrow recv\nmethod recv\ndiscard recv\nsync tail\ndecl key\narrow key\nmethod value\ndiscard value\ndecl result\n10\nmethod result\ntrue\ndiscard after\nfalse\ndecl then\n10\narrow then\ntrue\nmethod then\ntrue\ndiscard then'
run_case async_await_array_push_call_arg $'declared recv\ndeclared awaited\narrow recv\narrow prefix\narrow awaited\nmethod awaited\nexpr recv\nexpr prefix\nexpr awaited\nsync tail\ndeclared after\n1\n1\narrow after\n2\n10\n20\nmethod after\n2\n30\nexpr suffix\nexpr after\n3\n40\n50\n60\ndeclared then\n1\narrow then\n2\nmethod then\n2\nexpr then\n3'
run_case async_await_promise_resolve_call_arg $'declared pre\narrow pre\nmethod pre\nexpr pre\nsync tail\ndeclared after\nmethod flattened\nmethod after\nexpr after\ndeclared then\narrow then\nmethod then\nexpr then\n11\n22'
run_case async_await_promise_reject_call_arg $'declared pre\ndeclared await\narrow pre\narrow await\nmethod pre\nmethod await\nexpr pre\nexpr await\nsync tail\ndeclared after\ndeclared error\ndeclared outer then\narrow outer then\nmethod outer then\nexpr outer then\ndeclared recovered\n11\narrow error\narrow rejected\nmethod error\nexpr error\nmethod recovered\nexpr recovered\n44'
run_case async_await_promise_reject_operand $'binding pre\ndeclared pre\narrow pre\nmethod pre\nsync tail\nbinding error\nbinding caught\ndeclared error\narrow error\nmethod error\ndeclared recovered\n11\narrow recovered\nmethod recovered\n22'
run_case async_await_assignment_statement $'declared pre\narrow pre\nmethod pre\nexpr pre\narray pre\nsync tail\ndeclared post\narrow post\nmethod post\nexpr post\narray post\ndeclared then\n11\narrow then\n22\nmethod then\n35\nexpr then\n44\narray then\n66'
run_case async_await_string_index_of_return $'return search\nsync tail\nthen\n1'
run_case async_await_method_receiver $'return before\nreturn receiver\ndecl receiver\niface receiver\ndiscard receiver\nsync tail\nreturn arg\ndecl arg\ndecl method\ndecl value\n15\niface arg\niface method\ndiscard arg\ndiscard method\ndiscard after\nreturn then\n1\ndecl then\n15\niface then\n23\ndiscard then'
run_case async_await_method_receiver_arg $'decl recv\narrow recv\nmethod recv\nexpr recv\ndiscard recv\niface discard recv\nsync tail\ndecl pre\ndecl arg\narrow pre\narrow arg\nmethod left\nexpr left\ndiscard pre\ndiscard arg\niface discard arg\ndecl post\ndecl call\ndecl read\n1123\narrow post\narrow call\narrow read\n2234\nmethod mid\nmethod right\nexpr mid\nexpr right\ndiscard call\n17\ndiscard after\niface discard post\niface discard call\n21\niface discard after\ndecl then\n1123\narrow then\n2234\nmethod call\nexpr call\ndiscard then\niface discard then\nmethod then\n3456\nexpr then\n4567'
run_case async_await_assignment_rhs_expression $'local pre\nexpr pre\nmethod pre\nstring pre\nsync tail\nlocal post\nexpr post\nmethod post\nstring post\nlocal then\n3\nexpr then\n15\nmethod then\n27\nstring then\nab'
run_case async_await_call_arg_expression $'sync tail\nbare call\n3\nchar\nA\nparse\n12\npath\n/tmp/xy\nbare then\nstatic then\nA\nparser then\n12\npath then\n/tmp/xy\nreturn then\ndef'
run_case async_await_call_arg_multiple $'decl pre\narrow pre\nmethod pre\nexpr pre\nreturn pre\ndiscard pre\nsync tail\ndecl mid\narrow mid\nmethod mid\nexpr mid\nreturn mid\ndiscard mid\ndecl post\ndecl read\n12345\narrow post\narrow read\n23456\nmethod post\nmethod read\n34567\nexpr post\nexpr read\n45678\nreturn post\ndiscard post\ndiscard call\n15\ndecl then\n12345\narrow then\n23456\nmethod then\n34567\nexpr then\n45678\nreturn then\n56789\ndiscard then'
run_case async_await_method_call_arg_multiple $'decl recv\ndecl pre\narrow recv\narrow pre\nmethod recv\nmethod pre\nexpr recv\nexpr pre\nreturn recv\nreturn pre\ndiscard recv\ndiscard pre\nsync tail\ndecl mid\narrow mid\nmethod mid\nexpr mid\nreturn mid\ndiscard mid\ndecl post\ndecl call\ndecl read\n112345\narrow post\narrow call\narrow read\n223456\nmethod post\nmethod call\nmethod read\n334567\nexpr post\nexpr call\nexpr read\n445678\nreturn post\nreturn call\ndiscard post\ndiscard call\n15\ndiscard after\ndecl then\n112345\narrow then\n223456\nmethod then\n334567\nexpr then\n445678\nreturn then\n556789\ndiscard then'
run_case async_await_call_arg_pre_sibling_temp $'bare pre\ndiscard pre\nchar pre\nparse pre\nincludes recv\nincludes pre\nreturn pre\nsync tail\nbare call\n3\ndeclared after\ndiscard call\n9\ndiscard after\nchar after\nA\nparse after\n12\nincludes after\ntrue\ndeclared then\n3\ndiscard then\nstatic then\nA\nparser then\n12\nincludes then\ntrue\nreturn then\nB'
run_case async_await_call_arg_post_sibling $'method recv\nsync tail\ninit post\nread call\n3\ninitializer after\ndiscard post\nread call\n9\ndiscard after\nstatic post\nstatic after\nA\nmethod post\ninitializer then\n3\ndiscard then\nstatic then\nA\nterminal then\n99'
run_case async_await_local_compound_assignment $'local pre\narrow pre\nmethod pre\nexpr pre\nstring pre\nsync tail\narrow post\nmethod post\nexpr post\narrow then\n5\nmethod then\n21\nexpr then\n42\nstring post\nstring then\ntopaz ok\nlocal post\nlocal then\n2'
run_case async_await_class_field_compound_assignment $'this pre\nobject pre\narrow pre\nstring pre\nexpr pre\nsync tail\narrow post\nexpr post\nobject post\narrow then\n12\nstring post\nexpr then\n37\nobject then\n48\nstring then\ntopaz ok\nthis post\nthis then\n2'
run_case async_await_interface_field_compound_assignment $'sync pre\n3.5\ntop sync\ndecl pre\narrow pre\nmethod pre\nexpr pre\nsync tail\nmethod post\nexpr post\nfifo marker\narrow post\nmethod then\n17\nexpr then\n34\narrow then\ntopaz ok\ndecl post\ndecl then\n2'
run_case async_await_array_element_compound_assignment $'sync pre\n15\n1\ntop\ndecl pre\narrow pre\nmethod pre\nexpr pre\nsync tail\nmethod post\nexpr post\nfifo marker\narrow post\nmethod then\n25\nexpr then\n34\narrow then\ntopaz ok\ndecl post\ndecl then\n2'
run_case async_call_arg_recursive_nested_call_descriptor_await $'init left\nreturn left\nstmt left\nsync tail\ninit inner\ninit middle\ninit outer\ninit right\nreturn inner\nreturn middle\nreturn outer\nreturn right\nstmt inner\nstmt middle\nstmt outer\nstmt right\ninit tail\ninit direct\nreturn tail\nreturn direct\nstmt tail\nstmt direct\ninit call\n40\nreturn call\n130\nstmt call\n1030\ninit then\n40\nreturn then\n130\nstmt then'
run_case async_call_arg_awaited_nested_receiver_descriptor_await $'init receiver\nreturn receiver\nstmt receiver\nsync tail\ninit arg\nreturn arg\nstmt arg\ninit method\n1\ninit wrap\ninit sibling\nreturn method\n10\nreturn wrap\nreturn sibling\nstmt method\n100\nstmt wrap\nstmt sibling\ninit call\n113\nreturn call\n160\nstmt call\n410\ninit then\n113\nreturn then\n160\nstmt then'
run_case async_call_arg_nested_snapshot_leaf_descriptor_await $'init left\nreturn left\nstmt left\nsync tail\ninit inner\nreturn inner\nstmt inner\ninit nested\ninit snapshot\ninit right\nreturn nested\nreturn middle\nreturn snapshot\nreturn right\nstmt nested\nstmt snapshot\nstmt right\ninit call\n26\nreturn call\n90\nstmt call\n620\ninit then\n26\nreturn then\n90\nstmt then'
run_case async_call_arg_contextual_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_array_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_nested_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_deep_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_deeper_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_deepest_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_array_object_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case async_call_arg_contextual_object_array_spread_snapshot_leaf_descriptor_await $'left\nsync tail\ninner\nnested\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_case await_call_arg_nested_snapshot_array_spread_call_source_leaf $'left\nsync tail\ninner\nitems\n2\nreadBox\n12\nsnapshot\n112\nright\ncombine\n123\n3\nthen\n1126'
run_fail_case async_function_deferred_fail examples/async_function_deferred_fail.ts "await expression lowering is deferred"
run_case await_object_literal_mixed_side_effect_deferred_fail $'left\nsync tail\nmiddle\nright\ntail\ndone\nthen'
run_case await_object_literal_nested_array_side_effect_deferred_fail $'left\nsync tail\nmiddle\nright\ntail\ndone\nthen'
run_case await_object_literal_nested_object_side_effect_deferred_fail "2"
run_case await_object_literal_statement_nested_object_side_effect_snapshot $'left\nsync tail\nmiddle\nright\ntail\ndone\nthen'
run_case await_object_literal_statement_nested_object_assignment_deferred_fail "2"
run_case await_object_literal_statement_mixed_pure $'left\nsync tail\nright\ndone\nthen'
run_case await_object_literal_statement_shorthand_deferred_fail $'left\nsync tail\nright\ndone\nthen'
run_case await_object_literal_statement_nested_array_deferred_fail $'left\nsync tail\nmiddle\nright\ndone\nthen'
run_case await_object_literal_statement_nested_object_deferred_fail $'left\nsync tail\nmiddle\nright\ndone\nthen'
run_fail_case async_await_class_field_compound_assignment_side_effect_receiver_fail examples/async_await_class_field_compound_assignment_side_effect_receiver_fail.ts "property assignment requires a simple base"
run_fail_case async_await_interface_field_compound_assignment_side_effect_receiver_fail examples/async_await_interface_field_compound_assignment_side_effect_receiver_fail.ts "property assignment requires a simple base"
run_fail_case async_await_interface_field_compound_assignment_multiple_fail examples/async_await_interface_field_compound_assignment_multiple_fail.ts "await expression lowering is deferred"
run_fail_case async_await_interface_field_compound_assignment_type_mismatch_fail examples/async_await_interface_field_compound_assignment_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case async_await_array_element_compound_assignment_side_effect_receiver_fail examples/async_await_array_element_compound_assignment_side_effect_receiver_fail.ts "array element assignment requires a simple receiver"
run_fail_case async_await_array_element_compound_assignment_side_effect_index_fail examples/async_await_array_element_compound_assignment_side_effect_index_fail.ts "array element assignment requires a simple index"
run_fail_case async_await_array_element_compound_assignment_multiple_fail examples/async_await_array_element_compound_assignment_multiple_fail.ts "await expression lowering is deferred"
run_fail_case async_await_array_element_compound_assignment_type_mismatch_fail examples/async_await_array_element_compound_assignment_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case await_expression_deferred_fail examples/await_expression_deferred_fail.ts "\`await\` requires an async function"
run_fail_case await_non_promise_fail examples/await_non_promise_fail.ts "await operand must be Promise<T>, got topaz_number"
run_fail_case await_multiple_deferred_fail examples/await_multiple_deferred_fail.ts "await expression lowering is deferred"
run_case await_binary_mixed_side_effect_deferred_fail "middle"
run_case await_array_literal_mixed_side_effect_deferred_fail "middle"
run_fail_case await_initializer_multiple_deferred_fail examples/await_initializer_multiple_deferred_fail.ts "await expression lowering is deferred"
run_case await_object_literal_statement_deferred_fail "middle"
run_case await_call_arg_multiple_deferred_fail $'left\nsync tail\nassign\nright\nread counter\n2\ncombine\n3\n3\n2\nthen\n332'
run_case await_call_arg_assignment_property_deferred_fail $'left\nsync tail\nrhs replace\nright\ncombine\n3\n3\n2\n100\nthen\n3420'
run_case await_call_arg_assignment_interface_deferred_fail $'left\nsync tail\nrhs replace\nright\ncombine\n3\n3\n2\n100\nthen\n3420'
run_case await_call_arg_assignment_array_element_deferred_fail $'left\nsync tail\nassign\nright\ncombine\n3\n3\n2\n0\n50\n60\n1\nthen\n119'
run_case await_call_arg_assignment_array_element_compound_deferred_fail $'left\nsync tail\nassign\nright\ncombine\n4\n3\n3\nthen\n433'
run_case await_call_arg_assignment_non_array_compound $'local rhs\nsync tail\nlocal right\nlocal combine\n10\n0\n10\nclass left\nclass rhs\nclass right\nclass combine\n13\n3\n12\niface left\niface rhs\niface right\niface combine\n27\n4\n25\nthen\n5117'
run_fail_case await_call_arg_nested_snapshot_array_spread_conditional_source_deferred_fail examples/await_call_arg_nested_snapshot_array_spread_conditional_source_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_call_arg_builtin_deferred_fail examples/await_call_arg_builtin_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_call_arg_fs_write_deferred_fail examples/await_call_arg_fs_write_deferred_fail.ts "writeFileSync returns void and cannot be used as a value"
run_case await_call_arg_string_static_deferred_fail $'mixed\npost'
run_case await_call_arg_nested_flat_builtin_deferred_fail $'mixed\npost'
run_case await_call_arg_path_variadic_deferred_fail $'mixed\npost'
run_fail_case await_call_arg_pre_sibling_mirror_deferred_fail examples/await_call_arg_pre_sibling_mirror_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_call_arg_child_process_deferred_fail examples/await_call_arg_child_process_deferred_fail.ts "execFileSync returns void and cannot be used as a value"
run_fail_case await_call_arg_process_write_deferred_fail examples/await_call_arg_process_write_deferred_fail.ts "process.stdout.write returns void and cannot be used as a value"
run_case await_call_arg_method_deferred_fail $'map receiver\nfilter receiver\nsync tail\nmap arg\nfilter arg\nmap materialize\nmap callback\nmap callback\nmap callback\nmap callback\nmap after\n4\n12\nfilter materialize\nfilter callback\nfilter callback\nfilter callback\nfilter callback\nfilter after\n2\n3\nmap then\n12\nfilter then\n2'
run_fail_case await_call_arg_array_includes_nested_callback_deferred_fail examples/await_call_arg_array_includes_nested_callback_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_call_arg_collection_void_deferred_fail examples/await_call_arg_collection_void_deferred_fail.ts "Map.set returns void in this dialect and cannot be used as a value"
run_case await_collection_receiver_arg_nested_deferred_fail $'decl recv\nreturn recv\nsync tail\ndecl box\nreturn box\nidentity call\ndecl key\nidentity call\nreturn key\nnested key call\ndecl result\n1\nnested key call\ndecl then\n1\nreturn then\ntrue'
run_fail_case await_collection_receiver_arg_conditional_deferred_fail examples/await_collection_receiver_arg_conditional_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_call_arg_array_push_deferred_fail examples/await_call_arg_array_push_deferred_fail.ts "Array.push returns void in this dialect and cannot be used as a value"
run_fail_case await_promise_reject_no_context_fail examples/await_promise_reject_no_context_fail.ts "Promise.reject requires a contextual Promise<T> target"
run_case await_return_expr_deferred_fail "middle"
run_case await_expression_statement_deferred_fail $'middle\n6'
run_case await_binary_property_assignment_side_effect_deferred_fail $'2\n6'
run_fail_case await_binary_interface_assignment_side_effect_deferred_fail examples/await_binary_interface_assignment_side_effect_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_binary_array_element_assignment_side_effect_deferred_fail examples/await_binary_array_element_assignment_side_effect_deferred_fail.ts "await expression lowering is deferred"
run_fail_case await_try_deferred_fail examples/await_try_deferred_fail.ts "await inside try/catch/finally is deferred"
run_fail_case async_function_wrong_return_fail examples/async_function_wrong_return_fail.ts "async function return annotation must be Promise<T>"
run_fail_case async_function_return_promise_fail examples/async_function_return_promise_fail.ts "type mismatch: expected topaz_number, got topaz_promise_number"
run_fail_case async_arrow_deferred_fail examples/async_arrow_deferred_fail.ts "await expression lowering is deferred"
run_fail_case async_method_deferred_fail examples/async_method_deferred_fail.ts "await expression lowering is deferred"
run_fail_case async_generic_deferred_fail examples/async_generic_deferred_fail.ts "await expression lowering is deferred"
run_fail_case promise_then_on_rejected_param_fail examples/promise_then_on_rejected_param_fail.ts "Promise.then onRejected callback parameter type"
run_fail_case promise_then_on_rejected_return_mismatch_fail examples/promise_then_on_rejected_return_mismatch_fail.ts "Promise.then onRejected callback return type topaz_string does not match fulfilled callback return type topaz_number"
run_fail_case promise_then_on_rejected_return_promise_fail examples/promise_then_on_rejected_return_promise_fail.ts "Promise.then onRejected callback normalized return payload topaz_string does not match fulfilled callback payload topaz_number"
run_fail_case promise_then_two_handler_return_promise_fail examples/promise_then_two_handler_return_promise_fail.ts "Promise.then onRejected callback normalized return payload topaz_string does not match fulfilled callback payload topaz_number"
run_fail_case promise_then_two_handler_return_promise_mismatch_fail examples/promise_then_two_handler_return_promise_mismatch_fail.ts "Promise.then onRejected callback return type topaz_promise_string does not match fulfilled callback return type topaz_promise_number"
run_case promise_then_sentinel_return_promise_like $'sync tail\nundefined fulfilled callback\nnull fulfilled callback\nsentinel source rejection\nsource\nreturned rejection callback\nthrow callback\nsentinel recovery result\n7\nthrow rejection\n9\nthrow recovery result\n9\nundefined fulfilled result\n2\nnull fulfilled result\n3\nreturned rejection\nreturned\nreturned recovery result\n9'
run_case promise_then_two_handler_return_promise_like $'sync tail\nboth like fulfilled callback\nboth like rejected callback\nboth like source\nvalue like rejected callback\nvalue like source\nlike value fulfilled callback\npromise like rejected callback\npromise like source\nlike promise rejected callback\nlike promise source\nreturned rejected like callback\nthrow rejected callback\nfifo marker two handler\nthrow rejection observed\n88\nlike promise result\n56\nthrow recovery result\n88\nboth like fulfilled result\n2\nboth like rejected result\n12\nvalue like result\n23\nlike value result\n34\npromise like result\n45\nreturned rejection observed\nreturned rejection\nreturned recovery result\n79'
run_fail_case promise_then_two_handler_return_promise_like_mismatch_fail examples/promise_then_two_handler_return_promise_like_mismatch_fail.ts "Promise.then onRejected callback normalized return payload topaz_string does not match fulfilled callback payload topaz_number"
run_case promise_then_rejected_sentinel_return_promise_like $'sync tail\nfulfilled undefined bypass\n20\nfulfilled null bypass\n30\nundefined rejected callback\nrecover undefined\nnull rejected callback\nrecover null\nreturned rejected callback\nthrow rejected callback\nfifo marker rejected sentinel\nthrow rejection observed\n11\nthrow recovery result\n11\nundefined recovery result\n7\nnull recovery result\n8\nreturned rejection observed\nreturned rejection\nreturned recovery result\n9'
run_fail_case promise_then_rejected_sentinel_return_promise_like_fail examples/promise_then_rejected_sentinel_return_promise_like_fail.ts "Promise.then onRejected callback normalized return payload topaz_string does not match source payload topaz_number"
run_fail_case promise_then_undefined_on_rejected_mismatch_fail examples/promise_then_undefined_on_rejected_mismatch_fail.ts "Promise.then onRejected callback normalized return payload topaz_string does not match source payload topaz_number"
run_fail_case null_expression_fail examples/null_expression_fail.ts "unsupported expression (null_lit)"
run_fail_case promise_then_wrong_arity_fail examples/promise_then_wrong_arity_fail.ts "Promise.then expects one or two arguments, got 3"
run_fail_case promise_then_non_fn_fail examples/promise_then_non_fn_fail.ts "Promise.then callback must be a function value"
run_fail_case promise_catch_deferred_fail examples/promise_catch_deferred_fail.ts "Promise.catch callback parameter type"
run_fail_case promise_catch_return_mismatch_fail examples/promise_catch_return_mismatch_fail.ts "Promise.catch callback return type topaz_string does not match expected topaz_number"
run_fail_case promise_catch_return_promise_fail examples/promise_catch_return_promise_fail.ts "Promise.catch callback return type topaz_promise_string does not match expected topaz_promise_number"
run_fail_case promise_catch_return_promise_like_fail examples/promise_catch_return_promise_like_fail.ts "Promise.catch callback return type topaz_promise_like_string does not match expected topaz_promise_like_number"
run_fail_case promise_catch_wrong_arity_fail examples/promise_catch_wrong_arity_fail.ts "Promise.catch expects exactly one argument, got 0"
run_fail_case promise_finally_wrong_arity_fail examples/promise_finally_wrong_arity_fail.ts "Promise.finally expects exactly one argument, got 0"
run_fail_case promise_finally_parameter_fail examples/promise_finally_parameter_fail.ts "Promise.finally callback arity 1 does not match expected 0"
run_fail_case promise_finally_non_void_return_fail examples/promise_finally_non_void_return_fail.ts "Promise.finally callback must return void, Promise<T>, PromiseLike<T>, or an ignored primitive value, got topaz_class_PlainCleanup"
run_fail_case promise_finally_return_promise_fail examples/promise_finally_return_promise_fail.ts "Promise.finally callback must return void, Promise<T>, PromiseLike<T>, or an ignored primitive value, got topaz_class_ThenableCleanup"
run_fail_case promise_finally_non_fn_fail examples/promise_finally_non_fn_fail.ts "Promise.finally callback must be a function value"
run_fail_case promise_resolve_wrong_arity_fail examples/promise_resolve_wrong_arity_fail.ts "Promise.resolve expects 0..1 argument(s), got 2"
run_fail_case promise_resolve_undefined_fail examples/promise_resolve_undefined_fail.ts "Promise.resolve payload type topaz_undefined is unsupported"
run_case promise_resolve_promise_flatten $'sync tail\nnested flattened\n11\nrejected forwarded\nnative rejected\nfulfilled source\n33\nfulfilled forwarded\n34\nscalar preserved\n56\nrejected recovery\n22\nlike bridge\n45'
run_fail_case promise_resolve_structural_thenable_fail examples/promise_resolve_structural_thenable_fail.ts "type mismatch: expected topaz_promise_number, got topaz_promise_class_StructuralThenable"
run_case promise_like_await_deferred_fail $'direct before\nsync tail\ndirect after\ndirect then\n11\nterminal then\n20'
run_case promise_like_optional_await_deferred_fail $'sync tail\noptional missing\n0\noptional present\n32'
run_case promise_like_array_await_deferred_fail $'sync tail\narray then\n43'
run_case promise_like_field_await_deferred_fail $'sync tail\nfield then\n50'
run_fail_case promise_like_async_return_fail examples/promise_like_async_return_fail.ts "async function return annotation must be Promise<T>; PromiseLike<T> bridge is deferred"
run_case promise_like_resolve_deferred_fail $'sync tail\nassign\n11\nreturn\n22'
run_fail_case promise_like_structural_adapter_fail examples/promise_like_structural_adapter_fail.ts "expected identifier"
run_fail_case promise_like_unknown_payload_fail examples/promise_like_unknown_payload_fail.ts "PromiseLike<T>: payload type topaz_unknown is unsupported"
run_fail_case promise_like_map_key_deferred_fail examples/promise_like_map_key_deferred_fail.ts "no Map monomorph for key=topaz_promise_like_number, value=topaz_number"
run_fail_case promise_map_key_deferred_fail examples/promise_map_key_deferred_fail.ts "no Map monomorph for key=topaz_promise_number, value=topaz_string"
run_fail_case promise_reject_no_context_fail examples/promise_reject_no_context_fail.ts "Promise.reject requires a contextual Promise<T> target"
run_fail_case promise_reject_non_class_fail examples/promise_reject_non_class_fail.ts "Promise.reject error must be a class instance"
run_fail_case promise_reject_wrong_arity_fail examples/promise_reject_wrong_arity_fail.ts "Promise.reject expects exactly one argument, got 2"
run_fail_case promise_payload_unknown_deferred_fail examples/promise_payload_unknown_deferred_fail.ts "Promise<T>: payload type topaz_unknown is unsupported"
run_fail_case for_await_deferred_fail examples/for_await_deferred_fail.ts "expected '('"

run_case for_of_array $'15\n-7\n0\n2\n9\n3\nalpha\nbeta\ngamma\n102\n101\n103\nsquare\ncircle\n25\ntrue\n4'

run_case for_of_set $'15\n15\n15\n0\n100\n14\n7\n60\n2\n387\n115'

run_case for_of_map_values $'60\n6\n60\n0\n6\n50\n13\n400\n60\n20\n129'

run_case for_of_entries $'140\n606\n116\n220\n20\n40\n0\n402\n141\n63\n30\n30\n12\n366'

run_case iterator_basic $'60\n3\n6\n6\n300\nfalse\n17\n3\n60\n6'

run_case non_null_and_coalesce $'10\n25\ntrue\n7\nalpha\n10\n-1\n20\n110\n7\n99\nalpha\ndefault\nhello\n?\n20\n-1\n20'

run_case optional_chain $'10\n-1\nalpha\n(none)\nalpha\n(none)\n30\n0\n5\n-1\ngreeting\n(none)\n7\n0\n100\n300\n-1\n2\n-1\n-1\n20\nalpha'

run_case arrow_basic $'42\n42\ntrue\nfalse\n7\nhello, topaz\n100\n6\n7\n11\n12\n50\n75\n36\n100\n17\n123\ntopaz:ok'
run_case arrow_this_capture $'15\n25\n21\n31'
run_fail_case this_outside_class_fail examples/this_outside_class_fail.ts "\`this\` is only valid inside class methods or constructors"

run_case array_method_map $'2\n4\n6\n3\n9\n2\n4\nn=1\nn=3\ntrue\nfalse\n10\n30\n100\n300\n300\n0\n20\n40\n101\n301\n10\n21\n32\n1\n3\n5'

run_case array_method_filter $'3\n1\n5\n2\n2\n4\n2\n1\n2\n3\nalpha\ndelta\n3\ntrue\ntrue\n2\n4\n2\n50\n100\n0\n0\n3\n2\n4\n3\n10\n50'

run_case array_method_includes $'true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\ntrue\nfalse\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse'

run_case array_method_slice $'3\n20\n40\n3\n30\n50\n5\n10\n50\n2\n40\n50\n4\n10\n40\n2\n30\n40\n0\n0\n2\n40\n50\n0\n2\nbeta\ngamma\n1\n99\n777\n2\n20\n30\n2\n20\n30\n3\n4\n99'

run_case map_number_same_value_zero $'11\n22\n33\ntrue\ntrue\nfalse\ntrue\ntrue\ntrue\nfalse\n3'

run_case array_method_join $'1,2,3\n5\n1, 2, 3\n7\n123\n3\n1 -> 2 -> 3\nalpha-beta-gamma\nalpha,beta,gamma\ntrue,false,true\ntrue | false | true\n\n0\n0\n42\n2\n3.14,0,-1.5\n2,4,6\n2-3\n2,3\n[1,2,3]\n1:2:3\n10:20'

run_module_case module_basic examples/module_basic_main.ts $'7\n11\n12\n12\n25\n25'
run_module_case module_function_collision examples/module_function_collision_main.ts $'15\n10\n17'
run_fail_case runtime_prelude_hidden_fail examples/runtime_prelude_hidden_fail.ts "unknown identifier '__topaz_runtime_prelude_init'"
run_fail_case runtime_prelude_boolean_to_string_hidden_fail examples/runtime_prelude_boolean_to_string_hidden_fail.ts "unknown identifier '__topaz_boolean_to_string'"
run_fail_case runtime_prelude_boolean_hash_hidden_fail examples/runtime_prelude_boolean_hash_hidden_fail.ts "unknown identifier '__topaz_boolean_hash'"
run_fail_case runtime_prelude_boolean_key_eq_hidden_fail examples/runtime_prelude_boolean_key_eq_hidden_fail.ts "unknown identifier '__topaz_boolean_key_eq'"
run_fail_case runtime_prelude_number_key_eq_hidden_fail examples/runtime_prelude_number_key_eq_hidden_fail.ts "unknown identifier '__topaz_number_key_eq'"
run_fail_case runtime_prelude_starts_with_hidden_fail examples/runtime_prelude_starts_with_hidden_fail.ts "unknown identifier '__topaz_string_starts_with'"
run_fail_case runtime_prelude_ends_with_hidden_fail examples/runtime_prelude_ends_with_hidden_fail.ts "unknown identifier '__topaz_string_ends_with'"
run_fail_case runtime_prelude_trim_start_hidden_fail examples/runtime_prelude_trim_start_hidden_fail.ts "unknown identifier '__topaz_string_trim_start'"
run_fail_case runtime_prelude_path_extname_hidden_fail examples/runtime_prelude_path_extname_hidden_fail.ts "unknown identifier '__topaz_path_extname'"
run_fail_case runtime_prelude_path_dirname_hidden_fail examples/runtime_prelude_path_dirname_hidden_fail.ts "unknown identifier '__topaz_path_dirname'"
run_fail_case runtime_prelude_path_basename_hidden_fail examples/runtime_prelude_path_basename_hidden_fail.ts "unknown identifier '__topaz_path_basename'"
run_fail_case runtime_prelude_path_basename_ext_hidden_fail examples/runtime_prelude_path_basename_ext_hidden_fail.ts "unknown identifier '__topaz_path_basename_ext'"
run_fail_case runtime_prelude_string_eq_hidden_fail examples/runtime_prelude_string_eq_hidden_fail.ts "unknown identifier '__topaz_string_eq'"
run_fail_case runtime_prelude_path_join_hidden_fail examples/runtime_prelude_path_join_hidden_fail.ts "unknown identifier '__topaz_path_join_segments'"
run_fail_case runtime_prelude_path_resolve_hidden_fail examples/runtime_prelude_path_resolve_hidden_fail.ts "unknown identifier '__topaz_path_resolve_segments'"
run_fail_case runtime_prelude_panic_hidden_fail examples/runtime_prelude_panic_hidden_fail.ts "unknown identifier '__topaz_panic'"
run_fail_case runtime_prelude_parse_int_hidden_fail examples/runtime_prelude_parse_int_hidden_fail.ts "unknown identifier '__topaz_parse_int'"
run_fail_case runtime_prelude_string_from_char_code_hidden_fail examples/runtime_prelude_string_from_char_code_hidden_fail.ts "unknown identifier '__topaz_string_from_char_code'"
run_fail_case runtime_prelude_string_slice_hidden_fail examples/runtime_prelude_string_slice_hidden_fail.ts "unknown identifier '__topaz_string_slice'"
run_fail_case runtime_prelude_string_concat_hidden_fail examples/runtime_prelude_string_concat_hidden_fail.ts "unknown identifier '__topaz_string_concat'"
run_fail_case runtime_prelude_string_repeat_hidden_fail examples/runtime_prelude_string_repeat_hidden_fail.ts "unknown identifier '__topaz_string_repeat'"
run_fail_case runtime_prelude_array_slice_normalize_hidden_fail examples/runtime_prelude_array_slice_normalize_hidden_fail.ts "unknown identifier '__topaz_slice_normalize'"
run_fail_case runtime_prelude_string_char_code_at_hidden_fail examples/runtime_prelude_string_char_code_at_hidden_fail.ts "unknown identifier '__topaz_string_char_code_at'"
run_fail_case runtime_prelude_string_index_of_hidden_fail examples/runtime_prelude_string_index_of_hidden_fail.ts "unknown identifier '__topaz_string_index_of'"
run_fail_case runtime_prelude_string_byte_at_hidden_fail examples/runtime_prelude_string_byte_at_hidden_fail.ts "unknown identifier '__topaz_string_byte_at'"
run_fail_case runtime_prelude_string_buffer_hidden_fail examples/runtime_prelude_string_buffer_hidden_fail.ts "unknown identifier '__topaz_string_buffer_new'"
run_fail_case runtime_prelude_bigint_eq_hidden_fail examples/runtime_prelude_bigint_eq_hidden_fail.ts "unknown identifier '__topaz_bigint_eq'"
run_fail_case runtime_prelude_bigint_cmp_hidden_fail examples/runtime_prelude_bigint_cmp_hidden_fail.ts "unknown identifier '__topaz_bigint_cmp'"
run_fail_case runtime_prelude_bigint_neg_hidden_fail examples/runtime_prelude_bigint_neg_hidden_fail.ts "unknown identifier '__topaz_bigint_neg'"
run_fail_case runtime_prelude_bigint_add_hidden_fail examples/runtime_prelude_bigint_add_hidden_fail.ts "unknown identifier '__topaz_bigint_add'"
run_fail_case runtime_prelude_bigint_sub_hidden_fail examples/runtime_prelude_bigint_sub_hidden_fail.ts "unknown identifier '__topaz_bigint_sub'"
run_fail_case runtime_prelude_bigint_mul_hidden_fail examples/runtime_prelude_bigint_mul_hidden_fail.ts "unknown identifier '__topaz_bigint_mul'"
run_fail_case runtime_prelude_bigint_from_decimal_hidden_fail examples/runtime_prelude_bigint_from_decimal_hidden_fail.ts "unknown identifier '__topaz_bigint_from_decimal'"
run_fail_case runtime_prelude_bigint_to_string_hidden_fail examples/runtime_prelude_bigint_to_string_hidden_fail.ts "unknown identifier '__topaz_bigint_to_string'"
run_fail_case module_function_duplicate_fail examples/module_function_duplicate_fail.ts "redeclaration of function 'sameName'"
run_module_case module_side_effect examples/module_side_effect_main.ts "123"
run_module_case module_global_state examples/module_global_state_main.ts $'3\n5\nhi!'
run_fail_case module_cycle examples/module_cycle_a.ts "circular import detected"
run_module_case package_lookup_basic examples/fixtures/package_lookup/basic.ts $'14\n27\n31'
run_module_case package_lookup_ancestor examples/fixtures/package_lookup/app/src/main.ts "114"
run_fail_case package_lookup_missing examples/fixtures/package_lookup/missing_package_fail.ts "cannot resolve package 'missing-pkg'"
run_fail_case package_lookup_subpath examples/fixtures/package_lookup/subpath_fail.ts "package subpath import 'topaz-pkg/subpath' is unsupported"
run_fail_case package_lookup_topaz_escape examples/fixtures/package_lookup/topaz_escape_fail.ts "entry '../escape.ts' must start with './'"
run_fail_case package_lookup_topaz_cjs examples/fixtures/package_lookup/topaz_cjs_fail.ts "entry './dist/index.cjs' must end in .ts or .js"
run_fail_case package_lookup_main_exports_only examples/fixtures/package_lookup/main_exports_only_fail.ts "main/exports are unsupported"
run_fail_case import_type_clause_fail examples/import_type_clause_fail.ts "\`import type\` is unsupported"
run_fail_case import_type_specifier_fail examples/import_type_specifier_fail.ts "\`import type\` is unsupported"
run_fail_case strict_field_init_fail examples/strict_field_init_fail.ts "is not definitely assigned in the constructor"
run_fail_case optional_field_access_fail examples/optional_field_access_fail.ts "cannot access '.v' on union type"
run_fail_case dunion_field_access_fail examples/dunion_field_access_fail.ts "cannot access '.radius' on discriminated union"
run_fail_case dunion_common_field_write_fail examples/dunion_common_field_write_fail.ts "cannot assign to '.pos' on discriminated union"
run_fail_case dunion_init_narrow_let_fail examples/dunion_init_narrow_let_fail.ts "cannot access '.text' on discriminated union"
run_fail_case dunion_widen_fail examples/dunion_widen_fail.ts "is not a variant of"
run_fail_case dunion_optional_object_literal_fail examples/dunion_optional_object_literal_fail.ts 'has kind="bogus"'
run_fail_case string_literal_union_mismatch_fail examples/string_literal_union_mismatch_fail.ts 'expected topaz_union_string_literal_break_or_string_literal_continue, got string literal "return"'
run_fail_case compound_narrow_no_left_fail examples/compound_narrow_no_left_fail.ts "has no member 'op'"
run_fail_case compound_carry_indeterminate_fail examples/compound_carry_indeterminate_fail.ts "cannot access '.op' on discriminated union"
run_fail_case catch_unknown_unnarrowed_fail examples/catch_unknown_unnarrowed_fail.ts "cannot access '.msg' on \`unknown\`"
run_fail_case template_literal_unsupported_fail examples/template_literal_unsupported_fail.ts "template literal substitution must be number / boolean / string"
run_fail_case for_of_map_fail examples/for_of_map_fail.ts "for-of requires an Array<T>"
run_fail_case for_of_destructuring_fail examples/for_of_destructuring_fail.ts "destructuring binding in for-of is only supported for .entries() on Map / Set"
run_fail_case for_of_map_entries_fail examples/for_of_map_entries_fail.ts "for-of over .entries() requires destructuring binding"
run_fail_case map_entries_outside_for_of_fail examples/map_entries_outside_for_of_fail.ts "Map.entries() is only allowed as the right-hand side"
run_fail_case set_constructor_mismatch_fail examples/set_constructor_mismatch_fail.ts "Set() constructor element type mismatch"
run_fail_case set_constructor_non_iterable_fail examples/set_constructor_non_iterable_fail.ts "Set() constructor source must be an Array<T>, Set<T>, or Iterator<T>"
run_fail_case set_constructor_too_many_fail examples/set_constructor_too_many_fail.ts "Set() constructor expects at most one argument"
run_fail_case map_constructor_iterable_fail examples/map_constructor_iterable_fail.ts "Map() constructor arguments are unsupported"
run_fail_case iterator_in_container_fail examples/iterator_in_container_fail.ts "no Array monomorph for element type topaz_iter_number"
run_fail_case non_null_non_optional_fail examples/non_null_non_optional_fail.ts "non-null assertion (\`!\`) requires a \`T | undefined\` operand"
run_fail_case coalesce_non_optional_fail examples/coalesce_non_optional_fail.ts "\`??\` requires the left operand to be \`T | undefined\`"
run_fail_case optional_chain_non_optional_fail examples/optional_chain_non_optional_fail.ts "optional chain \`?.\` requires a \`T | undefined\` receiver"
run_fail_case optional_call_fail examples/optional_call_fail.ts "optional call \`f?.()\` is unsupported"
run_fail_case arrow_unannotated_fail examples/arrow_unannotated_fail.ts "arrow function parameter requires a type annotation"
run_case arrow_infer_return $'42\nxtopaz\nvoid-body\n7\n9'
run_fail_case arrow_block_infer_return_fail examples/arrow_block_infer_return_fail.ts "arrow function requires an explicit return type annotation"
run_case arrow_nested_fn_type $'30\n12\n7'
run_case function_expression $'4\n15\n5'
run_case function_expression_named $'4\n15\n5'
run_case async_function_expression_no_await $'function body\nsync tail\nthen inline\n7\nthen block\n42'
run_case async_function_expression_await $'before function await\nsync tail\nbetween function awaits\nafter function await\nthen function await\n42'
run_case async_function_expression_named $'named no-await body\nbefore named await\nsync tail\nthen named callback\n7\nthen named no-await\n6\nafter named await\nthen named await\n42'
run_fail_case function_expression_named_deferred_fail examples/function_expression_named_deferred_fail.ts "named function expression self-binding is deferred"
run_fail_case function_expression_async_deferred_fail examples/function_expression_async_deferred_fail.ts 'await expression lowering is deferred'
run_case array_of_fn $'6\n50\n2\n-95\n13\n16\n60\n3\n101\n102\n103\n19\n49\n0\nn=7\nn*2=14'
run_fail_case map_of_fn_fail examples/map_of_fn_fail.ts "no Map monomorph for key=topaz_string, value=topaz_fn_"
run_fail_case set_of_fn_fail examples/set_of_fn_fail.ts "no Set monomorph for element type topaz_fn_"
run_fail_case array_map_callback_arity_fail examples/array_map_callback_arity_fail.ts "Array.map callback arity"
run_fail_case array_map_callback_param_mismatch_fail examples/array_map_callback_param_mismatch_fail.ts "callback parameter type"
run_fail_case array_map_index_param_mismatch_fail examples/array_map_index_param_mismatch_fail.ts "callback parameter type"
run_fail_case array_map_block_no_annotation_fail examples/array_map_block_no_annotation_fail.ts "block-bodied arrow callback requires an explicit return type annotation"
run_fail_case array_filter_callback_non_boolean_fail examples/array_filter_callback_non_boolean_fail.ts "Array.filter callback must return boolean"
run_fail_case array_includes_type_mismatch_fail examples/array_includes_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case array_includes_from_index_fail examples/array_includes_from_index_fail.ts "Array.includes \`fromIndex\` argument is unsupported"
run_fail_case array_slice_arg_type_fail examples/array_slice_arg_type_fail.ts "Array.slice argument must be number"
run_fail_case array_slice_too_many_args_fail examples/array_slice_too_many_args_fail.ts "Array.slice expects at most two arguments"
run_fail_case array_join_class_elem_fail examples/array_join_class_elem_fail.ts "Array.join is unsupported for element type"
run_fail_case array_join_sep_type_fail examples/array_join_sep_type_fail.ts "Array.join separator must be string"
run_fail_case array_join_too_many_args_fail examples/array_join_too_many_args_fail.ts "Array.join expects at most one argument"

run_case spread_basic $'3\n6\n3\n4\n4\n100\n6\n115\n2\n15\n0\n10\n3\n14\n6\n5\n159\n4\n10\n3\n9\n7'
run_case array_spread_eval_plan $'left\nright\n5\n10'
run_case array_push_spread $'4\n10\n8\n36\n4\n38\n4\n10'
run_fail_case spread_call_args_fail examples/spread_call_args_fail.ts "spread in call arguments is unsupported"
run_fail_case spread_new_args_fail examples/spread_new_args_fail.ts "spread in \`new\` arguments is unsupported"
run_fail_case spread_set_fail examples/spread_set_fail.ts "spread source in array literal must be an Array<T>"
run_fail_case spread_elem_mismatch_fail examples/spread_elem_mismatch_fail.ts "spread element type topaz_string does not match destination element type topaz_number"
run_fail_case spread_non_array_fail examples/spread_non_array_fail.ts "spread source in array literal must be an Array<T>"
run_fail_case array_push_spread_mismatch_fail examples/array_push_spread_mismatch_fail.ts "spread argument element type topaz_string does not match Array.push element type topaz_number"
run_fail_case array_push_spread_non_array_fail examples/array_push_spread_non_array_fail.ts "spread argument to Array.push must be an Array<T>, got topaz_number"

run_case access_modifier $'13\n16\n3\n100\n103\n7\n8\n15\nalpha\n101\n102\ntoy\n42'
run_fail_case access_modifier_static_fail examples/access_modifier_static_fail.ts "class member modifier 'StaticKeyword' is unsupported"

run_case void_return $'hello\nhello\non\n7\n0\n0\n[log] via iface'
run_case void_fn_type $'3\n10\ndone'
run_case never_return_annotation alive
run_fail_case void_return_bare_in_nonvoid_fail examples/void_return_bare_in_nonvoid_fail.ts "\`return;\` is only allowed in a void-returning function"
run_fail_case void_return_value_in_void_fail examples/void_return_value_in_void_fail.ts "\`return <expr>;\` is not allowed in a void-returning function"
run_fail_case void_value_assign_fail examples/void_value_assign_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_param_fail examples/void_param_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_array_fail examples/void_array_fail.ts "\`void\` is only allowed as a function / method return type"
run_fail_case void_fn_type_fail examples/void_fn_type_fail.ts "used in fn-type parameter"
run_fail_case void_fn_expr_body_fail examples/void_fn_expr_body_fail.ts "void-returning arrows require block bodies"
run_fail_case void_fn_call_value_fail examples/void_fn_call_value_fail.ts "cannot use a \`void\` value"
run_case never_call_carry_narrow $'7\n11\n13'
run_fail_case never_call_carry_narrow_void_fail examples/never_call_carry_narrow_void_fail.ts "cannot access '.value' on union type"
run_fail_case never_call_value_fail examples/never_call_value_fail.ts "cannot use a \`void\` value"
run_fail_case array_map_void_callback_fail examples/array_map_void_callback_fail.ts "Array.map callback cannot return \`void\`"

run_case field_initializer $'0\ntrue\ndefault\n2\n2\n2\n0\n0\n0\n(unset)\n1\n10\nhi!\n100\nalpha\n100\n0\n5\n7\n16\n2\n11\n22\n101\nDEFAULT:ok'
run_fail_case field_initializer_type_mismatch_fail examples/field_initializer_type_mismatch_fail.ts "type mismatch: expected topaz_number, got topaz_string"
run_fail_case field_initializer_partial_fail examples/field_initializer_partial_fail.ts "has fields but no constructor"

run_case type_alias $'8\nok\ntrue\n100\n3\n2\n2\n3\n20\n0\n0\n25\n2\n42\n10\n7\n12\n42\n-1\n1024\n99\n6'
run_fail_case type_alias_generic_fail examples/type_alias_generic_fail.ts "generic type alias 'Pair' is unsupported"
run_fail_case type_alias_circular_fail examples/type_alias_circular_fail.ts "circular type alias 'A'"
run_fail_case type_alias_name_conflict_fail examples/type_alias_name_conflict_fail.ts "type alias 'Foo' collides with a class of the same name"
run_fail_case type_alias_as_value_fail examples/type_alias_as_value_fail.ts "unknown identifier 'Count'"
run_case type_alias_recursive $'6\n1\n2\n3\n42\n-42\n42\nnumber\nMap\n2\nnumber\nstring\n30\n70\n1\n16'
run_fail_case type_alias_self_ref_fail examples/type_alias_self_ref_fail.ts "circular type alias 'A'"
run_fail_case type_alias_array_self_ref_fail examples/type_alias_array_self_ref_fail.ts "circular type alias 'Foo'"

run_case object_literal $'3\n4\n7\n30\n40\n3\n4\n100\n2\nalice\n30\ntrue\n5\nok\nfirst\n7\n8\n5\n3\n15\n2\n10\n-1\n42\ndeep\n0\n0\n5\n0\n30\nb\n3\n2\nhello\nworld\n5\n99'
run_fail_case object_literal_no_context_fail examples/object_literal_no_context_fail.ts "requires a contextually typed anonymous-class target"
run_fail_case object_literal_missing_field_fail examples/object_literal_missing_field_fail.ts "missing required property: b"
run_fail_case object_literal_extra_field_fail examples/object_literal_extra_field_fail.ts "property 'c' does not exist"
run_case object_literal_shorthand $'1\n2\n1\n2\n10\n2\nalice\n30\n42\nhot\n7\n99'
run_fail_case object_literal_method_shorthand_fail examples/object_literal_method_shorthand_fail.ts "no method shorthand, getter / setter, spread"
run_fail_case object_literal_spread_fail examples/object_literal_spread_fail.ts "no method shorthand, getter / setter, spread"
run_fail_case object_literal_type_empty_fail examples/object_literal_type_empty_fail.ts "empty object literal type"
run_fail_case object_literal_type_method_fail examples/object_literal_type_method_fail.ts "only supports plain property signatures"
run_fail_case object_literal_type_dup_field_fail examples/object_literal_type_dup_field_fail.ts "duplicate property 'a' in object literal type"
run_fail_case object_literal_type_mismatch_fail examples/object_literal_type_mismatch_fail.ts "expected topaz_number, got topaz_string"

run_case optional_param $'topaz\ntopaz!\n0007\n07\n****7\n12\n1\nanon\n2\nnamed\na:80\nb:9000\n0\n5\n15\n10\n35\nhi\nhi[x]\n1\n2\nnone\ny\ndefault\nonly\nfb\np'
run_fail_case optional_param_non_trailing_fail examples/optional_param_non_trailing_fail.ts "a required parameter cannot follow an optional parameter"
run_fail_case optional_param_too_few_fail examples/optional_param_too_few_fail.ts "expects 2..3 argument(s), got 1"
run_fail_case optional_param_too_many_fail examples/optional_param_too_many_fail.ts "expects 1..2 argument(s), got 3"
run_fail_case optional_param_unnarrowed_fail examples/optional_param_unnarrowed_fail.ts "expected topaz_number, got topaz_union_number_or_undefined"
run_fail_case optional_field_unnarrowed_fail examples/optional_field_unnarrowed_fail.ts "expected topaz_number, got topaz_union_number_or_undefined"
run_fail_case optional_param_type_mismatch_fail examples/optional_param_type_mismatch_fail.ts "expected topaz_union_number_or_undefined, got topaz_string"

run_case object_destructuring $'3\n4\n7\n7\ntrue\nhi\n5\n9\n100\n200\n1\n3\nfirst\n10\n99\n6\n3\n4\n30\nb\n42\n5\n99\n8\n7\n42\n12\n14\n50\n60'
run_fail_case object_destructuring_rename_fail examples/object_destructuring_rename_fail.ts "property rename / nested pattern"
run_fail_case object_destructuring_default_fail examples/object_destructuring_default_fail.ts "default value"
run_fail_case object_destructuring_rest_fail examples/object_destructuring_rest_fail.ts "rest element"
run_fail_case object_destructuring_nested_fail examples/object_destructuring_nested_fail.ts "property rename / nested pattern"
run_fail_case object_destructuring_annotation_fail examples/object_destructuring_annotation_fail.ts "type annotation on object destructuring pattern is unsupported"
run_fail_case object_destructuring_unknown_field_fail examples/object_destructuring_unknown_field_fail.ts "has no field 'missing'"
run_fail_case object_destructuring_method_fail examples/object_destructuring_method_fail.ts "is a method of 'Counter', not a field"
run_fail_case object_destructuring_non_class_fail examples/object_destructuring_non_class_fail.ts "object destructuring requires a class or interface receiver"
run_fail_case object_destructuring_empty_fail examples/object_destructuring_empty_fail.ts "empty object destructuring pattern"

run_case array_of_dunion $'3\n31\n21\n3\n3\n4\n6\nsquare\n6\n99\n2\ntrue\nfalse\n1\n1\ntrue\nfalse\n3\n187'

run_case module_const_hoist $'true\nfalse\ntrue\nfalse\ntrue\ntrue\n51\n-1\n42\n70\n3\n5\n100\n11\n4\n2\n1500'
run_fail_case module_const_hoist_let_fail examples/module_const_hoist_let_fail.ts "unknown identifier 'counter'"
run_fail_case module_const_hoist_nonscalar_fail examples/module_const_hoist_nonscalar_fail.ts "unknown identifier 'GREETING'"

run_case string_method $'5\n104\n101\n101\n111\ntrue\ntrue\nell\n3\nllo\n3\nhello\n5\nlo\nhell\nll\n0\ntrue\nlo\n0\nbcd\n6\nbcdabcdef\nace\n101\n119\nrld\n122\nabcdef\n0\n2\n-1\n0\n1'
run_fail_case string_char_code_at_arity_fail examples/string_char_code_at_arity_fail.ts "String.charCodeAt expects exactly one argument"
run_fail_case string_char_code_at_arg_type_fail examples/string_char_code_at_arg_type_fail.ts "String.charCodeAt argument must be number"
run_fail_case string_slice_arg_type_fail examples/string_slice_arg_type_fail.ts "String.slice argument must be number"
run_fail_case string_slice_too_many_args_fail examples/string_slice_too_many_args_fail.ts "String.slice expects at most two arguments"
run_fail_case string_index_of_arity_fail examples/string_index_of_arity_fail.ts "String.indexOf expects exactly one argument"
run_fail_case string_index_of_arg_type_fail examples/string_index_of_arg_type_fail.ts "String.indexOf argument must be string, got topaz_number"
run_case string_starts_ends_with $'true\nfalse\ntrue\nfalse\ntrue\ntrue\nfalse\nfalse\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\nrelative\nrelative\nbare\nmodule\nmodule\nother'
run_fail_case string_starts_with_arity_fail examples/string_starts_with_arity_fail.ts "String.startsWith expects exactly one argument"
run_fail_case string_starts_with_arg_type_fail examples/string_starts_with_arg_type_fail.ts "String.startsWith argument must be string, got topaz_number"
run_fail_case string_ends_with_arity_fail examples/string_ends_with_arity_fail.ts "String.endsWith expects exactly one argument"
run_fail_case string_ends_with_arg_type_fail examples/string_ends_with_arg_type_fail.ts "String.endsWith argument must be string, got topaz_number"
run_case string_repeat $'xxx\n3\n0\ntrue\naa\npre-haha\nqq'
run_fail_case string_repeat_arity_fail examples/string_repeat_arity_fail.ts "String.repeat expects exactly one argument"
run_fail_case string_repeat_arg_type_fail examples/string_repeat_arg_type_fail.ts "String.repeat argument must be number, got topaz_string"
run_case string_trim_start $'topaz\n5\nok\n2\nready\n5\n0\ntrue\npre-value\nbc\nxxx\nname'
run_fail_case string_trim_start_arity_fail examples/string_trim_start_arity_fail.ts "String.trimStart expects no arguments"
run_fail_case string_unsupported_method_fail examples/string_unsupported_method_fail.ts "unsupported method '.match' on topaz_string"

run_case string_from_char_code $'A\na\n0\nz\nB\n1\n72\nHello\n5\nA\nz\nmark=!\n1\n1\n127\nA\nA\nD\nZ\nabcde'
run_fail_case string_from_char_code_arity_fail examples/string_from_char_code_arity_fail.ts "String.fromCharCode expects exactly one argument"
run_fail_case string_from_char_code_too_many_args_fail examples/string_from_char_code_too_many_args_fail.ts "String.fromCharCode expects exactly one argument"
run_fail_case string_from_char_code_arg_type_fail examples/string_from_char_code_arg_type_fail.ts "String.fromCharCode argument must be number"
run_fail_case string_static_unknown_fail examples/string_static_unknown_fail.ts "unsupported static method 'String.fromCodePoint'"
run_fail_case string_as_value_fail examples/string_as_value_fail.ts "unknown identifier 'String'"

run_case dunion_object_literal $'3\nident:foo\nnumber:42\neof\nident:bar\nnumber:7\nident:baz\nnumber:99\neof\neof\nident:hello\n4\nident:a\nnumber:1\nident:b\neof\nident:lone\neof\nident:next\nnumber:555\n3\ntrue\nfalse'
run_fail_case dunion_object_literal_missing_kind_fail examples/dunion_object_literal_missing_kind_fail.ts "must include discriminator property 'kind"
run_fail_case dunion_object_literal_kind_not_literal_fail examples/dunion_object_literal_kind_not_literal_fail.ts "must be a plain string literal to select"
run_fail_case dunion_object_literal_unknown_variant_fail examples/dunion_object_literal_unknown_variant_fail.ts "no variant of"
run_fail_case dunion_object_literal_concrete_variant_fail examples/dunion_object_literal_concrete_variant_fail.ts "concrete class variant requires"

run_case node_fs_read_file $'hello topaz\n\n12\n104\nhello\n12\n[hello]\nfirst5=hello\ntrue'
run_fail_case node_fs_read_file_arity_fail examples/node_fs_read_file_arity_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_missing_encoding_fail examples/node_fs_read_file_missing_encoding_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_too_many_args_fail examples/node_fs_read_file_too_many_args_fail.ts "readFileSync expects exactly two arguments"
run_fail_case node_fs_read_file_path_type_fail examples/node_fs_read_file_path_type_fail.ts "readFileSync path argument must be string"
run_fail_case node_fs_read_file_encoding_not_literal_fail examples/node_fs_read_file_encoding_not_literal_fail.ts "encoding argument must be the string literal"
run_fail_case node_fs_read_file_encoding_await_fail examples/node_fs_read_file_encoding_await_fail.ts "encoding argument must be the string literal"
run_fail_case node_fs_read_file_unknown_encoding_fail examples/node_fs_read_file_unknown_encoding_fail.ts "encoding argument must be \"utf8\""
run_fail_case node_fs_read_file_as_value_fail examples/node_fs_read_file_as_value_fail.ts "unknown identifier 'readFileSync'"
run_fail_case node_fs_unknown_named_import_fail examples/node_fs_unknown_named_import_fail.ts "unsupported named import 'unlinkSync'"
run_fail_case node_fs_namespace_import_fail examples/node_fs_namespace_import_fail.ts "namespace import of stdlib specifier 'node:fs'"
run_fail_case node_fs_rename_import_fail examples/node_fs_rename_import_fail.ts "import rename"

run_case node_fs_exists $'true\nfalse\ntrue\nfound\ntrue\nfalse\ntrue\ntrue'
run_fail_case node_fs_exists_arity_fail examples/node_fs_exists_arity_fail.ts "existsSync expects exactly one argument"
run_fail_case node_fs_exists_path_type_fail examples/node_fs_exists_path_type_fail.ts "existsSync path argument must be string"
run_fail_case node_fs_exists_as_value_fail examples/node_fs_exists_as_value_fail.ts "unknown identifier 'existsSync'"

run_case node_fs_write_file $'true\nhello topaz write\n\nshorter\n0\nvia fn\n\nhello topaz!'
run_fail_case node_fs_write_file_arity_fail examples/node_fs_write_file_arity_fail.ts "writeFileSync expects exactly two arguments"
run_fail_case node_fs_write_file_path_type_fail examples/node_fs_write_file_path_type_fail.ts "writeFileSync path argument must be string"
run_fail_case node_fs_write_file_content_type_fail examples/node_fs_write_file_content_type_fail.ts "writeFileSync content argument must be string"
run_fail_case node_fs_write_file_as_value_fail examples/node_fs_write_file_as_value_fail.ts "writeFileSync returns void and cannot be used as a value"

# cleanup any tree from a previous run so the "create from scratch" assertion is
# valid; an EBUSY / "Directory not empty" from a flaky filesystem must not abort
# the suite, the test itself is idempotent.
rm -rf /tmp/topaz_mkdir_test 2>/dev/null || true
run_case node_fs_mkdir $'true\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue\ntrue'
run_fail_case node_fs_mkdir_arity_fail examples/node_fs_mkdir_arity_fail.ts "mkdirSync expects exactly two arguments"
run_fail_case node_fs_mkdir_path_type_fail examples/node_fs_mkdir_path_type_fail.ts "mkdirSync path argument must be string"
run_fail_case node_fs_mkdir_opts_not_object_fail examples/node_fs_mkdir_opts_not_object_fail.ts "options argument must be the literal"
run_fail_case node_fs_mkdir_opts_wrong_key_fail examples/node_fs_mkdir_opts_wrong_key_fail.ts "options property must be \`recursive: true\`"
run_fail_case node_fs_mkdir_opts_recursive_false_fail examples/node_fs_mkdir_opts_recursive_false_fail.ts "\`recursive\` must be the literal \`true\`"
run_fail_case node_fs_mkdir_opts_extra_prop_fail examples/node_fs_mkdir_opts_extra_prop_fail.ts "options literal must contain exactly one property"
run_fail_case node_fs_mkdir_as_value_fail examples/node_fs_mkdir_as_value_fail.ts "mkdirSync returns void and cannot be used as a value"

rm -rf /tmp/topaz_std_fs_test 2>/dev/null || true
run_case std_fs_basic $'true\nfalse\ntrue\nhello std fs\n\nagain\n5'
run_fail_case std_fs_unknown_named_import_fail examples/std_fs_unknown_named_import_fail.ts "unsupported named import 'unlinkSync' from stdlib specifier 'std/fs'"

run_case node_path_basic $'/foo/bar\n/foo\nfoo\n.\n/\n/\n/foo/bar\n/a/c\n/a/b/d\n/foo/bar/baz\n/bar\n/x/w\n/a/b/util.ts\n/pkg/src\ntrue'
run_fail_case node_path_dirname_arity_fail examples/node_path_dirname_arity_fail.ts "dirname expects exactly one argument"
run_fail_case node_path_dirname_type_fail examples/node_path_dirname_type_fail.ts "dirname path argument must be string"
run_fail_case node_path_resolve_arity_fail examples/node_path_resolve_arity_fail.ts "resolve expects at least one argument"
run_fail_case node_path_resolve_type_fail examples/node_path_resolve_type_fail.ts "resolve segment argument must be string"
run_fail_case node_path_as_value_fail examples/node_path_as_value_fail.ts "unknown identifier 'resolve'"
run_fail_case node_path_unknown_named_import_fail examples/node_path_unknown_named_import_fail.ts "unsupported named import 'relative'"

run_case node_path_basename $'baz.ts\nbar\nbar\nfoo\nfoo\n\ntrue\nbaz\nfoo\nmain\nbar.ts\ntrue\nindex'
run_fail_case node_path_basename_arity_fail examples/node_path_basename_arity_fail.ts "basename expects one or two arguments"
run_fail_case node_path_basename_path_type_fail examples/node_path_basename_path_type_fail.ts "basename path argument must be string"
run_fail_case node_path_basename_ext_type_fail examples/node_path_basename_ext_type_fail.ts "basename ext argument must be string"
run_fail_case node_path_basename_as_value_fail examples/node_path_basename_as_value_fail.ts "unknown identifier 'basename'"

run_case node_path_extname $'.html\n.md\n.\ntrue\ntrue\n.md\n.ts\ntrue\n.gz\ntrue\ntrue\ntrue\n.tsx'
run_fail_case node_path_extname_arity_fail examples/node_path_extname_arity_fail.ts "extname expects exactly one argument"
run_fail_case node_path_extname_type_fail examples/node_path_extname_type_fail.ts "extname path argument must be string"
run_fail_case node_path_extname_as_value_fail examples/node_path_extname_as_value_fail.ts "unknown identifier 'extname'"

run_case node_path_join $'.\n.\nfoo/bar\n/foo/bar\n/bar\n../b\na/b/c/\na\n/\n.\n..\n/a/b/c\nfoo/bar\n/pkg/src/index'
run_fail_case node_path_join_type_fail examples/node_path_join_type_fail.ts "join segment argument must be string"
run_fail_case node_path_join_as_value_fail examples/node_path_join_as_value_fail.ts "unknown identifier 'join'"

run_case std_path_basic $'/pkg/src\n/pkg/dist/main.ts\nindex\n.ts\n/pkg/src/parser.ts\n/pkg/src/cli'
run_fail_case std_path_unknown_named_import_fail examples/std_path_unknown_named_import_fail.ts "unsupported named import 'relative' from stdlib specifier 'std/path'"

run_case node_child_process_exec $'hello from child\nparent line\none two\n\nx=2'
run_fail_case node_child_process_exec_arity_fail examples/node_child_process_exec_arity_fail.ts "execFileSync expects exactly three arguments"
run_fail_case node_child_process_exec_cmd_type_fail examples/node_child_process_exec_cmd_type_fail.ts "execFileSync cmd argument must be string"
run_fail_case node_child_process_exec_args_type_fail examples/node_child_process_exec_args_type_fail.ts "execFileSync args argument must be Array<string>"
run_fail_case node_child_process_exec_opts_not_object_fail examples/node_child_process_exec_opts_not_object_fail.ts "options argument must be the literal"
run_fail_case node_child_process_exec_opts_wrong_key_fail examples/node_child_process_exec_opts_wrong_key_fail.ts "options property must be \`stdio: \"inherit\"\`"
run_fail_case node_child_process_exec_opts_wrong_value_fail examples/node_child_process_exec_opts_wrong_value_fail.ts "\`stdio\` must be the string literal \"inherit\""
run_fail_case node_child_process_exec_as_value_fail examples/node_child_process_exec_as_value_fail.ts "execFileSync returns void and cannot be used as a value"
run_fail_case node_child_process_unknown_named_import_fail examples/node_child_process_unknown_named_import_fail.ts "unsupported named import 'spawnSync'"

run_case node_url_basic $'true\ntrue\ntrue\ntrue\nnode_url_basic\ntrue\ntrue\n/tmp/a b/c/d\n/etc/hosts\n7\n0\n255'
run_fail_case node_url_arity_fail examples/node_url_arity_fail.ts "fileURLToPath expects exactly one argument"
run_fail_case node_url_type_fail examples/node_url_type_fail.ts "fileURLToPath argument must be string"
run_fail_case node_url_as_value_fail examples/node_url_as_value_fail.ts "unknown identifier 'fileURLToPath'"
run_fail_case node_url_unknown_named_import_fail examples/node_url_unknown_named_import_fail.ts "unsupported named import 'pathToFileURL'"
run_fail_case import_meta_bare_fail examples/import_meta_bare_fail.ts "bare \`import.meta\` is unsupported"
run_fail_case import_meta_wrong_prop_fail examples/import_meta_wrong_prop_fail.ts "unsupported \`import.meta.resolve\`"

# Phase 1.5-6 prep #26: process.argv / process.exit / process.{stdout,stderr}
# .write + console.error. stderr writes are not captured by run_case.
run_case process_io $'1\nprocess_io\nab\n1\nbefore exit'
run_fail_case process_exit_type_fail examples/process_exit_type_fail.ts "process.exit code must be number"
run_fail_case process_exit_arity_fail examples/process_exit_arity_fail.ts "process.exit expects at most one argument"
run_fail_case process_stdout_write_type_fail examples/process_stdout_write_type_fail.ts "process.stdout.write argument must be string"
run_fail_case process_stdout_write_as_value_fail examples/process_stdout_write_as_value_fail.ts "process.stdout.write returns void and cannot be used as a value"
run_fail_case process_member_value_fail examples/process_member_value_fail.ts "unsupported \`process.pid\` as a value"
run_fail_case console_error_arity_fail examples/console_error_arity_fail.ts "console.error expects exactly one argument"

run_case std_process_basic $'1\nstd_process_basic\nab\n1\nlocal\nbefore exit'
run_fail_case std_process_unknown_named_import_fail examples/std_process_unknown_named_import_fail.ts "unsupported named import 'env' from stdlib specifier 'std/process'"
run_fail_case std_process_exit_type_fail examples/std_process_exit_type_fail.ts "process.exit code must be number"
run_fail_case std_process_write_stdout_type_fail examples/std_process_write_stdout_type_fail.ts "process.stdout.write argument must be string"
run_fail_case std_process_write_error_type_fail examples/std_process_write_error_type_fail.ts "writeError argument must be string"
run_fail_case std_process_write_error_as_value_fail examples/std_process_write_error_as_value_fail.ts "console.error returns void and cannot be used as a value"

run_case number_literal_bases $'34\n16\n10\n3\n63\n160\ntrue\ntrue'
run_case parse_number $'255\n16\n5\n10\n3.14\n42\n0\n100\n123\n-123\n15\n1295\n511\n10\n123\n8\n16\n15\n2.5\n100\nNaN\nNaN'
run_fail_case parse_int_arity_fail examples/parse_int_arity_fail.ts "parseInt expects exactly two arguments"
run_fail_case parse_int_arg_type_fail examples/parse_int_arg_type_fail.ts "parseInt first argument must be string"
run_fail_case parse_int_radix_type_fail examples/parse_int_radix_type_fail.ts "parseInt radix argument must be number"
run_fail_case parse_float_arity_fail examples/parse_float_arity_fail.ts "parseFloat expects exactly one argument"
run_fail_case parse_int_as_value_fail examples/parse_int_as_value_fail.ts "unknown identifier 'parseInt'"

run_case dunion_optional $'ident=foo\nabsent\nnum=42\ni:hello\nn:7\neof\nnone\ni:a\nn:99\neof\nnone\ngot:alpha-text\nmiss\nbang:123\nnc:eof\nchain:alpha-text\nid-match'
run_fail_case dunion_optional_unnarrowed_fail examples/dunion_optional_unnarrowed_fail.ts "cannot access '.kind' on union type"
run_fail_case dunion_optional_non_optional_bang_fail examples/dunion_optional_non_optional_bang_fail.ts "non-null assertion"
run_fail_case dunion_optional_non_optional_coalesce_fail examples/dunion_optional_non_optional_coalesce_fail.ts "left operand to be"

run_case brand_string_phantom $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_string_phantom_mutable $'u1\nu1\no1\ntrue\ntrue\nu1'
run_fail_case brand_string_phantom_implicit_fail examples/brand_string_phantom_implicit_fail.ts "type mismatch"
run_fail_case brand_string_phantom_cross_assign_fail examples/brand_string_phantom_cross_assign_fail.ts "topaz_brand_OrderId"
run_fail_case brand_string_phantom_non_brand_as_fail examples/brand_string_phantom_non_brand_as_fail.ts "only brand assertions are supported"
run_fail_case brand_string_phantom_bad_shape_fail examples/brand_string_phantom_bad_shape_fail.ts "unsupported brand intersection shape"
run_fail_case brand_string_phantom_optional_fail examples/brand_string_phantom_optional_fail.ts "phantom field must be required"

run_case brand_unique_symbol_phantom $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_unique_symbol_phantom_mutable $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_type_query_payload $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_fail_case brand_unique_symbol_cross_assign_fail examples/brand_unique_symbol_cross_assign_fail.ts "topaz_brand_TeamId"
run_fail_case brand_unique_symbol_implicit_fail examples/brand_unique_symbol_implicit_fail.ts "type mismatch"
run_fail_case brand_unique_symbol_bad_computed_fail examples/brand_unique_symbol_bad_computed_fail.ts "unsupported computed phantom field name"
run_fail_case brand_unique_symbol_structural_computed_fail examples/brand_unique_symbol_structural_computed_fail.ts "computed type literal fields are unsupported"
run_fail_case brand_type_query_cross_assign_fail examples/brand_type_query_cross_assign_fail.ts "topaz_brand_TeamId"
run_fail_case brand_type_query_implicit_fail examples/brand_type_query_implicit_fail.ts "type mismatch"
run_fail_case brand_type_query_qualified_fail examples/brand_type_query_qualified_fail.ts "qualified type queries are unsupported"

run_case brand_generic_template $'u1\nu1\no1\ntrue\ntrue\nu1\n42\n42'
run_case brand_generic_template_mutable $'u1\nu1\no1\ntrue\ntrue\nu1\n42\n42'
run_case brand_generic_computed_template $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_constrained $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_constrained $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_property_key_constraint $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_property_key_constraint $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_property_key_union_constraint $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_property_key_union_constraint $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_base_constraint $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_base_constraint $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_base_property_key_constraint $'u1\nu1\n42\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_base_property_key_constraint $'u1\nu1\n42\ntrue\ntrue\nu1'
run_case brand_generic_template_base_property_key_union_constraint $'u1\nu1\n42\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_base_property_key_union_constraint $'u1\nu1\n42\ntrue\ntrue\nu1'
run_case brand_phantom_object_template $'u1\nu1\no1\ntrue\ntrue\nu1\nx1\nn1'
run_case brand_phantom_object_mutable $'u1\nu1\no1\ntrue\ntrue\nu1\nx1\nn1'
run_case brand_phantom_object_computed_template $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_phantom_object_template_constrained $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_phantom_object_computed_template_property_key_constraint $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_phantom_object_template_property_key_union_constraint $'u1\nu1\no1\ntrue\ntrue\nu1'
run_case brand_phantom_object_template_default_payload $'u1\nu1\nu1\ntrue\ntrue\nu1\nt1\nx1\nn1'
run_case brand_phantom_object_computed_template_default_payload $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_type_query_payload $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_default_payload $'u1\nu1\nu1\ntrue\ntrue\nu1\nt1\nother'
run_case brand_generic_computed_template_default_payload $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_template_base_default $'u1\nu1\n42\nt1\ns1\ntrue\ntrue\nu1'
run_case brand_generic_computed_template_base_default $'u1\nu1\n42\nt1\ntrue\ntrue\nu1'
run_case brand_unknown_never_payload $'u1\nu1\nn1\ntrue\ntrue\nu1\nn1'
run_case brand_generic_template_unknown_default_payload $'u1\nu1\nu1\ntrue\ntrue\nu1\nt1'
run_case brand_generic_template_never_default_payload $'o1\no1\no1\ntrue\ntrue\no1\ni1'
run_case brand_ambient_unique_symbol_marker $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_generic_ambient_unique_symbol_marker $'u1\nu1\nt1\ntrue\ntrue\nu1'
run_case brand_export_ambient_unique_symbol_marker $'u1\ntrue'
run_case brand_interface_phantom $'u1\nu1\no1\ntrue\ntrue\nu1\nt1\nn1\no1'
run_case brand_interface_phantom_mutable $'u1\nu1\no1\ntrue\ntrue\nu1\nt1\nn1\no1'
run_case brand_interface_computed_phantom $'u1\nu1\nt1\ntrue\ntrue\nn1'
run_fail_case brand_generic_template_cross_assign_fail examples/brand_generic_template_cross_assign_fail.ts "topaz_brand_Brand_3a___brand_3a_UserId"
run_fail_case brand_generic_template_type_query_cross_assign_fail examples/brand_generic_template_type_query_cross_assign_fail.ts "topaz_brand_Brand_3a__5b_UserIdBrand_5d__3a_typeof_20_UserIdBrand"
run_fail_case brand_generic_template_default_cross_assign_fail examples/brand_generic_template_default_cross_assign_fail.ts "topaz_brand_Brand_3a___brand_3a_UserId"
run_fail_case brand_generic_template_implicit_fail examples/brand_generic_template_implicit_fail.ts "type mismatch"
run_fail_case brand_generic_template_bad_payload_fail examples/brand_generic_template_bad_payload_fail.ts "payload type argument must be a string literal, typeof Identifier, unknown, or never"
run_fail_case brand_generic_template_bad_default_fail examples/brand_generic_template_bad_default_fail.ts "payload default must be a string literal, typeof Identifier, unknown, or never"
run_fail_case brand_generic_template_unknown_never_cross_assign_fail examples/brand_generic_template_unknown_never_cross_assign_fail.ts "topaz_brand_Opaque_3a___opaque_3a_never"
run_fail_case brand_generic_template_arbitrary_payload_ref_fail examples/brand_generic_template_arbitrary_payload_ref_fail.ts "payload type argument must be a string literal, typeof Identifier, unknown, or never"
run_fail_case brand_generic_template_base_default_fail examples/brand_generic_template_base_default_fail.ts "unsupported brand template base default type"
run_fail_case brand_generic_template_base_default_constraint_fail examples/brand_generic_template_base_default_constraint_fail.ts "base default type topaz_number does not satisfy constraint string"
run_fail_case brand_generic_template_bad_shape_fail examples/brand_generic_template_bad_shape_fail.ts "generic type alias 'Brand' is unsupported"
run_fail_case brand_generic_template_bad_constraint_fail examples/brand_generic_template_bad_constraint_fail.ts "brand template payload constraint must be string, PropertyKey, or string | number | symbol"
run_fail_case brand_generic_template_property_key_union_missing_fail examples/brand_generic_template_property_key_union_missing_fail.ts "brand template payload constraint must be string, PropertyKey, or string | number | symbol"
run_fail_case brand_generic_template_base_bad_constraint_fail examples/brand_generic_template_base_bad_constraint_fail.ts "brand template base type parameter constraint must be string, PropertyKey, or string | number | symbol"
run_fail_case brand_generic_template_base_constraint_fail examples/brand_generic_template_base_constraint_fail.ts "does not satisfy constraint string"
run_fail_case brand_generic_template_base_property_key_constraint_fail examples/brand_generic_template_base_property_key_constraint_fail.ts "does not satisfy constraint PropertyKey"
run_fail_case brand_generic_template_base_property_key_union_constraint_fail examples/brand_generic_template_base_property_key_union_constraint_fail.ts "does not satisfy constraint string | number | symbol"
run_fail_case brand_phantom_object_cross_assign_fail examples/brand_phantom_object_cross_assign_fail.ts "topaz_brand_Phantom_3a___brand_3a_OrderId"
run_fail_case brand_phantom_object_bare_fail examples/brand_phantom_object_bare_fail.ts "unsupported outside a brand intersection"
run_fail_case brand_phantom_object_bad_shape_fail examples/brand_phantom_object_bad_shape_fail.ts "generic type alias 'Phantom' is unsupported"
run_fail_case brand_phantom_object_bad_constraint_fail examples/brand_phantom_object_bad_constraint_fail.ts "phantom object brand helper payload constraint must be string, PropertyKey, or string | number | symbol"
run_fail_case brand_phantom_object_property_key_union_missing_fail examples/brand_phantom_object_property_key_union_missing_fail.ts "phantom object brand helper payload constraint must be string, PropertyKey, or string | number | symbol"
run_fail_case brand_phantom_object_bad_default_fail examples/brand_phantom_object_bad_default_fail.ts "phantom object brand helper payload default must be a string literal, typeof Identifier, unknown, or never"
run_fail_case brand_phantom_object_default_cross_assign_fail examples/brand_phantom_object_default_cross_assign_fail.ts "topaz_brand_Phantom_3a___brand_3a_UserId"
run_fail_case brand_interface_phantom_cross_assign_fail examples/brand_interface_phantom_cross_assign_fail.ts "topaz_brand_OrderIdBrand"
run_fail_case brand_interface_phantom_bad_shape_fail examples/brand_interface_phantom_bad_shape_fail.ts "unsupported brand intersection shape"
run_fail_case brand_interface_computed_phantom_bad_key_fail examples/brand_interface_computed_phantom_bad_key_fail.ts "unsupported computed phantom field name"
run_fail_case interface_computed_field_fail examples/interface_computed_field_fail.ts "computed interface fields are unsupported outside phantom brand descriptors"
run_fail_case brand_ambient_unique_symbol_initializer_fail examples/brand_ambient_unique_symbol_initializer_fail.ts "ambient unique-symbol markers cannot have initializers"
run_fail_case brand_ambient_unique_symbol_wrong_type_fail examples/brand_ambient_unique_symbol_wrong_type_fail.ts "only \`unique symbol\` ambient markers are supported"
run_fail_case brand_ambient_unique_symbol_non_const_fail examples/brand_ambient_unique_symbol_non_const_fail.ts "only \`declare const ...: unique symbol\` ambient markers are supported"
run_fail_case brand_ambient_declare_function_fail examples/brand_ambient_declare_function_fail.ts "arbitrary ambient declarations are unsupported"
run_fail_case type_param_constraint_generic_fail examples/type_param_constraint_generic_fail.ts "type parameter constraint is unsupported"
run_fail_case type_param_default_generic_fail examples/type_param_default_generic_fail.ts "default type parameter is unsupported"

run_case cond_equality $'if-eq\nif-ne\nand\nor\nmixed\ndiffer\n3\n6\n2'
run_cc_warnfree_case cond_equality
run_cc_warnfree_case dunion_optional
run_cc_warnfree_case dunion_common_field
run_cc_warnfree_case compound_narrow
run_cc_warnfree_case compound_carry_narrow
run_cc_warnfree_case dunion_init_narrow
run_cc_warnfree_case dunion_widen
run_cc_warnfree_case dunion_optional_object_literal

echo "all tests passed"
