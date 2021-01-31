import {drawRandomVoronoiDiagram, recolor} from './voronoi.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const NUM_TILES = parseInt(URL_PARAMS.get('n'), 10) ||
    Math.round(window.innerWidth * window.innerHeight / 10_000);

// Disable context menu so we can handle right click
document.addEventListener('contextmenu', event => {
  event.preventDefault();
  return false;
});

// Handle clicks: left click = randomize; right click = recolor
let state = drawRandomVoronoiDiagram(NUM_TILES);
let renderInProgress = false;
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
if (URL_PARAMS.has('test')) {
  test(Number(URL_PARAMS.get('test')) || 20);
}
async function test(iterations) {
  const disabledLoggers = {
    log: console.log,
    time: console.time,
    timeEnd: console.timeEnd,
  };
  Object.keys(disabledLoggers).forEach(name => console[name] = () => null);

  const t = [];
  for (let i = 0; i < iterations; i++) {
    const s = performance.now();
    drawRandomVoronoiDiagram(NUM_TILES);
    const d = performance.now() - s;
    t.push(d);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  Object.entries(disabledLoggers).forEach(([name, fn]) => console[name] = fn);
  console.log('timings:', t);
  console.log('avg:', (t.reduce((sum, x) => sum + x, 0) / t.length).toFixed(0));
}
