# The `release` step of cyberspace-explorer's `generator` pipeline (deploys: true), in the `release` environment: reads
# cyberspace-generator's version from the repository, creates the tag generator-v<version> at the commit and the GitHub
# release, and adds the Linux binaries the `build` step made (/zazzle/input/artifacts/build). It never rebuilds.
# Needs GITHUB_RELEASE_TOKEN (Contents: write on the repository).
FROM debian:12.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates curl jq && rm -rf /var/lib/apt/lists/*
COPY run.sh /run.sh
CMD ["bash", "/run.sh"]
