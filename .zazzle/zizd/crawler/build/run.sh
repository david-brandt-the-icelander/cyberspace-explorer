# Bundle the crawler and lay out what `deploy` deploys:
#   src/           the bundle (wrangler deploy --dry-run --outdir), its dependencies (@anthropic-ai/sdk) inside it.
#                  crawler/wrangler.jsonc's main is src/index.js, so the copy below names the bundle without a change.
#   wrangler.jsonc crawler/wrangler.jsonc
#   BUILD          the commit
set -eu
export HOME=/tmp npm_config_cache=/tmp/.npm CI=1 WRANGLER_SEND_METRICS=false
out=${ZAZZLE_OUTPUT:-/zazzle/output}
src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
cp -R "$src" /tmp/repo
cd /tmp/repo
if grep -qE '"build"[[:space:]]*:' crawler/wrangler.jsonc; then echo "crawler/wrangler.jsonc has a build command; the pipeline does not run one" >&2; exit 1; fi
npm ci --prefix crawler --no-audit --no-fund
echo "bundling the crawler with wrangler $(wrangler --version)"
wrangler deploy --dry-run -c crawler/wrangler.jsonc --outdir "$out/src"
rm -f "$out/src/README.md"   # wrangler's note about the folder, not part of the Worker
cp crawler/wrangler.jsonc "$out/wrangler.jsonc"
git -c safe.directory='*' rev-parse HEAD >"$out/BUILD" 2>/dev/null || echo "${ZAZZLE_COMMIT:-unknown}" >"$out/BUILD"
ls -lR "$out"
echo "the crawler is built"
