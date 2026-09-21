/* Run a page headlessly against the real annotations file and check it.
 *
 * There is no browser here and no test framework: the page is evaluated in a
 * VM with a stubbed DOM, then a script of checks runs in the same context so
 * it can call the page's own functions. That is enough to walk every room on
 * every sheet, draw each one, and exercise the edit and export paths for
 * real, which is what has caught the bugs so far.
 *
 *     node tools/smoke.js . reader     the reader: rooms, sidebars, the floor rule
 *     node tools/smoke.js . editor     the editor: drawing, portals, undo
 *     node tools/smoke.js . export     the export: UVTT geometry and notes
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = process.argv[2] || path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

const WHICH = (process.argv[3] || 'reader').toLowerCase();
const APP = WHICH === 'reader' ? 'browse.js' : 'app.js';
const INNER = 'smoke-' + WHICH + '.js';

const noop = () => {};
const els = new Map();
function el(id) {
  if (els.has(id)) return els.get(id);
  const e = {
    id, innerHTML: '', textContent: '', value: '', hidden: false, checked: false,
    style: { setProperty: noop, removeProperty: noop, display: '' },
    dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    scrollTop: 0, clientWidth: 900, clientHeight: 700, disabled: false,
    addEventListener: noop, removeEventListener: noop, setPointerCapture: noop,
    releasePointerCapture: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
    querySelector: () => el(id + ' >'), querySelectorAll: () => [],
    appendChild: noop, closest: () => null, focus: noop, click: noop,
    getContext: () => ctx2d, insertAdjacentHTML: noop,
  };
  els.set(id, e);
  return e;
}
const ctx2d = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return el('#canvas');
    if (k === 'measureText') return () => ({ width: 10 });
    return typeof k === 'string' ? (t[k] !== undefined ? t[k] : noop) : noop;
  },
  set: () => true,
});

const store = {};
const sandbox = {
  console,
  document: {
    querySelector: s => el(s), querySelectorAll: () => [], createElement: () => el('new'),
    addEventListener: noop, hidden: false, body: el('body'), activeElement: null,
  },
  window: { devicePixelRatio: 1, addEventListener: noop, location: { search: '' } },
  location: { search: '' },
  history: { replaceState: noop },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  navigator: { userAgent: 'node' },
  requestAnimationFrame: noop,
  setImmediate,
  setInterval: noop,
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout: noop,
  ResizeObserver: class { observe() {} disconnect() {} },
  Image: class { set src(_) {} addEventListener() {} },
  URLSearchParams,
  getComputedStyle: () => ({ getPropertyValue: () => '300' }),
  fetch: async (url) => {
    const map = {
      '/castle-data.json': 'castle-data.json',
      '/api/annotations-v2': 'castle-ravenloft-annotations-v2.json',
    };
    if (map[url]) return { ok: true, json: async () => JSON.parse(read(map[url])) };
    if (url === '/api/map-packs') return { ok: true, json: async () => ({ packs: [] }) };
    if (url === '/api/annotations-v2') return { ok: true, text: async () => 'ok' };
    throw new Error('unexpected fetch ' + url);
  },
};
sandbox.globalThis = sandbox;
sandbox.window.localStorage = sandbox.localStorage;

vm.createContext(sandbox);
vm.runInContext(read('markers.js'), sandbox, { filename: 'markers.js' });
vm.runInContext(read(APP), sandbox, { filename: APP });

const inner = fs.readFileSync(path.join(__dirname, INNER), 'utf8');
vm.runInContext(inner, sandbox, { filename: 'smoke_inner.js' })
  .catch(e => { console.error('FAILED:', e && e.stack || e); process.exit(1); });
