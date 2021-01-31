import {averageSubpixels, distance} from './util.js';

// reuse this across renders to reduce garbage collection time
let borderPixels;

// keep track of which state we have already calculated borderPixels for
let bordersKnownState;

/** Antialiases borders. */
export function renderAntialiasedBorders(state) {
  console.time('antialias');
  const {tiles, canvas, pixels} = state;
  const width = canvas.width;
  const height = canvas.height;
  if (state === bordersKnownState) {
    for (let pixelIndex = 0; pixelIndex < width * height; ++pixelIndex) {
      const subpixels = borderPixels[pixelIndex];
      if (subpixels !== undefined) {
        canvas.setPixel(pixelIndex, averageSubpixels(subpixels, tiles));
      }
    }
  } else {
    // borders unknown - so we must calculate them
    calculateNbrTileIndexes(canvas, pixels);
    for (let y = 0; y < height; ++y) {
      const rowOffset = width * y;
      for (let x = 0; x < width; ++x) {
        const pixelIndex = x + rowOffset;
        // determine the tiles to which each neighbor pixel belongs
        const nbrTileIndices = borderPixels[pixelIndex];
        // if this is a border pixel, then sample subpixels
        if (nbrTileIndices !== undefined) {
          const subpixels = getSubpixelTileIndices(
              x, y, tiles, pixels[pixelIndex], nbrTileIndices);
          // NOTE: this changes the definition of borderPixels - we now have
          // borderPixels[pixelIndex] = array of subpixel tileIndexes
          borderPixels[pixelIndex] = subpixels;
          canvas.setPixel(pixelIndex, averageSubpixels(subpixels, tiles));
        }
      }
    }
    bordersKnownState = state;
  }
  console.timeEnd('antialias');
}

/** Adds an element to an array if it's not already present. */
const add = (arr, e) => {
  if (!arr.includes(e)) {
    arr.push(e);
  }
  return arr;
};

/**
 * Initializes borderPixels. Sets borderPixels[pixelIndex] = array of
 * neighboring tile indexes, or empty if all neighbors belong to the same tile.
 */
function calculateNbrTileIndexes(canvas, pixels) {
  const width = canvas.width;
  const height = canvas.height;
  // TODO: try sparse array
  if (borderPixels === undefined) {
    borderPixels = new Array(width * height);
  } else {
    if (borderPixels.length !== width * height) {
      borderPixels.length = width * height;
    }
    borderPixels.fill();
  }
  // search for borders row by row
  for (let y = 0; y < height; ++y) {
    const rowOffset = width * y;
    let left = 0;
    while (left < width - 1) {
      const leftPixelIndex = left + rowOffset;
      const leftTileIndex = pixels[leftPixelIndex];
      // search for tile border
      let right = width - 2;
      let rightPixelIndex = right + rowOffset;
      if (pixels[rightPixelIndex] !== leftTileIndex) {
        let step = Math.max((right - left) >> 1, 1);
        do {
          if (pixels[rightPixelIndex] === leftTileIndex) {
            right += step;
          } else {
            right -= step;
          }
          rightPixelIndex = right + rowOffset;
          if (step > 1) {
            step >>= 1;
          }
        } while (pixels[rightPixelIndex] !== leftTileIndex ||
                 pixels[rightPixelIndex + 1] === leftTileIndex);
      }
      borderPixels[rightPixelIndex] =
          add(borderPixels[rightPixelIndex] || [], pixels[rightPixelIndex + 1]);
      borderPixels[rightPixelIndex + 1] = [pixels[rightPixelIndex]];
      left = right + 1;
    }
  }
  // search for borders column by column
  for (let x = 0; x < width; ++x) {
    let top = 0;
    while (top < height - 1) {
      const topTileIndex = pixels[x + width * top];
      // search for tile border
      let bottom = height - 2;
      let bottomPixelIndex = x + width * bottom;
      if (pixels[bottomPixelIndex] !== topTileIndex) {
        let step = Math.max((bottom - top) >> 1, 1);
        do {
          if (pixels[bottomPixelIndex] === topTileIndex) {
            bottom += step;
          } else {
            bottom -= step;
          }
          bottomPixelIndex = x + width * bottom;
          if (step > 1) {
            step >>= 1;
          }
        } while (pixels[bottomPixelIndex] !== topTileIndex ||
                 pixels[bottomPixelIndex + width] === topTileIndex);
      }
      borderPixels[bottomPixelIndex] =
          add(borderPixels[bottomPixelIndex] || [],
              pixels[bottomPixelIndex + width]);
      borderPixels[bottomPixelIndex + width] =
          add(borderPixels[bottomPixelIndex + width] || [],
              pixels[bottomPixelIndex]);
      top = bottom + 1;
    }
  }
}

// Evenly spaced subpixel coordinates - we're effectively rendering border
// pixels at 3x resolution.
const SUBPIXEL_OFFSETS = [
  [-1/3, -1/3], [0, -1/3], [1/3, -1/3],
  [-1/3,    0], [0,    0], [1/3,    0],
  [-1/3,  1/3], [0,  1/3], [1/3,  1/3],
];

/** Calculates tileIndex for multiple locations within a pixel. */
function getSubpixelTileIndices(x, y, tiles, tileIndex, nbrTileIndices) {
  const tile = tiles[tileIndex];
  return SUBPIXEL_OFFSETS.map(([dx, dy]) => {
    const subpixelX = x + dx;
    const subpixelY = y + dy;
    let closestTileIndex = tileIndex;
    let minDist = distance(subpixelX, subpixelY, tile.x, tile.y);
    for (let i = 0; i < nbrTileIndices.length; ++i) {
      const index = nbrTileIndices[i];
      const nbrTile = tiles[index];
      const dist = distance(subpixelX, subpixelY, nbrTile.x, nbrTile.y);
      if (dist < minDist) {
        minDist = dist;
        closestTileIndex = index;
      }
    }
    return closestTileIndex;
  });
}
