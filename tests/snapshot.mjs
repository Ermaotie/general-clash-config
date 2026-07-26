import assert from 'node:assert/strict'
import { renderSnapshot, parseSubscription } from '../service/src/snapshot.js'

const template = `proxies:
  __PROXIES__
proxy-groups:
  - name: Automatic
    type: url-test
    proxies:
      __SELF_HOSTED_PROXY_NAMES__
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

const profile = renderSnapshot(template, [selfHosted, airport])
assert.match(profile, /name: .*SelfNode.*HK/, 'Self-hosted nodes must use the SelfNode fallback prefix')
assert.match(profile, /name: .*Airport.*HK/, 'Airport nodes must use their configured prefix')
const manual = profile.match(/- name: Manual[\s\S]*?(?=\n  - name:|$)/)?.[0] || ''
for (const name of ['SelfNode', 'Airport', 'Automatic', 'DIRECT', 'REJECT']) assert.match(manual, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Manual must include ${name}`)
for (const group of ['Default Proxy', 'AI', 'Media', 'Emby']) {
  const block = profile.match(new RegExp(`- name: ${group.replace(' ', '\\s+')}[\\s\\S]*?(?=\\n  - name:|$)`))?.[0] || ''
  assert.match(block, /SelfNode/, `${group} must include self-hosted nodes`)
  assert.doesNotMatch(block, /Airport/, `${group} must not include airport nodes`)
}

console.log('Snapshot rendering passed')
