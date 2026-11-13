const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../tv-home/web/app.js'), 'utf8');
function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name + ' exists');
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
async function test() {
  let prompts = 0, requests = 0;
  const c = vm.createContext({
    HOME: {manual_home_adoption: true}, kept: () => null, kidsOn: () => false,
    zone: 'grid', homeState: () => 'ask', clearFocus() {}, renderAsk() { prompts++; },
    TV: {requestHome() { requests++; }}, askKind: '', ai: 0
  });
  vm.runInContext(fn('homeAsk') + fn('requestHome'), c);
  c.homeAsk(); c.requestHome();
  assert.equal(prompts, 0, 'ADB-managed adoption must not prompt for Android Home');
  assert.equal(requests, 0, 'ADB-managed adoption must not open a Home chooser');
  c.HOME.manual_home_adoption = false;
  c.homeAsk(); c.requestHome();
  assert.equal(prompts, 1, 'ordinary Android TV keeps its prompt');
  assert.equal(requests, 1, 'ordinary Android TV keeps its chooser');

  let now = 10000000, network = 0, clockUpdates = 0;
  let next = {temp: 12, code: 3, is_day: true};
  const w = vm.createContext({
    NIGHT: true, WX_SHOW: true, OFFLINE: true, ST: {},
    WXCFG: {lat: 1, lon: 2}, data: {weather: null}, document: {hidden: false},
    weatherVisible: true, weatherSeen: 0, weatherTicket: 0, weatherRetried: false,
    weatherRetry: null, Date: {now: () => now}, Promise,
    setTimeout: () => 42, clearTimeout() {},
    clock() { clockUpdates++; }, updateAmbientWeather() {},
    t: key => key, weatherDirect: () => { network++; return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); }
  });
  vm.runInContext(fn('refreshWeather') + fn('weatherProblem'), w);
  assert.equal(w.weatherProblem(), 'wx_unavailable');
  await w.refreshWeather();
  assert.equal(w.data.weather.temp, 12);
  assert.equal(w.weatherProblem(), '');
  w.weatherVisible = false;
  await w.refreshWeather();
  assert.equal(network, 1, 'native pause stops polling');
  w.weatherVisible = true; w.document.hidden = true;
  await w.refreshWeather();
  assert.equal(network, 1, 'hidden document stops polling');
  w.document.hidden = false; now += 66 * 60000;
  assert.equal(w.weatherProblem(), 'wx_stale', 'old observations cannot look current');
  next = new Error('offline');
  await w.refreshWeather();
  assert.equal(w.weatherProblem(), 'wx_stale');
  assert.equal(w.weatherRetried, true, 'a failed read schedules one bounded retry');
  assert.equal(clockUpdates, 2, 'failure refreshes the status as well as success');

  // Android can resume before WebView reports visibility. The later visibility event
  // must recover the refresh that the hidden gate intentionally skipped.
  let visibility;
  w.document.addEventListener = (event, callback) => { visibility = callback; };
  for (const name of ['saveFocusNow', 'pauseVideo', 'setIdleAmbient', 'resetSmartIdle',
    'startVideo', 'sceneVideos', 'resetIdlePhoto']) w[name] = () => {};
  w.window = {};
  const listenerStart = source.indexOf('  document.addEventListener("visibilitychange", function () {');
  vm.runInContext(source.slice(listenerStart, source.indexOf('\n  });', listenerStart) + 6), w);
  w.document.hidden = true;
  await w.refreshWeather();
  next = {temp: 15, code: 0, is_day: true};
  w.document.hidden = false;
  visibility();
  await Promise.resolve();
  assert.equal(w.data.weather.temp, 15, 'visibility catches the resume-before-visible race');

  let xhr;
  function XHR() { xhr = this; }
  XHR.prototype.open = function(method, url) { this.url = url; };
  XHR.prototype.send = function() {};
  const x = vm.createContext({WXCFG: {lat: 1, lon: 2, timezone: 'UTC'}, XMLHttpRequest: XHR, Promise});
  vm.runInContext(fn('weatherDirect'), x);
  let promise = x.weatherDirect();
  assert.equal(xhr.timeout, 8000);
  xhr.status = 200; xhr.responseText = JSON.stringify({current: {temperature_2m: 9.4, weather_code: 3, is_day: 1}}); xhr.onload();
  assert.equal((await promise).temp, 9);
  promise = x.weatherDirect(); xhr.ontimeout();
  await assert.rejects(promise, /weather/);
  promise = x.weatherDirect(); xhr.status = 503; xhr.onload();
  await assert.rejects(promise, /weather/);
  promise = x.weatherDirect(); xhr.status = 200; xhr.responseText = '{"current":{}}'; xhr.onload();
  await assert.rejects(promise, /weather/);
  console.log('Manual Home adoption and weather lifecycle tests passed.');
}
test().catch(e => { console.error(e); process.exitCode = 1; });
