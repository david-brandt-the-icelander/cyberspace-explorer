# npm test on a copy of the repository (the input is read-only). The root package has no dependencies and the crawler's
# tests run without its own (crawler/package.json), as in the legacy runner. Leaves nothing in /zazzle/output.
set -eu
export HOME=/tmp npm_config_cache=/tmp/.npm npm_config_update_notifier=false CI=1
src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
cp -R "$src" /tmp/repo
cd /tmp/repo
echo "npm test of ${ZAZZLE_COMMIT:-?} with node $(node --version)"
npm test
