# General Clash Config / MySub

面向 Mihomo、OpenClash、Clash Verge、Stash 与 Shadowrocket 的私有 Clash 订阅服务。

MySub 将公开模板、个人规则和私有订阅源在 Cloudflare Worker 中合成为一份完整 YAML，再保存到私有 R2 快照。设备仅下载这一份设备订阅，不会在更新时访问 GitHub、机场或自建订阅地址。

## 安全与更新模型

- GitHub 仅保存模板、规则、Worker 源码、测试和部署流程；不会保存真实订阅地址、设备链接、管理令牌或密钥。
- 自建和机场订阅地址以加密形式保存在 D1。
- 快照每 30 分钟自动刷新；管理页保存来源/手动刷新，以及 GitHub Actions 发布成功后，也可立即刷新。
- 上游订阅或规则源临时不可用时，继续分发上一次成功快照。
- 设备订阅响应声明 `profile-update-interval: 24`，客户端按一天更新一次；自建订阅若提供 `subscription-userinfo`，其流量信息会透传到设备端。
- 广告、AI、影视与个人规则在 Worker 刷新时预加载并内联写入快照；设备配置中没有动态 `rule-providers` 或私有 `proxy-providers`。

## 策略组

| 策略组 | 候选项 |
| --- | --- |
| `Automatic` | 仅自建节点，使用 Cloudflare 测速地址自动测速 |
| `Manual` | 全部自建与机场节点、Automatic、DIRECT、REJECT |
| `Default Proxy`、`AI`、`Media`、`Emby` | 自建节点、Automatic、Manual、DIRECT、REJECT |

其中 `REJECT` 即阻断选项。机场节点只放在 `Manual`，不会进入日常业务策略组。所有未匹配流量默认进入可切换的 `Default Proxy`。

## DNS 与 IPv6

- IPv6 已开启，适合 IPv6 可用的 Emby/自建节点。
- 节点域名优先使用阿里与腾讯 DNS 解析，减少节点域名解析失败。
- Automatic 使用 `https://cp.cloudflare.com/generate_204` 测速，更适合 IPv6 节点。
- 仅有 AAAA 记录的节点可使用，但在没有可用 IPv6 的网络中不会连通；建议保留 IPv4 节点作为备用。

## 个人规则与优先级

规则按从上到下、首次命中生效：

1. 局域网与私有地址直连。
2. `config/rules/direct.yaml`：强制直连。
3. `config/rules/emby.yaml`：进入 `Emby` 策略组。
4. `config/rules/proxy.yaml`：进入 `Default Proxy`。
5. 广告拦截、AI、影视、Steam、国内直连与默认代理。

因此直连规则始终优先于 Emby 和代理规则；Emby 规则优先于广义代理规则。当前示例中：

- `tv.micu.hk` 直连；
- `oceancloud.asia`、`micu.hk` 进入 Emby 组。

在同一文件中也应先放精确规则，再放域名后缀规则。修改 `config/rules/*.yaml` 后提交到 `main`，快照刷新后设备即可获得新规则。

## 管理页与设备订阅

打开 Worker 地址后的 `/admin`，输入 `ADMIN_TOKEN` 后：

1. 添加订阅来源，选择“自建”或“机场”，并可自定义节点前缀。前缀留空时自建为 `SelfNode`，机场为 `Airport`。
2. 点击“保存并刷新”生成快照。
3. 输入英文设备名称生成订阅；可复制链接或直接导入 Clash Verge、Shadowrocket、Stash。

设备列表采用卡片视图，仅显示有效设备：

- 新设备可复制订阅链接或撤销；链接不会直接展示在页面上。
- 已撤销设备会隐藏，撤销后原链接立即失效。
- 早期旧设备只保存不可逆校验值，因此可显示名称和撤销，但无法恢复旧链接；请新建设备后替换客户端链接。
- 点击“读取订阅源”后，设备列表会自动刷新。

## GitHub Actions 自动部署

推送到 `main` 会运行配置校验、D1 迁移、Worker 部署，并在设置刷新令牌时刷新静态快照。

在仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret | 必需 | 用途 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | D1 迁移与 Worker 部署 |
| `MY_SUB_REFRESH_TOKEN` | 可选 | 发布后立即刷新快照 |

Action 摘要会准确显示配置校验、部署与快照刷新状态：Worker 部署失败时，刷新会显示“未执行（Worker 部署失败）”，不会误报为缺少刷新令牌。

Cloudflare API Token 需要覆盖此项目的 Workers Scripts、D1 与 R2 权限。令牌更新后，也要同步更新 GitHub 的 `CLOUDFLARE_API_TOKEN` Secret。

## 本地部署与维护

需要 Node.js 与 `npx`。使用 NVM 时：

```zsh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "/你的项目目录/service"
npm ci
```

将 Cloudflare 令牌提供给当前终端后，可执行：

```zsh
export CLOUDFLARE_API_TOKEN="$(security find-generic-password -a "$USER" -s "cloudflare-api-token" -w)"
npx wrangler d1 migrations apply general-clash-config --remote
npx wrangler deploy
```

首次全新部署还需创建 D1 表与私有 R2 bucket；不要为快照 bucket 配置公共访问。

管理令牌与刷新令牌使用 Worker Secret 保存：

```zsh
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put REFRESH_TOKEN
```

`CONFIG_KEY` 用于解密已保存的订阅来源。现有服务不要重设或删除它；仅在全新空白部署时创建。

```zsh
openssl rand -base64 32 | npx wrangler secret put CONFIG_KEY
```

## 常见问题

**设备导入提示策略组循环**：更新订阅即可。当前 Automatic 只包含自建节点，不引用 Manual 或自身。

**节点域名解析失败**：确认客户端 IPv6 与 DNS 可用；模板已为节点解析配置国内 DNS。

**GitHub Actions 部署失败**：先查看 Action 摘要。若提示 Cloudflare access token 无效，请更新仓库 Secret `CLOUDFLARE_API_TOKEN`；不要把令牌提交到仓库或发送到聊天中。

**看不到旧设备订阅链接**：这是安全设计。旧记录不能从哈希恢复，请新建设备并替换链接。
