import assert from 'node:assert/strict'
import { inlineRuleProviders, parseRuleProvider, renderSnapshot, parseSubscription } from '../service/src/snapshot.js'

const template = `proxies:
  __PROXIES__
proxy-groups:
  - name: Automatic
    type: url-test
    proxies:
      __SELF_HOSTED_NODE_NAMES__
  - name: Manual
    type: select
    proxies:
      __ALL_PROXY_NAMES__
  - name: Default Proxy
    type: select
    proxies:
      __SELF_HOSTED_PROXY_NAMES__
  - name: AI
    type: select
    proxies:
      __SELF_HOSTED_PROXY_NAMES__
  - name: Media
    type: select
    proxies:
      __SELF_HOSTED_PROXY_NAMES__
  - name: Emby
    type: select
    proxies:
      __SELF_HOSTED_PROXY_NAMES__
`

const selfHosted = {
  name: '我的节点', kind: 'self-hosted', prefix: '',
  yaml: 'proxies:\n  - { name: HK, type: ss, server: hk.example.com, port: 443, cipher: aes-128-gcm, password: secret }'
}
const airport = {
  name: '机场', kind: 'airport', prefix: 'Airport',
  yaml: 'proxies:\n  - { name: HK, type: ss, server: airport.example.com, port: 443, cipher: aes-128-gcm, password: secret }'
}

assert.deepEqual(parseSubscription(selfHosted.yaml).map(proxy => proxy.name), ['HK'], 'Clash YAML subscriptions must expose their nodes')
assert.throws(() => parseSubscription('proxies: invalid'), /proxies/, 'Invalid subscriptions must be rejected before snapshots are overwritten')
assert.deepEqual(parseRuleProvider('payload:\n  - DOMAIN,example.com'), ['DOMAIN,example.com'], 'Rule provider payloads must be parsed before snapshotting')
assert.deepEqual(parseRuleProvider('payload: []'), [], 'Empty optional rule providers must not block a snapshot')

const profile = renderSnapshot(template, [selfHosted, airport])
assert.match(profile, /name: .*SelfNode.*HK/, 'Self-hosted nodes must use the SelfNode fallback prefix')
assert.match(profile, /name: .*Airport.*HK/, 'Airport nodes must use their configured prefix')
const manual = profile.match(/- name: Manual[\s\S]*?(?=\n  - name:|$)/)?.[0] || ''
for (const name of ['SelfNode', 'Airport', 'Automatic', 'DIRECT', 'REJECT']) assert.match(manual, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Manual must include ${name}`)
const automatic = profile.match(/- name: Automatic[\s\S]*?(?=\n  - name:|$)/)?.[0] || ''
assert.match(automatic, /SelfNode/, 'Automatic must include self-hosted nodes')
const automaticCandidates = automatic.slice(automatic.indexOf('proxies:') + 'proxies:'.length)
assert.doesNotMatch(automaticCandidates, /Manual|DIRECT|REJECT|Automatic/, 'Automatic must not reference selector groups or itself')
for (const group of ['Default Proxy', 'AI', 'Media', 'Emby']) {
  const block = profile.match(new RegExp(`- name: ${group.replace(' ', '\\s+')}[\\s\\S]*?(?=\\n  - name:|$)`))?.[0] || ''
  assert.match(block, /SelfNode/, `${group} must include self-hosted nodes`)
  assert.doesNotMatch(block, /Airport/, `${group} must not include airport nodes`)
}

const fullyStatic = inlineRuleProviders(`rule-providers:
  sample:
    type: http
rules:
  - RULE-SET,sample,DIRECT
  - MATCH,Default Proxy
`, { sample: ['DOMAIN-SUFFIX,example.cn', 'DOMAIN,example.org'] })
assert.doesNotMatch(fullyStatic, /rule-providers:/, 'Static profiles must not retain dynamic rule providers')
assert.match(fullyStatic, /DOMAIN-SUFFIX,example\.cn,DIRECT/, 'Provider rules must be expanded inline')
assert.match(fullyStatic, /MATCH,Default Proxy/, 'Non-provider rules must be retained')
assert.doesNotMatch(inlineRuleProviders('rule-providers:\n  optional:\n    type: http\nrules:\n  - RULE-SET,optional,Emby\n', { optional: [] }), /RULE-SET/, 'Empty optional providers must be safely omitted')
const domainRules = inlineRuleProviders('rule-providers:\n  ads:\n    type: http\n    behavior: domain\nrules:\n  - RULE-SET,ads,REJECT\n', { ads: ['ads.example.com', '+.tracker.example'] })
assert.match(domainRules, /DOMAIN,ads\.example\.com,REJECT/, 'Domain providers must expand plain domains into valid rules')
assert.match(domainRules, /DOMAIN-SUFFIX,tracker\.example,REJECT/, 'Domain providers must preserve suffix semantics')

console.log('Snapshot rendering passed')
