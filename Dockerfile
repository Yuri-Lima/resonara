# Production image: Node 20 + ffmpeg with soxr, lame, vorbis, opus, flac
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version | head -1 \
  && ffmpeg -hide_banner -filters 2>&1 | grep -q loudnorm \
  && ffmpeg -hide_banner -filters 2>&1 | grep -q aresample

# Verify soxr if available in distro build (Debian ffmpeg often has soxr)
RUN ffmpeg -hide_banner -h filter=aresample 2>&1 | head -5 || true

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
