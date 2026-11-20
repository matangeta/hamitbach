/* המטבח: multi-user kitchen app. Supabase (auth + Postgres with row level security) holds every user's own
   recipes and lists; the shares table lets one user open a category of theirs to another (view or edit). */
(() => {
'use strict';
const CFG = window.KITCHEN_CONFIG || {};
const app = document.getElementById('app');
const configured = /^https:\/\//.test(CFG.supabaseUrl || '') && CFG.supabaseKey && !/^__/.test(CFG.supabaseKey);
const sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const APP_URL = location.origin + location.pathname;
const APP_VERSION = '1.5.0';

/* ---------- small helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const purify = (html) => window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
const mdBlock = (md) => purify(window.marked.parse(md || ''));
const mdInline = (md) => purify(window.marked.parseInline(md || ''));
const $ = (sel, root = app) => root.querySelector(sel);
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
function toast(msg) {
  let t = document.getElementById('toast-g');
  if (!t) { t = document.createElement('div'); t.id = 'toast-g'; t.className = 'offline'; t.style.background = 'var(--basil)'; document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
}
const fail = (e) => { console.error(e); toast(e && e.message && /network|fetch/i.test(e.message) ? 'אין חיבור לאינטרנט כרגע' : 'משהו השתבש. נסו שוב'); };
const must = ({ data, error }) => { if (error) throw error; return data; };
function externalLinks(root) { root.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; }); }

const ICON_SVG = '<svg class="app-icon" aria-hidden="true" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="#1f2a22"/><g transform="translate(0 -8)"><g fill="#fff"><rect x="26" y="47" width="48" height="29" rx="7"/><rect x="21" y="40" width="58" height="7" rx="3.5"/><circle cx="50" cy="36" r="4.5"/><rect x="14" y="52" width="13" height="6" rx="3"/><rect x="73" y="52" width="13" height="6" rx="3"/></g><g fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"><path d="M38 29c-4-5 4-8 0-13"/><path d="M62 29c-4-5 4-8 0-13"/></g></g><g><path d="M38 88c-5-4-5-9 0-14c5 5 5 10 0 14Z" fill="#f2a93b"/><path d="M50 88c-6-5-6-11 0-17c6 6 6 12 0 17Z" fill="#b4441f"/><path d="M62 88c-5-4-5-9 0-14c5 5 5 10 0 14Z" fill="#f2a93b"/></g></svg>';
const ICONS = {
  recipes: '<svg viewBox="0 0 24 24"><path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 11h20M9 4c0 1.5 1 1.5 1 3M13 4c0 1.5 1 1.5 1 3"/></svg>',
  shopping: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  wishlist: '<svg viewBox="0 0 24 24"><rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M2.5 9h19M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6-.5 6-1.5S14 5 12 9"/></svg>',
  restaurants: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 7.5a3 3 0 1 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/></svg>',
  claude: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
  guides: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/><path d="M6.5 8h2.5M6.5 11h2.5M15 8h2.5M15 11h2.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
const SCOPES = { recipes: 'מתכונים', shopping: 'רשימת קניות', wishlist: 'דברים שאני רוצה לקנות', restaurants: 'מסעדות' };
const CAT_ORDER = ['פיצה', 'פסטה', 'אסייתי', 'בשר ועוף', 'שרקוטרי', 'דגים', 'מרקים', 'סלטים', 'מאפים', 'קינוחים וארוחות בוקר', 'רטבים, ממרחים ותוספות', 'כבישה ותסיסה', 'חטיפים ונשנושים', 'משקאות', 'טיפים ומדריכים', 'אחר'];
const SEC_ICON = { 'פיצה': '🍕', 'אסייתי': '🍜', 'בשר ועוף': '🍗', 'שרקוטרי': '🥓', 'דגים': '🐟', 'מרקים': '🍲', 'סלטים': '🥗', 'מאפים': '🥐', 'קינוחים וארוחות בוקר': '🍰', 'רטבים, ממרחים ותוספות': '🫙', 'כבישה ותסיסה': '🥒', 'חטיפים ונשנושים': '🍿', 'משקאות': '🍹', 'טיפים ומדריכים': '💡', 'פסטה': '🍝', 'אחר': '🍽️' };
// recipe tags: shown as badges and filter chips; the editor offers a checkbox for each
const TAGS = { 'קיטו': '🥩', 'מנקנקת': '🌭' };
// old recipes carry a "🥩 **קיטו**" style line in the text; once the real tag badge shows, hide that line
const stripTagLines = (body, tags) => (body || '').replace(/^[^\S\n]*\S{1,2}[^\S\n]*\*\*([^*\n]+)\*\*[^\S\n]*(?:\n|$)/gm, (m, t) => ((tags || []).includes(t.trim()) ? '' : m));
const tagLabel = (t) => (TAGS[t] || '🏷️') + ' ' + t;
// guides live in the recipes table under this category, but get their own home tile and list
const GUIDE_CAT = 'טיפים ומדריכים';
const isGuide = (r) => (r.category || '') === GUIDE_CAT;
const secLabel = (n) => (SEC_ICON[n] ? SEC_ICON[n] + ' ' : '') + n;

/* ---------- session state ---------- */
const S = {
  user: null, profile: null,
  shares: [],          // rows I own + rows shared with me
  people: {},          // profile id -> profile (me + people I share with either way)
  owner: LS.get('owner', {}), // scope -> owner id currently viewed
  recipes: {},         // owner id -> array (cache)
  items: {},           // owner|list -> array (cache)
  channel: null,
};
const me = () => S.user && S.user.id;
const incoming = () => S.shares.filter((s) => s.grantee_id === me() && s.owner_id !== me());
const ownersFor = (scope) => [...new Set(incoming().filter((s) => s.scope === scope).map((s) => s.owner_id))];
const canEdit = (owner, scope) => owner === me() || incoming().some((s) => s.owner_id === owner && s.scope === scope && s.can_edit);
const nameOf = (id) => id === me() ? 'שלי' : (S.people[id] && (S.people[id].name || S.people[id].email)) || 'משתמש';
function viewOwner(scope) {
  const o = S.owner[scope];
  if (o && (o === me() || ownersFor(scope).includes(o))) return o;
  return me();
}
function setOwner(scope, id) { S.owner[scope] = id; LS.set('owner', S.owner); }

async function loadShares() {
  S.shares = must(await sb.from('shares').select('*'));
  const ids = [...new Set(S.shares.flatMap((s) => [s.owner_id, s.grantee_id]).filter(Boolean).concat(me()))];
  const profs = must(await sb.from('profiles').select('id,email,name').in('id', ids));
  S.people = Object.fromEntries(profs.map((p) => [p.id, p]));
  S.profile = S.people[me()] || { id: me(), email: S.user.email, name: '' };
  LS.set('cache-shares', { shares: S.shares, people: S.people });
}
async function loadRecipes(owner) {
  const rows = must(await sb.from('recipes').select('id,owner_id,title,category,tags,body,public_token,updated_at').eq('owner_id', owner).order('title'));
  S.recipes[owner] = rows; LS.set('cache-r-' + owner, rows); return rows;
}
async function loadItems(owner, list) {
  const rows = must(await sb.from('items').select('*').eq('owner_id', owner).eq('list', list).order('position').order('created_at'));
  S.items[owner + '|' + list] = rows; LS.set('cache-i-' + owner + '|' + list, rows); return rows;
}
const cachedRecipes = (o) => S.recipes[o] || LS.get('cache-r-' + o, null);
const cachedItems = (o, l) => S.items[o + '|' + l] || LS.get('cache-i-' + o + '|' + l, null);

// live updates: any change to rows I can see refreshes the open view (shared shopping list etc.)
function subscribe() {
  if (S.channel) sb.removeChannel(S.channel);
  let t = 0;
  const bump = (what) => { clearTimeout(t); t = setTimeout(() => { if (typeof current.refresh === 'function') current.refresh(what); }, 250); };
  S.channel = sb.channel('kitchen')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => bump('items'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => bump('recipes'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shares' }, async () => { try { await loadShares(); bump('shares'); } catch (e) {} })
    .subscribe();
}
const current = { refresh: null };

/* ---------- quantities (same rules as the original recipe book) ---------- */
const FR = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
const NUM = String.raw`(?:\d+(?:\.\d+)?\s?[½¼¾⅓⅔⅛]|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛])`;
const RE = new RegExp(String.raw`(?<![\w./:%])(${NUM})(?:(\s?[–-]\s?)(${NUM}))?(?![\d/]|\.\d)(?!(?!oz)[A-Za-z])`, 'g');
const UNIT = /^\s?(גרם|ג׳|קילו|ק״ג|מ״ל|ml|oz|כוס|כוסות|כף|כפות|כפית|כפיות)(?![֐-׿])/;
const METRIC = /^\s?(גרם|ג׳|מ״ל|ml|oz)/;
function parseNum(s) {
  s = String(s).trim().replace(',', '.');
  let m;
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return +m[1] / +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)?\s?([½¼¾⅓⅔⅛])$/))) return (+(m[1] || 0)) + FR[m[2]];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + +m[2] / +m[3];
  const v = parseFloat(s); return isNaN(v) ? null : v;
}
function fmt(v, metric) {
  if (metric) { if (v >= 100) return String(Math.round(v / 5) * 5); if (v >= 10) return String(Math.round(v)); return String(Math.round(v * 10) / 10); }
  if (v >= 10) return String(Math.round(v));
  const fr = [[0, ''], [.125, '⅛'], [.25, '¼'], [1 / 3, '⅓'], [.5, '½'], [2 / 3, '⅔'], [.75, '¾'], [1, '']];
  let w = Math.floor(v), f = v - w, best = fr[0];
  for (const c of fr) if (Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c;
  if (best[0] === 1) { w += 1; best = fr[0]; }
  if (w === 0 && !best[1]) return '⅛';
  return (w ? String(w) : '') + best[1];
}
const fmtFactor = (f) => '×' + (Math.round(f * 100) / 100);
function shouldScale(mode, before, after) {
  if (/(?:^|\s)(?:פי|תמי|שלב|מתכון)\s?$/.test(before)) return false;
  if (/^\s?(?:%|ס״מ|מעלות|דקות|דקה|שעות|שעה|ימים|שניות|:)/.test(after)) return false;
  if (/של\s(?:כ־)?$/.test(before)) return false;
  if (/ל־$/.test(before)) return true;
  if (mode === 'ing' || mode === 'yield') return true;
  return UNIT.test(after);
}
function makeQ(raw, metric) {
  const b = document.createElement('button');
  b.type = 'button'; b.dir = 'ltr'; b.className = 'q'; b.dataset.base = parseNum(raw); b.dataset.raw = raw.replace(/\s/g, '');
  if (metric) b.dataset.metric = '1';
  b.textContent = b.dataset.raw; b.title = 'שינוי הכמות';
  return b;
}
function markNode(node, mode) {
  const text = node.nodeValue; RE.lastIndex = 0;
  let m, last = 0, frag = null;
  while ((m = RE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (!shouldScale(mode, before, after)) continue;
    frag = frag || document.createDocumentFragment();
    frag.append(text.slice(last, m.index));
    const metric = METRIC.test(after);
    frag.append(makeQ(m[1], metric));
    if (m[3] !== undefined) { frag.append(m[2]); frag.append(makeQ(m[3], metric)); }
    last = m.index + m[0].length;
  }
  if (!frag) return;
  frag.append(text.slice(last));
  node.replaceWith(frag);
}
function textNodes(el) {
  const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement.closest('a, code, .q') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}
const WORDQ = /^(חצי|כף|כפית|כוס)(\s)/;
function prepare(content) {
  let zone = false, zoneBox = null;
  for (const el of [...content.children]) {
    const tag = el.tagName;
    if (/^H[1-3]$/.test(tag)) { zone = /מצרכים|לציפוי/.test(el.textContent); zoneBox = null; continue; }
    if (tag === 'HR') { zone = false; zoneBox = null; continue; }
    if (tag === 'TABLE') { const w = document.createElement('div'); w.className = 'tbl'; el.replaceWith(w); w.append(el); }
    const isYield = tag === 'P' && /^\s*(כמות|כמות המשרה)\s*:/.test(el.textContent);
    if (zone && tag !== 'BLOCKQUOTE') {
      el.querySelectorAll('li').forEach((li) => { const t = li.firstChild; if (t && t.nodeType === 3 && WORDQ.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(WORDQ, (s, w, sp) => (w === 'חצי' ? '½' : '1 ' + w) + sp); });
      textNodes(el).forEach((n) => markNode(n, n.parentElement.closest('th') ? 'text' : 'ing'));
      if (!zoneBox) { zoneBox = document.createElement('div'); zoneBox.className = 'ingr'; el.before(zoneBox); }
      zoneBox.append(el);
    } else {
      textNodes(el).forEach((n) => {
        let label = null, sib = n.previousSibling;
        while (sib && !label) { if (sib.nodeType === 1 && sib.tagName === 'STRONG') label = sib.textContent; sib = sib.previousSibling; }
        markNode(n, isYield || (label && /^כמות/.test(label)) ? 'yield' : 'text');
      });
    }
  }
}
function toText(content) {
  const lines = [];
  const walk = (el) => { for (const c of el.children) { const t = c.tagName;
    if (/^H[1-3]$/.test(t)) lines.push('', c.textContent.trim());
    else if (t === 'P') lines.push(c.textContent.trim());
    else if (t === 'UL' || t === 'OL') [...c.children].forEach((li, i) => lines.push((t === 'OL' ? (i + 1) + '. ' : '• ') + li.textContent.trim().replace(/\s*\n\s*/g, ' ')));
    else if (t === 'TABLE') c.querySelectorAll('tr').forEach((tr) => lines.push([...tr.children].map((x) => x.textContent.trim()).join(' | ')));
    else if (t === 'HR') lines.push('');
    else if (t === 'BLOCKQUOTE') c.querySelectorAll('p').forEach((p) => lines.push(p.textContent.trim()));
    else walk(c); } };
  walk(content);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/(\d[½¼¾⅓⅔⅛])/g, '$1‎').trim();
}

/* ---------- shared bits of UI ---------- */
const backBar = (href, label, extra = '') => `<div class="bar"><a class="btn" href="${href}">→ ${esc(label)}</a><span class="spacer"></span>${extra}</div>`;
function ownerChips(scope, onPick) {
  const others = ownersFor(scope);
  if (!others.length) return null;
  const cur = viewOwner(scope);
  const box = document.createElement('div'); box.className = 'chips owner-chips'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'של מי');
  for (const id of [me(), ...others]) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'chip';
    c.textContent = id === me() ? '🏠 שלי' : '👤 ' + nameOf(id); c.setAttribute('aria-pressed', String(id === cur));
    c.onclick = () => { setOwner(scope, id); onPick(); };
    box.append(c);
  }
  return box;
}
function sheet(title, inner) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.dir = 'rtl'; bg.lang = 'he';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="row"><h2>${esc(title)}</h2><span class="spacer"></span><button type="button" class="btn" data-close>סגירה</button></div>${inner}</div>`;
  document.body.append(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  bg.close = close;
  return bg;
}
function copyText(text, msg) {
  const done = () => toast(msg);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('להעתקה:', text));
  else prompt('להעתקה:', text);
}
async function nativeShare(data) { if (navigator.share) { try { await navigator.share(data); return true; } catch (e) { return e && e.name === 'AbortError'; } } return false; }

/* ---------- auth ---------- */
function authView(mode = 'in', msg = '') {
  document.title = 'המטבח';
  current.refresh = null;
  const isUp = mode === 'up', isReset = mode === 'reset', isNew = mode === 'newpass';
  app.innerHTML = `<div class="auth">
    <h1>${ICON_SVG} המטבח</h1>
    <p>מתכונים, רשימת קניות, משאלות ומסעדות. הכול במקום אחד, ואפשר לשתף עם מי שרוצים.</p>
    <form class="card stack" id="f" autocomplete="on">
      <h2 style="margin:0">${isNew ? 'סיסמה חדשה' : isReset ? 'איפוס סיסמה' : isUp ? 'הרשמה' : 'כניסה'}</h2>
      ${isUp ? '<label class="field"><span>שם</span><input type="text" name="name" autocomplete="name" required></label>' : ''}
      ${isNew ? '' : '<label class="field"><span>מייל</span><input type="email" name="email" autocomplete="email" dir="ltr" required></label>'}
      ${isReset ? '' : `<label class="field"><span>סיסמה</span><input type="password" name="pw" minlength="6" autocomplete="${isUp || isNew ? 'new-password' : 'current-password'}" dir="ltr" required>${isUp || isNew ? '<small>לפחות 6 תווים</small>' : ''}</label>`}
      <p class="err" id="err">${esc(msg)}</p>
      <button class="btn primary block" type="submit">${isNew ? 'שמירה' : isReset ? 'שליחת קישור לאיפוס' : isUp ? 'יצירת חשבון' : 'כניסה'}</button>
      <div class="row" style="justify-content:space-between">
        ${isUp || isReset ? '<button type="button" class="reset" data-mode="in">כבר יש לי חשבון</button>' : '<button type="button" class="reset" data-mode="up">אין לי חשבון, להרשמה</button>'}
        ${mode === 'in' ? '<button type="button" class="reset" data-mode="reset">שכחתי סיסמה</button>' : ''}
      </div>
    </form></div>`;
  app.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => authView(b.dataset.mode); });
  const f = $('#f'), err = $('#err');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f), email = String(fd.get('email') || '').trim(), pw = String(fd.get('pw') || '');
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; err.textContent = '';
    try {
      if (isNew) { must(await sb.auth.updateUser({ password: pw })); toast('הסיסמה עודכנה'); go('#/'); boot(); return; }
      if (isReset) { must(await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })); err.className = 'ok'; err.textContent = 'שלחנו לך מייל עם קישור לאיפוס.'; return; }
      if (isUp) {
        const d = must(await sb.auth.signUp({ email, password: pw, options: { data: { name: String(fd.get('name') || '').trim() }, emailRedirectTo: APP_URL } }));
        if (!d.session) { err.className = 'ok'; err.textContent = 'כמעט סיימנו: שלחנו לך מייל לאישור. אחרי הלחיצה על הקישור במייל אפשר להיכנס.'; return; }
      } else must(await sb.auth.signInWithPassword({ email, password: pw }));
      boot();
    } catch (x) {
      const m = String(x && x.message || '');
      err.className = 'err';
      err.textContent = /Invalid login/i.test(m) ? 'המייל או הסיסמה לא נכונים.' : /not confirmed/i.test(m) ? 'צריך קודם לאשר את המייל (חפשו מייל מ־Supabase).' :
        /already registered/i.test(m) ? 'המייל הזה כבר רשום. אפשר להיכנס.' : /rate limit/i.test(m) ? 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' : 'לא הצלחתי: ' + m;
    } finally { btn.disabled = false; }
  };
}

/* ---------- home ---------- */
async function home() {
  document.title = 'המטבח';
  const draw = (counts) => {
    const name = S.profile && S.profile.name ? S.profile.name : '';
    const inc = incoming();
    const sharers = [...new Set(inc.map((s) => s.owner_id))];
    const n = (k) => counts && counts[k] != null ? counts[k] : null;
    const tiles = [
      ['#/recipes', 'recipes', 'מתכונים', n('recipes') != null ? `${n('recipes')} מתכונים` : '', 'main'],
      ['#/guides', 'guides', 'מדריכים', n('guides') != null ? `${n('guides')} מדריכים וטיפים` : ''],
      ['#/list/shopping', 'shopping', 'רשימת קניות', n('shopping') != null ? (n('shopping') ? `נשארו ${n('shopping')} לקנות` : 'הכול נקנה') : ''],
      ['#/list/wishlist', 'wishlist', 'דברים שאני רוצה לקנות', n('wishlist') != null ? (n('wishlist') ? `${n('wishlist')} פריטים` : 'ריקה כרגע') : ''],
      ['#/list/restaurants', 'restaurants', 'מסעדות', n('restaurants') != null ? (n('restaurants') ? `${n('restaurants')} מסעדות` : 'עוד אין מסעדות') : ''],
      ['#/claude', 'claude', 'חיבור ל־Claude', 'לשמור מתכונים ולעדכן רשימות מתוך Claude', 'share'],
      ['#/share', 'share', 'שיתוף', sharers.length ? `${sharers.map(nameOf).join(', ')} ${sharers.length === 1 ? 'משתף' : 'משתפים'} איתך` : 'לשתף מתכונים ורשימות עם אחרים', 'share'],
    ];
    app.innerHTML = `<header class="home-head"><div class="home-top"><h1>${ICON_SVG} המטבח${name ? ' של ' + esc(name) : ''}</h1><span class="spacer"></span>
      <a class="icon-btn" href="#/settings" aria-label="הגדרות">${ICONS.gear}</a></div>
      <p>מתכונים, קניות, משאלות ומסעדות. הכול במקום אחד.</p></header>
      <div id="banners"></div>
      <nav class="tiles">${tiles.map(([h, k, t, sub, cls]) => `<a class="tile ${cls || ''}" href="${h}">${ICONS[k]}<span><b>${t}</b><small>${esc(sub) || '&nbsp;'}</small></span></a>`).join('')}</nav>`;
    installBanner($('#banners'));
    if (counts && counts.recipes === 0 && !LS.get('import-dismissed', false)) {
      const b = document.createElement('div'); b.className = 'banner';
      b.innerHTML = '<span>יש לך קובץ עם מתכונים ורשימות קיימים? אפשר לייבא אותו לחשבון.</span><span class="spacer"></span><a class="btn primary" href="#/settings">לייבוא</a><button class="reset" type="button">לא עכשיו</button>';
      b.querySelector('button').onclick = () => { LS.set('import-dismissed', true); b.remove(); };
      $('#banners').append(b);
    }
  };
  draw(LS.get('home-counts', null));
  const load = async () => {
    try {
      const q = (list, extra) => { let r = sb.from('items').select('id', { count: 'exact', head: true }).eq('owner_id', me()).eq('list', list); return extra ? extra(r) : r; };
      const [r, s, w, x] = await Promise.all([
        sb.from('recipes').select('id', { count: 'exact', head: true }).eq('owner_id', me()).neq('category', GUIDE_CAT),
        q('shopping', (r) => r.eq('done', false).not('extra', 'cs', '{"note":true}')), q('wishlist', (r) => r.eq('done', false)), q('restaurants')]);
      const g = await sb.from('recipes').select('id', { count: 'exact', head: true }).eq('owner_id', me()).eq('category', GUIDE_CAT);
      const counts = { recipes: r.count, guides: g.count, shopping: s.count, wishlist: w.count, restaurants: x.count };
      if ([r, s, w, x].some((z) => z.error)) return;
      LS.set('home-counts', counts);
      if (location.hash === '' || location.hash === '#/' || location.hash === '#') draw(counts);
    } catch (e) {}
  };
  current.refresh = load;
  load();
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
function installBanner(box) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || LS.get('install-dismissed', false)) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installEvt && !ios) return;
  const b = document.createElement('div'); b.className = 'banner';
  b.innerHTML = `<span>${ios ? 'להתקנה כאפליקציה: לחצו על כפתור השיתוף בספארי ואז "הוספה למסך הבית".' : 'אפשר להתקין את המטבח כאפליקציה במסך הבית.'}</span><span class="spacer"></span>
    ${installEvt ? '<button class="btn primary" type="button" id="inst">התקנה</button>' : ''}<button class="reset" type="button" id="inst-x">לא עכשיו</button>`;
  box.append(b);
  const i = b.querySelector('#inst'); if (i) i.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; b.remove(); };
  b.querySelector('#inst-x').onclick = () => { LS.set('install-dismissed', true); b.remove(); };
}

/* ---------- recipes list ---------- */
function categoriesOf(rows) {
  const used = [...new Set(rows.map((r) => r.category || 'אחר'))];
  return [...CAT_ORDER.filter((c) => used.includes(c)), ...used.filter((c) => !CAT_ORDER.includes(c)).sort()];
}
async function recipesView(guides = false) {
  document.title = guides ? 'מדריכים' : 'מתכונים';
  const owner = viewOwner('recipes');
  const editable = canEdit(owner, 'recipes');
  const qKey = guides ? 'guide-q' : 'recipe-q';
  app.innerHTML = backBar('#/', 'ראשי', editable ? `<a class="btn primary" href="#/new${guides ? '/guide' : ''}">+ ${guides ? 'מדריך חדש' : 'מתכון חדש'}</a>` : '') +
    `<h1 class="page-title">${guides ? 'מדריכים וטיפים' : 'מתכונים'}</h1><div id="owners"></div>
    <input type="search" class="search" id="q" placeholder="${guides ? 'חיפוש מדריך…' : 'חיפוש מתכון או מצרך…'}" value="${esc(LS.get(qKey, ''))}">
    <div class="chips" role="group" aria-label="סינון לפי קטגוריה"></div><div id="secs"><p class="loading">טוען…</p></div>`;
  const oc = ownerChips('recipes', () => recipesView(guides)); if (oc) $('#owners').append(oc);
  if (owner !== me()) $('#owners').insertAdjacentHTML('beforeend', `<p class="ro-note">המתכונים של ${esc(nameOf(owner))}${editable ? '. יש לך הרשאת עריכה.' : '. אפשר לצפות ולשמור עותק אצלך.'}</p>`);
  let filter = LS.get('recipe-filter', ''), tag = LS.get('recipe-tag', '');
  const chips = $('.chips'), secs = $('#secs'), qi = $('#q');
  let allRows = cachedRecipes(owner);
  const draw = () => {
    if (!allRows) return;
    const rows = allRows.filter((r) => guides === isGuide(r));
    const cats = categoriesOf(rows);
    if (guides || !cats.includes(filter)) filter = '';
    const allTags = [...new Set(rows.flatMap((r) => r.tags || []))];
    if (!allTags.includes(tag)) tag = '';
    chips.innerHTML = '';
    for (const name of guides ? [] : ['', ...cats]) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip';
      c.textContent = name ? secLabel(name) : '📖 הכול'; c.setAttribute('aria-pressed', String(name === filter));
      c.onclick = () => { filter = name; LS.set('recipe-filter', filter); draw(); };
      chips.append(c);
    }
    for (const t of allTags) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chip tag';
      c.textContent = tagLabel(t); c.setAttribute('aria-pressed', String(tag === t));
      c.onclick = () => { tag = tag === t ? '' : t; LS.set('recipe-tag', tag); draw(); };
      chips.append(c);
    }
    const q = qi.value.trim().toLowerCase();
    secs.innerHTML = '';
    let shown = 0;
    for (const cat of cats) {
      if (filter && cat !== filter) continue;
      const list = rows.filter((r) => (r.category || 'אחר') === cat && (!tag || (r.tags || []).includes(tag)) &&
        (!q || r.title.toLowerCase().includes(q) || (r.body || '').toLowerCase().includes(q)));
      if (!list.length) continue;
      shown += list.length;
      const sec = document.createElement('section'); sec.className = 'sec';
      sec.innerHTML = `<h2>${esc(secLabel(cat))}</h2><nav class="list">${list.map((r) => `<a href="#/r/${r.id}"><span>${esc(r.title)}${(r.tags || []).map((t) => ` <span class="badge">${esc(tagLabel(t))}</span>`).join('')}</span><span class="go" aria-hidden="true">‹</span></a>`).join('')}</nav>`;
      secs.append(sec);
    }
    if (!shown) secs.innerHTML = `<p class="empty">${rows.length ? (guides ? 'לא מצאתי מדריך מתאים.' : 'לא מצאתי מתכון מתאים.') : guides ? 'עוד אין כאן מדריכים.' : editable ? 'עוד אין כאן מתכונים. אפשר להוסיף מתכון חדש, או לייבא קובץ מההגדרות.' : 'עוד אין כאן מתכונים.'}</p>`;
  };
  qi.oninput = () => { LS.set(qKey, qi.value); draw(); };
  draw();
  current.refresh = async (what) => { if (what && what !== 'recipes' && what !== 'shares') return; try { allRows = await loadRecipes(owner); draw(); } catch (e) { if (!allRows) fail(e); } };
  await current.refresh();
}

/* ---------- one recipe ---------- */
async function findRecipe(id) {
  for (const rows of Object.values(S.recipes)) { const r = rows.find((x) => x.id === id); if (r) return r; }
  const data = must(await sb.from('recipes').select('id,owner_id,title,category,tags,body,public_token,updated_at').eq('id', id).maybeSingle());
  return data;
}
function renderRecipeBody(r, opts) {
  const factors = LS.get('recipe-factors', {});
  const key = opts.key;
  app.innerHTML = `
    <div class="bar">
      ${opts.back || ''}
      <span class="spacer"></span>
      <span class="scale" id="scale-box"><button type="button" id="minus" aria-label="פחות">−</button><output id="factor" dir="ltr" aria-live="polite">×1</output><button type="button" id="plus" aria-label="יותר">+</button></span>
      ${opts.actions || ''}
    </div>
    ${opts.note || ''}
    <h1 class="r-title">${esc(r.title)}</h1>
    ${(r.tags || []).length ? `<p style="margin:0 0 6px">${r.tags.map((t) => `<span class="badge">${esc(tagLabel(t))}</span>`).join(' ')}</p>` : ''}
    <p class="hint" id="hint">לחצו על כמות כדי לשנות אותה, וכל שאר הכמויות יתעדכנו בהתאם. <button type="button" class="reset" id="reset" hidden>חזרה לכמות המקורית</button></p>
    <article class="content">${mdBlock(stripTagLines(r.body, r.tags))}</article>
    ${opts.foot || ''}`;
  const content = $('.content');
  prepare(content);
  externalLinks(content);
  // links to other recipe files that were not resolved on import
  content.querySelectorAll('a[href$=".md"]').forEach((a) => a.removeAttribute('href'));
  const qs = [...content.querySelectorAll('.q')];
  if (!qs.length) { $('#scale-box').hidden = true; $('#hint').hidden = true; }
  const apply = () => {
    const f = factors[key] || 1;
    for (const q of qs) q.textContent = f === 1 ? q.dataset.raw : fmt(q.dataset.base * f, !!q.dataset.metric);
    const out = $('#factor'); out.textContent = fmtFactor(f); out.classList.toggle('changed', f !== 1);
    $('#reset').hidden = f === 1;
  };
  const setF = (f) => { f = Math.max(0.05, Math.min(50, f)); if (Math.abs(f - 1) < 1e-9) f = 1; if (f === 1) delete factors[key]; else factors[key] = f; LS.set('recipe-factors', factors); apply(); };
  const STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  $('#plus').onclick = () => { const f = factors[key] || 1; setF(STEPS.find((s) => s > f + 1e-9) || f + 2); };
  $('#minus').onclick = () => { const f = factors[key] || 1; setF([...STEPS].reverse().find((s) => s < f - 1e-9) || f / 2); };
  $('#reset').onclick = () => setF(1);
  content.addEventListener('click', (e) => {
    const q = e.target.closest('.q'); if (!q) return;
    const input = document.createElement('input');
    input.className = 'q-edit'; input.inputMode = 'decimal'; input.value = q.textContent; input.dir = 'ltr'; input.setAttribute('aria-label', 'כמות חדשה');
    q.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = (commit) => { if (done) return; done = true; input.replaceWith(q); const v = parseNum(input.value); if (commit && v && v > 0 && +q.dataset.base > 0) setF(v / +q.dataset.base); };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  });
  apply();
  return { content, factor: () => factors[key] || 1 };
}
async function recipeView(id) {
  app.innerHTML = '<p class="loading">טוען…</p>';
  let r;
  try { r = await findRecipe(id); } catch (e) { fail(e); }
  if (!r) { app.innerHTML = backBar('#/recipes', 'מתכונים') + '<p class="empty">המתכון לא נמצא, או שכבר אין לך גישה אליו.</p>'; return; }
  document.title = r.title;
  const mine = r.owner_id === me(), editable = canEdit(r.owner_id, 'recipes');
  const view = renderRecipeBody(r, {
    key: r.id,
    back: isGuide(r) ? '<a class="btn" href="#/guides">→ מדריכים</a>' : '<a class="btn" href="#/recipes">→ מתכונים</a>',
    actions: `${editable ? `<a class="btn" href="#/r/${r.id}/edit">עריכה</a>` : ''}<button type="button" class="btn primary" id="share">שיתוף</button>`,
    note: mine ? '' : `<p class="ro-note" style="margin-top:10px">מתכון של ${esc(nameOf(r.owner_id))}. <button type="button" class="reset" id="copy-mine">שמירת עותק במתכונים שלי</button></p>`,
  });
  const cm = $('#copy-mine'); if (cm) cm.onclick = () => saveCopy(r);
  $('#share').onclick = () => shareRecipe(r, view);
  current.refresh = null;
}
async function saveCopy(r) {
  try {
    const row = must(await sb.from('recipes').insert({ title: r.title, category: r.category, tags: r.tags || [], body: r.body || '' }).select('id').single());
    delete S.recipes[me()];
    toast('נשמר במתכונים שלך'); go('#/r/' + row.id);
  } catch (e) { fail(e); }
}
function shareRecipe(r, view) {
  const mine = r.owner_id === me();
  const f = view.factor();
  const text = () => r.title + (f !== 1 ? ` (כמויות ${fmtFactor(f)} מהמקור)` : '') + '\n\n' + toText(view.content);
  const linkOf = (tok) => APP_URL + '#/p/' + tok;
  const bg = sheet('שיתוף המתכון', `
    <section class="opt"><h3>קישור למתכון</h3>
      <p>כל מי שיש לו את הקישור יכול לראות את המתכון ולשנות בו כמויות, גם בלי חשבון.</p>
      <div id="pub"></div></section>
    <section class="opt"><h3>שיתוף עם משתמש באפליקציה</h3>
      <p>כדי שמישהו יראה את כל המתכונים שלך בתוך האפליקציה, ויקבל גם כל מתכון חדש.</p>
      <div class="row"><a class="btn" href="#/share" data-close>לשיתוף עם משתמש</a></div></section>
    <details class="opt"><summary>שיתוף כטקסט</summary>
      <p>עם הכמויות שמוצגות עכשיו.</p>
      <div class="row"><button type="button" class="btn" id="copy">העתקת הטקסט</button><a class="btn" id="wa" target="_blank" rel="noopener">שליחה בוואטסאפ</a></div></details>`);
  bg.querySelector('#wa').href = 'https://wa.me/?text=' + encodeURIComponent(text());
  bg.querySelector('#copy').onclick = () => copyText(text(), 'הטקסט הועתק');
  const pub = bg.querySelector('#pub');
  const drawPub = () => {
    if (r.public_token) {
      const link = linkOf(r.public_token);
      pub.innerHTML = `<input class="link-field" dir="ltr" readonly value="${esc(link)}">
        <div class="row"><button type="button" class="btn primary" id="sh">שליחה</button><button type="button" class="btn" id="cp">העתקת קישור</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(r.title + '\n' + link)}">וואטסאפ</a>
        ${mine ? '<button type="button" class="reset" id="off">ביטול הקישור</button>' : ''}</div>`;
      pub.querySelector('#cp').onclick = () => copyText(link, 'הקישור הועתק');
      pub.querySelector('#sh').onclick = async () => { if (!(await nativeShare({ title: r.title, text: r.title, url: link }))) copyText(link, 'הקישור הועתק'); };
      const off = pub.querySelector('#off'); if (off) off.onclick = async () => { try { must(await sb.from('recipes').update({ public_token: null }).eq('id', r.id)); r.public_token = null; drawPub(); toast('הקישור בוטל'); } catch (e) { fail(e); } };
    } else if (mine) {
      pub.innerHTML = '<div class="row"><button type="button" class="btn primary" id="on">יצירת קישור</button></div>';
      pub.querySelector('#on').onclick = async () => { try { const tok = crypto.randomUUID(); must(await sb.from('recipes').update({ public_token: tok }).eq('id', r.id)); r.public_token = tok; drawPub(); } catch (e) { fail(e); } };
    } else pub.innerHTML = '<p class="small">רק הבעלים של המתכון יכולים ליצור לו קישור. אפשר לשמור עותק אצלך וליצור קישור לעותק.</p>';
  };
  drawPub();
}
async function publicView(token) {
  app.innerHTML = '<p class="loading">טוען…</p>';
  current.refresh = null;
  let r = null;
  try { r = (must(await sb.rpc('public_recipe', { token })) || [])[0]; } catch (e) {}
  if (!r) { app.innerHTML = `<div class="auth"><h1>${ICON_SVG} המטבח</h1><p class="empty">הקישור הזה כבר לא פעיל.</p><a class="btn primary" href="#/">לאפליקציה</a></div>`; return; }
  document.title = r.title;
  renderRecipeBody(r, {
    key: 'p-' + token,
    back: `<a class="btn" href="#/">${S.user ? '→ המטבח שלי' : 'המטבח'}</a>`,
    actions: S.user ? '<button type="button" class="btn primary" id="save">שמירה אצלי</button>' : '',
    note: r.owner_name ? `<p class="muted" style="margin:10px 0 0">מתכון ש${esc(r.owner_name)} שיתף/ה איתך</p>` : '',
    foot: S.user ? '' : '<div class="banner" style="margin-top:28px"><span>רוצים מקום אחד משלכם למתכונים, רשימת קניות ומסעדות?</span><span class="spacer"></span><a class="btn primary" href="#/">הרשמה בחינם</a></div>',
  });
  const s = $('#save'); if (s) s.onclick = () => saveCopy(r);
}

/* ---------- recipe editor ---------- */
const TEMPLATE = '**כמות:** \n**זמן:** \n\n---\n\n## מצרכים\n- \n\n## הוראות\n1. \n';
async function editView(id, guide = false) {
  let r = { title: '', category: guide ? GUIDE_CAT : (LS.get('recipe-filter', '') || 'אחר'), tags: [], body: TEMPLATE, owner_id: viewOwner('recipes') };
  if (id) { try { r = await findRecipe(id); } catch (e) { fail(e); return; } if (!r) return go('#/recipes'); }
  if (!canEdit(r.owner_id, 'recipes')) return go(id ? '#/r/' + id : '#/recipes');
  document.title = id ? 'עריכה' : guide ? 'מדריך חדש' : 'מתכון חדש';
  const cats = [...new Set([...CAT_ORDER, ...categoriesOf(cachedRecipes(r.owner_id) || [])])];
  app.innerHTML = backBar(id ? '#/r/' + id : guide ? '#/guides' : '#/recipes', 'ביטול') + `
    <h1 class="page-title">${id ? 'עריכת מתכון' : 'מתכון חדש'}</h1>
    <form class="stack" id="f">
      <label class="field"><span>שם המתכון</span><input type="text" name="title" required value="${esc(r.title)}"></label>
      <label class="field"><span>קטגוריה</span><select name="category">${cats.map((c) => `<option ${c === r.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ קטגוריה חדשה…</option></select></label>
      <label class="field" id="newcat" hidden><span>שם הקטגוריה החדשה</span><input type="text" name="newcat"></label>
      <div class="checks">${Object.keys(TAGS).map((t) => `<label><input type="checkbox" name="tag" value="${esc(t)}" ${(r.tags || []).includes(t) ? 'checked' : ''}> ${esc(tagLabel(t))}</label>`).join('')}</div>
      <label class="field"><span>המתכון</span><textarea class="inp md" name="body" dir="rtl">${esc(r.body)}</textarea>
        <small>כותבים כמו בהודעה: כותרת עם ## בתחילת שורה, רשימה עם - , שלבים עם 1. . כמויות בחלק "מצרכים" ניתנות לשינוי אוטומטית.</small></label>
      <div class="row"><button class="btn primary" type="submit">שמירה</button>${id ? '<span class="spacer"></span><button class="btn danger" type="button" id="del">מחיקת המתכון</button>' : ''}</div>
    </form>`;
  const f = $('#f');
  f.category.onchange = () => { $('#newcat').hidden = f.category.value !== '__new'; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const category = f.category.value === '__new' ? (f.newcat.value.trim() || 'אחר') : f.category.value;
    const tags = (r.tags || []).filter((t) => !TAGS[t]).concat([...f.querySelectorAll('[name=tag]:checked')].map((c) => c.value));
    const row = { title: f.title.value.trim(), category, tags, body: f.body.value };
    try {
      let saved;
      if (id) saved = must(await sb.from('recipes').update(row).eq('id', id).select('id').single());
      else saved = must(await sb.from('recipes').insert({ ...row, owner_id: r.owner_id }).select('id').single());
      delete S.recipes[r.owner_id];
      toast('נשמר'); go('#/r/' + saved.id);
    } catch (x) { fail(x); }
  };
  const del = $('#del');
  if (del) { let armed = false; del.onclick = async () => {
    if (!armed) { armed = true; del.textContent = 'ללחוץ שוב כדי למחוק'; setTimeout(() => { armed = false; del.textContent = 'מחיקת המתכון'; }, 3000); return; }
    try { must(await sb.from('recipes').delete().eq('id', id)); delete S.recipes[r.owner_id]; toast('נמחק'); go(isGuide(r) ? '#/guides' : '#/recipes'); } catch (x) { fail(x); }
  }; }
  current.refresh = null;
}

/* ---------- lists ---------- */
const LIST_TITLE = { shopping: 'רשימת קניות', wishlist: 'דברים שאני רוצה לקנות', restaurants: 'מסעדות' };
async function listView(list) {
  document.title = LIST_TITLE[list];
  const owner = viewOwner(list), editable = canEdit(owner, list);
  app.innerHTML = backBar('#/', 'ראשי', editable && list !== 'shopping' ? '<button class="btn primary" type="button" id="add">+ הוספה</button>' : '') +
    `<h1 class="page-title">${LIST_TITLE[list]}</h1><div id="owners"></div><div id="body" class="listpage"><p class="loading">טוען…</p></div>`;
  const oc = ownerChips(list, () => listView(list)); if (oc) $('#owners').append(oc);
  if (owner !== me()) $('#owners').insertAdjacentHTML('beforeend', `<p class="ro-note">הרשימה של ${esc(nameOf(owner))}${editable ? '. שינויים כאן מתעדכנים גם אצלו/ה.' : '. צפייה בלבד.'}</p>`);
  const body = $('#body');
  let rows = cachedItems(owner, list);
  const ctx = { owner, list, editable, reload: async () => { rows = await loadItems(owner, list); if (list === 'shopping') normalizeShopping(ctx, rows); draw(); }, rows: () => rows, local: (fn) => { fn(rows); draw(); } };
  const draw = () => { if (rows) (list === 'shopping' ? drawShopping : list === 'wishlist' ? drawWishlist : drawRestaurants)(body, rows, ctx); };
  const add = $('#add'); if (add) add.onclick = () => itemSheet(ctx, null);
  draw();
  current.refresh = async (what) => { if (what && what !== 'items' && what !== 'shares') return; try { await ctx.reload(); } catch (e) { if (!rows) fail(e); } };
  await current.refresh();
}
async function saveItem(ctx, id, row) {
  if (id) must(await sb.from('items').update(row).eq('id', id));
  else must(await sb.from('items').insert({ ...row, owner_id: ctx.owner, list: ctx.list }));
  await ctx.reload();
}
async function toggleDone(ctx, it, done) {
  const prev = { done: it.done, extra: it.extra };
  const extra = { ...(it.extra || {}) };
  if (ctx.list === 'shopping') { delete extra.trip; if (done) extra.bought_at = new Date().toISOString(); else delete extra.bought_at; }
  ctx.local(() => { it.done = done; it.extra = extra; });
  try { must(await sb.from('items').update({ done, extra }).eq('id', it.id)); } catch (e) { fail(e); ctx.local(() => { Object.assign(it, prev); }); }
}

/* ---------- shopping: today's list, history by day, everything ever bought ----------
   extra.bought_at = when an item was ticked; extra.trip = the day (YYYY-MM-DD) it moved to history, or 'old'.
   The open list = not bought yet + ticked today. Anything ticked on an earlier day is history automatically. */
const SHOP_CUTOFF = Date.parse('2026-11-20T13:50:00Z'); // items ticked before the history feature carry no bought_at
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const isNote = (r) => !!(r.extra && r.extra.note);
const lastSec = (s) => (s || '').split(' · ').pop();
const baseName = (t) => (t || '').replace(/\*\*/g, '').replace(/\s*\([^)]*\)/g, '').split(/\s+[–—-]\s+/)[0].trim();
const nameKey = (t) => baseName(t).toLowerCase();
function tripOf(r) { // '' = on the open list
  if (!r.done) return '';
  const x = r.extra || {};
  if (x.trip) return x.trip;
  const b = x.bought_at || r.updated_at;
  if (!b) return 'old';
  const d = dayKey(b);
  return d === dayKey(Date.now()) ? '' : d;
}
function dayLabel(k) {
  if (k === 'old') return 'קניות קודמות';
  const [y, m, d] = k.split('-').map(Number), dt = new Date(y, m - 1, d);
  const diff = Math.round((new Date(dayKey(Date.now()) + 'T00:00') - dt) / 864e5);
  const w = dt.toLocaleDateString('he-IL', { weekday: 'long' });
  return (diff === 1 ? 'אתמול, ' : '') + `${w}, ${d}.${m}${y !== new Date().getFullYear() ? '.' + y : ''}`;
}
// one-time fix-up of rows ticked without a timestamp (old app / old connector), so later edits don't move them
function normalizeShopping(ctx, rows) {
  if (!ctx.editable) return;
  rows.filter((r) => r.done && !(r.extra && (r.extra.bought_at || r.extra.trip))).forEach((r) => {
    const t = Date.parse(r.updated_at);
    const extra = { ...(r.extra || {}), ...(t > SHOP_CUTOFF ? { bought_at: r.updated_at } : { trip: 'old' }) };
    r.extra = extra;
    sb.from('items').update({ extra }).eq('id', r.id).then(() => {}, () => {});
  });
}
async function reAdd(ctx, title, section) {
  try { await saveItem(ctx, null, { title, section: lastSec(section), position: Date.now() / 1000 }); toast('נוסף לרשימה'); } catch (e) { fail(e); }
}

function drawShopping(body, rows, ctx) {
  const tab = LS.get('shop-tab', 'now');
  const open = rows.filter((r) => tripOf(r) === '');
  const past = rows.filter((r) => tripOf(r) !== '');
  const left = open.filter((r) => !r.done && !isNote(r)).length;
  const tabs = [['now', `לקנות${left ? ` (${left})` : ''}`], ['history', 'היסטוריה'], ['all', 'כל המצרכים']];
  const keepFocus = document.activeElement && ['new-item', 'all-q'].includes(document.activeElement.id) ? document.activeElement.id : '';
  body.innerHTML = `<div class="tabs chips">${tabs.map(([k, t]) => `<button type="button" class="chip" data-tab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('')}</div><div id="shop"></div>`;
  body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { LS.set('shop-tab', b.dataset.tab); drawShopping(body, rows, ctx); }; });
  const box = body.querySelector('#shop');
  (tab === 'history' ? drawShopHistory : tab === 'all' ? drawShopAll : drawShopNow)(box, open, past, ctx);
  if (keepFocus) { const el = body.querySelector('#' + keepFocus); if (el) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }
}

function shopLi(ctx, it) {
  const el = document.createElement('li'); el.classList.toggle('done', it.done);
  el.innerHTML = `<label><input type="checkbox" ${it.done ? 'checked' : ''} ${ctx.editable ? '' : 'disabled'}><span>${mdInline(it.title)}${it.note ? ` <small class="muted">${esc(it.note)}</small>` : ''}</span></label>${ctx.editable ? '<button type="button" class="more" aria-label="עריכה">⋯</button>' : ''}`;
  el.querySelector('input').onchange = (e) => toggleDone(ctx, it, e.target.checked);
  const m = el.querySelector('.more'); if (m) m.onclick = () => itemSheet(ctx, it);
  externalLinks(el);
  return el;
}

function drawShopNow(box, rows, past, ctx) {
  const sections = [...new Set(rows.map((r) => r.section || ''))];
  const known = [...new Set([...sections, ...past.filter((r) => !isNote(r)).map((r) => lastSec(r.section))].filter(Boolean))];
  const left = rows.filter((r) => !r.done && !isNote(r)).length;
  const ticked = rows.filter((r) => r.done && !isNote(r));
  const lastS = LS.get('shop-sec', '');
  box.innerHTML = `${ctx.editable ? `<form class="addrow" id="addf"><input type="text" id="new-item" placeholder="מה צריך לקנות?" autocomplete="off" enterkeyhint="done" list="shop-names">
      <datalist id="shop-names">${[...new Set(past.filter((r) => !isNote(r)).map((r) => baseName(r.title)))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <select id="new-sec" aria-label="קטגוריה">${['', ...known].map((s) => `<option value="${esc(s)}" ${s === lastS ? 'selected' : ''}>${s ? esc(s) : 'בלי קטגוריה'}</option>`).join('')}<option value="__new">+ חדשה…</option></select>
      <button class="btn primary" type="submit">הוספה</button></form>` : ''}
    <div class="shop-bar"><output>${rows.length ? (left ? `נשארו ${left} לקנות` : 'הכול נקנה') : ''}</output><span class="spacer"></span>
      ${ctx.editable && ticked.length ? '<button type="button" class="btn primary" id="finish">סיימתי לקנות ✓</button><button type="button" class="reset" id="uncheck">ביטול הסימונים</button>' : ''}</div>
    ${ctx.editable && ticked.length ? '<p class="hint">מה שסימנתם היום נשאר כאן עד סוף היום, ואז עובר לבד להיסטוריה. "סיימתי לקנות" מעביר אותו כבר עכשיו.</p>' : ''}
    <div id="secs"></div><section class="bought" id="bought" hidden><h2>נקנו היום</h2><ul class="tasks"></ul></section>`;
  const secs = box.querySelector('#secs'), bought = box.querySelector('#bought ul');
  if (!rows.length) secs.innerHTML = `<p class="empty">הרשימה ריקה. מוסיפים פריט בשורה למעלה${past.length ? ', או מחזירים משהו מ"כל המצרכים"' : ''}.</p>`;
  let lastGroup = null;
  for (const s of sections) {
    const items = rows.filter((r) => (r.section || '') === s);
    const notes = items.filter(isNote), todo = items.filter((r) => !r.done && !isNote(r));
    const [group, sub] = s.includes(' · ') ? s.split(' · ') : ['', s];
    if (group && group !== lastGroup) { secs.insertAdjacentHTML('beforeend', `<h2>${esc(group)}</h2>`); }
    lastGroup = group;
    if (!todo.length && !notes.length) continue;
    if (sub) secs.insertAdjacentHTML('beforeend', `<h3>${esc(sub)}</h3>`);
    if (notes.length) { const ul = document.createElement('ul'); ul.className = 'notes'; notes.forEach((n) => { const l = document.createElement('li'); l.innerHTML = mdInline(n.title); if (ctx.editable) { l.style.cursor = 'pointer'; l.onclick = (e) => { if (!e.target.closest('a')) itemSheet(ctx, n); }; } externalLinks(l); ul.append(l); }); secs.append(ul); }
    if (todo.length) { const ul = document.createElement('ul'); ul.className = 'tasks'; todo.forEach((it) => ul.append(shopLi(ctx, it))); secs.append(ul); }
  }
  ticked.forEach((it) => bought.append(shopLi(ctx, it)));
  box.querySelector('#bought').hidden = !bought.children.length;
  const f = box.querySelector('#addf');
  if (f) {
    const sel = f.querySelector('#new-sec'), inp = f.querySelector('#new-item');
    sel.onchange = () => { if (sel.value === '__new') { const n = (prompt('שם הקטגוריה החדשה:') || '').trim(); if (n) { sel.insertAdjacentHTML('afterbegin', `<option value="${esc(n)}">${esc(n)}</option>`); sel.value = n; } else sel.value = ''; } LS.set('shop-sec', sel.value); };
    // picking a name bought before fills in its usual category
    inp.oninput = () => { const k = nameKey(inp.value); const hit = k && [...past].reverse().find((r) => nameKey(r.title) === k); if (hit && lastSec(hit.section) && known.includes(lastSec(hit.section))) sel.value = lastSec(hit.section); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const t = inp.value.trim(); if (!t) return;
      inp.value = '';
      try { await saveItem(ctx, null, { title: t, section: sel.value === '__new' ? '' : sel.value, position: Date.now() / 1000 }); const i2 = document.querySelector('#new-item'); if (i2) i2.focus(); } catch (x) { fail(x); }
    };
  }
  const un = box.querySelector('#uncheck');
  if (un) un.onclick = async () => {
    try { await Promise.all(ticked.map((r) => { const extra = { ...(r.extra || {}) }; delete extra.bought_at; delete extra.trip; return sb.from('items').update({ done: false, extra }).eq('id', r.id).then(must); })); await ctx.reload(); } catch (e) { fail(e); }
  };
  const fin = box.querySelector('#finish');
  if (fin) fin.onclick = async () => {
    const now = new Date().toISOString();
    try {
      await Promise.all(ticked.map((r) => { const b = (r.extra && r.extra.bought_at) || now; return sb.from('items').update({ extra: { ...(r.extra || {}), bought_at: b, trip: dayKey(b) } }).eq('id', r.id).then(must); }));
      toast(left ? 'מה שנקנה עבר להיסטוריה. השאר נשאר ברשימה' : 'הקנייה נשמרה בהיסטוריה');
      await ctx.reload();
    } catch (e) { fail(e); }
  };
}

function drawShopHistory(box, open, past, ctx) {
  const groups = {};
  past.forEach((r) => { (groups[tripOf(r)] = groups[tripOf(r)] || []).push(r); });
  const keys = Object.keys(groups).sort((a, b) => (a === 'old') - (b === 'old') || (a < b ? 1 : -1));
  if (!keys.length) { box.innerHTML = '<p class="empty">עוד אין היסטוריה. כל מה שתסמנו כנקנה יישמר כאן לפי תאריך הקנייה.</p>'; return; }
  const onList = new Set(open.filter((r) => !r.done).map((r) => nameKey(r.title)));
  box.innerHTML = '';
  keys.forEach((k, i) => {
    const items = groups[k].filter((r) => !isNote(r)), notes = groups[k].filter(isNote);
    const d = document.createElement('details'); d.className = 'trip'; d.open = i === 0;
    d.innerHTML = `<summary><b>${esc(dayLabel(k))}</b><small class="muted">${items.length} מצרכים</small></summary>`;
    const groupsIn = [...new Set(groups[k].map((r) => (r.section || '').includes(' · ') ? r.section.split(' · ')[0] : ''))].filter(Boolean);
    if (groupsIn.length) d.insertAdjacentHTML('beforeend', `<p class="hint">${groupsIn.map(esc).join(' · ')}</p>`);
    if (notes.length) { const ul = document.createElement('ul'); ul.className = 'notes'; notes.forEach((n) => { const l = document.createElement('li'); l.innerHTML = mdInline(n.title); externalLinks(l); ul.append(l); }); d.append(ul); }
    const ul = document.createElement('ul'); ul.className = 'tasks plain';
    items.forEach((it) => {
      const li = document.createElement('li');
      const inList = onList.has(nameKey(it.title));
      li.innerHTML = `<span class="it">${mdInline(it.title)}${lastSec(it.section) ? ` <small class="muted">${esc(lastSec(it.section))}</small>` : ''}</span>${ctx.editable ? (inList ? '<span class="pill">ברשימה</span>' : '<button type="button" class="readd" aria-label="להוסיף שוב לרשימה">+ שוב</button>') : ''}`;
      const b = li.querySelector('.readd'); if (b) b.onclick = () => reAdd(ctx, it.title, it.section);
      externalLinks(li); ul.append(li);
    });
    d.append(ul);
    if (ctx.editable && items.length) {
      const row = document.createElement('div'); row.className = 'row trip-actions';
      row.innerHTML = '<button type="button" class="reset" data-all>להוסיף את כל הקנייה הזאת שוב</button>';
      row.querySelector('[data-all]').onclick = async () => {
        const todo = items.filter((it) => !onList.has(nameKey(it.title)));
        if (!todo.length) return toast('הכול כבר ברשימה');
        const now = Date.now() / 1000;
        try { must(await sb.from('items').insert(todo.map((it, j) => ({ owner_id: ctx.owner, list: 'shopping', title: it.title, note: it.note || '', section: lastSec(it.section), position: now + j })))); toast(`נוספו ${todo.length} לרשימה`); await ctx.reload(); } catch (e) { fail(e); }
      };
      d.append(row);
    }
    box.append(d);
  });
}

function drawShopAll(box, open, past, ctx) {
  const map = new Map();
  past.filter((r) => !isNote(r)).forEach((r) => {
    const k = nameKey(r.title); if (!k) return;
    const b = (r.extra && r.extra.bought_at) || r.updated_at || '';
    const e = map.get(k) || { name: baseName(r.title), n: 0, last: '', section: '' };
    e.n++; if (b >= e.last) { e.last = b; e.section = lastSec(r.section) || e.section; }
    map.set(k, e);
  });
  const onList = new Set(open.filter((r) => !r.done).map((r) => nameKey(r.title)));
  const all = [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name, 'he'));
  const q = LS.get('shop-all-q', '');
  box.innerHTML = all.length ? `<input type="search" id="all-q" class="search" placeholder="חיפוש במצרכים שקניתם (${all.length})" value="${esc(q)}" autocomplete="off"><ul class="tasks plain" id="all-list"></ul>`
    : '<p class="empty">כאן יופיעו כל המצרכים שאי פעם קניתם, כדי להחזיר אותם לרשימה בלחיצה.</p>';
  const ul = box.querySelector('#all-list'); if (!ul) return;
  const paint = () => {
    const s = (box.querySelector('#all-q').value || '').trim().toLowerCase();
    ul.innerHTML = '';
    all.filter(([k]) => !s || k.includes(s)).forEach(([k, e]) => {
      const li = document.createElement('li');
      const when = e.last && !isNaN(Date.parse(e.last)) ? `לאחרונה ${new Date(e.last).getDate()}.${new Date(e.last).getMonth() + 1}` : '';
      li.innerHTML = `<span class="it">${esc(e.name)} <small class="muted">${[e.n > 1 ? `${e.n} פעמים` : '', when, e.section].filter(Boolean).map(esc).join(' · ')}</small></span>${ctx.editable ? (onList.has(k) ? '<span class="pill">ברשימה</span>' : '<button type="button" class="readd" aria-label="להוסיף לרשימה">+ לרשימה</button>') : ''}`;
      const b = li.querySelector('.readd'); if (b) b.onclick = () => reAdd(ctx, e.name, e.section);
      ul.append(li);
    });
    if (!ul.children.length) ul.innerHTML = '<li class="muted" style="padding:10px 14px">לא נמצא</li>';
  };
  box.querySelector('#all-q').oninput = (ev) => { LS.set('shop-all-q', ev.target.value); paint(); };
  paint();
}

function linkHTML(url, label) { return url && /^https?:\/\//.test(url) ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : ''; }
function drawWishlist(body, rows, ctx) {
  const open = rows.filter((r) => !r.done), done = rows.filter((r) => r.done);
  const card = (it) => `<article class="icard ${it.done ? 'done' : ''}" data-id="${it.id}"><div class="top">
      ${ctx.editable ? `<input type="checkbox" ${it.done ? 'checked' : ''} aria-label="נקנה" style="width:22px;height:22px;accent-color:var(--basil)">` : ''}<b>${esc(it.title)}</b>${it.extra && it.extra.price ? `<span class="pill">${esc(it.extra.price)}</span>` : ''}</div>
      ${it.note ? `<div class="note">${mdInline(it.note)}</div>` : ''}${it.extra && it.extra.where ? `<div class="meta">${esc(it.extra.where)}</div>` : ''}
      <div class="row">${linkHTML(it.link, 'לקישור')}${ctx.editable ? '<button class="reset" type="button" data-edit>עריכה</button>' : ''}</div></article>`;
  body.innerHTML = rows.length ? `<div class="cards">${open.map(card).join('')}</div>${done.length ? `<section class="bought"><h2>כבר קניתי</h2><div class="cards">${done.map(card).join('')}</div></section>` : ''}`
    : '<p class="empty">עוד אין כאן כלום. מוסיפים עם הכפתור למעלה.</p>';
  wireCards(body, rows, ctx);
}
function drawRestaurants(body, rows, ctx) {
  let tab = LS.get('rest-tab', 'want');
  const tabs = [['want', 'רוצה לנסות'], ['been', 'היינו ואהבנו']];
  const list = rows.filter((r) => (r.section || 'want') === tab);
  const card = (it) => {
    const x = it.extra || {}, links = [it.link, ...(x.links || [])].filter(Boolean);
    return `<article class="icard" data-id="${it.id}"><div class="top"><b>${esc(it.title)}</b>${x.rating ? `<span class="pill">${esc(x.rating)}</span>` : ''}</div>
      ${x.cuisine || x.area ? `<div class="meta">${[x.cuisine, x.area].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
      ${it.note ? `<div class="note">${mdInline(it.note)}</div>` : ''}${x.order ? `<div><b>מה להזמין:</b> ${esc(x.order)}</div>` : ''}
      <div class="row">${links.map((l, i) => linkHTML(l, links.length > 1 ? `פוסט ${i + 1}` : 'לפוסט')).join('')}
        ${x.area || it.title ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent(it.title.replace(/\(.*?\)/g, '') + ' ' + (x.area || ''))}">מפה</a>` : ''}
        ${ctx.editable ? `${tab === 'want' ? '<button class="reset" type="button" data-been>היינו!</button>' : ''}<button class="reset" type="button" data-edit>עריכה</button>` : ''}</div></article>`;
  };
  body.innerHTML = `<div class="tabs chips">${tabs.map(([k, t]) => `<button type="button" class="chip" data-tab="${k}" aria-pressed="${k === tab}">${t} (${rows.filter((r) => (r.section || 'want') === k).length})</button>`).join('')}</div>
    ${list.length ? `<div class="cards">${list.map(card).join('')}</div>` : `<p class="empty">${tab === 'want' ? 'עוד אין מסעדות ברשימה.' : 'כשתסמנו "היינו!" על מסעדה, היא תעבור לכאן.'}</p>`}`;
  body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { LS.set('rest-tab', b.dataset.tab); drawRestaurants(body, rows, ctx); }; });
  body.querySelectorAll('[data-been]').forEach((b) => { b.onclick = () => { const it = rows.find((r) => r.id === b.closest('[data-id]').dataset.id); itemSheet(ctx, it, { section: 'been' }); }; });
  wireCards(body, rows, ctx);
}
function wireCards(body, rows, ctx) {
  externalLinks(body);
  body.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => itemSheet(ctx, rows.find((r) => r.id === b.closest('[data-id]').dataset.id)); });
  body.querySelectorAll('.icard input[type=checkbox]').forEach((c) => { c.onchange = () => toggleDone(ctx, rows.find((r) => r.id === c.closest('[data-id]').dataset.id), c.checked); });
}
// add / edit one item; fields depend on the list
function itemSheet(ctx, it, preset = {}) {
  const x = (it && it.extra) || {};
  const sec = preset.section || (it && it.section) || (ctx.list === 'restaurants' ? LS.get('rest-tab', 'want') : '');
  const F = (name, label, val, attrs = '') => `<label class="field"><span>${label}</span><input type="text" name="${name}" value="${esc(val || '')}" ${attrs}></label>`;
  let fields = '';
  if (ctx.list === 'shopping') {
    const sections = [...new Set(ctx.rows().map((r) => r.section || ''))].filter(Boolean);
    fields = F('title', 'פריט', it && it.title, 'required') + F('note', 'הערה', it && it.note) +
      `<label class="field"><span>קטגוריה</span><input type="text" name="section" list="secs-dl" value="${esc(sec)}"><datalist id="secs-dl">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>`;
  } else if (ctx.list === 'wishlist') {
    fields = F('title', 'מה', it && it.title, 'required') + F('note', 'למה / הערות', it && it.note) + F('price', 'מחיר משוער', x.price) + F('where', 'איפה קונים', x.where) + F('link', 'קישור', it && it.link, 'dir="ltr" inputmode="url"');
  } else {
    fields = F('title', 'שם המסעדה', it && it.title, 'required') + F('cuisine', 'סוג אוכל', x.cuisine) + F('area', 'עיר / אזור', x.area) +
      (sec === 'been' ? F('order', 'מה להזמין', x.order) + F('rating', 'ציון', x.rating) : '') + F('note', 'הערות', it && it.note) + F('link', 'קישור (פוסט, אתר)', it && it.link, 'dir="ltr" inputmode="url"');
  }
  const bg = sheet(it ? 'עריכה' : 'הוספה', `<form class="stack" id="itf">${fields}
    <div class="row"><button class="btn primary" type="submit">שמירה</button><span class="spacer"></span>${it ? '<button class="btn danger" type="button" id="del">מחיקה</button>' : ''}</div></form>`);
  const f = bg.querySelector('#itf');
  setTimeout(() => f.title.focus(), 50);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = (n) => (f[n] ? f[n].value.trim() : undefined);
    const extra = { ...x };
    for (const k of ['price', 'where', 'cuisine', 'area', 'order', 'rating']) if (f[k]) extra[k] = v(k);
    const row = { title: v('title'), note: v('note') || '', extra };
    if (f.link) row.link = v('link');
    if (ctx.list === 'shopping') row.section = v('section') || '';
    if (ctx.list === 'restaurants') row.section = sec;
    try { await saveItem(ctx, it && it.id, row); bg.close(); } catch (x2) { fail(x2); }
  };
  const del = bg.querySelector('#del');
  if (del) del.onclick = async () => { try { must(await sb.from('items').delete().eq('id', it.id)); bg.close(); await ctx.reload(); } catch (e) { fail(e); } };
}

/* ---------- sharing ---------- */
async function shareView() {
  document.title = 'שיתוף';
  app.innerHTML = backBar('#/', 'ראשי') + `<h1 class="page-title">שיתוף</h1>
    <form class="card stack" id="f">
      <h2 style="margin:0;font-size:1.2rem">שיתוף עם מישהו</h2>
      <label class="field"><span>המייל שלו/ה</span><input type="email" name="email" dir="ltr" required placeholder="name@example.com"><small>אם עוד אין לו/ה חשבון, השיתוף יחכה ויופעל ברגע שיירשם/תירשם עם המייל הזה.</small></label>
      <div class="field"><span>מה לשתף</span><div class="checks">${Object.entries(SCOPES).map(([k, t]) => `<label><input type="checkbox" name="scope" value="${k}" checked> ${t}</label>`).join('')}</div></div>
      <div class="field"><span>הרשאה</span><div class="checks">
        <label><input type="radio" name="perm" value="view" checked> צפייה בלבד</label>
        <label><input type="radio" name="perm" value="edit"> צפייה ועריכה (למשל רשימת קניות משותפת)</label></div></div>
      <p class="err" id="err"></p>
      <button class="btn primary" type="submit">שיתוף</button>
    </form>
    <section class="sec"><h2>אני משתף/ת עם</h2><div id="out" class="cards"></div></section>
    <section class="sec"><h2>משתפים איתי</h2><div id="in" class="cards"></div></section>`;
  const draw = () => {
    const out = S.shares.filter((s) => s.owner_id === me());
    const byEmail = {}; out.forEach((s) => (byEmail[s.grantee_email] ||= []).push(s));
    $('#out').innerHTML = Object.keys(byEmail).length ? Object.entries(byEmail).map(([email, rows]) => {
      const p = rows[0].grantee_id && S.people[rows[0].grantee_id];
      return `<article class="icard share-group" data-email="${esc(email)}"><div class="top"><b>${esc(p && p.name ? p.name : email)}</b>${rows[0].grantee_id ? '' : '<span class="pill wait">ממתין להרשמה</span>'}</div>
        ${p && p.name ? `<div class="meta" dir="ltr" style="text-align:right">${esc(email)}</div>` : ''}
        <div>${rows.map((s) => `<span class="pill">${SCOPES[s.scope]} · ${s.can_edit ? 'עריכה' : 'צפייה'}</span>`).join('')}</div>
        <div class="row">${rows[0].grantee_id ? '' : '<button class="btn" type="button" data-invite>שליחת הזמנה</button>'}<button class="reset" type="button" data-stop>הפסקת השיתוף</button></div></article>`;
    }).join('') : '<p class="empty">עוד לא שיתפת עם אף אחד.</p>';
    const inc = incoming(); const byOwner = {}; inc.forEach((s) => (byOwner[s.owner_id] ||= []).push(s));
    $('#in').innerHTML = Object.keys(byOwner).length ? Object.entries(byOwner).map(([id, rows]) => `<article class="icard" data-owner="${id}"><div class="top"><b>${esc(nameOf(id))}</b></div>
        <div>${rows.map((s) => `<a class="pill" style="text-decoration:none" href="#/${s.scope === 'recipes' ? 'recipes' : 'list/' + s.scope}" data-scope="${s.scope}">${SCOPES[s.scope]} · ${s.can_edit ? 'עריכה' : 'צפייה'}</a>`).join('')}</div>
        <div class="row"><button class="reset" type="button" data-leave>הסרה מהרשימה שלי</button></div></article>`).join('') : '<p class="empty">אף אחד עוד לא שיתף איתך.</p>';
    app.querySelectorAll('#in [data-scope]').forEach((a) => { a.onclick = () => setOwner(a.dataset.scope, a.closest('[data-owner]').dataset.owner); });
    app.querySelectorAll('[data-stop]').forEach((b) => { b.onclick = async () => { const email = b.closest('[data-email]').dataset.email; try { must(await sb.from('shares').delete().eq('owner_id', me()).eq('grantee_email', email)); await loadShares(); draw(); toast('השיתוף הופסק'); } catch (e) { fail(e); } }; });
    app.querySelectorAll('[data-leave]').forEach((b) => { b.onclick = async () => { const id = b.closest('[data-owner]').dataset.owner; try { must(await sb.from('shares').delete().eq('owner_id', id).eq('grantee_id', me())); await loadShares(); draw(); } catch (e) { fail(e); } }; });
    app.querySelectorAll('[data-invite]').forEach((b) => { b.onclick = () => invite(b.closest('[data-email]').dataset.email); });
  };
  const invite = async (email) => {
    const text = `${S.profile.name || 'הזמנתי אותך'}: שיתפתי איתך את המטבח שלי (מתכונים ורשימות). נרשמים כאן עם המייל ${email}:\n${APP_URL}`;
    if (!(await nativeShare({ title: 'המטבח', text }))) window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  const f = $('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const email = f.email.value.trim().toLowerCase(), scopes = [...f.querySelectorAll('[name=scope]:checked')].map((c) => c.value), can_edit = f.perm.value === 'edit';
    const err = $('#err'); err.textContent = '';
    if (!scopes.length) { err.textContent = 'צריך לבחור לפחות דבר אחד לשתף.'; return; }
    if (email === (S.user.email || '').toLowerCase()) { err.textContent = 'זה המייל שלך 🙂'; return; }
    try {
      must(await sb.from('shares').upsert(scopes.map((scope) => ({ owner_id: me(), grantee_email: email, scope, can_edit })), { onConflict: 'owner_id,grantee_email,scope' }));
      await loadShares(); draw(); f.reset();
      const row = S.shares.find((s) => s.owner_id === me() && s.grantee_email === email);
      if (row && !row.grantee_id) { toast('נשמר. עכשיו שלחו הזמנה'); invite(email); } else toast('שותף בהצלחה');
    } catch (x) { fail(x); }
  };
  draw();
  current.refresh = (what) => { if (what === 'shares') draw(); };
  try { await loadShares(); draw(); } catch (e) {}
}


/* ---------- OAuth consent (Claude connector sign-in through Supabase's OAuth server) ---------- */
const MCP_URL = (CFG.supabaseUrl || '') + '/functions/v1/kitchen-mcp';
async function consentView(authId) {
  document.title = 'חיבור ל־Claude';
  current.refresh = null;
  app.innerHTML = `<div class="auth"><h1>${ICON_SVG} המטבח</h1><div class="card stack" id="c"><p class="loading">טוען…</p></div></div>`;
  const box = $('#c');
  let d;
  try { d = must(await sb.auth.oauth.getAuthorizationDetails(authId)); }
  catch (e) { box.innerHTML = `<p class="err">הבקשה לא תקפה או שפג תוקפה. נסו להתחבר שוב מ־Claude.</p><p class="muted">${esc(e.message || '')}</p>`; return; }
  if (d && d.redirect_url && !d.authorization_id) { location.assign(d.redirect_url); return; }
  const client = (d.client && (d.client.name || d.client.client_name)) || 'Claude';
  box.innerHTML = `<h2 style="margin:0">לאשר ל־${esc(client)} גישה למטבח שלך?</h2>
    <p class="muted" style="margin:0">${esc(client)} יוכל לקרוא ולהוסיף מתכונים, ולנהל את רשימת הקניות, המשאלות והמסעדות שלך ושל מי שמשתף איתך, בשם <b dir="ltr">${esc(S.user.email)}</b>.</p>
    <p class="muted" style="margin:0;font-size:.85rem">אפשר לבטל את החיבור בכל רגע בהגדרות של Claude.</p>
    <div class="row"><button class="btn primary" id="ok" type="button">אישור</button><button class="btn" id="no" type="button">ביטול</button></div><p class="err" id="err"></p>`;
  const act = async (fn) => {
    box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { const r = must(await fn(authId, { skipBrowserRedirect: true })); if (r && r.redirect_url) location.assign(r.redirect_url); }
    catch (e) { $('#err').textContent = 'לא הצלחתי: ' + (e.message || e); box.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  };
  $('#ok').onclick = () => act((id, o) => sb.auth.oauth.approveAuthorization(id, o));
  $('#no').onclick = () => act((id, o) => sb.auth.oauth.denyAuthorization(id, o));
}
function claudeView() {
  document.title = 'חיבור ל־Claude';
  current.refresh = null;
  app.innerHTML = backBar('#/', 'ראשי') + `<h1 class="page-title">חיבור ל־Claude</h1>
    <p>אחרי החיבור אפשר לשלוח ל־Claude מתכון (טקסט, צילום מסך או קישור) ולבקש "תשמור במטבח", להגיד "תוסיף חלב לרשימת הקניות", או לשאול "מה אפשר להכין עם מה שיש לי?". Claude קורא ומעדכן את המטבח שלך ישירות, גם מהטלפון.</p>
    <section class="card stack">
      <h2 style="margin:0;font-size:1.2rem">הוספה (פעם אחת)</h2>
      <ol style="margin:0;padding-inline-start:1.3em;display:grid;gap:6px">
        <li>פותחים את <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener">Claude ← Customize ← Connectors</a> (מהמחשב או מהדפדפן בטלפון).</li>
        <li>לוחצים על <b>Add</b> ואז <b>Add custom connector</b>.</li>
        <li>בשם כותבים <b>המטבח</b>, ובכתובת מדביקים את הכתובת הזאת:
          <input class="link-field" dir="ltr" readonly value="${esc(MCP_URL)}" style="margin-top:6px">
          <div class="row" style="margin-top:6px"><button class="btn" type="button" id="cp">העתקת הכתובת</button></div></li>
        <li>לוחצים <b>Add</b> ואז <b>Connect</b>. ייפתח מסך של המטבח: מתחברים (אם צריך) ולוחצים <b>אישור</b>.</li>
        <li>בשיחה חדשה ב־Claude מוודאים שהמחבר "המטבח" מופעל (בתפריט הכלים של השיחה).</li>
        <li>רשות: כדי ש־Claude לא יבקש אישור לפני כל פעולה, בהגדרות המחבר משנים את הכלים מ־Needs approval ל־Always allow.</li>
      </ol>
      <p class="muted" style="margin:0;font-size:.9rem">Claude עובד על החשבון שלך ב־Claude, והחיבור לא עולה כסף. כל אחד מחבר את החשבון שלו ורואה רק את המטבח שלו ואת מה ששיתפו איתו.</p>
    </section>`;
  $('#cp').onclick = () => copyText(MCP_URL, 'הכתובת הועתקה');
}

/* ---------- settings: profile, import, export ---------- */
function settingsView() {
  document.title = 'הגדרות';
  current.refresh = null;
  app.innerHTML = backBar('#/', 'ראשי') + `<h1 class="page-title">הגדרות</h1>
    <div class="stack">
      <form class="card stack" id="pf"><h2 style="margin:0;font-size:1.2rem">הפרופיל שלי</h2>
        <label class="field"><span>שם (כך יראו אותך מי שמשתפים איתך)</span><input type="text" name="name" value="${esc(S.profile.name)}"></label>
        <p class="muted" style="margin:0" dir="ltr">${esc(S.user.email)}</p>
        <div class="row"><button class="btn primary" type="submit">שמירה</button></div></form>
      <section class="card stack"><h2 style="margin:0;font-size:1.2rem">ייבוא</h2>
        <p class="muted" style="margin:0">קובץ ייבוא של המטבח (.json) מוסיף לחשבון שלך מתכונים ורשימות. מתכונים שכבר יובאו לא ייכפלו.</p>
        <label class="btn" style="justify-self:start">בחירת קובץ<input type="file" id="imp" accept=".json,application/json" hidden></label>
        <p id="imp-status" class="ok"></p></section>
      <section class="card stack"><h2 style="margin:0;font-size:1.2rem">גיבוי</h2>
        <p class="muted" style="margin:0">הורדה של כל המתכונים והרשימות שלך לקובץ אחד.</p>
        <div class="row"><button class="btn" type="button" id="exp">הורדת גיבוי</button></div></section>
      <div class="row"><button class="btn danger" type="button" id="out">יציאה מהחשבון</button></div>
      <p class="muted" style="margin:0;font-size:.85rem">גרסה ${APP_VERSION}</p>
    </div>`;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    try { const name = e.target.name.value.trim(); must(await sb.from('profiles').update({ name }).eq('id', me())); S.profile.name = name; toast('נשמר'); } catch (x) { fail(x); }
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const st = $('#imp-status'); st.className = 'ok';
    try { const data = JSON.parse(await file.text()); await importData(data, (m) => { st.textContent = m; }); }
    catch (x) { st.className = 'err'; st.textContent = 'הייבוא נכשל: ' + (x.message || x); }
    e.target.value = '';
  };
  $('#exp').onclick = async () => {
    try {
      const recipes = must(await sb.from('recipes').select('title,category,tags,body').eq('owner_id', me()));
      const items = must(await sb.from('items').select('list,section,title,note,link,extra,done,position').eq('owner_id', me()));
      const blob = new Blob([JSON.stringify({ app: 'hamitbach', version: 1, exported: new Date().toISOString(), recipes, items }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'המטבח-גיבוי-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (x) { fail(x); }
  };
  $('#out').onclick = async () => { await sb.auth.signOut(); localStorage.clear(); location.hash = ''; location.reload(); };
}
async function importData(data, status) {
  if (!data || data.app !== 'hamitbach' || !Array.isArray(data.recipes)) throw new Error('זה לא קובץ של המטבח');
  status('בודק מה כבר קיים…');
  const existing = must(await sb.from('recipes').select('id,source_key,title').eq('owner_id', me()));
  const byKey = Object.fromEntries(existing.filter((r) => r.source_key).map((r) => [r.source_key, r.id]));
  const byTitle = new Set(existing.map((r) => r.title));
  const todo = data.recipes.filter((r) => !(r.key && byKey[r.key]) && !(!r.key && byTitle.has(r.title)));
  for (let i = 0; i < todo.length; i += 40) {
    status(`מייבא מתכונים… ${Math.min(i + 40, todo.length)} מתוך ${todo.length}`);
    const rows = todo.slice(i, i + 40).map((r) => ({ owner_id: me(), title: r.title, category: r.category || 'אחר', tags: r.tags || [], body: r.body || '', source_key: r.key || null }));
    const ins = must(await sb.from('recipes').insert(rows).select('id,source_key'));
    ins.forEach((r) => { if (r.source_key) byKey[r.source_key] = r.id; });
  }
  // links between recipes: "file.md" -> in-app route
  const titleOf = Object.fromEntries(data.recipes.filter((r) => r.key).map((r) => [r.key, r.title]));
  const relink = (md) => (md || '').replace(/\[([^\]]*)\]\(((?:\.\.\/)?(?:מתכונים\/)?)([^)\s]+?\.md)(#[^)]*)?\)/g, (m, text, pre, f) => {
    const k = decodeURI(f); if (!byKey[k]) return m;
    return `[${/\.md$/.test(text) && titleOf[k] ? titleOf[k] : text}](#/r/${byKey[k]})`;
  });
  const linked = todo.filter((r) => r.key && /\.md[)#]/.test(r.body || ''));
  let n = 0;
  for (const r of linked) {
    n++; if (n % 10 === 0) status(`מחבר קישורים בין מתכונים… ${n} מתוך ${linked.length}`);
    must(await sb.from('recipes').update({ body: relink(r.body) }).eq('id', byKey[r.key]));
  }
  let itemsAdded = 0;
  if (Array.isArray(data.items) && data.items.length) {
    const have = must(await sb.from('items').select('list,title').eq('owner_id', me()));
    const seen = new Set(have.map((i) => i.list + '|' + i.title));
    const rows = data.items.filter((i) => SCOPES[i.list] && i.list !== 'recipes' && !seen.has(i.list + '|' + relink(i.title)))
      .map((i) => ({ owner_id: me(), list: i.list, section: i.section || '', title: relink(i.title), note: relink(i.note || ''), link: i.link || '', extra: i.extra || {}, done: !!i.done, position: i.position || 0 }));
    for (let i = 0; i < rows.length; i += 100) must(await sb.from('items').insert(rows.slice(i, i + 100)));
    itemsAdded = rows.length;
  }
  S.recipes = {}; S.items = {};
  status(`הייבוא הסתיים: ${todo.length} מתכונים ו־${itemsAdded} פריטים ברשימות.`);
  LS.set('import-dismissed', true);
}

/* ---------- updates: the service worker always fetches fresh files; this tells an open app that a newer version exists ---------- */
let updateShown = false;
async function checkVersion() {
  if (updateShown || !navigator.onLine) return;
  try {
    const v = (await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()).version;
    if (!v || v === APP_VERSION) return;
    updateShown = true;
    const b = document.createElement('div'); b.className = 'offline'; b.style.background = 'var(--basil)'; b.style.cursor = 'pointer';
    b.textContent = 'יש גרסה חדשה. לחצו לעדכון';
    b.onclick = async () => { try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch (e) {} location.reload(); };
    document.body.append(b);
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
setInterval(checkVersion, 30 * 60 * 1000);

/* ---------- routing ---------- */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const parts = h.split('/');
  // Supabase auth redirects put tokens in the hash; leave those to the client
  if (/access_token=|error_description=|type=recovery/.test(location.hash)) return;
  if (parts[0] === 'p' && parts[1]) return publicView(parts[1]);
  const authId = new URLSearchParams(location.search).get('authorization_id');
  if (!S.user) return authView('in', authId ? 'כדי לחבר את Claude, קודם נכנסים לחשבון.' : '');
  if (authId) return consentView(authId);
  if (parts[0] === 'recipes') return recipesView(false);
  if (parts[0] === 'guides') return recipesView(true);
  if (parts[0] === 'new') return editView(null, parts[1] === 'guide');
  if (parts[0] === 'r' && parts[1]) return parts[2] === 'edit' ? editView(parts[1]) : recipeView(parts[1]);
  if (parts[0] === 'list' && LIST_TITLE[parts[1]]) return listView(parts[1]);
  if (parts[0] === 'share') return shareView();
  if (parts[0] === 'settings') return settingsView();
  if (parts[0] === 'claude') return claudeView();
  return home();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });

const offline = document.createElement('div'); offline.className = 'offline'; offline.textContent = 'אין חיבור. מוצג מה שנשמר במכשיר'; offline.hidden = navigator.onLine; document.body.append(offline);
addEventListener('online', () => { offline.hidden = true; if (current.refresh) current.refresh(); });
addEventListener('offline', () => { offline.hidden = false; });

async function boot() {
  if (!sb) { app.innerHTML = `<div class="auth"><h1>${ICON_SVG} המטבח</h1><p class="empty">האפליקציה עוד לא מחוברת לשרת (חסרות הגדרות ב־config.js).</p></div>`; return; }
  const { data: { session } } = await sb.auth.getSession();
  S.user = session ? session.user : null;
  if (S.user) {
    const c = LS.get('cache-shares', null); if (c) { S.shares = c.shares; S.people = c.people; S.profile = c.people[me()]; }
    if (!S.profile) S.profile = { id: me(), email: S.user.email, name: (S.user.user_metadata && S.user.user_metadata.name) || '' };
    try { await loadShares(); } catch (e) {}
    subscribe();
  }
  route();
}
if (sb) sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { S.user = session && session.user; history.replaceState(null, '', location.pathname + '#/'); authView('newpass'); return; }
  if (event === 'SIGNED_IN' && /access_token=/.test(location.hash)) { history.replaceState(null, '', location.pathname + '#/'); setTimeout(boot, 0); }
  if (event === 'SIGNED_OUT') { S.user = null; }
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
checkVersion();
})();
