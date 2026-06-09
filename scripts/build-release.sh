#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *)
    echo "unsupported release OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "unsupported release architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

artifact="topaz-${os}-${arch}"
release_dir="dist-release"
release_path="${release_dir}/${artifact}"
tmp_dir=""
cleanup_tmp() {
  if [[ -n "${tmp_dir}" ]]; then
    rm -rf "${tmp_dir}"
  fi
}
trap cleanup_tmp EXIT

echo "RELEASE [self-host fixed point]"
pnpm run test:selfhost

rm -rf "${release_dir}"
mkdir -p "${release_dir}"

echo "RELEASE [copy ${artifact}]"
cp build/topaz "${release_path}"
chmod 0755 "${release_path}"

echo "RELEASE [smoke ${artifact}]"
"./${release_path}" --help > /dev/null
"./${release_path}" examples/fib.ts -o build/release_fib > /dev/null
fib_out=$(./build/release_fib)
if [[ "${fib_out}" != "5702887" ]]; then
  echo "FAIL [release_fib]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: ${fib_out}" >&2
  exit 1
fi

echo "RELEASE [smoke ${artifact} binary-only]"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/topaz-release.XXXXXX")
cp "${release_path}" "${tmp_dir}/${artifact}"
chmod 0755 "${tmp_dir}/${artifact}"
"${tmp_dir}/${artifact}" examples/fib.ts -o "${tmp_dir}/release_fib" > /dev/null
fib_out=$("${tmp_dir}/release_fib")
if [[ "${fib_out}" != "5702887" ]]; then
  echo "FAIL [release_fib binary-only]:" >&2
  echo "  expected: 5702887" >&2
  echo "  got: ${fib_out}" >&2
  exit 1
fi

echo "RELEASE [sha256]"
(
  cd "${release_dir}"
  shasum -a 256 "${artifact}" > SHA256SUMS
)

echo "RELEASE [done]"
echo "  ${release_path}"
echo "  ${release_dir}/SHA256SUMS"
