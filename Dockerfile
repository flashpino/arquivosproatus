# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine

# Timezone Brasil
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && \
    echo "America/Sao_Paulo" > /etc/timezone

WORKDIR /app

# Copia dependências e código do builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Cria pasta de logs
RUN mkdir -p logs

# Usuário não-root por segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
