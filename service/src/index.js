const TEMPLATE_URL = 'https://github.com/Ermaotie/general-clash-config/raw/refs/heads/main/config/base.yaml';
const text = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function hash(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', text.encode(value)))); }
async function key(env) { return crypto.subtle.importKey('raw', unb64(env.CONFIG_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(value, env) { const iv = crypto.getRandomValues(new Uint8Array(12)); const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), text.encode(JSON.stringify(value)))); return `${b64(iv)}.${b64(body)}`; }
async function open(value, env) { const [iv, body] = value.split('.'); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(body)))); }
function authorized(request, env) { return request.headers.get('x-admin-token') === env.ADMIN_TOKEN; }

function normalizeSettings(value) {
  if (Array.isArray(value?.providers)) return { providers: value.providers };
  if (value?.selfHostedUrl) return { providers: [{ name: '自建节点', url: value.selfHostedUrl, kind: 'self-hosted' }] };
  return { providers: [] };
}
function validateProviders(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) return null;
  const providers = input.map((source, index) => ({
    name: String(source?.name || `订阅源 ${index + 1}`).trim().slice(0, 48),
    url: String(source?.url || '').trim(),
    kind: source?.kind === 'airport' ? 'airport' : 'self-hosted'
  }));
  if (providers.some(source => !source.name || !/^https:\/\//.test(source.url))) return null;
  if (!providers.some(source => source.kind === 'self-hosted')) return null;
  return providers;
}
function sourceId(source, index) { return `${source.kind === 'airport' ? 'airport' : 'self_hosted'}_${index + 1}`; }
function profileFilename(name) {
  const safe = String(name || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `MySub-${safe || 'Device'}.yaml`;
}
function providerYaml(source, index) {
  const id = sourceId(source, index);
  const label = JSON.stringify(`[${source.name}] `);
  return `${id}:\n    type: http\n    url: ${JSON.stringify(source.url)}\n    path: ./proxy_providers/${id}.yaml\n    interval: 3600\n    health-check: { enable: true, url: "https://www.gstatic.com/generate_204", interval: 600 }\n    override: { additional-prefix: ${label} }`;
}
function ids(sources) { return sources.map((source, index) => `- ${sourceId(source, index)}`).join('\n      '); }
function renderTemplate(template, providers) {
  const selfHosted = providers.filter(source => source.kind === 'self-hosted');
  const airports = providers.filter(source => source.kind === 'airport');
  if (!selfHosted.length) throw new Error('A self-hosted subscription is required');
  return template
    .replace('__SELF_HOSTED_PROVIDERS__', selfHosted.map(providerYaml).join('\n  '))
    .replace('__AIRPORT_PROVIDERS__', airports.length ? airports.map(providerYaml).join('\n  ') : '# no airport providers')
    .replaceAll('__SELF_HOSTED_USES__', ids(selfHosted))
    .replace('__AIRPORT_USES__', airports.length ? ids(airports) : '# no airport providers');
}

function page() { return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>私有订阅管理</title><style>body{max-width:760px;margin:36px auto;padding:0 16px;font:16px system-ui;color:#172033}input,select,button{padding:10px;margin:6px 0;box-sizing:border-box;font:inherit}input,select{width:100%}button{cursor:pointer}.source{display:grid;grid-template-columns:1fr 130px 42px;gap:8px;align-items:center}.wide{grid-column:1/-1}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button{width:auto}#subscription{font-family:ui-monospace,monospace}small{color:#65708a}</style><h1>私有订阅管理</h1><input id="token" placeholder="管理令牌" type="password" autocomplete="current-password"><button onclick="loadSettings()">读取已保存订阅源</button><h2>订阅源</h2><div id="sources"></div><button onclick="addSource()">添加订阅源</button><button onclick="saveSettings()">保存订阅源</button><small>自建节点会进入所有策略组；机场节点只进入 Manual。</small><h2>设备订阅</h2><input id="device" placeholder="设备名称，例如：MacBook"><button onclick="createDevice()">生成设备订阅链接</button><input id="subscription" readonly placeholder="生成后会显示在这里"><div class="actions"><button onclick="copySubscription()">复制链接</button><button onclick="openVerge()">导入 Clash Verge</button><button onclick="openShadowrocket()">导入 Shadowrocket</button><button onclick="openStash()">打开 Stash（已复制）</button></div><small id="message">Stash 会先复制订阅地址，再打开应用；请在 Stash 中粘贴并导入。</small><script>const $=id=>document.getElementById(id);const headers=()=>({'x-admin-token':$('token').value,'content-type':'application/json'});function addSource(source={name:'',url:'',kind:'self-hosted'}){const row=document.createElement('div');row.className='source';row.innerHTML='<input class="name" placeholder="名称" value="'+escapeHtml(source.name)+'"><select class="kind"><option value="self-hosted">自建</option><option value="airport">机场</option></select><button type="button">×</button><input class="url wide" placeholder="https:// 订阅地址" value="'+escapeHtml(source.url)+'">';row.querySelector('.kind').value=source.kind;row.querySelector('button').onclick=()=>row.remove();$('sources').append(row)}function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function sources(){return [...document.querySelectorAll('.source')].map(row=>({name:row.querySelector('.name').value,url:row.querySelector('.url').value,kind:row.querySelector('.kind').value}))}async function loadSettings(){let r=await fetch('/api/settings',{headers:headers()});if(!r.ok)return message('读取失败：请检查管理令牌');let data=await r.json();$('sources').replaceChildren();data.providers.forEach(addSource);message('已读取保存的订阅源')}async function saveSettings(){let r=await fetch('/api/settings',{method:'PUT',headers:headers(),body:JSON.stringify({providers:sources()})});message(r.ok?'已加密保存':'保存失败：每个订阅源需要名称、HTTPS 地址，且至少一个自建节点')}async function createDevice(){let r=await fetch('/api/devices',{method:'POST',headers:headers(),body:JSON.stringify({name:$('device').value||'设备'})});if(!r.ok)return message('生成失败：请先保存订阅源并检查令牌');$('subscription').value=(await r.json()).subscription;message('订阅链接已生成，可复制或直接导入')}async function copySubscription(){if(!$('subscription').value)return message('请先生成订阅链接');await navigator.clipboard.writeText($('subscription').value);message('订阅链接已复制')}function openVerge(){if(!$('subscription').value)return message('请先生成订阅链接');location.href='clash://install-config?url='+encodeURIComponent($('subscription').value)}function openShadowrocket(){if(!$('subscription').value)return message('请先生成订阅链接');location.href='shadowrocket://add/'+encodeURIComponent($('subscription').value)}async function openStash(){if(!$('subscription').value)return message('请先生成订阅链接');await navigator.clipboard.writeText($('subscription').value);location.href='stash://';message('已复制订阅链接，请在 Stash 中粘贴并导入')}function message(value){$('message').textContent=value}addSource({name:'自建节点',url:'',kind:'self-hosted'});</script></html>`; }

export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/admin') return new Response(page(), { headers: { 'content-type': 'text/html;charset=utf-8' } });
  if (url.pathname === '/api/settings' && request.method === 'GET') {
    if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
    const row = await env.DB.prepare('SELECT encrypted_value FROM settings WHERE id=1').first();
    return Response.json(row ? normalizeSettings(await open(row.encrypted_value, env)) : { providers: [] });
  }
  if (url.pathname === '/api/settings' && request.method === 'PUT') {
    if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
    const providers = validateProviders((await request.json()).providers);
    if (!providers) return new Response('Invalid providers', { status: 400 });
    await env.DB.prepare('INSERT OR REPLACE INTO settings (id, encrypted_value) VALUES (1, ?)').bind(await seal({ providers }, env)).run();
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/api/devices' && request.method === 'POST') {
    if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 });
    const input = await request.json(); const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''); const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO devices (id,name,token_hash,created_at) VALUES (?,?,?,?)').bind(id, String(input.name || '设备').slice(0, 64), await hash(token), new Date().toISOString()).run();
    return Response.json({ subscription: `${url.origin}/sub/${token}` });
  }
  if (url.pathname.startsWith('/sub/')) {
    const token = url.pathname.slice(5); const device = await env.DB.prepare('SELECT id,name FROM devices WHERE token_hash=? AND revoked_at IS NULL').bind(await hash(token)).first();
    if (!device) return new Response('Not found', { status: 404 });
    const row = await env.DB.prepare('SELECT encrypted_value FROM settings WHERE id=1').first();
    if (!row) return new Response('Subscription source not configured', { status: 503 });
    const settings = normalizeSettings(await open(row.encrypted_value, env)); const remote = await fetch(`${TEMPLATE_URL}?updated=${Date.now()}`);
    if (!remote.ok) return new Response('Rule template unavailable', { status: 503 });
    let yaml; try { yaml = renderTemplate(await remote.text(), settings.providers); } catch { return new Response('Subscription source not configured', { status: 503 }); }
    return new Response(yaml, { headers: { 'content-type': 'text/yaml;charset=utf-8', 'cache-control': 'private, max-age=300', 'content-disposition': `attachment; filename="${profileFilename(device.name)}"`, 'profile-update-interval': '24' } });
  }
  return new Response('Not found', { status: 404 });
} };
