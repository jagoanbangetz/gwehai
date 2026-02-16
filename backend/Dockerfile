# Build context: backend/ (so skills/ is backend/skills)
# Build: docker build -t gwehai-backend -f backend/Dockerfile backend
# Skills are copied into the image so the agent can load them at runtime (no volume needed).

FROM node:20-alpine AS builder

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source and skills (skills baked into image)
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install prod deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built app and skills (skills must be next to dist so getWorkspaceRoot finds them)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/skills ./skills

# So that process.cwd() is /app and /app/skills exists; optional override via env
ENV NODE_ENV=production
ENV PENTEST_WORKSPACE=/app

USER node
EXPOSE 3001

CMD ["node", "dist/main.js"]
