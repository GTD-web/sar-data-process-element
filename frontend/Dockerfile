# 빌드 컨텍스트는 repo root. (CSC natives 를 COPY 하기 위함)
# 실행: docker build -t sdpe-frontend:latest -f frontend/Dockerfile .

# --- deps ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Lockfile 은 일부러 복사하지 않는다. Windows 호스트에서 생성된 lockfile 이
# platform-specific optional native deps (lightningcss-linux-x64-gnu,
# @tailwindcss/oxide-linux-x64-gnu 등) 를 빠뜨려 빌드가 깨진다.
# (npm bug https://github.com/npm/cli/issues/4828)
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund

# --- build ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

# --- runner ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next.js standalone 가 컨테이너 ID 호스트네임(= 172.x.x.x bridge IP) 에만 바인딩하는
# 기본 동작 회피. 0.0.0.0 으로 명시해 컨테이너 내부 localhost 접근도 허용.
ENV HOSTNAME=0.0.0.0
# matplotlib 가 /nonexistent/.config 에 쓰려다 fallback 경고 내는 것 방지
ENV MPLCONFIGDIR=/tmp/matplotlib
# H5 업로드/실행 산출물 저장 디렉토리 (컨테이너 내부, 재시작 시 휘발)
ENV SDPE_UPLOAD_DIR=/tmp/sdpe-uploads
ENV SDPE_RUN_DIR=/tmp/sdpe-runs

# Python 런타임 + SAR natives 의존성. apt 패키지로 numpy/scipy 빌드 회피.
# rasterio: SLC TIFF strip 쓰기 + QuickLook PNG 생성에 필수
# (없으면 io.py 가 ENVI BIN fallback 으로 가서 QuickLook 이 생성 안 됨)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-numpy \
      python3-scipy \
      python3-h5py \
      python3-matplotlib \
      python3-rasterio \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# CSC natives (root context). CSC-03 추가 시 한 줄 더 COPY.
COPY --chown=nextjs:nodejs natives/csc-04-level-1-processor /app/natives/csc-04

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
