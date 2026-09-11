# 上新无界 V2 运行时镜像部署

这是复赛服务器的推荐部署方式。服务器不需要上传源码，不需要安装 Node.js，也不需要执行 `npm install` 或 `npm run build`。

运行包只包含：

- Docker 运行时镜像 `.tar`；
- `docker-compose.runtime.yml`；
- `.env.example` 配置模板；
- 本说明文件。

## 1. 服务器要求

- CentOS 7.9、Ubuntu、Debian 等可以运行 Docker 的 Linux 服务器；
- Docker Engine 和 Docker Compose Plugin；
- 至少 2 核 CPU、4 GB 内存、10 GB 可用磁盘；
- 能访问 Token Plan 专属 API 地址。

CentOS 7.9 只负责运行容器，应用实际运行在镜像内部的 Node 22 环境中。

## 2. 上传并解压运行包

本地上传：

```powershell
scp "crosslaunch-ai-runtime-20260911.zip" root@服务器IP:/opt/
```

服务器执行：

```bash
mkdir -p /opt/crosslaunch-ai
cd /opt/crosslaunch-ai
unzip -o /opt/crosslaunch-ai-runtime-20260911.zip
```

解压后目录中应只有镜像压缩包、Compose 文件、配置模板和说明文件，不应有 `app/`、`tests/` 或源码目录。

## 3. 导入 Docker 镜像

```bash
cd /opt/crosslaunch-ai
docker load -i crosslaunch-ai-image-20260911.tar
docker images crosslaunch-ai
```

应看到镜像标签：

```text
crosslaunch-ai   finale-20260911
```

## 4. 填写服务器配置

```bash
cp .env.example .env
chmod 600 .env
vi .env
```

只需填写：

```env
TOKEN_PLAN_API_KEY=填写你的Token Plan专属API Key
```

建议保持以下配置：

```env
TOKEN_PLAN_MODE=live
TOKEN_PLAN_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
TOKEN_PLAN_MULTIMODAL_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1
TOKEN_PLAN_TEXT_MODEL=qwen3.7-plus
TOKEN_PLAN_VISION_MODEL=qwen3.7-plus
TOKEN_PLAN_IMAGE_MODEL=qwen-image-2.0
PORT=3000
```

Key 不会进入前端，也不会写入镜像。不要将 `.env` 上传到 GitHub 或发到公开群组。

## 5. 启动

```bash
docker compose -f docker-compose.runtime.yml up -d
docker compose -f docker-compose.runtime.yml ps
```

检查服务：

```bash
curl -sS http://127.0.0.1:3000/api/status
```

正常结果应包含：

```json
{"database":"available","objectStorage":"configured","modelRouter":{"configured":true,"mode":"live"}}
```

查看日志：

```bash
docker compose -f docker-compose.runtime.yml logs -f --tail=200 crosslaunch
```

临时访问：`http://服务器IP:3000`。

## 6. 域名和 HTTPS

Nginx 反向代理到 `127.0.0.1:3000`。至少配置：

```nginx
client_max_body_size 25M;
proxy_read_timeout 900s;
proxy_send_timeout 900s;
```

AI 生成和合规检测可能持续几分钟，超时时间不能使用默认值。正式演示请通过 HTTPS 域名访问。

## 7. 日常管理

```bash
# 重启
docker compose -f docker-compose.runtime.yml restart

# 停止但保留数据
docker compose -f docker-compose.runtime.yml stop

# 查看日志
docker compose -f docker-compose.runtime.yml logs --tail=300 crosslaunch
```

不要执行：

```bash
docker compose -f docker-compose.runtime.yml down -v
```

这会删除保存项目、图片和导出文件的数据卷。

## 8. 备份

```bash
mkdir -p backups
docker compose -f docker-compose.runtime.yml exec -T crosslaunch tar -czf - -C /app/.data . > "backups/crosslaunch-data-$(date +%Y%m%d-%H%M%S).tar.gz"
```

## 9. 常见错误

如果页面显示未配置 AI：

```bash
docker compose -f docker-compose.runtime.yml up -d --force-recreate
curl -sS http://127.0.0.1:3000/api/status
```

如果页面 502/504：

```bash
docker compose -f docker-compose.runtime.yml ps
docker compose -f docker-compose.runtime.yml logs --tail=300 crosslaunch
```

重点检查 Nginx 的 `proxy_read_timeout 900s`，以及服务器能否访问 Token Plan 地址。
