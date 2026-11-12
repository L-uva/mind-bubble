FROM node:24-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3123 \
    DATA_DIR=/data
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3123
CMD ["node", "--disable-warning=ExperimentalWarning", "index.js"]
