# The `build` step of cyberspace-explorer's `generator` pipeline: in the `release` environment, the static Linux binaries
# of cyberspace-generator for both CPU types, as the legacy runner's release.sh builds them (the machine's own musl target
# with cargo, the other with cargo-zigbuild). Elsewhere it builds nothing.
# Pinned as in the legacy runner: Rust 1.100.0, zig 0.17.1 (ziglang) and cargo-zigbuild 0.24.1.
FROM rust:1.100.0-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev musl-tools python3 python3-venv git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl \
 && python3 -m venv /opt/py && /opt/py/bin/pip install --no-cache-dir "ziglang==0.17.1" "cargo-zigbuild==0.24.1" \
 && chmod -R a+rX /usr/local/rustup /usr/local/cargo /opt/py
ENV RUSTUP_TOOLCHAIN=1.100.0 PATH=/opt/py/bin:/usr/local/cargo/bin:$PATH
RUN cargo zigbuild --help >/dev/null && python3 -m ziglang version
COPY run.sh /run.sh
CMD ["sh", "/run.sh"]
