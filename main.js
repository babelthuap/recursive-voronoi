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
