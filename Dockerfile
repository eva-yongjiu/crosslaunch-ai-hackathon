FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
# vinext 同时负责生产构建和生产启动，必须保留 devDependencies。
RUN npm ci --include=dev
# 在复制源码前先确认 CLI 已安装，避免构建阶段才出现 exit code 127。
RUN ./node_modules/.bin/vinext --version

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV CROSSLAUNCH_DATA_DIR=/app/.data

# 只复制 Vinext standalone 运行时，不把 app、tests、配置源码带入最终镜像。
COPY --from=builder /app/dist/standalone ./
# Vinext standalone 不会自动携带 React peer runtime，这些包是生产服务器启动所需的。
COPY --from=builder /app/node_modules/react ./node_modules/react
COPY --from=builder /app/node_modules/react-dom ./node_modules/react-dom
COPY --from=builder /app/node_modules/react-server-dom-webpack ./node_modules/react-server-dom-webpack
COPY --from=builder /app/node_modules/scheduler ./node_modules/scheduler
COPY --from=builder /app/node_modules/acorn-loose ./node_modules/acorn-loose
COPY --from=builder /app/node_modules/neo-async ./node_modules/neo-async
COPY --from=builder /app/node_modules/webpack-sources ./node_modules/webpack-sources

RUN mkdir -p /app/.data
EXPOSE 3000
CMD ["node", "server.js"]
