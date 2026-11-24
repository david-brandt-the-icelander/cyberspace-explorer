# The Rust checks, on a copy of the repository, with cargo's registry and target directory in /tmp. Leaves nothing in
# /zazzle/output. As in the legacy runner, the parity tests need python3 with jsonschema and referencing (they pass
# silently without them), so that is checked first.
set -eu
export HOME=/tmp CARGO_HOME=/tmp/cargo CARGO_TARGET_DIR=/tmp/target CARGO_TERM_COLOR=never CI=1
src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
cp -R "$src" /tmp/repo
cd /tmp/repo
step() { echo "── $*"; t0=$(date +%s); "$@"; echo "── ok ($(( $(date +%s) - t0 )) s)"; }
echo "checking ${ZAZZLE_COMMIT:-?} with $(rustc --version) and $(python3 --version)"
step python3 -c 'import jsonschema, referencing'
step cargo fmt --all --check
step cargo clippy --workspace --all-targets --locked -- -D warnings
step cargo test --workspace --locked
step cargo run -q --locked -p cyberspace-generator -- validate
echo "the generator's checks passed"
