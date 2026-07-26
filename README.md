# General Clash Config

这是一个用于 Mihomo、OpenClash、Clash Verge、Stash 与 Shadowrocket 的私有订阅服务。

## 安全边界

本仓库只保存公开模板、Worker 源码、测试与自动部署流程。真实订阅地址、管理令牌、加密密钥和设备订阅链接只保存在 Cloudflare，不会提交到 GitHub。

## 策略组

- `Manual`：全部自建与机场节点、自动测速、DIRECT、BLOCK。
- `Default Proxy`、`AI`、`Media`、`Emby`：自建节点、自动测速、Manual、DIRECT、BLOCK。
- `BLOCK` 使用 Mihomo 的 `REJECT`。

## 管理与使用

打开 Worker 的 `/admin` 页面，输入管理令牌后添加订阅源。每个来源选择“自建”或“机场”；至少需保留一个自建来源。生成设备订阅后，可复制链接、直接导入 Clash Verge 或 Shadowrocket。Stash 会复制链接并打开应用，请在 Stash 内粘贴导入。

OpenClash 使用同一订阅链接添加订阅配置。规则更新后，客户端下次更新订阅会自动获取新规则。

## 自动部署

推送到 `main` 时，GitHub Actions 会运行模板校验，然后部署 Cloudflare Worker。需要在仓库的 Actions secrets 中配置 `CLOUDFLARE_API_TOKEN`；不要添加 `ADMIN_TOKEN` 或 `CONFIG_KEY`，它们已作为 Worker secrets 单独保存。
