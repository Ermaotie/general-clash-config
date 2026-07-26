import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from '../service/node_modules/yaml/dist/index.js'
import { inlineRuleProviders, parseRuleProvider, renderSnapshot } from '../service/src/snapshot.js'

const output = process.argv[2]
if (!output) throw new Error('请提供 Mihomo 校验配置的输出路径')

const root = new URL('..', import.meta.url)
const template = readFileSync(new URL('./config/base.yaml', root), 'utf8')
const providers = parse(template)?.['rule-providers'] || {}
const localRules = {
  'personal-direct': './config/rules/direct.yaml',
  'personal-proxy': './config/rules/proxy.yaml',
  'personal-emby': './config/rules/emby.yaml'
}

const source = {
  name: 'CI validation node',
  kind: 'self-hosted',
  prefix: 'Validation',
  yaml: 'proxies:\n  - { name: "Mihomo validation", type: ss, server: 198.51.100.1, port: 443, cipher: aes-128-gcm, password: validation-only }'
}

const payloads = {}
for (const [name, provider] of Object.entries(providers)) {
  let body
  if (localRules[name]) {
    body = readFileSync(new URL(localRules[name], root), 'utf8')
  } else {
    const response = await fetch(provider.url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`无法下载规则集「${name}」：HTTP ${response.status}`)
    body = await response.text()
  }
  payloads[name] = parseRuleProvider(body)
}

writeFileSync(output, inlineRuleProviders(renderSnapshot(template, [source]), payloads))
console.log(`Rendered ${Object.keys(payloads).length} rule sets for Mihomo validation`)
