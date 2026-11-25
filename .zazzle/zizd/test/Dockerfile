# The `test` step of cyberspace-explorer's `site` and `crawler` pipelines: `npm test` (the Worker, the page's pure
# functions, the VS Code extension and the crawler), as the legacy runner's ci.sh does. Node 22, as there, and python3
# with jsonschema 4.26.0: the crawler's tests check the views it writes against the skills' schemas with it.
FROM node:22.21.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/py && /opt/py/bin/pip install --no-cache-dir "jsonschema==4.26.0" \
 && /opt/py/bin/python3 -c 'import jsonschema' && chmod -R a+rX /opt/py
ENV PATH=/opt/py/bin:$PATH
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
