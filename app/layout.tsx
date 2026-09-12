import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") ?? "";

export const metadata: Metadata = {
  title: "上新无界 · CrossLaunch AI",
  description: "从商品事实到三渠道发布的 AI 跨境上新工作台",
  icons: {
    icon: `${basePath}/favicon.svg` || "/favicon.svg",
    shortcut: `${basePath}/favicon.svg` || "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
