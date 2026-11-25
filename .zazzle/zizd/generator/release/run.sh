#!/usr/bin/env bash
# Release cyberspace-generator from the build step's artifacts, in the `release` environment only:
#   1. refuse outside the release environment, without GITHUB_RELEASE_TOKEN, or without the build's artifacts (and
#      refuse artifacts of another commit, or binaries that do not match their SHA256SUMS);
#   2. the version is [workspace.package] version in the repository's Cargo.toml, and must be the build's VERSION;
#      the tag is generator-v<version>;
#   3. the tag: created at this commit if there is none; if it exists at another commit, refuse (set a new version);
#   4. the release: a draft with generated notes, made if there is none; if it is already published, there is nothing
#      to do;
#   5. the two Linux binaries are uploaded, replacing assets of the same name, and SHA256SUMS keeps the other lines;
#   6. the draft is published once all four binaries are there and SHA256SUMS agrees with GitHub's checksums.
# The macOS half has no step yet (it needs a Tart VM step): until then the owner runs release-macos.sh generator-v<version>
# on the Mac, which adds the two macOS binaries to this draft and publishes it. Until both halves are in, the release stays
# a draft, which consumers never see. The asset names and SHA256SUMS are what zazzle's bump-cyberspace-generator.sh and
# fetch-cyberspace-generator.sh depend on, as in the legacy runner's github-release.sh.
#
# A halt request (ZAZZLE_HALT_FILE) is honoured before each of 3–6, with exit 75; a rerun picks up where it stopped.
# The token goes to curl in a header file, never on a command line or in a URL.
#
# DEPLOY_DRY_RUN=1, for trying the step by hand only (no pipeline names it): no token needed; it reads the public API
# without one, and says what it would do instead of doing it.
set -euo pipefail
export HOME=/tmp
repo=david-brandt-the-icelander/cyberspace-explorer
api=https://api.github.com uploads=https://uploads.github.com
targets="aarch64-apple-darwin x86_64-apple-darwin x86_64-unknown-linux-musl aarch64-unknown-linux-musl"
art=${ZAZZLE_ARTIFACTS:-/zazzle/input/artifacts}/build
dry=${DEPLOY_DRY_RUN:-}
say() { printf '%s\n' "$*"; }
refuse() { say "refusing: $*" >&2; exit 1; }
halted() { if [ -n "${ZAZZLE_HALT_FILE:-}" ] && [ -f "$ZAZZLE_HALT_FILE" ]; then say "halting before $1: $(cat "$ZAZZLE_HALT_FILE")"; exit 75; fi; }

[ "${ZAZZLE_ENV:-}" = release ] || refuse "cyberspace-generator is released from the release environment only (ZAZZLE_ENV=${ZAZZLE_ENV:-none})"
token=${GITHUB_RELEASE_TOKEN:-}
[ -n "$token" ] || [ -n "$dry" ] || refuse "GITHUB_RELEASE_TOKEN is needed"
commit=${ZAZZLE_COMMIT:-}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || refuse "ZAZZLE_COMMIT is not a commit: '$commit'"
for f in VERSION BUILD dist/SHA256SUMS dist/cyberspace-generator-x86_64-unknown-linux-musl dist/cyberspace-generator-aarch64-unknown-linux-musl; do
  [ -f "$art/$f" ] || refuse "the build step's artifacts have no $f ($art)"
done
[ "$(cat "$art/BUILD")" = "$commit" ] || refuse "the build step's artifacts are of $(cat "$art/BUILD"), not $commit"
(cd "$art/dist" && sha256sum --quiet -c SHA256SUMS) || refuse "the binaries do not match the build's SHA256SUMS"

src=$(ls -d /zazzle/input/repos/*/cyberspace-explorer | head -1)
version=$(awk '/^\[/{s=($0=="[workspace.package]")} s && /^version *=/{gsub(/^version *= *"|".*$/,""); print; exit}' "$src/Cargo.toml")
[ -n "$version" ] || refuse "no version under [workspace.package] in Cargo.toml"
[ "$version" = "$(cat "$art/VERSION")" ] || refuse "Cargo.toml says $version, the build says $(cat "$art/VERSION")"
tag=generator-v$version
say "releasing cyberspace-generator $version as $tag at $commit${dry:+ (dry run)}"

# gh METHOD URL [curl args…]: a call to GitHub; the body goes to $body, the HTTP status is printed. A URL starting with
# / is under the repository.
body=$(mktemp) headers=$(mktemp)
chmod 600 "$headers"
trap 'rm -f "$body" "$headers"' EXIT
{ [ -z "$token" ] || printf 'Authorization: Bearer %s\n' "$token"; printf 'X-GitHub-Api-Version: 2022-11-28\n'; } >"$headers"
gh() {
  local method=$1 url=$2; shift 2
  case $url in /*) url="$api/repos/$repo$url" ;; esac
  curl -sS --retry 3 -H @"$headers" -H "Accept: ${accept:-application/vnd.github+json}" -X "$method" -o "$body" -w '%{http_code}' "$@" "$url"
}
ok() { case $1 in 2??) return 0 ;; *) say "GitHub answered $1: $(head -c 300 "$body")" >&2; return 1 ;; esac; }

# 3. The tag.
halted "the tag"
status=$(gh GET "/git/ref/tags/$tag")
case $status in
  200)
    tag_sha=$(jq -r .object.sha "$body")
    if [ "$(jq -r .object.type "$body")" = tag ]; then status=$(gh GET "/git/tags/$tag_sha"); ok "$status"; tag_sha=$(jq -r .object.sha "$body"); fi
    [ "$tag_sha" = "$commit" ] || refuse "$tag exists at $tag_sha, not $commit: set a new version under [workspace.package] in Cargo.toml"
    say "$tag exists at $commit" ;;
  404)
    if [ -n "$dry" ]; then say "dry run: would create the tag $tag at $commit"
    else
      status=$(gh POST /git/refs -d "$(jq -nc --arg r "refs/tags/$tag" --arg s "$commit" '{ref:$r, sha:$s}')"); ok "$status"
      say "created the tag $tag at $commit"
    fi ;;
  *) ok "$status" || exit 1 ;;
esac

# 4. The release: drafts are listed only with a token, so a dry run sees published releases only.
halted "the draft release"
find_release() {
  local page=1 n
  while [ "$page" -le 10 ]; do
    status=$(gh GET "/releases?per_page=100&page=$page"); ok "$status" || return 1
    rel=$(jq -c --arg t "$tag" '[.[] | select(.tag_name == $t)] | sort_by(.id) | first // empty' "$body")
    n=$(jq length "$body")
    [ -z "$rel" ] || return 0
    [ "$n" = 100 ] || return 0
    page=$((page + 1))
  done
}
rel=""; find_release
if [ -n "$rel" ] && [ "$(jq -r .draft <<<"$rel")" != true ]; then
  say "the release $tag is already published ($(jq -r .html_url <<<"$rel")): nothing to do"; exit 0
fi
if [ -n "$dry" ]; then
  if [ -n "$rel" ]; then say "dry run: would add to the draft release $tag (id $(jq -r .id <<<"$rel"))"
  else say "dry run: would create the draft release $tag (or add to its draft, which a dry run cannot see without a token)"; fi
  say "dry run: would upload these, and their lines of SHA256SUMS:"
  (cd "$art/dist" && ls -l cyberspace-generator-* && sed 's/^/  /' SHA256SUMS)
  say "dry run: would publish once the macOS binaries are there too (release-macos.sh $tag on the Mac)"
  exit 0
fi
if [ -n "$rel" ]; then
  id=$(jq -r .id <<<"$rel"); say "the draft release $tag exists (id $id)"
else
  status=$(gh POST /releases -d "$(jq -nc --arg t "$tag" --arg c "$commit" '{tag_name:$t, target_commitish:$c, name:$t, draft:true, generate_release_notes:true}')")
  ok "$status"; id=$(jq -r .id "$body"); say "created the draft release $tag (id $id)"
fi

# 5. The binaries and SHA256SUMS.
asset_id() { status=$(gh GET "/releases/$id/assets?per_page=100"); ok "$status" && jq -r --arg n "$1" '.[] | select(.name == $n) | .id' "$body"; }
upload() { # upload FILE: under its own name, replacing an asset of that name
  local name old; name=$(basename "$1")
  old=$(asset_id "$name")
  if [ -n "$old" ]; then status=$(gh DELETE "/releases/assets/$old"); ok "$status"; fi
  status=$(gh POST "$uploads/repos/$repo/releases/$id/assets?name=$name" -H 'Content-Type: application/octet-stream' --data-binary @"$1"); ok "$status"
  say "attached $name"
}
halted "the uploads"
work=$(mktemp -d)
for f in "$art"/dist/cyberspace-generator-*; do upload "$f"; done
old=$(asset_id SHA256SUMS)
: >"$work/old"
if [ -n "$old" ]; then
  # The asset URL redirects to storage that must not get the token; curl drops it on the redirect to another host.
  status=$(accept=application/octet-stream gh GET "/releases/assets/$old" -L); ok "$status"; cp "$body" "$work/old"
fi
awk 'NR == FNR { mine[$2] = 1; next } !($2 in mine)' "$art/dist/SHA256SUMS" "$work/old" >"$work/kept"
cat "$art/dist/SHA256SUMS" "$work/kept" | LC_ALL=C sort -k2 >"$work/SHA256SUMS"
say "SHA256SUMS:"; sed 's/^/  /' "$work/SHA256SUMS"
upload "$work/SHA256SUMS"

# 6. Publish once complete.
halted "publishing"
status=$(gh GET "/releases/$id/assets?per_page=100"); ok "$status"; cp "$body" "$work/assets"
missing=""
for t in $targets; do
  name=cyberspace-generator-$t
  jq -e --arg n "$name" 'any(.[]; .name == $n)' "$work/assets" >/dev/null || { missing="$missing $t"; continue; }
  want=$(awk -v n="$name" '$2 == n { print $1 }' "$work/SHA256SUMS")
  got=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .digest // "" | sub("^sha256:"; "")' "$work/assets")
  [ -n "$want" ] || refuse "$name is not in SHA256SUMS; $tag stays a draft"
  [ -z "$got" ] || [ "$got" = "$want" ] || refuse "$name: SHA256SUMS says $want, GitHub has $got; $tag stays a draft"
done
if [ -n "$missing" ]; then
  say "the release $tag stays a draft until it has:$missing (on the Mac: release-macos.sh $tag)"
  exit 0
fi
status=$(gh PATCH "/releases/$id" -d '{"draft":false}'); ok "$status"
say "published $(jq -r .html_url "$body")"
