# CarePurse backend (hosted on Pxxl): the x402 gateway and Mhasibu in one container.
# Stellar testnet and the VTpass sandbox only. No secrets in the image: set them in Pxxl's Secrets.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

# Dependencies first (cached between builds).
COPY services/gateway/package.json services/gateway/package-lock.json services/gateway/
COPY packages/mhasibu/package.json packages/mhasibu/package-lock.json packages/mhasibu/
RUN cd services/gateway && npm ci --omit=dev && cd ../../packages/mhasibu && npm ci --omit=dev && npm cache clean --force

COPY services/gateway services/gateway
COPY packages/mhasibu packages/mhasibu
COPY deploy/backend deploy/backend

# Local JSON files are only used without DATABASE_URL; keep that path writable (data is lost on restart).
RUN mkdir -p /app/.data && chown node:node /app/.data

USER node
EXPOSE 3000
CMD ["node", "deploy/backend/start.mjs"]
