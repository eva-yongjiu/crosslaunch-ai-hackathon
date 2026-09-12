# 共享 Nginx 部署：静态前端 + 后端运行包

本项目的浏览器前端可以作为静态文件部署到服务器的 HTML 目录；AI、项目持久化、图片存储、合规分析和 ZIP 导出仍由后端运行包提供。

## 推荐目录

以 `/crosslaunch` 为本项目 URL 前缀为例：

```text
/var/www/html/crosslaunch/       # 静态前端包解压到这里
/opt/crosslaunch/backend/        # 后端运行包和 .env
```

访问地址：`https://你的域名/crosslaunch/`

## 1. 上传并解压静态包

将 `crosslaunch-ai-web-static-*.zip` 上传到服务器后：

```bash
mkdir -p /var/www/html
unzip -o crosslaunch-ai-web-static-*.zip -d /var/www/html
find /var/www/html/crosslaunch -maxdepth 2 -type f | head
```

静态包内应包含 `crosslaunch/index.html` 和 `crosslaunch/_next/`，不包含源码和 API Key。

## 2. 启动后端

将后端运行包上传到 `/opt/crosslaunch/backend/`，进入该目录并准备环境变量：

```bash
mkdir -p /opt/crosslaunch/backend
tar -xf crosslaunch-ai-backend-*.tar
cp .env.example .env
vi .env
```

`.env` 至少填写：

```env
TOKEN_PLAN_MODE=live
TOKEN_PLAN_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
TOKEN_PLAN_MULTIMODAL_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1
TOKEN_PLAN_API_KEY=你的Token_Plan专属Key
TOKEN_PLAN_TEXT_MODEL=qwen3.7-plus
TOKEN_PLAN_VISION_MODEL=qwen3.7-plus
TOKEN_PLAN_IMAGE_MODEL=qwen-image-2.0
PORT=3000
CROSSLAUNCH_PUBLIC_BASE_PATH=/crosslaunch
```

启动后端容器（后端只监听本机 3000 端口）：

```bash
docker load -i crosslaunch-ai-backend-*.tar
docker compose -f docker-compose.runtime.yml up -d
docker compose -f docker-compose.runtime.yml ps
curl -fsS http://127.0.0.1:3000/api/status
```

看到 `modelRouter.configured: true` 才表示 Key 已被后端读取。Key 只放 `.env`，不要放进 `/var/www/html`。

## 3. Nginx 配置

将静态包内的 `nginx.crosslaunch.conf` 内容加入现有 HTTPS `server { ... }`，或者保存为 `/etc/nginx/conf.d/crosslaunch.conf` 后合并到对应域名的 server 块。

```nginx
location = /crosslaunch {
    return 301 /crosslaunch/;
}

location ^~ /crosslaunch/api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 12m;
    proxy_read_timeout 180s;
}

location ^~ /crosslaunch/ {
    alias /var/www/html/crosslaunch/;
    index index.html;
    add_header Cache-Control "no-cache" always;
}
```

检查并平滑加载：

```bash
nginx -t && systemctl reload nginx
```

如果现有 Nginx 的 `server` 已经有统一的 HTTPS、压缩、日志或安全响应头，只需要把上述两个 `location` 放入现有 `server` 中，不要重复创建 80/443 监听块。

## 4. 验证

```bash
curl -I https://你的域名/crosslaunch/
curl -I https://你的域名/crosslaunch/_next/static/任意CSS文件
curl -fsS https://你的域名/crosslaunch/api/status
```

浏览器开发者工具中，所有接口都应是 `/crosslaunch/api/...`，不应出现根路径 `/api/...` 或 `/_next/...` 的 404。

## 5. 后续新增项目

每个前端前缀都需要在构建时设定，例如 `/project-b`：

```powershell
$env:NEXT_PUBLIC_BASE_PATH = "/project-b"
npm run build
```

然后将新的 `dist/client` 打包到 `/var/www/html/project-b/`，并把 Nginx 的两个 `location` 中的 `/crosslaunch` 改为 `/project-b`。如果要隔离项目数据和 Key，给它单独的后端容器、端口和 `CROSSLAUNCH_DATA_DIR`；不要让多个项目共用同一个数据目录。
