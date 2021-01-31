import {drawRandomVoronoiDiagram, recolor} from './voronoi.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const NUM_TILES = parseInt(URL_PARAMS.get('n'), 10) ||
    Math.round(window.innerWidth * window.innerHeight / 10_000);
const TEST_MODE = URL_PARAMS.has('test');

// Hold on to the render state in order to recolor it
let state = drawRandomVoronoiDiagram(NUM_TILES, /* antialias= */ !TEST_MODE);
let renderInProgress = false;

document.addEventListener('contextmenu', event => {
  // Disable context menu so we can handle right click
  event.preventDefault();
  // On mobile, however, "right click" won't trigger, so recolor here instead
  if (!renderInProgress) {
    renderInProgress = true;
    recolor(state);
    requestAnimationFrame(() => renderInProgress = false);
  }
  return false;
});

// Handle clicks: left click = randomize; right click = recolor
document.addEventListener('mousedown', event => {
  if (renderInProgress) {
    return;
  }
  renderInProgress = true;
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) {
    recolor(state);
  } else {
    state = drawRandomVoronoiDiagram(NUM_TILES);
  }
  requestAnimationFrame(() => renderInProgress = false);
});

// Re-render multiple times in a row and time each.
if (TEST_MODE) {
  test(Number(URL_PARAMS.get('test')) || 20);
}
async function test(iterations) {
  const disabledNames = ['log', 'time', 'timeEnd'];
  const disabledFns = disabledNames.map(name => {
    const fn = console[name];
    console[name] = () => null;
    return [name, fn];
  });

  const t = [];
  for (let i = 0; i < iterations; i++) {
    const s = performance.now();
    state = drawRandomVoronoiDiagram(NUM_TILES, /* antialias= */ false);
    const d = performance.now() - s;
    t.push(d);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  disabledFns.forEach(([name, fn]) => console[name] = fn);
  console.log('timings:', t);
  console.log('avg:', (t.reduce((sum, x) => sum + x, 0) / t.length).toFixed(0));
}
