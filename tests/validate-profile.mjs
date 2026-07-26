import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const profile = readFileSync(new URL('../config/base.yaml', import.meta.url), 'utf8')

const requiredGroups = ['Manual', 'Default Proxy', 'AI', 'Media', 'Emby']

assert.match(profile, /^ipv6:\s*true\s*$/m, 'IPv6 must remain enabled')
for (const group of requiredGroups) {
  assert.match(profile, new RegExp(`name: ${group.replace(' ', '\\s+')}`), `Missing selector: ${group}`)
}

const groupBlock = group => profile.match(new RegExp(`- name: ${group.replace(' ', '\\s+')}[\\s\\S]*?(?=\\n  - name:|\\n\\nrule-providers:)`))?.[0] ?? ''
for (const group of requiredGroups) {
  const block = groupBlock(group)
  for (const item of ['Automatic', 'Manual', 'DIRECT', 'REJECT']) {
    if (group === 'Manual' && item === 'Manual') continue
    assert.match(block, new RegExp(item), `${group} must include ${item}`)
  }
  assert.match(block, /__SELF_HOSTED_USES__/, `${group} must include self-hosted nodes`)
  if (group !== 'Manual') assert.doesNotMatch(block, /__AIRPORT_USES__/, `${group} must not include airport nodes`)
}

assert.match(profile, /GEOSITE,steam@cn,DIRECT/, 'Chinese Steam content must be direct')
assert.match(profile, /MATCH,Default Proxy/, 'Unmatched traffic must use Default Proxy')
const directRules = readFileSync(new URL('../config/rules/direct.yaml', import.meta.url), 'utf8')
const proxyRules = readFileSync(new URL('../config/rules/proxy.yaml', import.meta.url), 'utf8')
assert.match(directRules, /DOMAIN,tv\.micu\.hk/, 'tv.micu.hk must be direct')
assert.match(proxyRules, /DOMAIN-SUFFIX,micu\.hk/, 'micu.hk must use Default Proxy')
assert.match(profile, /personal-direct:/, 'Missing personal direct rule provider')
assert.match(profile, /personal-proxy:/, 'Missing personal proxy rule provider')
assert.match(profile, /personal-emby:/, 'Missing personal Emby rule provider')
assert.match(profile, /RULE-SET,personal-direct,DIRECT/, 'Personal direct rules must be applied')
assert.match(profile, /RULE-SET,personal-proxy,Default Proxy/, 'Personal proxy rules must be applied')
assert.match(profile, /RULE-SET,personal-emby,Emby/, 'Personal Emby rules must be applied')

assert.match(profile, /__SELF_HOSTED_PROVIDERS__/, 'Missing self-hosted subscription provider placeholder')
assert.match(profile, /__AIRPORT_PROVIDERS__/, 'Missing airport provider placeholder')
assert.match(profile, /ads:\n\s+type: http\n\s+behavior: domain/, 'Ad rules must use domain behavior')
assert.match(profile, /media:\n\s+type: http\n\s+behavior: domain/, 'Media rules must use domain behavior')
assert.match(profile, /proxy-server-nameserver:/, 'DNS respect-rules requires proxy-server-nameserver')

for (const path of ['service/src/index.js', 'service/schema.sql', 'service/wrangler.jsonc']) {
  assert.ok(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').length > 0, `Missing ${path}`)
}
const worker = readFileSync(new URL('../service/src/index.js', import.meta.url), 'utf8')
for (const token of ['providers', 'clipboard.writeText', 'clash://install-config', 'shadowrocket://add/', 'stash://']) {
  assert.match(worker, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing UI support: ${token}`)
}
const workflow = readFileSync(new URL('../.github/workflows/validate-and-deploy.yml', import.meta.url), 'utf8')
assert.match(workflow, /node tests\/validate-profile\.mjs/, 'Workflow must validate the template')
assert.match(workflow, /wrangler deploy/, 'Workflow must deploy the Worker')
assert.doesNotMatch(workflow, /ADMIN_TOKEN|CONFIG_KEY/, 'Workflow must not expose worker secrets')

console.log('Profile template validation passed')
