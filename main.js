import {drawRandomVoronoiDiagram, recolor, rerender} from './voronoi.js';

const URL_PARAMS = new URLSearchParams(window.location.search);
const TEST_MODE = URL_PARAMS.has('test');

const El = {
  ANTIALIAS: document.getElementById('antialias'),
  CANVAS_CONTAINER: document.getElementById('canvas'),
  CONTROLS: document.getElementById('controls'),
  DOWNLOAD: document.getElementById('download'),
  HAMBURGER: document.getElementById('hamburger'),
  NUM_TILES: document.getElementById('numTiles'),
  RECOLOR: document.getElementById('recolor'),
  REGENERATE: document.getElementById('regenerate'),
  DISPLAY_CAPITALS: document.getElementById('displayCapitals'),
  UPLOAD: document.getElementById('upload'),
};

// Render options
const options = {
  antialias: !TEST_MODE && El.ANTIALIAS.checked,
  container: El.CANVAS_CONTAINER,
  displayCapitals: El.DISPLAY_CAPITALS.checked,
  imageUrl: null,
  numTiles: parseInt(El.NUM_TILES.value),
};

// Hold on to the Voronoi diagram state in order to recolor it (etc.)
drawRandomVoronoiDiagram(options).then(state => {
  /** Invokes fn if there's not already a render in progress. */
  const doRender = (() => {
    let renderInProgress = false;
    let debouncedFn = null;
    return async (fn) => {
      if (renderInProgress) {
        debouncedFn = fn;
      } else {
        renderInProgress = true;
        await fn();
        renderInProgress = false;
        if (debouncedFn) {
          fn = debouncedFn;
          debouncedFn = null;
          await doRender(fn);
        }
      }
    };
  })();

  // Handle menu
  let expandMenu = !El.CONTROLS.classList.contains('hidden');
  function toggleMenu() {
    expandMenu = !expandMenu;
    if (expandMenu) {
      El.CONTROLS.classList.remove('hidden');
    } else {
      El.CONTROLS.classList.add('hidden');
    }
  }
  El.HAMBURGER.addEventListener('mousedown', toggleMenu);

  // Handle image upload
  El.UPLOAD.addEventListener('change', () => {
    doRender(() => {
      if (!El.UPLOAD.files || !El.UPLOAD.files[0]) {
        return;
      }
      return new Promise(resolve => {
        options.imageUrl = URL.createObjectURL(El.UPLOAD.files[0]);

        // if no animate...
        if (!URL_PARAMS.has('animate')) {
          return rerender(state, options).then(resolve);
        }

        // if animate...
        toggleMenu();
        options.antialias = false;
        const finalNumTiles = 10_000;
        const durationMs = parseInt(URL_PARAMS.get('animate')) || 20_000;
        const tilesPerMs2 = finalNumTiles / (durationMs * durationMs);
        let start;
        const tick = (t) => {
          if (!start) start = t;
          const progress = t - start;
          options.numTiles =
              Math.max(1, Math.floor((progress ** 2) * tilesPerMs2));
          if (options.numTiles < finalNumTiles) {
            drawRandomVoronoiDiagram(options).then(newState => {
              state = newState;
              requestAnimationFrame(tick);
            });
          } else {
            console.log('animation time:', progress);
            resolve();
          }
        };

        requestAnimationFrame(tick);
      });
    });
  });

  // Handle numTiles input
  El.NUM_TILES.max = window.innerWidth * window.innerHeight >> 4;
  El.NUM_TILES.addEventListener('keydown', event => {
    const maxNumTiles = window.innerWidth * window.innerHeight >> 4;
    El.NUM_TILES.max = maxNumTiles;
    if (event.key === 'Enter') {
      doRender(async () => {
        state = await drawRandomVoronoiDiagram(options);
      });
    } else {
      setTimeout(() => {
        let value = parseInt(El.NUM_TILES.value);
        if (value > maxNumTiles) {
          value = El.NUM_TILES.value = maxNumTiles;
        }
        if (value > 0 && value !== options.numTiles) {
          options.numTiles = value;
          doRender(async () => {
            state = await drawRandomVoronoiDiagram(options);
          });
        }
      }, 0);
    }
  });

  // Other inputs
  El.REGENERATE.addEventListener('mousedown', () => {
    doRender(async () => {
      state = await drawRandomVoronoiDiagram(options);
    });
  });
  El.RECOLOR.addEventListener('mousedown', () => {
    doRender(() => recolor(state, options));
  });
  El.DISPLAY_CAPITALS.addEventListener('change', () => {
    doRender(() => {
      options.displayCapitals = El.DISPLAY_CAPITALS.checked;
      return rerender(state, options);
    });
  });
  El.ANTIALIAS.addEventListener('change', () => {
    doRender(() => {
      options.antialias = El.ANTIALIAS.checked;
      return rerender(state, options);
    });
  });
  El.DOWNLOAD.addEventListener('click', () => {
    El.DOWNLOAD.download = `voronoi_${Date.now()}.png`;
    El.DOWNLOAD.href =
        state.canvas.toDataURL().replace('image/png', 'image/octet-stream');
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
    doRender(async () => {
      if (event.button !== 0 || event.altKey || event.ctrlKey ||
          event.metaKey) {
        await recolor(state, options);
      } else {
        state = await drawRandomVoronoiDiagram(options);
      }
    });
  });

  // Handle keystrokes
  document.addEventListener('keydown', event => {
    switch (event.key) {
      case 'Escape':
      case '`':
        toggleMenu();
        break;
      case 'a':
        doRender(() => {
          options.antialias = !options.antialias;
          El.ANTIALIAS.checked = options.antialias;
          return rerender(state, options);
        });
        break;
      case 'c':
        doRender(() => recolor(state, options));
        break;
      case 's':
        doRender(async () => {
          state = await drawRandomVoronoiDiagram(options);
        });
        break;
      case 't':
        doRender(() => {
          options.displayCapitals = !options.displayCapitals;
          El.DISPLAY_CAPITALS.checked = options.displayCapitals;
          return rerender(state, options);
        });
        break;
    }
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
      state = await drawRandomVoronoiDiagram({
        antialias: false,
        displayCapitals: false,
        numTiles: options.numTiles,
      });
      const d = performance.now() - s;
      t.push(d);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    disabledFns.forEach(([name, fn]) => console[name] = fn);
    console.log('timings:', t);
    console.log(
        'avg:', (t.reduce((sum, x) => sum + x, 0) / t.length).toFixed(0));
  }
});
