const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../tv-home/web/app.js'), 'utf8');

function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'function exists: ' + name);
  return source.slice(start, source.indexOf('\n  }\n', start) + 4);
}
// readConfig's home.links filter, run on its own
const filterStart = source.indexOf('    LINKS = (Array.isArray(HOME.links)');
assert(filterStart >= 0, 'readConfig parses home.links');
const filterSrc = source.slice(filterStart, source.indexOf('    });\n', filterStart) + 8);

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
for (const name of ['linkApps', 'sortApps', 'linkFace', 'dockHTML', 'openAppMenu']) vm.runInContext(fn(name), context);
vm.runInContext('var amItems = [], amApp = null, amI = 0, zone = "";', context);

// 1. config validation
context.HOME = { links: [
  { id: 'nbc-news-now', name: 'NBC News NOW', url: 'https://pluto.tv/live-tv/nbc-news-now', app: 'tv.pluto.android', colour: '#1a3a8a' },
  { id: 'Bad Id', name: 'x', url: 'u', app: 'a' },
  { id: 'no-url', name: 'x', app: 'a' },
  null,
  { id: 'evil', name: '<b>Evil</b>', url: 'https://x', app: 'tv.pluto.android', colour: 'red;background-image:url(x)' }
] };
vm.runInContext(filterSrc, context);
assert.deepStrictEqual(Array.from(context.LINKS, l => l.id), ['nbc-news-now', 'evil'], 'invalid links are dropped');

// 2. tiles appear only while the target app is installed
const apps = [{ kind: 'app', name: 'YouTube', package: 'com.amazon.firetv.youtube' }];
assert.equal(context.linkApps(apps).length, 0, 'no tile without its app');
apps.push({ kind: 'app', name: 'Pluto TV', package: 'tv.pluto.android' });
const tiles = context.linkApps(apps);
assert.deepStrictEqual(Array.from(tiles, t => t.package), ['link:nbc-news-now', 'link:evil']);
assert.equal(tiles[0].link, 'https://pluto.tv/live-tv/nbc-news-now');
assert.equal(tiles[0].app, 'tv.pluto.android');
const sorted = context.sortApps(apps.concat(tiles));
assert(sorted.some(a => a.package === 'link:nbc-news-now'), 'link tiles survive sortApps');

// 3. faces: name as text, colour only when it is a hex colour, markup escaped
const good = context.dockHTML(tiles[0]);
assert(good.includes('face word') && good.includes('background:#1a3a8a') && good.includes('NBC News NOW'));
assert(!good.includes('tvos.invalid/icon/link:'), 'no icon lookup for a link tile');
const evil = context.dockHTML(tiles[1]);
assert(!evil.includes('<b>') && !evil.includes('background-image') && !evil.includes('style='), 'name escaped, bad colour ignored');

// 4. hold-OK menu: no uninstall or app info for a link tile
context.TV = { uninstall() {}, appInfo() {} };
context.openAppMenu(tiles[0]);
assert.deepStrictEqual(Array.from(vm.runInContext('amItems', context), i => i.act), ['move', 'hide']);
context.openAppMenu(apps[0]);
assert.deepStrictEqual(Array.from(vm.runInContext('amItems', context), i => i.act), ['move', 'hide', 'uninstall', 'info']);

// 5. OK opens the link in its app, else launches the app itself
const act = source.indexOf('    if (a.link) {');
assert(act >= 0, 'activate handles link tiles');
const openSrc = 'function openTile(a) {\n' + source.slice(source.indexOf('    opened(a.package);\n    if (a.link)'), source.indexOf('    if (TV && TV.launch(a.package)) return;', act)) + '}';
vm.runInContext(openSrc, context);
calls.length = 0;
context.TV = { openLink: (u, p) => { calls.push(['openLink', u, p]); return true; }, launch: p => { calls.push(['launch', p]); return true; } };
context.openTile(tiles[0]);
assert.deepStrictEqual(calls, [['opened', 'link:nbc-news-now'], ['openLink', 'https://pluto.tv/live-tv/nbc-news-now', 'tv.pluto.android']]);
calls.length = 0;
context.TV.openLink = (u, p) => { calls.push(['openLink', u, p]); return false; };
context.openTile(tiles[0]);
assert.deepStrictEqual(calls.slice(-1), [['launch', 'tv.pluto.android']], 'falls back to the app');

console.log('Link tile tests passed.');
