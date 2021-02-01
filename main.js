import {drawRandomVoronoiDiagram, recolor, rerender} from './voronoi.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const TEST_MODE = URL_PARAMS.has('test');

const El = {
  CANVAS_CONTAINER: document.getElementById('canvas'),
  CONTROLS: document.getElementById('controls'),
  HAMBURGER: document.getElementById('hamburger'),
  NUM_TILES: document.getElementById('numTiles'),
  RECOLOR: document.getElementById('recolor'),
  REGENERATE: document.getElementById('regenerate'),
  UPLOAD: document.getElementById('upload'),
};

// Render options
const options = {
  antialias: !TEST_MODE,
  container: El.CANVAS_CONTAINER,
  displayCapitals: false,
  imageUrl: null,
};

// Hold on to the Voronoi diagram state in order to recolor it (etc.)
let numTiles = parseInt(El.NUM_TILES.value);
let state = drawRandomVoronoiDiagram(numTiles, options);

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

// Handle menu
let expandMenu = !El.CONTROLS.classList.contains('hidden');
El.HAMBURGER.addEventListener('mousedown', () => {
  expandMenu = !expandMenu;
  if (expandMenu) {
    El.CONTROLS.classList.remove('hidden');
  } else {
    El.CONTROLS.classList.add('hidden');
  }
});
El.UPLOAD.addEventListener('change', function() {
  doRender(() => {
    if (this.files && this.files[0]) {
      options.imageUrl = URL.createObjectURL(this.files[0]);
      rerender(state, options);
    }
  });
});
// TODO
// El.NUM_TILES.addEventListener('change', () => {
//   const value = parseInt(El.NUM_TILES.value);
//   if (value > 0) {
//     numTiles = value;
//   }
// });
El.REGENERATE.addEventListener('mousedown', () => {
  doRender(() => state = drawRandomVoronoiDiagram(numTiles, options));
});
El.RECOLOR.addEventListener('mousedown', () => {
  doRender(() => recolor(state, options));
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
      state = drawRandomVoronoiDiagram(numTiles, options);
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
        state = drawRandomVoronoiDiagram(numTiles, options);
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
        numTiles, {antialias: false, displayCapitals: false});
    const d = performance.now() - s;
    t.push(d);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  disabledFns.forEach(([name, fn]) => console[name] = fn);
  console.log('timings:', t);
  console.log('avg:', (t.reduce((sum, x) => sum + x, 0) / t.length).toFixed(0));
}
