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

## 个人规则优先级

规则从上到下匹配，第一条命中的规则立即生效。个人规则的顺序固定为：

1. 私有地址与局域网直连。
2. `config/rules/direct.yaml`：强制直连。
3. `config/rules/proxy.yaml`：强制走 `Default Proxy`。
4. 广告拦截。
5. `config/rules/emby.yaml`：进入 `Emby` 策略组。
6. AI、影视、Steam、国内直连与最终默认代理。

因此，当规则有重叠时，`direct.yaml` 会优先于 `proxy.yaml`。例如 `tv.micu.hk` 放在 `direct.yaml`，而 `DOMAIN-SUFFIX,micu.hk` 放在 `proxy.yaml` 时，`tv.micu.hk` 仍会直连，其他 `micu.hk` 子域名走默认代理。

在同一个个人规则文件中，也应把更精确的规则写在前面。例如先写 `DOMAIN,api.example.com`，再写 `DOMAIN-SUFFIX,example.com`。修改后提交 GitHub，客户端下次更新订阅即可应用。

## 自动部署

推送到 `main` 时，GitHub Actions 会运行模板校验，然后部署 Cloudflare Worker。需要在仓库的 Actions secrets 中配置 `CLOUDFLARE_API_TOKEN`；不要添加 `ADMIN_TOKEN` 或 `CONFIG_KEY`，它们已作为 Worker secrets 单独保存。

## 更换管理令牌

管理令牌不存放在 GitHub，也不应通过管理网页修改。请在自己的终端中进入 `service` 目录后运行 `npx wrangler secret put ADMIN_TOKEN`，按提示输入一段至少 16 个字符的易记长口令。Worker secrets 更新后立即生效。
