# The `build` step of cyberspace-explorer's `crawler` pipeline: installs the crawler's dependencies
# (crawler/package-lock.json) and bundles the cyberspace-crawler Worker (crawler/wrangler.jsonc) without deploying it.
FROM node:22.21.1-bookworm-slim
RUN npm install -g --no-audit --no-fund wrangler@4.156.1 && npm cache clean --force
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
