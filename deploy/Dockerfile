# Build stage: client bundle + server bundle, content validation.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run validate && npm run build

# Runtime stage: only what the server needs.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    DATA_DIR=/data \
    CLIENT_DIR=/app/client/dist \
    PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "dist/index.js"]
