# RPG学習アプリのコンテナ（詳細設計書 11.3）。ROLE=api / worker / all で役割を切り替える
# ビルド：docker build --build-arg APP_ENV=dev --build-arg RELEASE_NO=20261105-01 -t rpg-app:20261105-01 .
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/build-web.mjs ./scripts/
COPY web ./web
ARG APP_ENV=dev
ARG RELEASE_NO=local
RUN node scripts/build-web.mjs --env=${APP_ENV} --release=${RELEASE_NO} && mv dist/web-${APP_ENV} dist/web
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY functions ./functions
COPY server ./server
COPY db ./db
COPY scripts/migrate.mjs scripts/create-admin.mjs ./scripts/
COPY --from=web /app/dist/web ./web
ARG RELEASE_NO=local
ENV WEB_ROOT=/app/web RELEASE_NO=${RELEASE_NO} PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server/main.mjs"]
