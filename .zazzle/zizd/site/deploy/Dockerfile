# The `deploy` step of cyberspace-explorer's `site` pipeline (deploys: true): deploys the Worker the `build` step bundled
# to cyberspace-explorer.com, from /zazzle/input/artifacts/build, smoke-tests the site and rolls back if it fails.
# It never rebuilds. Needs CLOUDFLARE_API_TOKEN. wrangler is the build step's version.
FROM node:22.21.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && npm install -g --no-audit --no-fund wrangler@4.156.1 && npm cache clean --force
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
