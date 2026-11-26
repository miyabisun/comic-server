# Rust inference helper; model conversion is isolated in a build-only Python stage.
FROM rust:1.97-bookworm AS remaster-build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY remaster/main.rs remaster/main.rs
RUN cargo build --release --locked

FROM python:3.14-slim-bookworm AS models
WORKDIR /build
COPY remaster/requirements-build.txt ./
RUN pip install --no-cache-dir -r requirements-build.txt
COPY remaster/prepare-models.py ./
RUN python prepare-models.py /models
# ONNX Runtime CPU from Microsoft's NuGet package; its Linux x64 library is the same file the GitHub release archive shipped.
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/1.29.0/microsoft.ml.onnxruntime.1.29.0.nupkg', '/runtime.nupkg')" && \
    echo '4557021fec4da3924e2e12ff44b1cc50b176de0d2c5c7daa89ab11c208b3a454  /runtime.nupkg' | sha256sum -c - && \
    python -m zipfile -e /runtime.nupkg /nupkg && \
    mkdir -p /runtime/lib && \
    install -m 755 /nupkg/runtimes/linux-x64/native/libonnxruntime.so /runtime/lib/libonnxruntime.so.1.29.0 && \
    install -m 755 /nupkg/runtimes/linux-x64/native/libonnxruntime_providers_shared.so /runtime/lib/ && \
    ln -s libonnxruntime.so.1.29.0 /runtime/lib/libonnxruntime.so.1 && \
    ln -s libonnxruntime.so.1 /runtime/lib/libonnxruntime.so && \
    rm -rf /runtime.nupkg /nupkg

# Stage 1: Build
FROM oven/bun:1.4.3 AS builder
WORKDIR /app

# Server dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Client build
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile
COPY client/ ./client/
RUN cd client && bun run build

# Assemble /dist
RUN mkdir -p /dist/client && \
    cp package.json bun.lock /dist/ && \
    cp -r client/build /dist/client/
COPY src/ /dist/src/
RUN cd /dist && bun install --frozen-lockfile --production

# Stage 2: Production runtime
FROM oven/bun:1.4.3-slim
WORKDIR /app
COPY --from=builder /dist ./
COPY --from=remaster-build /build/target/release/comic-remaster ./target/release/comic-remaster
COPY --from=models /models ./remaster/models
COPY --from=models /runtime/lib/ /usr/local/lib/
COPY LICENSE README.md README.ja.md DESIGN.md ./
COPY docs/ ./docs/
COPY licenses/ ./licenses/
ENV ORT_DYLIB_PATH=/usr/local/lib/libonnxruntime.so.1.29.0
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
