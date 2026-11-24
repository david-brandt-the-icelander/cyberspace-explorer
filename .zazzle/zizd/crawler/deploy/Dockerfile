# The `deploy` step of cyberspace-explorer's `crawler` pipeline (deploys: true): deploys the cyberspace-crawler Worker the
# `build` step bundled, from /zazzle/input/artifacts/build. It never rebuilds. Needs CLOUDFLARE_API_TOKEN.
FROM node:22.21.1-bookworm-slim
RUN npm install -g --no-audit --no-fund wrangler@4.156.1 && npm cache clean --force
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
