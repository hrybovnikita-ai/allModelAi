FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
COPY backend ./
# Fail the image build if git is missing required modules (avoids a running container that crashes on require).
RUN node -e "require('./src/services/cloudflareImageService'); require('./src/services/responseLanguage'); require('./src/services/imageGenerationService');"
COPY --from=frontend /frontend/dist /app/frontend/dist
# DATABASE_URL (Supabase pooler) selects PostgreSQL in production. DB_FILE is only used when DATABASE_URL is unset.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5050
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
