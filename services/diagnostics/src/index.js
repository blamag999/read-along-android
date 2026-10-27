export class RateLimiter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/check' || request.method !== 'POST') return new Response('Not found', {status:404});
    const body = await request.json().catch(() => ({}));
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recent = (await this.state.storage.get('events') || []).filter(t => t > oneDayAgo);
    if (recent.filter(t => t > oneHourAgo).length >= 3 || recent.length >= 10) {
      return Response.json({allowed:false}, {status:429});
    }
    recent.push(now);
    await this.state.storage.put('events', recent, {expirationTtl: 86400});
    return Response.json({allowed:true});
  }
}

const REPO = 'blamag999/read-along-android';
const MAX_BODY = 64 * 1024;
const ALLOWED_ORIGINS = new Set(['https://localhost', 'http://localhost', 'http://127.0.0.1']);
const EVENTS = new Set([
  'app.started','audio.play','audio.pause','audio.ended','audio.waiting','audio.stalled',
  'audio.seeking','audio.seeked','audio.error','audio.metadata','pdf.render.start',
  'pdf.render.end','pdf.render.error','viewport.change','orientation.change',
  'document.hidden','window.error','promise.rejection','diagnostics.open'
]);
function corsHeaders(origin) {
  const headers = {'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function response(data, status, origin) {
  return new Response(JSON.stringify(data), {status, headers:{...corsHeaders(origin),'Content-Type':'application/json; charset=utf-8'}});
}
async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function cleanReport(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid_report');
  const version = String(input.version || 'unknown').slice(0,40);
  if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) throw new Error('invalid_version');
  const platform = ['android','ios','web'].includes(input.platform) ? input.platform : 'other';
  const current = input.current && typeof input.current === 'object' ? input.current : {};
  const cleanState = s => ({
    page: Number.isFinite(s.page) ? Math.max(0,Math.min(100000,Math.trunc(s.page))) : 0,
    audioTime: Number.isFinite(s.time) ? Math.round(Math.max(0,Math.min(864000,s.time))*10)/10 : 0,
    paused: typeof s.paused === 'boolean' ? s.paused : true,
    readyState: Number.isFinite(s.readyState) ? Math.max(0,Math.min(4,Math.trunc(s.readyState))) : 0,
    duration: Number.isFinite(s.duration) ? Math.round(Math.max(0,Math.min(864000,s.duration))*10)/10 : 0
  });
  const events = Array.isArray(input.events) ? input.events.slice(-350).filter(e => e && EVENTS.has(e.event)).map(e => {
    const row = {event:e.event, at: typeof e.at === 'string' && /^\d{4}-\d\d-\d\dT/.test(e.at) ? e.at.slice(0,30) : ''};
    if (Number.isFinite(e.page)) row.page = Math.max(0,Math.min(100000,Math.trunc(e.page)));
    if (Number.isFinite(e.audioTime)) row.audioTime = Math.round(Math.max(0,Math.min(864000,e.audioTime))*10)/10;
    if (typeof e.paused === 'boolean') row.paused = e.paused;
    if (Number.isFinite(e.readyState)) row.readyState = Math.max(0,Math.min(4,Math.trunc(e.readyState)));
    if (Number.isFinite(e.duration)) row.duration = Math.round(Math.max(0,Math.min(864000,e.duration))*10)/10;
    if (typeof e.orientation === 'string' && /^(portrait|landscape|unknown|hidden|visible)/.test(e.orientation)) row.orientation = e.orientation.slice(0,24);
    return row;
  }) : [];
  const nativeLifecycle = Array.isArray(input.nativeLifecycle) ? input.nativeLifecycle.slice(-250).filter(line =>
    typeof line === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.]+Z? [A-Za-z0-9_.-]{1,64}$/.test(line)
  ).map(line => line.slice(0,100)) : [];
  return {
    app:'Read Along', version, platform,
    generatedAt: typeof input.generatedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(input.generatedAt) ? input.generatedAt.slice(0,30) : new Date().toISOString(),
    viewport: {
      width: Number.isFinite(input.viewport?.width) ? Math.max(0,Math.min(10000,Math.trunc(input.viewport.width))) : 0,
      height: Number.isFinite(input.viewport?.height) ? Math.max(0,Math.min(10000,Math.trunc(input.viewport.height))) : 0,
      orientation: typeof input.viewport?.orientation === 'string' && /^(portrait|landscape|unknown)/.test(input.viewport.orientation) ? input.viewport.orientation.slice(0,24) : 'unknown'
    },
    current: cleanState({page:current.page,time:current.time,paused:current.paused,readyState:current.readyState,duration:current.duration}),
    events, nativeLifecycleAvailable: input.nativeLifecycleAvailable === true, nativeLifecycle
  };
}
async function verifyTurnstile(token, request, env) {
  if (!token || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',body:form});
  const result = await res.json().catch(() => ({}));
  return result.success === true && (!result.action || result.action === 'read_along_diagnostics');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:corsHeaders(origin)});
    const url = new URL(request.url);
    if (!['GET','POST'].includes(request.method)) return response({error:'method_not_allowed'},405,origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return response({error:'origin_not_allowed'},403,origin);
    if (url.pathname === '/config' && request.method === 'GET') {
      if (!env.TURNSTILE_SITE_KEY) return response({error:'service_not_configured'},503,origin);
      return response({siteKey:env.TURNSTILE_SITE_KEY},200,origin);
    }
    if (url.pathname !== '/report' || request.method !== 'POST') return response({error:'not_found'},404,origin);
    if (!env.GITHUB_TOKEN || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY || !env.RATE_LIMITER) return response({error:'service_not_configured'},503,origin);
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY) return response({error:'payload_too_large'},413,origin);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return response({error:'payload_too_large'},413,origin);
    let body;
    try { body = JSON.parse(raw); } catch { return response({error:'invalid_json'},400,origin); }
    if (!(await verifyTurnstile(body.turnstileToken, request, env))) return response({error:'verification_failed'},403,origin);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limiterName = await sha256(ip + ':' + (env.RATE_LIMIT_SALT || 'read-along-v1'));
    const limiterId = env.RATE_LIMITER.idFromName(limiterName);
    const limit = await env.RATE_LIMITER.get(limiterId).fetch('https://limiter/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if (limit.status === 429) return response({error:'rate_limited',message:'Đã đạt giới hạn gửi log. Hãy thử lại sau.'},429,origin);
    if (!limit.ok) return response({error:'rate_limiter_unavailable'},503,origin);
    let report;
    try { report = cleanReport(body.report); } catch { return response({error:'invalid_report'},400,origin); }
    const title = '[Chẩn đoán] Audio / xoay màn hình - v' + report.version;
    const issueBody = [
      'Báo lỗi được gửi có chủ đích từ chức năng chẩn đoán trong Read Along.',
      '',
      '> Log đã được lọc theo allowlist ở máy chủ. Không bao gồm tên sách/tệp, URL, token, nội dung sách, email hoặc thông tin tài khoản.',
      '',
      '- Phiên bản: ' + report.version,
      '- Nền tảng: ' + report.platform,
      '- Thời điểm tạo log: ' + report.generatedAt,
      '- Kích thước viewport: ' + report.viewport.width + ' × ' + report.viewport.height,
      '- Vòng đời native có sẵn: ' + (report.nativeLifecycleAvailable ? 'Có' : 'Không'),
      '',
      '## Trạng thái tại thời điểm gửi',
      '```json',
      JSON.stringify({current:report.current,viewport:report.viewport},null,2),
      '```',
      '## Sự kiện ứng dụng',
      '```json',
      JSON.stringify(report.events,null,2),
      '```',
      '## Android Activity / WebView lifecycle',
      '```text',
      report.nativeLifecycle.join('\n') || '(Không có log native; có thể đang chạy Web Local hoặc APK chưa tích hợp plugin.)',
      '```',
      '',
      '## Cần bổ sung',
      'Nếu có thể, mô tả ngắn các bước tái hiện lỗi trong comment. Không đính kèm sách, audio hoặc dữ liệu cá nhân.'
    ].join('\n');
    const gh = await fetch('https://api.github.com/repos/' + REPO + '/issues', {
      method:'POST',
      headers:{'Authorization':'Bearer ' + env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
      body:JSON.stringify({title,body:issueBody})
    });
    const issue = await gh.json().catch(() => ({}));
    if (!gh.ok || !issue.html_url || !/^https:\/\/github\.com\/blamag999\/read-along-android\/issues\/\d+$/.test(issue.html_url)) {
      return response({error:'issue_creation_failed'},502,origin);
    }
    return response({issueUrl:issue.html_url},201,origin);
  }
};
