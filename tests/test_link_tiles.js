const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../tv-home/web/app.js'), 'utf8');

function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'function exists: ' + name);
  const firstLine = source.slice(start, source.indexOf('\n', start)).trimEnd();
  return firstLine.endsWith('}') ? firstLine : source.slice(start, source.indexOf('\n  }\n', start) + 4);
}
// readConfig's home.links filter, run on its own
const filterStart = source.indexOf('    var linkIds = {};');
assert(filterStart >= 0, 'readConfig parses home.links');
const filterSrc = source.slice(filterStart, source.indexOf('    });\n', filterStart) + 8);

// Every list of apps the home shows (bridge, standalone/offline, mock, first paint) includes the
// link tiles: no path may build data.apps without appList.
assert(!/data\.apps\s*=\s*sortApps\(/.test(source), 'data.apps is only built through appList');
assert(source.match(/data\.apps = appList\(/g).length >= 4, 'offline, mock, bridge and boot paths use appList');

const calls = [];
const context = {
  LINKS: [], HOME: {}, NIGHT: true, newApps: [], lift: null,
  esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  t: k => k, iconUrl: pkg => 'http://tvos.invalid/icon/' + pkg, dotHTML: () => '',
  opened: pkg => calls.push(['opened', pkg]), status() {}, renderAppMenu() {},
  api: (m, path, body) => { calls.push(['api', path, body]); return Promise.resolve({}); },
  TV: null, ICONS: {}, window: {}
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  var APP_ORDER ='), source.indexOf('  var GRID_COLS')), context);
for (const name of ['linkApps', 'appList', 'openLinkTile', 'sortApps', 'linkFace', 'dockHTML', 'openAppMenu']) vm.runInContext(fn(name), context);
vm.runInContext('var amItems = [], amApp = null, amI = 0, zone = "";', context);

// 1. config validation
context.HOME = { links: [
  { id: 'nbc-news-now', name: 'NBC News NOW', url: 'https://pluto.tv/live-tv/nbc-news-now', app: 'tv.pluto.android', colour: '#1a3a8a' },
  { id: 'Bad Id', name: 'x', url: 'u', app: 'a' },
  { id: 'no-url', name: 'x', app: 'a' },
  null,
  { id: 'nbc-news-now', name: 'Again', url: 'https://x', app: 'tv.pluto.android' },
  { id: 'evil', name: '<b>Evil</b>', url: 'https://x', app: 'tv.pluto.android', colour: 'red;background-image:url(x)' }
] };
vm.runInContext(filterSrc, context);
assert.deepStrictEqual(Array.from(context.LINKS, l => l.id), ['nbc-news-now', 'evil'], 'invalid and repeated links are dropped');

// 2. tiles appear only while the target app is installed, through appList
const apps = [{ kind: 'app', name: 'YouTube', package: 'com.amazon.firetv.youtube' }];
assert.deepStrictEqual(Array.from(context.appList(apps), a => a.package), ['com.amazon.firetv.youtube'], 'no tile without its app');
apps.push({ kind: 'app', name: 'Pluto TV', package: 'tv.pluto.android' });
const listed = context.appList(apps);
const tiles = listed.filter(a => a.link);
assert.deepStrictEqual(Array.from(tiles, t => t.package).sort(), ['link:evil', 'link:nbc-news-now']);
const nbc = tiles.find(t => t.package === 'link:nbc-news-now');
assert.equal(nbc.link, 'https://pluto.tv/live-tv/nbc-news-now');
assert.equal(nbc.app, 'tv.pluto.android');

// 3. faces: name as text, colour only when it is a hex colour, markup escaped
const good = context.dockHTML(nbc);
assert(good.includes('face word') && good.includes('background:#1a3a8a') && good.includes('NBC News NOW'));
assert(!good.includes('tvos.invalid/icon/link:'), 'no icon lookup for a link tile');
const evil = context.dockHTML(tiles.find(t => t.package === 'link:evil'));
assert(!evil.includes('<b>') && !evil.includes('background-image') && !evil.includes('style='), 'name escaped, bad colour ignored');

// 4. hold-OK menu: no uninstall or app info for a link tile
context.TV = { uninstall() {}, appInfo() {} };
context.openAppMenu(nbc);
assert.deepStrictEqual(Array.from(vm.runInContext('amItems', context), i => i.act), ['move', 'hide']);
context.openAppMenu(apps[0]);
assert.deepStrictEqual(Array.from(vm.runInContext('amItems', context), i => i.act), ['move', 'hide', 'uninstall', 'info']);

// 5. opening: the link in its app, else the app itself, else the bridge
calls.length = 0;
context.TV = { openLink: (u, p) => { calls.push(['openLink', u, p]); return true; }, launch: p => { calls.push(['launch', p]); return true; } };
context.openLinkTile(nbc);
assert.deepStrictEqual(calls, [['openLink', 'https://pluto.tv/live-tv/nbc-news-now', 'tv.pluto.android']]);
calls.length = 0;
context.TV.openLink = (u, p) => { calls.push(['openLink', u, p]); return false; };
context.openLinkTile(nbc);
assert.deepStrictEqual(calls.slice(-1), [['launch', 'tv.pluto.android']], 'falls back to the app');
calls.length = 0;
context.TV = null;
context.openLinkTile(nbc);
assert.equal(JSON.stringify(calls), JSON.stringify([['api', '/api/launch', { app: 'tv.pluto.android' }]]), 'without a TV bridge, the bridge opens the app');

// 6. both openers (dock OK and kids mode) use openLinkTile
assert(/if \(a\.link\) \{ openLinkTile\(a\); return; \}/.test(source), 'dock OK opens link tiles');
assert(/x\.package === pkg && x\.link[\s\S]{0,80}openLinkTile\(lt\)/.test(source), 'kids mode opens link tiles');
// Home settings, Apps: no icon lookup for a fake package
assert(source.includes('icon: it.link ? "" : it.package'), 'settings rows use the letter fallback');

console.log('Link tile tests passed.');
