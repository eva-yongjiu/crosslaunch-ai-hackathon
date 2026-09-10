# 上新无界 V2 服务器部署指南

本文适用于将当前项目部署到一台可联网的 Linux 服务器，并通过域名提供复赛演示。

推荐路径：Docker Compose + Nginx + HTTPS。服务器只需要安装 Docker，不需要单独安装 Node.js。

## 1. 部署前准备

服务器建议满足：

- Ubuntu 22.04/24.04、Debian 12 或同类 Linux；
- 2 核 CPU、4 GB 内存、至少 10 GB 可用磁盘；
- 已安装 Docker Engine 和 Docker Compose Plugin；
- 服务器可以访问 `https://token-plan.cn-beijing.maas.aliyuncs.com`；
- 一个已经解析到服务器公网 IP 的域名；
- 安全组只开放 SSH、HTTP、HTTPS。应用端口 3000 不需要对公网开放。

如果暂时没有域名，可以先用 `http://服务器IP:3000` 验证，但正式演示建议使用 HTTPS 域名。

## 2. 上传部署包

在本地生成的部署包不包含 `.env`、API Key、历史数据、`node_modules` 和 Git 历史。将 ZIP 上传到服务器，例如：

```bash
scp crosslaunch-ai-server-*.zip root@服务器IP:/opt/
```

登录服务器并解压：

```bash
ssh root@服务器IP
mkdir -p /opt/crosslaunch-ai
cd /opt/crosslaunch-ai
unzip -o /opt/crosslaunch-ai-server-*.zip
```

如果服务器没有 `unzip`：

```bash
apt-get update && apt-get install -y unzip
```

## 3. 必须修改的配置

在项目目录创建服务器专用配置：

```bash
cd /opt/crosslaunch-ai
cp .env.example .env
chmod 600 .env
nano .env
```

至少修改这一项：

```env
TOKEN_PLAN_API_KEY=在这里填写菜鸟黑客松Token Plan专属API Key
```

建议保持以下配置不变：

```env
TOKEN_PLAN_MODE=live
TOKEN_PLAN_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
TOKEN_PLAN_MULTIMODAL_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1
TOKEN_PLAN_TEXT_MODEL=qwen3.7-plus
TOKEN_PLAN_VISION_MODEL=qwen3.7-plus
TOKEN_PLAN_IMAGE_MODEL=qwen-image-2.0
PORT=3000
```

注意：Token Plan Key 必须与上面的专属基地址配套使用，不要改成 `dashscope.aliyuncs.com`。不要把真实 Key 写入 `README`、前端代码、Dockerfile、GitHub 或截图。

## 4. 使用 Docker 启动（推荐）

在 `/opt/crosslaunch-ai` 执行：

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
```

查看启动日志：

```bash
docker compose logs -f --tail=200 crosslaunch
```

另开一个终端检查健康状态：

```bash
curl -sS http://127.0.0.1:3000/api/status
```

正常结果应包含类似内容：

```json
{"database":"available","objectStorage":"configured","modelRouter":{"configured":true,"mode":"live"}}
```

浏览器访问：

```text
http://服务器IP:3000
```

如果使用 Nginx 反向代理，保持 `PORT=3000`，不要把 3000 直接暴露到公网。

## 5. 配置 Nginx 和 HTTPS

安装 Nginx：

```bash
apt-get update
apt-get install -y nginx
```

创建站点配置：

```bash
nano /etc/nginx/sites-available/crosslaunch-ai
```

填入以下内容，把 `demo.example.com` 换成你的域名：

```nginx
server {
    listen 80;
    server_name demo.example.com;

    client_max_body_size 25M;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并检查：

```bash
ln -s /etc/nginx/sites-available/crosslaunch-ai /etc/nginx/sites-enabled/crosslaunch-ai
nginx -t
systemctl reload nginx
```

确认域名 DNS 已指向服务器后申请证书：

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d demo.example.com
```

完成后访问：`https://demo.example.com`。

## 6. 防火墙

如果服务器使用 UFW：

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

不要执行 `ufw allow 3000/tcp`，除非你明确需要绕过 Nginx 做临时测试。

## 7. 复赛演示验收流程

上线后按下面顺序演示：

1. 打开首页，确认右上角显示“已配置 / live”；
2. 新建项目并上传一张真实商品图；
3. 点击 AI 识别，等待任务完成，检查事实来源、置信度和待确认项；
4. 确认商品事实；
5. 进入内容创作，生成 Amazon、TikTok Shop、Shopify 三个平台的中英文 Listing 和详情模块；
6. 进入合规检测，查看文字高亮、图片区域定位、规则来源和覆盖状态；
7. 点击“一键 AI 优化并复检”，确认风险归零或明确保留人工审核项；
8. 下载分平台交付 ZIP，打开其中各平台的 `START-HERE.txt`；
9. 验证导出内容：Amazon 使用 CSV、TikTok Shop 使用 CSV、Shopify 使用产品导入 CSV/HTML，而不是让用户直接处理内部 JSON。

首次演示建议使用已经准备好的保温杯测试素材，先走通一次完整链路，再换成评委现场指定商品。

## 8. 日常更新

如果通过 GitHub 更新：

```bash
cd /opt/crosslaunch-ai
git pull origin main
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=200 crosslaunch
```

如果使用 ZIP 更新，先上传新 ZIP，再在目录中解压覆盖。不要删除 Docker volume；项目数据保存在 `crosslaunch-data` 中。

不要执行以下命令：

```bash
docker compose down -v
```

其中 `-v` 会删除项目数据卷。

## 9. 数据备份与恢复

备份本地数据库文件、素材和导出文件：

```bash
mkdir -p backups
docker compose exec -T crosslaunch tar -czf - -C /app/.data . > "backups/crosslaunch-data-$(date +%Y%m%d-%H%M%S).tar.gz"
```

恢复前先停止服务，把备份解压回数据目录，再启动服务。恢复操作建议先复制一份备份，避免覆盖现有数据。

## 10. 常见问题

### 页面显示未配置 AI

检查 `.env` 是否存在、Key 是否填写、是否有多余引号或空格，然后重建容器：

```bash
docker compose up -d --force-recreate
docker compose logs --tail=200 crosslaunch
```

不要把 `.env` 内容截图或发到公开群组，因为可能暴露 Key。更安全的检查方式是只看状态接口：

```bash
curl -sS http://127.0.0.1:3000/api/status
```

### 页面 502 或 504

```bash
docker compose ps
docker compose logs --tail=300 crosslaunch
curl -sS http://127.0.0.1:3000/api/status
```

AI 生成、合规检测可能持续数分钟，Nginx 中的 `proxy_read_timeout 900s` 不要删除。

### 容器反复重启

重点检查：

- `.env` 是否放在 `/opt/crosslaunch-ai/.env`；
- Docker 是否有足够内存和磁盘；
- 服务器能否访问 Token Plan 专属地址；
- `docker compose logs` 中是否有端口占用或配置解析错误。

### 如何确认 Key 没有进入前端

Key 只由服务端读取。检查浏览器开发者工具的 Network 请求，不应出现 `TOKEN_PLAN_API_KEY` 或 `Authorization: Bearer ...`；只应看到项目业务接口请求。

## 11. 不使用 Docker 的 Node.js 方案

只有在服务器已有 Node.js 22.13+ 且你明确不想使用 Docker 时使用此方案：

```bash
cd /opt/crosslaunch-ai
node --version
npm --version
npm ci
npm run build
mkdir -p .data
```

确认 `.env` 中使用：

```env
PORT=3000
CROSSLAUNCH_DATA_DIR=/opt/crosslaunch-ai/.data
```

临时启动：

```bash
npm run start
```

正式运行建议使用 systemd。创建 `/etc/systemd/system/crosslaunch.service`，并将 `ExecStart` 中的 npm 路径替换为 `command -v npm` 的实际结果：

```ini
[Unit]
Description=CrossLaunch AI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=crosslaunch
WorkingDirectory=/opt/crosslaunch-ai
EnvironmentFile=/opt/crosslaunch-ai/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

创建运行用户并启动：

```bash
useradd --system --home /opt/crosslaunch-ai --shell /usr/sbin/nologin crosslaunch || true
chown -R crosslaunch:crosslaunch /opt/crosslaunch-ai
systemctl daemon-reload
systemctl enable --now crosslaunch
systemctl status crosslaunch
journalctl -u crosslaunch -n 200 --no-pager
```

Docker 方案和 Node.js 方案二选一，不要同时启动两个服务占用同一个端口。
