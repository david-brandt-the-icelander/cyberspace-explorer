# Bundle the explorer's Worker and lay out what `deploy` deploys, so that the deploy only uploads:
#   worker/        the bundle (wrangler deploy --dry-run --outdir): index.js and the modules it imports as text
#                  (index.html, worker/admin.html, docs/cyberspace-protocol.md). wrangler.jsonc's main is worker/index.js,
#                  so the copy below names the bundle without a change.
#   wrangler.jsonc the repository's configuration
#   BUILD          the commit
set -eu
export HOME=/tmp npm_config_cache=/tmp/.npm CI=1 WRANGLER_SEND_METRICS=false
out=${ZAZZLE_OUTPUT:-/zazzle/output}
src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
cp -R "$src" /tmp/repo
cd /tmp/repo
# wrangler runs a configuration's custom build command at deploy time, even with --no-bundle: refuse one here, so a
# build never hands the deploy step something it would run with the Cloudflare token.
if grep -qE '"build"[[:space:]]*:' wrangler.jsonc; then echo "wrangler.jsonc has a build command; the pipeline does not run one" >&2; exit 1; fi
echo "bundling the explorer's Worker with wrangler $(wrangler --version)"
wrangler deploy --dry-run -c wrangler.jsonc --outdir "$out/worker"
rm -f "$out/worker/README.md"   # wrangler's note about the folder, not part of the Worker
cp wrangler.jsonc "$out/"
git -c safe.directory='*' rev-parse HEAD >"$out/BUILD" 2>/dev/null || echo "${ZAZZLE_COMMIT:-unknown}" >"$out/BUILD"
ls -lR "$out"
echo "the explorer's Worker is built"
