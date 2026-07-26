import { parse, stringify } from 'yaml'

function prefixFor(source) {
  return source.prefix || (source.kind === 'airport' ? 'Airport' : 'SelfNode')
}

function yamlList(value, indent) {
  const padding = ' '.repeat(indent)
  return stringify(value).trimEnd().split('\n').map(line => `${padding}${line}`).join('\n')
}

export function parseSubscription(body) {
  let parsed
  try {
    parsed = parse(body)
  } catch {
    throw new Error('订阅不是有效的 Clash YAML')
  }
  if (!Array.isArray(parsed?.proxies)) throw new Error('订阅缺少 proxies 节点列表')
  if (parsed.proxies.some(proxy => !proxy || typeof proxy !== 'object' || !String(proxy.name || '').trim())) {
    throw new Error('订阅包含没有名称的节点')
  }
  return parsed.proxies
}

export function parseRuleProvider(body) {
  let parsed
  try {
    parsed = parse(body)
  } catch {
    throw new Error('规则集不是有效的 YAML')
  }
  const payload = parsed?.payload || parsed?.rules
  if (!Array.isArray(payload) || payload.some(rule => !String(rule || '').trim())) throw new Error('规则集缺少有效 payload')
  return payload.map(rule => String(rule).trim())
}

function mergeNodes(sources) {
  const used = new Set()
  return sources.flatMap(source => parseSubscription(source.yaml).map(proxy => {
    const base = `[${prefixFor(source)}] ${String(proxy.name).trim()}`
    let name = base
    let index = 2
    while (used.has(name)) name = `${base} #${index++}`
    used.add(name)
    return { ...proxy, name, __kind: source.kind }
  }))
}

export function inlineRuleProviders(profile, providerRules) {
  const parsed = parse(profile)
  const configured = parsed?.['rule-providers'] || {}
  const rules = []
  for (const entry of parsed?.rules || []) {
    const match = String(entry).match(/^RULE-SET,([^,]+),(.+)$/)
    if (!match || !configured[match[1]]) {
      rules.push(entry)
      continue
    }
    const payload = providerRules[match[1]]
    if (!Array.isArray(payload)) throw new Error(`规则集「${match[1]}」格式无效`)
    const behavior = configured[match[1]].behavior || 'classical'
    rules.push(...payload.map(rule => inlineRule(String(rule).trim(), behavior, match[2])))
  }
  parsed.rules = rules
  delete parsed['rule-providers']
  return stringify(parsed, { lineWidth: 0 })
}

function inlineRule(rule, behavior, target) {
  if (behavior !== 'domain') return `${rule},${target}`
  if (rule.startsWith('+.')) return `DOMAIN-SUFFIX,${rule.slice(2)},${target}`
  return `DOMAIN,${rule},${target}`
}

export function renderSnapshot(template, sources) {
  const nodes = mergeNodes(sources)
  const selfHostedNames = nodes.filter(node => node.__kind === 'self-hosted').map(node => node.name)
  if (!selfHostedNames.length) throw new Error('至少需要一个自建节点')
  const allNames = nodes.map(node => node.name)
  const proxies = nodes.map(({ __kind, ...node }) => node)
  const manual = ['Automatic', 'DIRECT', 'REJECT', ...allNames]
  const selfHosted = ['Automatic', 'Manual', 'DIRECT', 'REJECT', ...selfHostedNames]
  const profile = template
    .replace(/^\s*__PROXIES__\s*$/m, yamlList(proxies, 2))
    .replace(/^\s*__ALL_PROXY_NAMES__\s*$/m, yamlList(manual, 6))
    .replace(/^\s*__SELF_HOSTED_NODE_NAMES__\s*$/m, yamlList(selfHostedNames, 6))
    .replaceAll(/^\s*__SELF_HOSTED_PROXY_NAMES__\s*$/gm, yamlList(selfHosted, 6))
  if (profile.includes('__')) throw new Error('静态模板缺少节点占位符')
  try {
    const parsed = parse(profile)
    if (!Array.isArray(parsed?.proxies) || !Array.isArray(parsed?.['proxy-groups'])) throw new Error()
  } catch {
    throw new Error('生成的订阅配置无效')
  }
  return profile
}
