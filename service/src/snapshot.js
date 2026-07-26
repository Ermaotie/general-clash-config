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
