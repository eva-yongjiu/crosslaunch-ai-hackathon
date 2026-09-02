FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV CROSSLAUNCH_DATA_DIR=/app/.data

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /app/.data
EXPOSE 3000
CMD ["npm", "run", "start"]
