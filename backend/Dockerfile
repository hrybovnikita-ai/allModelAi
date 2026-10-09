# Backend-only build context (if Render root directory is set to backend/).
# Prefer the repo-root Dockerfile via render.yaml for the bundled frontend dist.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN node -e "require('./src/services/cloudflareImageService'); require('./src/services/responseLanguage'); require('./src/services/imageGenerationService');"

ENV NODE_ENV=production HOST=0.0.0.0 PORT=5050

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
