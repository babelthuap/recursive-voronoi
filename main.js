import {drawRandomVoronoiDiagram, recolor, rerender} from './voronoi.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const NUM_TILES = parseInt(URL_PARAMS.get('n'), 10) ||
    Math.round(window.innerWidth * window.innerHeight / 10_000);
const TEST_MODE = URL_PARAMS.has('test');

// Render options
const options = {
  antialias: !TEST_MODE,
  container: document.getElementById('canvas'),
  displayCapitals: false,
  imageUrl: null,
};

// Hold on to the Voronoi diagram state in order to recolor it (etc.)
let state = drawRandomVoronoiDiagram(NUM_TILES, options);

/** Invokes fn if there's not already a render in progress. */
const doRender = (() => {
  let renderInProgress = false;
  return (fn) => {
    if (!renderInProgress) {
      renderInProgress = true;
      fn();
      requestAnimationFrame(() => renderInProgress = false);
    }
  };
})();

// Handle image upload
document.getElementById('upload').addEventListener('change', function() {
  doRender(() => {
    if (this.files && this.files[0]) {
      options.imageUrl = URL.createObjectURL(this.files[0]);
      rerender(state, options);
    }
  });
});

// Disable context menu so we can handle right click
options.container.addEventListener('contextmenu', event => {
  event.preventDefault();
  // On mobile, however, "right click" won't trigger, so recolor here instead
  doRender(() => recolor(state, options));
  return false;
});

// Handle clicks: left click = randomize; right click = recolor
options.container.addEventListener('mousedown', event => {
  doRender(() => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey) {
      recolor(state, options);
    } else {
      state = drawRandomVoronoiDiagram(NUM_TILES, options);
    }
  });
});

// Handle keystrokes
document.addEventListener('keydown', event => {
  doRender(() => {
    switch (event.key) {
      case 'a':
        options.antialias = !options.antialias;
        rerender(state, options);
        break;
      case 'c':
        recolor(state, options);
        break;
      case 's':
        state = drawRandomVoronoiDiagram(NUM_TILES, options);
        break;
      case 't':
        options.displayCapitals = !options.displayCapitals;
        rerender(state, options);
        break;
    }
  });
});


/**********************/
/** TEST RENDER TIME **/
/**********************/
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
    state = drawRandomVoronoiDiagram(
        NUM_TILES, {antialias: false, displayCapitals: false});
    const d = performance.now() - s;
    t.push(d);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  disabledFns.forEach(([name, fn]) => console[name] = fn);
  console.log('timings:', t);
  console.log('avg:', (t.reduce((sum, x) => sum + x, 0) / t.length).toFixed(0));
}
