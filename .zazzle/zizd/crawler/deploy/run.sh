# Deploy the crawler from the build step's artifacts, as the legacy runner's deploy.sh does for it: refuse without
# CLOUDFLARE_API_TOKEN, without the artifacts, with the database placeholder still in its configuration, or with a custom
# build command; then wrangler deploy of the bundle as it is (--no-bundle). A halt request (ZAZZLE_HALT_FILE) is honoured
# before the deploy, with exit 75.
#
# The crawler has no public route, so there is no smoke test of its own (the explorer's deploy checks /crawler, a page the
# explorer serves). No migrations: crawler/schema.sql is applied by the owner, never from a pipeline, as today. The
# database, bucket and queues are created once by the owner (crawler/README.md, "Setting it up once").
#
# DEPLOY_DRY_RUN=1, for trying the step by hand only (no pipeline names it): no credentials needed, and
# `wrangler deploy --dry-run` instead of the deploy.
set -eu
export HOME=/tmp npm_config_cache=/tmp/.npm CI=1 WRANGLER_SEND_METRICS=false
art=${ZAZZLE_ARTIFACTS:-/zazzle/input/artifacts}/build
dry=${DEPLOY_DRY_RUN:-}
halted() { if [ -n "${ZAZZLE_HALT_FILE:-}" ] && [ -f "$ZAZZLE_HALT_FILE" ]; then echo "halting before $1: $(cat "$ZAZZLE_HALT_FILE")"; exit 75; fi; }
if [ -z "$dry" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then echo "refusing: CLOUDFLARE_API_TOKEN is needed" >&2; exit 1; fi
for f in src/index.js wrangler.jsonc; do
  [ -e "$art/$f" ] || { echo "refusing: the build step's artifacts have no $f ($art)" >&2; exit 1; }
done
rm -rf /tmp/deploy && cp -R "$art" /tmp/deploy
cd /tmp/deploy
if grep -q REPLACE-WITH-D1-DATABASE-ID wrangler.jsonc; then
  echo "refusing: crawler/wrangler.jsonc still holds REPLACE-WITH-D1-DATABASE-ID (crawler/README.md, \"Setting it up once\")" >&2; exit 1
fi
if grep -qE '"build"[[:space:]]*:' wrangler.jsonc; then echo "refusing: crawler/wrangler.jsonc has a build command" >&2; exit 1; fi
echo "deploying cyberspace-crawler $(cat BUILD 2>/dev/null || echo '?') with wrangler $(wrangler --version)${dry:+ (dry run)}"
halted "the deploy"
if [ -n "$dry" ]; then
  wrangler deploy src/index.js --no-bundle -c wrangler.jsonc --dry-run
else
  wrangler deploy src/index.js --no-bundle -c wrangler.jsonc
fi
echo "cyberspace-crawler deployed${dry:+ (dry run)}"
