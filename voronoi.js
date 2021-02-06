import {renderAntialiasedBorders} from './antialias.js';
import {createCanvas} from './canvas.js';
import {distance, loadImagePixelData, rand} from './util.js';

// reuse these across renders to reduce garbage collection time
let tilesArray, pixelsArray, unsetId;

/** Draws a random Voronoi diagram. */
export async function drawRandomVoronoiDiagram({
  antialias = true,
  container = document.body,
  displayCapitals = false,
  imageUrl = null,
  numTiles,
  width = window.innerWidth,
  height = window.innerHeight,
}) {
  console.log('');
  console.time('drawRandomVoronoiDiagram_' + numTiles);

  const hasImageUrl = !!imageUrl;
  const tiles = placeTiles(numTiles, width, height, hasImageUrl);
  const canvas = createCanvas(width, height);
  if (hasImageUrl) {
    canvas.togglePixelSetters(false);
  }
  const pixels = calculateAndRenderPixels(tiles, canvas);
  if (hasImageUrl) {
    canvas.togglePixelSetters(true);
  }
  canvas.attachToDom(container);

  const state = {tiles, canvas, pixels};
  if (imageUrl) {
    await renderImage(state, {antialias, displayCapitals, imageUrl});
  } else {
    await postprocess(state, {antialias, displayCapitals, imageUrl});
  }

  console.timeEnd('drawRandomVoronoiDiagram_' + numTiles);
  return state;
}

/** Reassigns random colors to each tile and then re-renders. */
export async function recolor(state, options) {
  console.time('recolor');
  options.imageUrl = null;
  for (const tile of state.tiles) {
    tile.color[0] = rand(256);
    tile.color[1] = rand(256);
    tile.color[2] = rand(256);
  }
  await rerender(state, options);
  console.timeEnd('recolor');
}

/** Rerenders given an existing state. */
export async function rerender(state, options) {
  const {tiles, canvas, pixels} = state;
  renderRecursive(
      {allTiles: tiles, tilesSubset: tiles, canvas, pixels},
      {minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1});
  if (options.imageUrl) {
    await renderImage(state, options);
  } else {
    await postprocess(state, options);
  }
}

/**
 * After a render, repaints canvas then optionally antialiases and displays
 * tile capitals.
 */
function postprocess(state, {antialias, displayCapitals}) {
  state.canvas.repaint();
  if (displayCapitals) {
    drawCapitals(state);
  }
  if (antialias) {
    return new Promise(resolve => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          renderAntialiasedBorders(state);
          state.canvas.repaint();
          if (displayCapitals) {
            drawCapitals(state);
          }
          resolve();
        });
      }, 0);
    });
  } else {
    return Promise.resolve();
  }
}

/** Draws a dot to represent each capital. */
function drawCapitals({tiles, canvas}) {
  for (let i = 0; i < tiles.length; ++i) {
    const tile = tiles[i];
    if (relativeLuminance(tile.color) > 1275000 /* 50% luminance */) {
      canvas.drawCircle(tile.x, tile.y, /* r= */ 5, '#000');
    } else {
      canvas.drawCircle(tile.x, tile.y, /* r= */ 5, '#fff');
    }
  }
}

/** Returns relative luminance scaled to [0, 2550000] */
function relativeLuminance(color) {
  // see https://en.wikipedia.org/wiki/Relative_luminance
  return 2126 * color[0] + 7152 * color[1] + 722 * color[2];
}

/** Recolors tiles to approximate the given image. */
function renderImage(state, options) {
  console.time('renderImage');

  const {tiles, canvas, pixels} = state;
  const width = canvas.width;
  const height = canvas.height;

  return loadImagePixelData(options.imageUrl, width, height)
      .then(async (imgPixelData) => {
        // determine new tile colors by averaging the image color over each
        // tile
        const newTileColors = tiles.map(tile => {
          return {count: 0, rgb: new Uint32Array(3)};
        });
        for (let pixelIndex = 0; pixelIndex < pixels.length; ++pixelIndex) {
          const tileIndex = pixels[pixelIndex];
          const newColor = newTileColors[tileIndex];
          newColor.count += 1;
          const imgR = pixelIndex << 2;
          newColor.rgb[0] += imgPixelData[imgR];
          newColor.rgb[1] += imgPixelData[imgR + 1];
          newColor.rgb[2] += imgPixelData[imgR + 2];
        }

        // recolor
        for (let tileIndex = 0; tileIndex < tiles.length; ++tileIndex) {
          const tile = tiles[tileIndex];
          const newColor = newTileColors[tileIndex];
          tile.color[0] = newColor.rgb[0] / newColor.count;
          tile.color[1] = newColor.rgb[1] / newColor.count;
          tile.color[2] = newColor.rgb[2] / newColor.count;
        }

        // re-render
        renderRecursive(
            {allTiles: tiles, tilesSubset: tiles, canvas, pixels},
            {minX: 0, minY: 0, maxX: width - 1, maxY: height - 1});
        console.timeEnd('renderImage');

        return postprocess(state, options);
      });
}

/** Places tile capitals randomly. */
function placeTiles(numTiles, width, height, hasImageUrl) {
  console.time('placeTiles');

  if (!tilesArray) {
    tilesArray = new Array(numTiles);
  } else if (tilesArray.length !== numTiles) {
    tilesArray.length = numTiles;
  }
  const tiles = tilesArray;

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
    const color = hasImageUrl ?
        new Uint8ClampedArray(3) :
        crypto.getRandomValues(new Uint8ClampedArray(3));
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
      getRequiredBytes(tiles.length) !== pixelsArray.BYTES_PER_ELEMENT) {
    pixelsArray = createPixelsArray(tiles.length, width * height);
  }
  unsetId = getUnsetId(pixelsArray);
  const pixels = pixelsArray.fill(unsetId);

  // seed pixels array by marking each capital; this helps when numTiles is
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

function getRequiredBytes(numTiles) {
  if (numTiles < 2 ** 8) {
    return 1;
  } else {
    return numTiles < 2 ** 16 ? 2 : 4;
  }
}

function createPixelsArray(numTiles, numPixels) {
  switch (getRequiredBytes(numTiles)) {
    case 1: return new Uint8Array(numPixels);
    case 2: return new Uint16Array(numPixels);
    case 4: return new Uint32Array(numPixels);
  }
}

function getUnsetId(pixelsArray) {
  switch (pixelsArray.BYTES_PER_ELEMENT) {
    case 1: return 0xff;
    case 2: return 0xffff;
    case 4: return 0xffffffff;
  }
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
 * Splits tilesSubset into left and right subsets based on their capitals'
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
 * Splits tilesSubset into top and bottom subsets based on their capitals'
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
    const leftTileIndex = calculatePixel(left, y, left + rowOffset, state);
    boundaryTiles.add(allTiles[leftTileIndex]);

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
