# Stage 1: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Server
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY prisma/ ./prisma/
RUN npx prisma generate
COPY src/ ./src/
COPY --from=client-builder /app/client/build ./client/build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
