# 上新无界静态前端包

本包是可直接放入共享 Nginx HTML 目录的浏览器前端，不含源码、不含 Node.js、不含 Docker 镜像、不含 API Key。

默认访问前缀：`/crosslaunch/`

## 上传

把压缩包解压到 `/var/www/html/`，保持目录结构：

```text
/var/www/html/crosslaunch/index.html
/var/www/html/crosslaunch/_next/...
```

然后将 `nginx.crosslaunch.conf` 加入现有 HTTPS `server {}`，其中静态目录必须是 `/var/www/html/crosslaunch/`，API 代理必须转发到后端 `127.0.0.1:3000`。

前端本身只负责页面；AI 调用、项目保存、图片上传、合规检测和导出必须同时启动后端运行包。完整步骤见仓库 `docs/DEPLOY_STATIC_FRONTEND.md`。

## 快速检查

```bash
nginx -t && systemctl reload nginx
curl -I https://你的域名/crosslaunch/
curl -fsS https://你的域名/crosslaunch/api/status
```

如果浏览器控制台出现 `/_next/` 或 `/api/` 根路径 404，说明 Nginx 前缀配置未按模板生效。
