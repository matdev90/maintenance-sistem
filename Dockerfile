FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
RUN apk add --no-cache tini && \
    npm install -g pm2

WORKDIR /app
RUN mkdir -p /app/logs /app/public/uploads

COPY --from=builder /build/node_modules ./node_modules
COPY package*.json ecosystem.config.js ./
COPY config ./config
COPY controllers ./controllers
COPY middlewares ./middlewares
COPY migrations ./migrations
COPY models ./models
COPY public ./public
COPY routes ./routes
COPY utils ./utils
COPY views ./views
COPY server.js ./

RUN addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app

USER app
EXPOSE 2222

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
