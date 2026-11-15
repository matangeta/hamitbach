// המטבח: remote MCP server (Streamable HTTP, stateless JSON responses) on a Supabase Edge Function.
// Auth: OAuth 2.1 through Supabase Auth's OAuth server. Claude sends the user's access token as a Bearer
// token; every database call runs with that token, so row level security limits it to what the user may see.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const FN_URL = `${SUPABASE_URL}/functions/v1/kitchen-mcp`;
const APP_URL = 'https://matangeta.github.io/hamitbach/';
const VERSION = '1.0.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });

const resourceMetadata = () => ({
  resource: FN_URL,
  authorization_servers: [`${SUPABASE_URL}/auth/v1`],
  bearer_methods_supported: ['header'],
  resource_name: 'המטבח',
  resource_documentation: APP_URL,
});
const unauthorized = (msg = 'Sign in required') => json({ error: 'unauthorized', error_description: msg }, 401, {
  'WWW-Authenticate': `Bearer resource_metadata="${FN_URL}/.well-known/oauth-protected-resource"`,
});

const LISTS = ['shopping', 'wishlist', 'restaurants'] as const;
const LIST_HE: Record<string, string> = { shopping: 'רשימת קניות', wishlist: 'דברים שאני רוצה לקנות', restaurants: 'מסעדות' };
const CATS = ['פיצה', 'פסטה', 'אסייתי', 'בשר ועוף', 'שרקוטרי', 'דגים', 'מרקים', 'סלטים', 'מאפים', 'קינוחים וארוחות בוקר', 'רטבים, ממרחים ותוספות', 'כבישה ותסיסה', 'חטיפים ונשנושים', 'משקאות', 'טיפים ומדריכים', 'אחר'];

const RECIPE_FORMAT = `Recipe body format (Markdown, Hebrew unless the user asks otherwise), so the app can scale quantities:
**מקור:** [name](url) (when known)
**כמות:** e.g. 4 מנות
**זמן:** e.g. 30 דקות
---
## מצרכים
- one ingredient per line, number first: "200 גרם קמח", "2 ביצים", "½ כפית מלח"
## הוראות
1. numbered steps
## טיפים (optional)
Do not repeat the title inside the body. Keep the author's quantities exactly; write numbers as digits.`;

const ownerParam = { owner_email: { type: 'string', description: 'Optional. Email of another user who shared this category with the current user; omit for the user\'s own data.' } };
const TOOLS = [
  {
    name: 'search_recipes',
    description: 'Search the user\'s recipes (and recipes shared with them) by words in the title or text. Returns id, title and category. Call with no query to list everything.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string', enum: CATS }, ...ownerParam, limit: { type: 'integer', default: 50 } } },
    annotations: { readOnlyHint: true, title: 'חיפוש מתכונים' },
  },
  {
    name: 'get_recipe',
    description: 'Get one full recipe (Markdown) by id, or by exact or partial title.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, ...ownerParam } },
    annotations: { readOnlyHint: true, title: 'קריאת מתכון' },
  },
  {
    name: 'save_recipe',
    description: `Save a NEW recipe to the user's kitchen app. Use it when the user shares a recipe as text, a photo/screenshot, or a link: read and parse it yourself first, then call this once with clean structured content.\n${RECIPE_FORMAT}`,
    inputSchema: { type: 'object', required: ['title', 'body'], properties: {
      title: { type: 'string', description: 'Short Hebrew title' },
      category: { type: 'string', enum: CATS },
      body: { type: 'string', description: 'Markdown body in the format described above' },
      keto: { type: 'boolean', description: 'true if the recipe is keto / low-carb' },
      ...ownerParam } },
    annotations: { title: 'שמירת מתכון' },
  },
  {
    name: 'update_recipe',
    description: 'Change an existing recipe (title, category, body or keto tag). Get it first with get_recipe and send the full new body.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, category: { type: 'string', enum: CATS }, body: { type: 'string' }, keto: { type: 'boolean' } } },
    annotations: { title: 'עדכון מתכון' },
  },
  {
    name: 'get_list',
    description: 'Read one of the user\'s lists: shopping (רשימת קניות), wishlist (דברים שאני רוצה לקנות) or restaurants (מסעדות). Returns items with ids, sections and done state.',
    inputSchema: { type: 'object', required: ['list'], properties: { list: { type: 'string', enum: LISTS }, include_done: { type: 'boolean', default: true }, ...ownerParam } },
    annotations: { readOnlyHint: true, title: 'קריאת רשימה' },
  },
  {
    name: 'add_items',
    description: 'Add items to a list. shopping: title like "חלב 3%" or "קמח – 1 ק״ג", optional section (e.g. "ירקות ופירות", "מוצרי חלב וביצים", "מזווה", "בשר ודגים"; reuse sections that already exist in get_list). wishlist: title, note (why), price, link. restaurants: title, cuisine, area, note, link, section "want" (רוצה לנסות, default) or "been" (היינו) with order and rating.',
    inputSchema: { type: 'object', required: ['list', 'items'], properties: {
      list: { type: 'string', enum: LISTS }, ...ownerParam,
      items: { type: 'array', items: { type: 'object', required: ['title'], properties: {
        title: { type: 'string' }, section: { type: 'string' }, note: { type: 'string' }, link: { type: 'string' },
        price: { type: 'string' }, cuisine: { type: 'string' }, area: { type: 'string' }, order: { type: 'string' }, rating: { type: 'string' } } } } } },
    annotations: { title: 'הוספה לרשימה' },
  },
  {
    name: 'update_items',
    description: 'Mark items done/undone (bought, visited) or change their fields. Use ids from get_list.',
    inputSchema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id'], properties: {
      id: { type: 'string' }, done: { type: 'boolean' }, title: { type: 'string' }, section: { type: 'string' }, note: { type: 'string' }, link: { type: 'string' },
      price: { type: 'string' }, cuisine: { type: 'string' }, area: { type: 'string' }, order: { type: 'string' }, rating: { type: 'string' } } } } } },
    annotations: { title: 'עדכון פריטים' },
  },
  {
    name: 'remove_items',
    description: 'Delete items from a list by id. Only when the user asks to remove (not when something was bought: use update_items with done=true).',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
    annotations: { destructiveHint: true, title: 'מחיקת פריטים' },
  },
];

const EXTRA_KEYS = ['price', 'cuisine', 'area', 'order', 'rating'];
type Ctx = { sb: SupabaseClient; uid: string };
const text = (t: string) => ({ content: [{ type: 'text', text: t }] });
const errText = (t: string) => ({ content: [{ type: 'text', text: t }], isError: true });
const must = <T,>({ data, error }: { data: T; error: unknown }) => { if (error) throw error; return data; };
const recipeLink = (id: string) => `${APP_URL}#/r/${id}`;

async function ownerId(c: Ctx, email?: string) {
  if (!email) return c.uid;
  const rows = must(await c.sb.from('profiles').select('id,email').eq('email', email.trim().toLowerCase()));
  if (!rows?.length) throw new Error(`No user ${email} shares anything with you.`);
  return rows[0].id as string;
}

async function call(c: Ctx, name: string, a: any) {
  switch (name) {
    case 'search_recipes': {
      let q = c.sb.from('recipes').select('id,title,category,tags,owner_id').order('title').limit(Math.min(a.limit || 50, 300));
      if (a.owner_email) q = q.eq('owner_id', await ownerId(c, a.owner_email));
      if (a.category) q = q.eq('category', a.category);
      if (a.query) { const s = String(a.query).replace(/[%,()]/g, ' ').trim(); q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`); }
      const rows = must(await q) as any[];
      if (!rows.length) return text('לא נמצאו מתכונים.');
      return text(rows.map((r) => `${r.id} | ${r.title} | ${r.category}${(r.tags || []).length ? ' | ' + r.tags.join(',') : ''}${r.owner_id !== c.uid ? ' | (משותף)' : ''}`).join('\n'));
    }
    case 'get_recipe': {
      let q = c.sb.from('recipes').select('id,title,category,tags,body,owner_id');
      if (a.id) q = q.eq('id', a.id); else if (a.title) q = q.ilike('title', `%${String(a.title).replace(/[%]/g, '')}%`); else return errText('Give id or title.');
      if (a.owner_email) q = q.eq('owner_id', await ownerId(c, a.owner_email));
      const rows = must(await q.limit(5)) as any[];
      if (!rows.length) return errText('Recipe not found.');
      if (rows.length > 1 && !a.id) return text('כמה מתכונים מתאימים, בחרו id:\n' + rows.map((r) => `${r.id} | ${r.title}`).join('\n'));
      const r = rows[0];
      return text(`# ${r.title}\nid: ${r.id}\ncategory: ${r.category}\nlink: ${recipeLink(r.id)}\n\n${r.body}`);
    }
    case 'save_recipe': {
      const owner = await ownerId(c, a.owner_email);
      const row = must(await c.sb.from('recipes').insert({ owner_id: owner, title: a.title, category: CATS.includes(a.category) ? a.category : 'אחר', body: a.body, tags: a.keto ? ['קיטו'] : [] }).select('id').single()) as any;
      return text(`נשמר: "${a.title}". ${recipeLink(row.id)}`);
    }
    case 'update_recipe': {
      const cur = must(await c.sb.from('recipes').select('tags').eq('id', a.id).maybeSingle()) as any;
      if (!cur) return errText('Recipe not found.');
      const patch: any = {};
      for (const k of ['title', 'category', 'body']) if (a[k] !== undefined) patch[k] = a[k];
      if (a.keto !== undefined) patch.tags = (cur.tags || []).filter((t: string) => t !== 'קיטו').concat(a.keto ? ['קיטו'] : []);
      const rows = must(await c.sb.from('recipes').update(patch).eq('id', a.id).select('id')) as any[];
      if (!rows.length) return errText('No permission to edit this recipe.');
      return text(`עודכן. ${recipeLink(a.id)}`);
    }
    case 'get_list': {
      const owner = await ownerId(c, a.owner_email);
      let q = c.sb.from('items').select('id,section,title,note,link,extra,done').eq('owner_id', owner).eq('list', a.list).order('position').order('created_at');
      if (a.include_done === false) q = q.eq('done', false);
      const rows = must(await q) as any[];
      if (!rows.length) return text(`${LIST_HE[a.list]}: ריקה.`);
      return text(`${LIST_HE[a.list]}:\n` + rows.map((r) => {
        const x = r.extra || {}; const bits = [r.section && `section: ${r.section}`, r.note && `note: ${r.note}`, r.link && `link: ${r.link}`,
          ...EXTRA_KEYS.filter((k) => x[k]).map((k) => `${k}: ${x[k]}`), x.note === true && '(הערה, לא פריט לקנייה)'].filter(Boolean);
        return `${r.done ? '[x]' : '[ ]'} ${r.id} | ${r.title}${bits.length ? ' | ' + bits.join(' | ') : ''}`;
      }).join('\n'));
    }
    case 'add_items': {
      const owner = await ownerId(c, a.owner_email);
      const now = Date.now() / 1000;
      const rows = (a.items || []).map((it: any, i: number) => ({
        owner_id: owner, list: a.list, title: it.title, note: it.note || '', link: it.link || '', position: now + i,
        section: a.list === 'restaurants' ? (it.section === 'been' ? 'been' : 'want') : (it.section || ''),
        extra: Object.fromEntries(EXTRA_KEYS.filter((k) => it[k]).map((k) => [k, it[k]])),
      }));
      if (!rows.length) return errText('No items.');
      must(await c.sb.from('items').insert(rows));
      return text(`נוספו ${rows.length} ל${LIST_HE[a.list]}: ${rows.map((r: any) => r.title).join(', ')}`);
    }
    case 'update_items': {
      let n = 0;
      for (const it of a.items || []) {
        const patch: any = {};
        for (const k of ['done', 'title', 'section', 'note', 'link']) if (it[k] !== undefined) patch[k] = it[k];
        if (EXTRA_KEYS.some((k) => it[k] !== undefined)) {
          const cur = must(await c.sb.from('items').select('extra').eq('id', it.id).maybeSingle()) as any;
          patch.extra = { ...(cur?.extra || {}), ...Object.fromEntries(EXTRA_KEYS.filter((k) => it[k] !== undefined).map((k) => [k, it[k]])) };
        }
        const rows = must(await c.sb.from('items').update(patch).eq('id', it.id).select('id')) as any[];
        n += rows.length;
      }
      return text(`עודכנו ${n} פריטים.`);
    }
    case 'remove_items': {
      const rows = must(await c.sb.from('items').delete().in('id', a.ids || []).select('id')) as any[];
      return text(`נמחקו ${rows.length} פריטים.`);
    }
  }
  return errText(`Unknown tool ${name}`);
}

const INSTRUCTIONS = `This connects to "המטבח", the user's personal kitchen app (${APP_URL}): recipes, shopping list, wishlist and restaurants. Answer the user in Hebrew unless they write in another language.
- When the user sends a recipe (text, screenshot, photo of a page, or a link), read it yourself, rewrite it cleanly in Hebrew in the required format, and call save_recipe once. Then reply with the title and the link.
- "תוסיף לרשימה / צריך לקנות" -> add_items list=shopping; "קניתי" -> get_list then update_items done=true.
- To answer "what can I cook", use search_recipes and get_recipe.
- Data shared by other users is reachable with owner_email.`;

async function rpc(c: Ctx | null, msg: any) {
  const { id, method, params } = msg;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const bad = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hamitbach', title: 'המטבח', version: VERSION }, instructions: INSTRUCTIONS });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try { return ok(await call(c!, params.name, params.arguments || {})); }
      catch (e) { return ok(errText('Error: ' + ((e as any)?.message || String(e)))); }
    }
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default: return bad(-32601, `Method not found: ${method}`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (url.pathname.endsWith('/.well-known/oauth-protected-resource')) return json(resourceMetadata());
  if (req.method === 'GET') {
    if (req.headers.get('accept')?.includes('text/event-stream')) return new Response('SSE not supported', { status: 405, headers: CORS });
    return json({ name: 'המטבח MCP', version: VERSION, mcp: FN_URL });
  }
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === ANON_KEY) return unauthorized();
  const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return unauthorized('Invalid or expired token');
  const c: Ctx = { sb, uid: data.user.id };

  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const msgs = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of msgs) { if (m && m.id !== undefined && m.method) out.push(await rpc(c, m)); }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
});
