FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV CROSSLAUNCH_DATA_DIR=/app/.data

COPY package*.json ./
# vinext 同时负责生产构建和生产启动，必须保留 devDependencies。
RUN npm ci --include=dev
# 在复制源码前先确认 CLI 已安装，避免构建阶段才出现 exit code 127。
RUN ./node_modules/.bin/vinext --version

COPY . .
RUN npm run build

RUN mkdir -p /app/.data
EXPOSE 3000
CMD ["npm", "run", "start"]
