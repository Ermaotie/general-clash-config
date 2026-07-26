import { parseSubscription, renderSnapshot } from './snapshot.js'

const TEMPLATE_URL = 'https://github.com/Ermaotie/general-clash-config/raw/refs/heads/main/config/base.yaml'
const SNAPSHOT_KEY = 'profile.yaml'
const encoder = new TextEncoder()
const b64 = bytes => btoa(String.fromCharCode(...bytes))
const unb64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0))

async function hash(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))) }
async function key(env) { return crypto.subtle.importKey('raw', unb64(env.CONFIG_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']) }
async function seal(value, env) { const iv = crypto.getRandomValues(new Uint8Array(12)); const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), encoder.encode(JSON.stringify(value)))); return `${b64(iv)}.${b64(body)}` }
async function open(value, env) { const [iv, body] = value.split('.'); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(body)))) }
function authorized(request, env) { return request.headers.get('x-admin-token') === env.ADMIN_TOKEN }
function refreshAuthorized(request, env) { return Boolean(env.REFRESH_TOKEN) && request.headers.get('authorization') === `Bearer ${env.REFRESH_TOKEN}` }

function normalizeSettings(value) {
  if (Array.isArray(value?.providers)) return { providers: value.providers }
  if (value?.selfHostedUrl) return { providers: [{ name: '自建节点', url: value.selfHostedUrl, kind: 'self-hosted', prefix: '' }] }
  return { providers: [] }
}
function validateProviders(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) return null
  const providers = input.map((source, index) => ({
    name: String(source?.name || `订阅源 ${index + 1}`).trim().slice(0, 48),
    url: String(source?.url || '').trim(),
    kind: source?.kind === 'airport' ? 'airport' : 'self-hosted',
    prefix: String(source?.prefix || '').trim().slice(0, 32)
  }))
  if (providers.some(source => !source.name || !/^https:\/\//.test(source.url))) return null
  if (!providers.some(source => source.kind === 'self-hosted')) return null
  return providers
}
function profileFilename(name) {
  const safe = String(name || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return `MySub-${safe || 'Device'}.yaml`
}
function safeError(error) { return String(error?.message || '刷新失败').replace(/[\r\n]+/g, ' ').slice(0, 220) }
async function settings(env) {
  const row = await env.DB.prepare('SELECT encrypted_value FROM settings WHERE id=1').first()
  return row ? normalizeSettings(await open(row.encrypted_value, env)) : null
}
async function getSnapshotState(env) {
  return (await env.DB.prepare('SELECT status,updated_at,attempted_at,node_count,last_error FROM snapshot_state WHERE id=1').first()) || { status: 'empty', updated_at: null, attempted_at: null, node_count: 0, last_error: null }
}
async function putSnapshotState(env, state) {
  await env.DB.prepare('INSERT OR REPLACE INTO snapshot_state (id,status,updated_at,attempted_at,node_count,last_error) VALUES (1,?,?,?,?,?)')
    .bind(state.status, state.updatedAt || null, state.attemptedAt, state.nodeCount || 0, state.lastError || null).run()
}
async function fetchText(url, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'MySub static snapshot refresher' } })
    if (!response.ok) throw new Error(`${label} 返回 ${response.status}`)
    return await response.text()
  } catch (error) {
    throw new Error(`${label} 无法读取：${safeError(error)}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function refreshSnapshot(env, configuredSettings) {
  const attemptedAt = new Date().toISOString()
  try {
    await putSnapshotState(env, { ...(await getSnapshotState(env)), status: 'refreshing', attemptedAt })
    const current = configuredSettings || await settings(env)
    if (!current?.providers?.length) throw new Error('尚未配置订阅源')
    const [template, ...subscriptions] = await Promise.all([
      fetchText(TEMPLATE_URL, '规则模板'),
      ...current.providers.map(source => fetchText(source.url, `订阅源「${source.name}」`))
    ])
    const sources = current.providers.map((source, index) => ({ ...source, yaml: subscriptions[index] }))
    const profile = renderSnapshot(template, sources)
    const nodeCount = sources.reduce((total, source) => total + parseSubscription(source.yaml).length, 0)
    await env.SNAPSHOTS.put(SNAPSHOT_KEY, profile, { httpMetadata: { contentType: 'text/yaml; charset=utf-8' } })
    const state = { status: 'ready', updatedAt: new Date().toISOString(), attemptedAt, nodeCount, lastError: null }
    await putSnapshotState(env, state)
    return { ok: true, ...state }
  } catch (error) {
    const previous = await getSnapshotState(env)
    const state = { status: 'error', updatedAt: previous.updated_at, attemptedAt, nodeCount: previous.node_count, lastError: safeError(error) }
    await putSnapshotState(env, state)
    return { ok: false, ...state }
  }
}

function page() { return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MySub 私有订阅</title><style>:root{color:#172033;background:#f3f6fb;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#e4efff,transparent 34rem),#f3f6fb}.workspace-shell{max-width:960px;margin:auto;padding:40px 18px 72px}.hero,.heading,.row{display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{display:flex;gap:13px;align-items:center}.mark{width:43px;height:43px;display:grid;place-items:center;border-radius:13px;background:#2563eb;color:#fff;font-weight:800}.hero h1{font-size:24px;margin:0}.hero p,.hint{margin:4px 0;color:#64748b;font-size:13px}.live{padding:7px 10px;border-radius:99px;background:#eaf8ef;color:#16803d;font-size:13px;font-weight:650}.card,details{background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 12px 32px #16335b0b;margin-top:16px}.card{padding:22px}details{padding:0 22px}summary{padding:17px 0;cursor:pointer;font-weight:700}.heading h2{font-size:17px;margin:0}.grid,.source-grid{display:grid;grid-template-columns:1fr 160px;gap:12px}.source{padding:15px 0;border-top:1px solid #eef2f7}.source:first-child{border-top:0}.source-grid{grid-template-columns:1fr 150px 150px 42px}.url{grid-column:1/-1}label{font-size:12px;font-weight:650;color:#475569;display:grid;gap:6px}input,select,button{font:inherit}input,select{width:100%;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#172033}button{border:0;border-radius:10px;padding:10px 13px;background:#eaf0fb;color:#28405f;cursor:pointer;font-weight:650}.primary{background:#2563eb;color:#fff}.danger{align-self:end;background:#fef2f2;color:#b91c1c;padding:10px}.row{justify-content:flex-start;flex-wrap:wrap;margin-top:16px}.status{margin-top:15px;padding:11px 13px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:14px}.status.success{background:#ecfdf5;color:#15803d}.status.error{background:#fef2f2;color:#b91c1c}.snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.snapshot div{padding:12px;background:#f8fafc;border-radius:10px}.snapshot b{display:block;font-size:13px}.snapshot span{font-size:12px;color:#64748b}@media(max-width:640px){.workspace-shell{padding:24px 14px}.grid,.source-grid,.snapshot{grid-template-columns:1fr}.url{grid-column:auto}.danger{align-self:auto}.row button{width:100%}}</style><main class="workspace-shell"><header class="hero"><div class="brand"><div class="mark">M</div><div><h1>MySub</h1><p>私有订阅管理工作台</p></div></div><span class="live">● 服务在线</span></header><details><summary>管理会话</summary><div class="grid"><label>管理令牌<input id="token" type="password" placeholder="输入管理令牌"></label><div class="row"><button class="primary" onclick="loadSettings()">读取订阅源</button></div></div><p class="hint">令牌只用于当前页面操作，不会保存到浏览器。</p></details><section class="card"><div class="heading"><div><h2>静态订阅快照</h2><p>设备只读取已生成配置，不在更新时访问规则仓库或上游订阅。</p></div><button onclick="refreshNow()">立即刷新</button></div><div id="snapshot" class="snapshot"><div><b>状态</b><span>等待读取</span></div></div></section><section class="card"><div class="heading"><div><h2>订阅源</h2><p>自建节点进入所有策略组；机场节点只在 Manual 中可选。</p></div><button onclick="addSource()">＋ 添加来源</button></div><div id="sources"></div><div class="row"><button class="primary" onclick="saveSettings()">保存并刷新</button></div></section><section class="card"><div class="heading"><div><h2>设备订阅</h2><p>每台设备建议使用独立链接，便于单独管理。</p></div></div><label>英文设备名称<input id="device" placeholder="例如 Macbook 或 HomeRouter"></label><div class="row"><button class="primary" onclick="createDevice()">生成设备订阅</button></div><label style="margin-top:15px">订阅链接<input id="subscription" readonly placeholder="生成后会显示在这里"></label><div class="row"><button onclick="copySubscription()">复制链接</button><button onclick="openVerge()">导入 Clash Verge</button><button onclick="openShadowrocket()">导入 Shadowrocket</button><button onclick="openStash()">打开 Stash（已复制）</button></div></section><div id="message" class="status" role="status">准备就绪。请先读取或填写订阅源。</div></main><script>const $=id=>document.getElementById(id),headers=()=>({'x-admin-token':$('token').value,'content-type':'application/json'});function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function addSource(s){s=s||{name:'自建节点',url:'',kind:'self-hosted',prefix:''};const row=document.createElement('div');row.className='source';row.innerHTML='<div class="source-grid"><label>来源名称<input class="name" value="'+esc(s.name)+'"></label><label>类型<select class="kind"><option value="self-hosted">自建</option><option value="airport">机场</option></select></label><label>节点前缀<input class="prefix" placeholder="留空自动" value="'+esc(s.prefix)+'"></label><button class="danger" type="button">×</button><label class="url">订阅地址<input class="url-input" type="url" placeholder="https:// 订阅地址" value="'+esc(s.url)+'"></label></div>';row.querySelector('.kind').value=s.kind;row.querySelector('button').onclick=()=>row.remove();$('sources').append(row)}function sources(){return [...document.querySelectorAll('.source')].map(r=>({name:r.querySelector('.name').value,url:r.querySelector('.url-input').value,kind:r.querySelector('.kind').value,prefix:r.querySelector('.prefix').value}))}function msg(v,t){const e=$('message');e.textContent=v;e.className='status '+(t||'')}function snapshot(s){$('snapshot').innerHTML='<div><b>状态</b><span>'+esc(s.status||'empty')+'</span></div><div><b>节点数量</b><span>'+esc(s.node_count||s.nodeCount||0)+'</span></div><div><b>最近成功</b><span>'+esc(s.updated_at||s.updatedAt||'尚未生成')+'</span></div>'+(s.last_error||s.lastError?'<div style="grid-column:1/-1"><b>最近错误</b><span>'+esc(s.last_error||s.lastError)+'</span></div>':'')}async function loadSettings(){const r=await fetch('/api/settings',{headers:headers()});if(!r.ok)return msg('读取失败：请检查管理令牌','error');const d=await r.json();$('sources').replaceChildren();d.providers.forEach(addSource);await loadStatus();msg('已读取保存的订阅源','success')}async function loadStatus(){const r=await fetch('/api/status',{headers:headers()});if(r.ok)snapshot(await r.json())}async function saveSettings(){const r=await fetch('/api/settings',{method:'PUT',headers:headers(),body:JSON.stringify({providers:sources()})});const d=await r.json().catch(()=>null);if(!r.ok)return msg('保存失败：每个来源需要名称、HTTPS 地址，且至少一个自建节点','error');snapshot(d);msg(d.ok?'订阅源已保存，并生成了最新快照':'订阅源已保存；刷新失败，设备继续使用上次成功快照','success')}async function refreshNow(){const r=await fetch('/api/refresh',{method:'POST',headers:headers()});const d=await r.json().catch(()=>null);if(!r.ok)return msg('刷新失败：请检查管理令牌','error');snapshot(d);msg(d.ok?'静态快照已更新':'刷新失败，设备继续使用上次成功快照','success')}async function createDevice(){const r=await fetch('/api/devices',{method:'POST',headers:headers(),body:JSON.stringify({name:$('device').value||'Device'})});if(!r.ok)return msg('生成失败：请检查令牌','error');$('subscription').value=(await r.json()).subscription;msg('设备订阅已生成，可复制或直接导入','success')}async function copySubscription(){if(!$('subscription').value)return msg('请先生成订阅链接');await navigator.clipboard.writeText($('subscription').value);msg('订阅链接已复制','success')}function openVerge(){if(!$('subscription').value)return msg('请先生成订阅链接');location.href='clash://install-config?url='+encodeURIComponent($('subscription').value)}function openShadowrocket(){if(!$('subscription').value)return msg('请先生成订阅链接');location.href='shadowrocket://add/'+encodeURIComponent($('subscription').value)}async function openStash(){if(!$('subscription').value)return msg('请先生成订阅链接');await navigator.clipboard.writeText($('subscription').value);location.href='stash://';msg('已复制订阅链接，请在 Stash 中粘贴并导入','success')}addSource()</script></html>` }

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/__scheduled') return new Response('Not found', { status: 404 })
    if (url.pathname === '/admin') return new Response(page(), { headers: { 'content-type': 'text/html;charset=utf-8' } })
    if (url.pathname === '/api/settings' && request.method === 'GET') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      return Response.json((await settings(env)) || { providers: [] })
    }
    if (url.pathname === '/api/settings' && request.method === 'PUT') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      const providers = validateProviders((await request.json()).providers)
      if (!providers) return new Response('Invalid providers', { status: 400 })
      const current = { providers }
      await env.DB.prepare('INSERT OR REPLACE INTO settings (id, encrypted_value) VALUES (1, ?)').bind(await seal(current, env)).run()
      return Response.json(await refreshSnapshot(env, current))
    }
    if (url.pathname === '/api/status' && request.method === 'GET') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      return Response.json(await getSnapshotState(env))
    }
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      return Response.json(await refreshSnapshot(env))
    }
    if (url.pathname === '/internal/refresh' && request.method === 'POST') {
      if (!refreshAuthorized(request, env)) return new Response('Not found', { status: 404 })
      return Response.json(await refreshSnapshot(env))
    }
    if (url.pathname === '/api/devices' && request.method === 'POST') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      const input = await request.json(); const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''); const id = crypto.randomUUID()
      await env.DB.prepare('INSERT INTO devices (id,name,token_hash,created_at) VALUES (?,?,?,?)').bind(id, String(input.name || '设备').slice(0, 64), await hash(token), new Date().toISOString()).run()
      return Response.json({ subscription: `${url.origin}/sub/${token}` })
    }
    if (url.pathname.startsWith('/sub/')) {
      const token = url.pathname.slice(5); const device = await env.DB.prepare('SELECT id,name FROM devices WHERE token_hash=? AND revoked_at IS NULL').bind(await hash(token)).first()
      if (!device) return new Response('Not found', { status: 404 })
      const profile = await env.SNAPSHOTS.get(SNAPSHOT_KEY)
      if (!profile) return new Response('Subscription snapshot not ready; refresh it from /admin first', { status: 503 })
      return new Response(profile.body, { headers: { 'content-type': 'text/yaml;charset=utf-8', 'cache-control': 'private, max-age=300', 'content-disposition': `attachment; filename=${profileFilename(device.name)}`, 'profile-update-interval': '24' } })
    }
    return new Response('Not found', { status: 404 })
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshSnapshot(env).catch(error => console.error('Scheduled snapshot refresh failed', safeError(error))))
  }
}
