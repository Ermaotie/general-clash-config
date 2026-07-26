import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const profile = readFileSync(new URL('../config/base.yaml', import.meta.url), 'utf8')

const requiredGroups = ['Manual', 'Default Proxy', 'AI', 'Media', 'Emby']

assert.match(profile, /^ipv6:\s*true\s*$/m, 'IPv6 must remain enabled')
assert.match(profile, /url:\s*https:\/\/cp\.cloudflare\.com\/generate_204/, 'Automatic testing must use the IPv6-friendly Cloudflare endpoint')
for (const group of requiredGroups) {
  assert.match(profile, new RegExp(`name: ${group.replace(' ', '\\s+')}`), `Missing selector: ${group}`)
}

const groupBlock = group => profile.match(new RegExp(`- name: ${group.replace(' ', '\\s+')}[\\s\\S]*?(?=\\n  - name:|\\n\\nrule-providers:)`))?.[0] ?? ''
for (const group of requiredGroups) {
  const block = groupBlock(group)
  if (group === 'Manual') {
    assert.match(block, /__ALL_PROXY_NAMES__/, 'Manual must include every static node and fallback option')
  } else {
    assert.match(block, /__SELF_HOSTED_PROXY_NAMES__/, `${group} must include self-hosted nodes and fallback options`)
  }
}

assert.match(profile, /GEOSITE,steam@cn,DIRECT/, 'Chinese Steam content must be direct')
assert.match(profile, /MATCH,Default Proxy/, 'Unmatched traffic must use Default Proxy')
const directRules = readFileSync(new URL('../config/rules/direct.yaml', import.meta.url), 'utf8')
const proxyRules = readFileSync(new URL('../config/rules/proxy.yaml', import.meta.url), 'utf8')
assert.match(directRules, /DOMAIN,tv\.micu\.hk/, 'tv.micu.hk must be direct')
const embyRules = readFileSync(new URL('../config/rules/emby.yaml', import.meta.url), 'utf8')
assert.doesNotMatch(proxyRules, /DOMAIN-SUFFIX,micu\.hk/, 'micu.hk must not remain in Default Proxy rules')
assert.match(embyRules, /DOMAIN-SUFFIX,micu\.hk/, 'micu.hk must use the Emby selector')
assert.match(embyRules, /DOMAIN-SUFFIX,oceancloud\.asia/, 'oceancloud.asia must use the Emby selector')
assert.match(profile, /personal-direct:/, 'Missing personal direct rule provider')
assert.match(profile, /personal-proxy:/, 'Missing personal proxy rule provider')
assert.match(profile, /personal-emby:/, 'Missing personal Emby rule provider')
assert.match(profile, /RULE-SET,personal-direct,DIRECT/, 'Personal direct rules must be applied')
assert.match(profile, /RULE-SET,personal-proxy,Default Proxy/, 'Personal proxy rules must be applied')
assert.match(profile, /RULE-SET,personal-emby,Emby/, 'Personal Emby rules must be applied')
assert.ok(profile.indexOf('RULE-SET,personal-emby,Emby') < profile.indexOf('RULE-SET,personal-proxy,Default Proxy'), 'Personal Emby rules must win over broad proxy rules')

assert.match(profile, /__PROXIES__/, 'Static snapshots must inject real proxy definitions')
assert.match(profile, /__SELF_HOSTED_PROXY_NAMES__/, 'Static snapshots must inject self-hosted node names')
assert.match(profile, /__ALL_PROXY_NAMES__/, 'Manual must receive all node names from the static snapshot')
assert.doesNotMatch(profile, /proxy-providers:/, 'Device profiles must not dynamically fetch private subscription providers')
assert.match(profile, /ads:\n\s+type: http\n\s+behavior: domain/, 'Ad rules must use domain behavior')
assert.match(profile, /media:\n\s+type: http\n\s+behavior: domain/, 'Media rules must use domain behavior')
assert.match(profile, /proxy-server-nameserver:/, 'DNS respect-rules requires proxy-server-nameserver')
assert.match(profile, /proxy-server-nameserver:[\s\S]*223\.5\.5\.5[\s\S]*119\.29\.29\.29/, 'Proxy node hostnames must have domestic DNS resolvers')

for (const path of ['service/src/index.js', 'service/src/snapshot.js', 'service/schema.sql', 'service/wrangler.jsonc']) {
  assert.ok(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').length > 0, `Missing ${path}`)
}
const worker = readFileSync(new URL('../service/src/index.js', import.meta.url), 'utf8')
for (const token of ['providers', 'clipboard.writeText', 'clash://install-config', 'shadowrocket://add/', 'stash://', '已生成设备', 'token_encrypted', '/api/manage/devices', 'DELETE', 'position:fixed', 'replaceChildren', 'device-card', '复制订阅链接']) {
  assert.match(worker, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing UI support: ${token}`)
}
assert.match(worker, /cache-control': 'no-store'/, 'Management page and device list must not be served from a stale cache')
assert.match(worker, /MySub-/, 'Device subscriptions must have a friendly filename prefix')
assert.match(worker, /url\.pathname === '\/' \|\| url\.pathname === '\/admin'/, 'Root path must serve the management page')
assert.match(worker, /SELECT id,name FROM devices/, 'Subscription filename must use the device name')
for (const token of ['prefix', 'providers', 'refreshSnapshot']) {
  assert.match(worker, new RegExp(token), `Missing provider prefix support: ${token}`)
}
const snapshot = readFileSync(new URL('../service/src/snapshot.js', import.meta.url), 'utf8')
for (const token of ['SelfNode', 'Airport', 'renderSnapshot']) {
  assert.match(snapshot, new RegExp(token), `Missing static snapshot prefix support: ${token}`)
}
for (const token of ['workspace-shell', '管理会话', '静态订阅快照', 'status', '节点前缀']) {
  assert.match(worker, new RegExp(token), `Missing workspace UI element: ${token}`)
}
for (const token of ['refreshSnapshot', 'SNAPSHOTS', '/api/refresh', '/api/status', 'scheduled']) {
  assert.match(worker, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing static snapshot support: ${token}`)
}
for (const token of ['profile-update-interval', 'subscription-userinfo', 'customMetadata']) {
  assert.match(worker, new RegExp(token), `Subscription responses must preserve ${token}`)
}
const wrangler = readFileSync(new URL('../service/wrangler.jsonc', import.meta.url), 'utf8')
assert.match(wrangler, /r2_buckets/, 'Worker must bind its private snapshot bucket')
assert.match(wrangler, /\*\/30 \* \* \* \*/, 'Worker must refresh static snapshots every 30 minutes')
const workflow = readFileSync(new URL('../.github/workflows/validate-and-deploy.yml', import.meta.url), 'utf8')
assert.match(workflow, /node tests\/validate-profile\.mjs/, 'Workflow must validate the template')
assert.match(workflow, /node tests\/snapshot\.mjs/, 'Workflow must validate static snapshot rendering')
assert.match(workflow, /Render static profile for Mihomo/, 'Workflow must render a complete static profile before kernel validation')
assert.match(workflow, /install_mihomo\.outputs\.path \}\} -t -f/, 'Workflow must ask the Mihomo kernel to validate the rendered profile')
assert.match(workflow, /Mihomo kernel validation/, 'Workflow must publish Mihomo validation in the run summary')
assert.match(workflow, /GeoSite\\.dat/, 'Workflow must provision geodata needed by GEOSITE rules')
assert.match(workflow, /GeoLite2-ASN\\.mmdb/, 'Workflow must provision ASN data needed by AI rules')
assert.match(workflow, /npm ci/, 'Workflow must install Worker dependencies before deployment')
assert.match(workflow, /wrangler deploy/, 'Workflow must deploy the Worker')
assert.match(workflow, /d1 migrations apply/, 'Workflow must apply database migrations before deployment')
assert.doesNotMatch(workflow, /ADMIN_TOKEN|CONFIG_KEY/, 'Workflow must not expose worker secrets')
assert.doesNotMatch(workflow, /if:\s*\$\{\{\s*secrets\./, 'GitHub Actions cannot access secrets directly in a step condition')
for (const label of ['Validate profile template', 'Check deployment credential', 'Refresh static snapshot', 'Publish run summary', 'GITHUB_STEP_SUMMARY', '未执行（Worker 部署失败）']) {
  assert.match(workflow, new RegExp(label), `Workflow must report ${label}`)
}

console.log('Profile template validation passed')
