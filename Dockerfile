# Stage 1: Client build (Node.js)
FROM node:22-slim AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Rust build
FROM rust:1-slim-bookworm AS rust-builder
WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Build actual source
COPY src/ ./src/
RUN touch src/main.rs && cargo build --release

# Stage 3: Runtime
FROM debian:bookworm-slim
RUN groupadd -r comic && useradd -r -g comic -d /app comic
WORKDIR /app
COPY --from=rust-builder /app/target/release/comic-server ./comic-server
COPY --from=client-builder /app/client/build ./client/build
RUN chown -R comic:comic /app
USER comic
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["./comic-server"]
