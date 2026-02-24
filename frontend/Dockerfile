# Build and serve frontend for Playwright / browser tests.
# Build: docker build -t gwehai-frontend -f frontend/Dockerfile frontend
# Serve: listens on 0.0.0.0:4173

FROM node:20-alpine

# For healthcheck
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4173

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4173/ || exit 1

CMD ["npm", "run", "preview:docker"]
