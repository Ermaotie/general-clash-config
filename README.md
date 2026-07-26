# General Clash Config

这是一个用于 Mihomo、OpenClash、Clash Verge、Stash 与 Shadowrocket 的私有订阅服务。

设备订阅读取的是 Cloudflare R2 中预先生成的完整 YAML 快照：设备更新时不会再访问 GitHub 或你的上游订阅地址。这样更适合路由器和多设备长期使用。

## 安全边界

本仓库只保存公开模板、Worker 源码、测试与自动部署流程。真实订阅地址、管理令牌、加密密钥和设备订阅链接只保存在 Cloudflare，不会提交到 GitHub。

## 策略组

- `Manual`：全部自建与机场节点、自动测速、DIRECT、BLOCK。
- `Default Proxy`、`AI`、`Media`、`Emby`：自建节点、自动测速、Manual、DIRECT、BLOCK。
- `BLOCK` 使用 Mihomo 的 `REJECT`。

## 管理与使用

打开 Worker 的 `/admin` 页面，输入管理令牌后添加订阅源。每个来源选择“自建”或“机场”；至少需保留一个自建来源。保存来源会立即生成静态快照；也可以点击“立即刷新”。生成设备订阅后，可复制链接、直接导入 Clash Verge 或 Shadowrocket。Stash 会复制链接并打开应用，请在 Stash 内粘贴导入。

“已生成设备”区域可查看新建设备、复制订阅链接和撤销不再使用的设备。为防止链接泄露，历史设备只保存了不可逆校验值，无法重新显示其原始链接；需要时请新建设备、在客户端替换链接后撤销旧设备。

每个订阅源都可填写“节点前缀”。该来源的节点会显示为 `[前缀] 节点名`；留空时，自建来源使用 `SelfNode`，机场来源使用 `Airport`。

OpenClash 使用同一订阅链接添加订阅配置。规则更新后，静态快照由以下任一方式更新：管理页保存/手动刷新、每 30 分钟的 Worker 定时任务，或 GitHub Actions 发布完成后的受保护刷新请求。设备链接、设备名称和下载文件名不会变化。

如果某次刷新失败，服务会保留并继续分发最后一次成功的快照；管理页会显示最近错误。快照 bucket 没有公共域名，不能绕过设备令牌直接访问。

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

## 部署步骤

以下步骤用于部署当前仓库对应的 Worker。部署前请确认已安装 Node.js，并且终端能够使用 `npx`。

### 1. 进入 Worker 目录并加载 Node 环境

```zsh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd "/你的项目目录/service"
```

然后安装 Worker 依赖：

```zsh
npm ci
```

### 2. 配置 Cloudflare 部署凭据

在 Cloudflare 创建具有 Workers 与 D1 部署权限的 API Token，并将它作为 `CLOUDFLARE_API_TOKEN` 提供给当前终端。此项目中可从 macOS 钥匙串读取：

```zsh
export CLOUDFLARE_API_TOKEN="$(security find-generic-password -a "$USER" -s "cloudflare-api-token" -w)"
```

不要把令牌复制到 GitHub 文件、聊天记录或公开仓库。

### 3. 初始化数据库与私有快照存储

首次部署时执行一次；重复执行是安全的：

```zsh
npx wrangler d1 execute general-clash-config --remote --file=schema.sql
npx wrangler r2 bucket create general-clash-config-snapshots
```

如果 bucket 已存在，第二条命令会提示已存在，可安全跳过；它不应配置公共访问或自定义域名。

### 4. 设置 Worker 密钥

设置或更换管理令牌：

```zsh
npx wrangler secret put ADMIN_TOKEN
```

按提示输入至少 16 个字符的易记长口令。它用于登录 `/admin` 管理页，旧令牌会立即失效。

`CONFIG_KEY` 用于加密 D1 内的订阅地址。当前服务已经存在该密钥，**不要重新设置或删除它**；否则已保存的订阅源将无法解密，需要重新录入。仅在全新、空白部署时才创建它：

```zsh
openssl rand -base64 32 | npx wrangler secret put CONFIG_KEY
```

### 5. 发布 Worker

```zsh
npx wrangler deploy
```

部署完成后打开 Worker 地址末尾的 `/admin`，输入管理令牌，添加自建或机场订阅源，并生成设备订阅链接。

首次完成来源填写后，点击“保存并刷新”或“立即刷新”生成第一份快照。在快照生成前，设备订阅会提示尚未就绪；这是为了保证设备端绝不会回退到动态拉取。

### 6. 开启 GitHub 自动部署

进入 GitHub 仓库的 **Settings → Secrets and variables → Actions**，新增名称为 `CLOUDFLARE_API_TOKEN` 的 Repository Secret，并填入同一个 Cloudflare API Token。之后每次推送到 `main`：

1. Actions 校验策略组和规则模板。
2. 校验成功后部署 Worker。
3. 客户端下次更新原有设备订阅时，自动获得最新规则。

如果尚未添加该 Secret，Actions 仍会执行模板校验，但会跳过部署，不会影响已在运行的 Worker。

### 7. 可选：规则发布后立即刷新快照

默认的 30 分钟定时刷新已经足够。若希望 GitHub 规则提交并部署成功后立刻刷新，在 Worker 和 GitHub Actions 中设置同一段独立口令：

```zsh
npx wrangler secret put REFRESH_TOKEN
```

然后在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 新增 `MY_SUB_REFRESH_TOKEN`，填入相同口令。它仅允许触发刷新，不能读取管理设置或设备订阅；不要复用 `ADMIN_TOKEN`。

Action 摘要会明确显示静态快照是已刷新，还是因为缺少该可选密钥而跳过。

## 更换管理令牌

管理令牌不存放在 GitHub，也不应通过管理网页修改。请在自己的终端中进入 `service` 目录后运行 `npx wrangler secret put ADMIN_TOKEN`，按提示输入一段至少 16 个字符的易记长口令。Worker secrets 更新后立即生效。
