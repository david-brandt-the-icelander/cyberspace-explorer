# The `check` step of cyberspace-explorer's `generator` pipeline: the Rust checks of the legacy runner's ci.sh
# (cargo fmt, clippy, test, cyberspace-generator validate), with Python's jsonschema for the parity tests.
# Pinned: Rust 1.100.0 (the legacy runner's), jsonschema 4.26.0 (with referencing).
FROM rust:1.100.0-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rustup component add clippy rustfmt \
 && python3 -m venv /opt/py && /opt/py/bin/pip install --no-cache-dir "jsonschema==4.26.0" \
 && /opt/py/bin/python3 -c 'import jsonschema, referencing' \
 && chmod -R a+rX /usr/local/rustup /usr/local/cargo /opt/py
# RUSTUP_TOOLCHAIN holds every run to this Rust, even if a branch adds a rust-toolchain file.
ENV RUSTUP_TOOLCHAIN=1.100.0 PATH=/opt/py/bin:/usr/local/cargo/bin:$PATH
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
