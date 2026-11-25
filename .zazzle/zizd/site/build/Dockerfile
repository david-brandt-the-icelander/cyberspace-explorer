# The `build` step of cyberspace-explorer's `site` pipeline: bundles the explorer's Worker (wrangler.jsonc) without
# deploying it. wrangler is the version the legacy runner pinned; the root package has no lock file of its own.
FROM node:22.21.1-bookworm-slim
RUN npm install -g --no-audit --no-fund wrangler@4.156.1 && npm cache clean --force
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
