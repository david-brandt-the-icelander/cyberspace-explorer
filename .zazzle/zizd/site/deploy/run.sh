# Deploy the explorer's Worker from the build step's artifacts, as the legacy runner's deploy.sh does for it:
#   1. refuse without CLOUDFLARE_API_TOKEN, without the artifacts, with the crawler's database placeholder still in
#      wrangler.jsonc, or with a custom build command in it;
#   2. wrangler deploy of the bundle as it is (--no-bundle);
#   3. smoke: / says "Cyberspace explorer", /auth/me answers, /crawler says "cyberspace-crawler";
#   4. if the smoke test fails, wrangler rollback, and the step fails.
# A halt request (ZAZZLE_HALT_FILE) is honoured before the deploy, with exit 75. Once the Worker is deployed the smoke
# test and its rollback always run: they decide whether what was just deployed may stay. No migrations: the crawler's
# schema (crawler/schema.sql) is applied by the owner, never from a pipeline, as today.
#
# DEPLOY_DRY_RUN=1, for trying the step by hand only (no pipeline names it): no credentials needed,
# `wrangler deploy --dry-run` instead of the deploy, the smoke test reads the live site, and a rollback is only logged.
set -eu
export HOME=/tmp npm_config_cache=/tmp/.npm CI=1 WRANGLER_SEND_METRICS=false
art=${ZAZZLE_ARTIFACTS:-/zazzle/input/artifacts}/build
dry=${DEPLOY_DRY_RUN:-}
site=https://cyberspace-explorer.com
halted() { if [ -n "${ZAZZLE_HALT_FILE:-}" ] && [ -f "$ZAZZLE_HALT_FILE" ]; then echo "halting before $1: $(cat "$ZAZZLE_HALT_FILE")"; exit 75; fi; }
if [ -z "$dry" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then echo "refusing: CLOUDFLARE_API_TOKEN is needed" >&2; exit 1; fi
for f in worker/index.js wrangler.jsonc; do
  [ -e "$art/$f" ] || { echo "refusing: the build step's artifacts have no $f ($art)" >&2; exit 1; }
done
rm -rf /tmp/deploy && cp -R "$art" /tmp/deploy
cd /tmp/deploy
if grep -q REPLACE-WITH-D1-DATABASE-ID wrangler.jsonc; then
  echo "refusing: wrangler.jsonc still holds REPLACE-WITH-D1-DATABASE-ID (crawler/README.md, \"Setting it up once\")" >&2; exit 1
fi
if grep -qE '"build"[[:space:]]*:' wrangler.jsonc; then echo "refusing: wrangler.jsonc has a build command" >&2; exit 1; fi
echo "deploying cyberspace-explorer $(cat BUILD 2>/dev/null || echo '?') with wrangler $(wrangler --version)${dry:+ (dry run)}"

page_says() { # page_says URL TEXT: it answers 200 (after redirects) and contains TEXT
  body=$(curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors -m 20 "$1") || { echo "smoke test failed: $1"; return 1; }
  case $body in *"$2"*) echo "smoke ok: $1 contains \"$2\"" ;; *) echo "smoke test failed: $1 does not contain \"$2\""; return 1 ;; esac
}
answers() { curl -fsS -o /dev/null --retry 5 --retry-delay 3 --retry-all-errors -m 20 "$1" && echo "smoke ok: $1" || { echo "smoke test failed: $1"; return 1; }; }
smoke() {
  sleep "${SMOKE_DELAY:-5}"
  page_says "$site/" "Cyberspace explorer" && answers "$site/auth/me" && page_says "$site/crawler" "cyberspace-crawler"
}

halted "the deploy"
if [ -n "$dry" ]; then
  wrangler deploy worker/index.js --no-bundle -c wrangler.jsonc --dry-run
else
  wrangler deploy worker/index.js --no-bundle -c wrangler.jsonc
fi
if smoke; then
  echo "cyberspace-explorer deployed${dry:+ (dry run)}"
  exit 0
fi
if [ -n "$dry" ]; then
  echo "dry run: a deploy would roll back the explorer's Worker here"
else
  echo "smoke test failed: rolling back the explorer's Worker"
  wrangler rollback -c wrangler.jsonc -y --message "zizd: smoke test failed for $(head -c 12 BUILD 2>/dev/null)" \
    || echo "the rollback failed: roll back by hand (wrangler rollback -c wrangler.jsonc)"
fi
exit 1
