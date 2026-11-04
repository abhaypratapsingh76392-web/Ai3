# ---------- FreeModel VIP ----------
FROM node:20-alpine AS base
ENV NODE_ENV=production
WORKDIR /app

# install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# copy the app
COPY server ./server
COPY public ./public

# storage folder (mount a disk here on Render for persistence)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
