import {createCanvas} from './canvas.js';
import {averageSubpixels, distance, rand} from './util.js';

// reuse these across renders to reduce garbage collection time
let tilesArray, colorsArray, pixelsArray, unsetId;

let borderPixels;
let bordersKnown = false;

/** Draws a random Voronoi diagram. */
export function drawRandomVoronoiDiagram(
    numTiles, antialias = true, width = window.innerWidth,
    height = window.innerHeight, container = document.body) {
  console.log('');
  console.time('drawRandomVoronoiDiagram_' + numTiles);

  const tiles = placeTiles(numTiles, width, height);
  const canvas = createCanvas(width, height);
  const pixels = calculateAndRenderPixels(tiles, canvas);

  canvas.repaint();
  canvas.attachToDom(container);

  if (antialias) {
    setTimeout(() => {
      requestAnimationFrame(() => {
        console.time('antialias');
        bordersKnown = false;
        renderAntialiasedBorders(tiles, canvas, pixels);
        canvas.repaint();
        console.timeEnd('antialias');
      });
    }, 0);
  }

  console.timeEnd('drawRandomVoronoiDiagram_' + numTiles);
  return {tiles, canvas, pixels};
}

/** Reassigns random colors to each tile and then re-renders. */
export function recolor({tiles, canvas, pixels}) {
  console.time('recolor');
  for (const tile of tiles) {
    tile.color[0] = rand(256);
    tile.color[1] = rand(256);
    tile.color[2] = rand(256);
  }
  renderRecursive(
      {allTiles: tiles, tilesSubset: tiles, canvas, pixels},
      {minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1});
  renderAntialiasedBorders(tiles, canvas, pixels);
  canvas.repaint();
  canvas.repaint();
  console.timeEnd('recolor');
}

/** Places tile capitals randomly. */
function placeTiles(numTiles, width, height) {
  console.time('placeTiles');

  if (!tilesArray) {
    tilesArray = new Array(numTiles);
  } else if (tilesArray.length !== numTiles) {
    tilesArray.length === numTiles;
  }
  const tiles = tilesArray;

  if (!colorsArray || colorsArray.length !== 3 * numTiles) {
    colorsArray = new Uint8ClampedArray(3 * numTiles);
  }
  const randColors = crypto.getRandomValues(colorsArray);

  const capitals = new Set();
  for (let i = 0; i < numTiles; ++i) {
    let x = rand(width);
    let y = rand(height);
    let pixelIndex = x + width * y;
    while (capitals.has(pixelIndex)) {
      x = rand(width);
      y = rand(height);
      pixelIndex = x + width * y;
    }
    capitals.add(pixelIndex);
    const color = randColors.subarray(3 * i, 3 * (i + 1));
    tiles[i] = {i, x, y, color};
  }

  console.timeEnd('placeTiles');
  return tiles;
}

/**
 * Assigns a tile to every pixel, creating a map from pixelIndex to tileIndex,
 * while simultaneously coloring in those pixels.
 */
function calculateAndRenderPixels(tiles, canvas) {
  console.time('calculateAndRenderPixels');
  const width = canvas.width;
  const height = canvas.height;
  // Reset the pixels array
  if (pixelsArray === undefined || pixelsArray.length !== width * height ||
      (tiles.length >= 0xff && pixelsArray.BYTES_PER_ELEMENT === 1)) {
    pixelsArray = tiles.length < 0xff ? new Uint8Array(width * height) :
                                        new Uint16Array(width * height);
  }
  unsetId = tiles.length < 0xff ? 0xff : 0xffff;
  const pixels = pixelsArray.fill(unsetId);

  // seed pixels array by marking each capitol; this helps when numTiles is
  // extremely large
  for (let tileIndex = 0; tileIndex < tiles.length; ++tileIndex) {
    const tile = tiles[tileIndex];
    pixels[tile.x + width * tile.y] = tileIndex;
  }

  // Divide and conquer!
  const state = {allTiles: tiles, tilesSubset: new Set(tiles), canvas, pixels};
  renderRecursive(state, {minX: 0, minY: 0, maxX: width - 1, maxY: height - 1});
  console.timeEnd('calculateAndRenderPixels');
  return pixels;
}

// TODO: optimize this for various combinations of parameters
const MIN_SIZE = 16;

/**
 * Render the given box by cutting it in half and recursively rendering each
 * half. This is effective because we know that the possible colors (i.e. tiles)
 * within any box are only:
 *   - the colors of the capitals in that box
 *   - PLUS the colors on the box's boundary.
 * This allows us to render each sub-box with fewer possible colors, speeding up
 * the render immensely.
 *
 * We stop recursing once the box contains only one color, or the box is smaller
 * than MIN_SIZE (determined empirically).
 */
function renderRecursive(state, {minX, minY, maxX, maxY}) {
  const {allTiles, tilesSubset, canvas, pixels} = state;
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;

  if (tilesSubset.size === 1) {
    // this box is a solid color! we can stop recursing
    const tile = tilesSubset.values().next().value;
    const color = tile.color;
    for (let y = minY; y <= maxY; ++y) {
      const rowOffset = canvas.width * y;
      canvas.setRowHorizontal(minX + rowOffset, maxX + rowOffset, color);
      for (let pixelIndex = minX + rowOffset; pixelIndex <= maxX + rowOffset;
           ++pixelIndex) {
        pixels[pixelIndex] = tile.i;
      }
    }
    return;
  }

  if (boxWidth < MIN_SIZE || boxHeight < MIN_SIZE) {
    // fill in box; stop recursing
    for (let y = minY; y <= maxY; ++y) {
      const rowOffset = canvas.width * y;
      let left = minX;

      // fill in un-colored pixels: starting at left, search for the border with
      // next color in this row, then fill the pixels in between
      while (left <= maxX) {
        const leftPixelIndex = left + rowOffset;
        const leftTileIndex = calculatePixel(left, y, leftPixelIndex, state);
        let right = maxX;
        let rightPixelIndex = right + rowOffset;
        if (calculatePixel(right, y, rightPixelIndex, state) !==
            leftTileIndex) {
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
          } while (calculatePixel(right, y, rightPixelIndex, state) !==
                       leftTileIndex ||
                   calculatePixel(right + 1, y, rightPixelIndex + 1, state) ===
                       leftTileIndex);
        }

        // fill line of same-color pixels
        const color = allTiles[leftTileIndex].color;
        canvas.setRowHorizontal(leftPixelIndex, rightPixelIndex, color);
        for (let pixelIndex = leftPixelIndex; pixelIndex <= rightPixelIndex;
             ++pixelIndex) {
          pixels[pixelIndex] = leftTileIndex;
        }

        left = right + 1;
      }
    }
    return;
  }

  let sub1, sub2, tilesSubset1, tilesSubset2;
  if (boxWidth > boxHeight) {
    // CUT VERTICALLY
    const middleX = (minX + maxX) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: middleX, maxY: maxY};  // left half
    sub2 = {minX: middleX, minY: minY, maxX: maxX, maxY: maxY};  // right half
    // calculate middle boundary tiles
    const midBoundary = getBoundaryTilesVertical(middleX, minY, maxY, state);
    // split tiles into left and right subsets
    [tilesSubset1, tilesSubset2] =
        splitTilesSubsetVertical(tilesSubset, middleX);
    // calculate boundary tiles for left half
    getBoundaryTilesVertical(minX, minY, maxY, state, tilesSubset1);
    getBoundaryTilesHorizontal(minY, minX, middleX, state, tilesSubset1);
    getBoundaryTilesHorizontal(maxY, minX, middleX, state, tilesSubset1);
    for (const tile of midBoundary) {
      tilesSubset1.add(tile);
    }
    // calculate boundary tiles for right half
    getBoundaryTilesVertical(maxX, minY, maxY, state, tilesSubset2);
    getBoundaryTilesHorizontal(minY, middleX, maxX, state, tilesSubset2);
    getBoundaryTilesHorizontal(maxY, middleX, maxX, state, tilesSubset2);
    for (const tile of midBoundary) {
      tilesSubset2.add(tile);
    }
  } else {
    // CUT HORIZONTALLY
    const middleY = (minY + maxY) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: maxX, maxY: middleY};  // top half
    sub2 = {minX: minX, minY: middleY, maxX: maxX, maxY: maxY};  // bottom half
    // calculate middle boundary tiles
    const midBoundary = getBoundaryTilesHorizontal(middleY, minX, maxX, state);
    // split tiles into top and bottom subsets
    [tilesSubset1, tilesSubset2] =
        splitTilesSubsetHorizontal(tilesSubset, middleY);
    // calculate boundary tiles for top half
    getBoundaryTilesHorizontal(minY, minX, maxX, state, tilesSubset1);
    getBoundaryTilesVertical(minX, minY, middleY, state, tilesSubset1);
    getBoundaryTilesVertical(maxX, minY, middleY, state, tilesSubset1);
    for (const tile of midBoundary) {
      tilesSubset1.add(tile);
    }
    // calculate boundary tiles for bottom half
    getBoundaryTilesHorizontal(maxY, minX, maxX, state, tilesSubset2);
    getBoundaryTilesVertical(minX, middleY, maxY, state, tilesSubset2);
    getBoundaryTilesVertical(maxX, middleY, maxY, state, tilesSubset2);
    for (const tile of midBoundary) {
      tilesSubset2.add(tile);
    }
  }

  renderRecursive({allTiles, tilesSubset: tilesSubset1, canvas, pixels}, sub1);
  renderRecursive({allTiles, tilesSubset: tilesSubset2, canvas, pixels}, sub2);
}

/**
 * Splits tilesSubset into left and right subsets based on their capitols'
 * coordinates.
 */
function splitTilesSubsetVertical(tilesSubset, middleX) {
  const leftTilesSubset = new Set();
  const rightTilesSubset = new Set();
  for (const tile of tilesSubset) {
    if (tile.x < middleX) {
      leftTilesSubset.add(tile);
    } else {
      rightTilesSubset.add(tile);
    }
  }
  return [leftTilesSubset, rightTilesSubset];
}

/**
 * Splits tilesSubset into top and bottom subsets based on their capitols'
 * coordinates.
 */
function splitTilesSubsetHorizontal(tilesSubset, middleY) {
  const topTilesSubset = new Set();
  const bottomTilesSubset = new Set();
  for (const tile of tilesSubset) {
    if (tile.y < middleY) {
      topTilesSubset.add(tile);
    } else {
      bottomTilesSubset.add(tile);
    }
  }
  return [topTilesSubset, bottomTilesSubset];
}

/**
 * Adds to `boundaryTiles` the tileIndexes of all tiles that have at least one
 * pixel on the specified vertical line. Colors in previously unknown pixels.
 */
function getBoundaryTilesVertical(
    x, minY, maxY, state, boundaryTiles = new Set()) {
  const {allTiles, canvas, pixels} = state;
  const width = canvas.width;

  let top = minY;
  while (top <= maxY) {
    const topTileIndex = calculatePixel(x, top, x + width * top, state);
    boundaryTiles.add(allTiles[topTileIndex]);

    // fill in un-colored pixels: starting at top, search for the border with
    // next color in this row, then fill the pixels in between
    let bottom = maxY;
    let bottomPixelIndex = x + width * bottom;
    if (calculatePixel(x, bottom, bottomPixelIndex, state) !== topTileIndex) {
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
      } while (
          calculatePixel(x, bottom, bottomPixelIndex, state) !== topTileIndex ||
          calculatePixel(x, bottom + 1, bottomPixelIndex + width, state) ===
              topTileIndex);
    }

    top = bottom + 1;
  }
  return boundaryTiles;
}

/**
 * Adds to `boundaryTiles` the tileIndexes of all tiles that have at least one
 * pixel on the specified horizontal line. Colors in previously unknown pixels.
 */
function getBoundaryTilesHorizontal(
    y, minX, maxX, state, boundaryTiles = new Set()) {
  const {allTiles, canvas, pixels} = state;
  const rowOffset = canvas.width * y;
  let left = minX;

  while (left <= maxX) {
    const leftPixelIndex = left + rowOffset;
    const leftTileIndex = calculatePixel(left, y, leftPixelIndex, state);
    const leftTile = allTiles[leftTileIndex];
    boundaryTiles.add(leftTile);

    // fill in un-colored pixels: starting at left, search for the border with
    // next color in this row, then fill the pixels in between
    let right = maxX;
    let rightPixelIndex = right + rowOffset;
    if (calculatePixel(right, y, rightPixelIndex, state) !== leftTileIndex) {
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
      } while (calculatePixel(right, y, rightPixelIndex, state) !==
                   leftTileIndex ||
               calculatePixel(right + 1, y, rightPixelIndex + 1, state) ===
                   leftTileIndex);
    }

    // fill line of same-color pixels
    canvas.setRowHorizontal(leftPixelIndex, rightPixelIndex, leftTile.color);
    for (let pixelIndex = leftPixelIndex; pixelIndex <= rightPixelIndex;
         ++pixelIndex) {
      pixels[pixelIndex] = leftTileIndex;
    }

    left = right + 1;
  }
  return boundaryTiles;
}

/**
 * Looks up or calculates (& stores) the pixel-to-tile mapping for a pixel.
 * Returns the tileIndex of the closest tile.
 */
function calculatePixel(x, y, pixelIndex, {tilesSubset, canvas, pixels}) {
  let tileIndex = pixels[pixelIndex];
  if (tileIndex === unsetId) {
    const tile = findClosestTile(x, y, tilesSubset);
    canvas.setPixel(pixelIndex, tile.color);
    pixels[pixelIndex] = tile.i;
    return tile.i;
  }
  return tileIndex;
}

/** Finds the closest tile to a given point. */
function findClosestTile(x, y, tiles) {
  let closestTile;
  let minDist = Infinity;
  for (const tile of tiles) {
    const dist = distance(x, y, tile.x, tile.y);
    if (dist < minDist) {
      minDist = dist;
      closestTile = tile;
    }
  }
  return closestTile;
}

/** Antialiases borders. */
function renderAntialiasedBorders(tiles, canvas, pixels) {
  if (bordersKnown) {
    for (let y = 0; y < canvas.height; ++y) {
      const rowOffset = canvas.width * y;
      for (let x = 0; x < canvas.width; ++x) {
        const subpixels = borderPixels[y][x];
        if (subpixels !== undefined) {
          canvas.setPixel(x + rowOffset, averageSubpixels(subpixels, tiles));
        }
      }
    }
  } else {
    // borders unknown - so we must calculate them
    calculateNbrTileIndexes(canvas, pixels);
    for (let y = 0; y < canvas.height; ++y) {
      for (let x = 0; x < canvas.width; ++x) {
        // determine the tiles to which each neighbor pixel belongs
        const nbrTileIndices = borderPixels[y][x];
        // if this is a border pixel, then sample subpixels
        if (nbrTileIndices !== undefined) {
          const pixelIndex = x + canvas.width * y;
          const subpixels = getSubpixelTileIndices(
              x, y, tiles, pixels[pixelIndex], nbrTileIndices);
          // NOTE: this changes the definition of borderPixels - we now have
          // borderPixels[y][x] = array of subpixel tileIndexes
          borderPixels[y][x] = subpixels;
          canvas.setPixel(pixelIndex, averageSubpixels(subpixels, tiles));
        }
      }
    }

    bordersKnown = true;
  }
}

/** Adds an element to an array if it's not already present. */
const add = (arr, e) => {
  if (!arr.includes(e)) {
    arr.push(e);
  }
  return arr;
};

/**
 * Initializes borderPixels. Sets borderPixels[y][x] = array of neighboring tile
 * indexes, or empty if all neighbors belong to the same tile.
 */
function calculateNbrTileIndexes(canvas, pixels) {
  if (borderPixels === undefined) {
    borderPixels = new Array(canvas.height);
  }
  const width = canvas.width;
  const height = canvas.height;
  // search for borders row by row
  for (let y = 0; y < height; ++y) {
    borderPixels[y] = new Array(width);
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
      borderPixels[y][right] =
          add(borderPixels[y][right] || [], pixels[rightPixelIndex + 1]);
      borderPixels[y][right + 1] = [pixels[rightPixelIndex]];
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
      borderPixels[bottom][x] =
          add(borderPixels[bottom][x] || [], pixels[bottomPixelIndex + width]);
      borderPixels[bottom + 1][x] =
          add(borderPixels[bottom + 1][x] || [], pixels[bottomPixelIndex]);
      top = bottom + 1;
    }
  }
}

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
