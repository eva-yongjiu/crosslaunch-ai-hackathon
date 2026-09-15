# 上新无界后端运行包

本包只包含后端 Docker 运行时镜像，不包含应用源码，也不包含 API Key。它为静态前端提供 AI、项目、图片、合规和导出接口。

## 启动

```bash
docker load -i crosslaunch-ai-backend-20260915-v6.tar
cp .env.example .env
vi .env
docker compose -f docker-compose.runtime.yml up -d
docker compose -f docker-compose.runtime.yml ps
curl -fsS http://127.0.0.1:3000/api/status
```

`.env` 至少填写 `TOKEN_PLAN_API_KEY`，并将前端前缀设置为：

```env
CROSSLAUNCH_PUBLIC_BASE_PATH=/crosslaunch
```

后端仅监听本机 `3000`，由共享 Nginx 的 `/crosslaunch/api/` 代理访问。静态前端上传和 Nginx 配置见 `DEPLOY_STATIC_FRONTEND.md`。

不要把 `.env`、包含 Key 的日志或数据卷内容上传到 GitHub。
