/** Returns a random integer in [0, n) */
export const rand = (n) => Math.floor(Math.random() * n);

/**
 * Returns the sqaure of the Euclidean distance between two points in R^2.
 */
const euclideanDist = (x1, y1, x2, y2) => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
};

/**
 * Returns the un-rooted distance between two points in R^2 according to the
 * configured metric. Sufficient for comparing distances.
 */
export const distance = (() => {
  const metric = Number(new URLSearchParams(location.search).get('metric'));
  switch (metric) {
    case 1:
      // taxicab distance
      return (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
    case 2:
      // euclidean distance
      return euclideanDist;
    case 3:
      // cubic distance
      return (x1, y1, x2, y2) => {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return dx * dx * dx + dy * dy * dy;
      };
    case 4:
      // quartic distance
      return (x1, y1, x2, y2) => {
        let dx = x1 - x2;
        dx *= dx;
        dx *= dx;
        let dy = y1 - y2;
        dy *= dy;
        dy *= dy;
        return dx + dy;
      };
    default:
      if (metric > 1) {
        // generalized distance: dx^m + dy^m
        return (x1, y1, x2, y2) => {
          const dx = Math.abs(x1 - x2);
          const dy = Math.abs(y1 - y2);
          return Math.pow(dx, metric) + Math.pow(dy, metric);
        };
      } else {
        // fall back to euclidean distance
        return euclideanDist;
      }
  }
})();

/** Averages the color values of the given subpixel tileIndexes. */
export function averageSubpixels(subpixels, tiles) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < subpixels.length; i++) {
    const color = tiles[subpixels[i]].color;
    r += color[0];
    g += color[1];
    b += color[2];
  }
  const average = new Uint8ClampedArray(3);
  average[0] = r / subpixels.length;
  average[1] = g / subpixels.length;
  average[2] = b / subpixels.length;
  return average;
}

/** Loads pixel data from an image stretched to the given dimensions. */
export const loadImagePixelData = (() => {
  let cachedImageUrl;
  let cachedResolutions = {};
  return (imageUrl, width, height) => {
    const key = `${width}x${height}`;
    // check whether the requested imgPixelData is cached
    if (imageUrl === cachedImageUrl) {
      if (key in cachedResolutions) {
        return Promise.resolve(cachedResolutions[key]);
      }
    } else {
      cachedImageUrl = imageUrl;
      cachedResolutions = {};
    }
    // fresh load
    return new Promise(resolve => {
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = width;
      imageCanvas.height = height;
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.src = imageUrl;
      image.addEventListener('load', () => {
        // stretch image onto imageCanvas
        const ctx = imageCanvas.getContext('2d');
        ctx.drawImage(
            image,
            /* source: */ 0, 0, image.width, image.height,
            /* destination: */ 0, 0, width, height);
        const imgPixelData = ctx.getImageData(0, 0, width, height).data;
        cachedResolutions[key] = imgPixelData;
        resolve(imgPixelData);
      });
    });
  };
})();
