# Build the Linux half of a cyberspace-generator release, in the `release` environment only (ZAZZLE_ENV=release). On the
# base pipeline (main) it builds nothing: the `check` step has tested the commit, and release builds (LTO, two targets)
# are only worth their time for a release. It leaves in /zazzle/output:
#   dist/cyberspace-generator-x86_64-unknown-linux-musl, dist/cyberspace-generator-aarch64-unknown-linux-musl
#   dist/SHA256SUMS   their lines ("<sha256>  <name>")
#   VERSION           cyberspace-generator's version in Cargo.toml ([workspace.package] version)
#   BUILD             the commit
# Each binary is checked to be for its CPU and statically linked, and the machine's own one to answer --version with
# the version.
set -eu
export HOME=/tmp CARGO_HOME=/tmp/cargo CARGO_TARGET_DIR=/tmp/target CARGO_TERM_COLOR=never CI=1
out=${ZAZZLE_OUTPUT:-/zazzle/output}
if [ "${ZAZZLE_ENV:-}" != release ]; then
  echo "not the release environment (ZAZZLE_ENV=${ZAZZLE_ENV:-none}): no release binaries are built"
  exit 0
fi
src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
cp -R "$src" /tmp/repo
cd /tmp/repo
case "$(uname -m)" in
  x86_64)  native=x86_64-unknown-linux-musl;  cross=aarch64-unknown-linux-musl ;;
  aarch64) native=aarch64-unknown-linux-musl; cross=x86_64-unknown-linux-musl ;;
  *) echo "no musl target for $(uname -m)" >&2; exit 1 ;;
esac
version=$(cargo metadata --no-deps --format-version 1 --locked \
  | python3 -c 'import json, sys; print(next(p["version"] for p in json.load(sys.stdin)["packages"] if p["name"] == "cyberspace-generator"))')
echo "cyberspace-generator $version at ${ZAZZLE_COMMIT:-?}, $(rustc --version)"
mkdir -p "$out/dist"
binary() { # binary TARGET build|zigbuild
  t=$1; f="$out/dist/cyberspace-generator-$t"
  echo "── cargo $2 $t"
  cargo "$2" --release --locked -p cyberspace-generator --target "$t"
  cp "$CARGO_TARGET_DIR/$t/release/cyberspace-generator" "$f"
  case $t in x86_64-*) want=3e00 ;; aarch64-*) want=b700 ;; esac
  got=$(od -An -tx1 -j18 -N2 "$f" | tr -d ' \n')   # ELF e_machine, little-endian
  [ "$got" = "$want" ] || { echo "$f is not a $t binary (e_machine $got)" >&2; exit 1; }
  if LC_ALL=C grep -qaE '/lib(64)?/ld-(linux|musl)' "$f"; then echo "$f names a dynamic loader: not static" >&2; exit 1; fi
  echo "$(basename "$f"): $(wc -c <"$f" | tr -d ' ') bytes"
}
binary "$native" build
binary "$cross" zigbuild
v=$("$out/dist/cyberspace-generator-$native" --version)
case "$v" in *"$version"*) echo "$v" ;; *) echo "--version says \"$v\", not $version" >&2; exit 1 ;; esac
(cd "$out/dist" && sha256sum cyberspace-generator-* >SHA256SUMS && cat SHA256SUMS)
echo "$version" >"$out/VERSION"
git -c safe.directory='*' rev-parse HEAD >"$out/BUILD" 2>/dev/null || echo "${ZAZZLE_COMMIT:-unknown}" >"$out/BUILD"
echo "the Linux binaries of cyberspace-generator $version are built"
