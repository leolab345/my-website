
FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev \
    && npm cache clean --force

COPY server.js ./
COPY public ./public

RUN mkdir -p /var/data \
    && chown -R node:node /app /var/data

USER node

EXPOSE 3000

CMD ["npm", "start"]
