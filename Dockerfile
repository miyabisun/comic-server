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
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/microsoft/onnxruntime/releases/download/v1.29.0/onnxruntime-linux-x64-1.29.0.tgz', '/runtime.tgz')" && \
    echo 'c3fddc4f139a045b0c4902c57410f0694f1c2fdf9b6939fbe38b1aeae7cd14ba  /runtime.tgz' | sha256sum -c - && \
    mkdir /runtime && tar -xzf /runtime.tgz --strip-components=1 -C /runtime

# Stage 1: Build
FROM oven/bun:1.4.2 AS builder
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
FROM oven/bun:1.4.2-slim
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
