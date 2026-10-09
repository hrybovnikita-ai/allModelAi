# AllModelAI production image (Render: dockerfilePath ./Dockerfile, repo root as build context).
FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci -w frontend
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev -w allmodelai-backend
COPY backend ./backend
# Fail the image build if git is missing required modules (avoids a running container that crashes on require).
RUN node -e "require('./backend/src/services/cloudflareImageService'); require('./backend/src/services/responseLanguage'); require('./backend/src/services/imageGenerationService');"
COPY --from=frontend /app/frontend/dist /app/frontend/dist
WORKDIR /app/backend
# DATABASE_URL (Supabase pooler) selects PostgreSQL in production. DB_FILE is only used when DATABASE_URL is unset.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5050
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
