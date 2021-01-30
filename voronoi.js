import {createCanvas} from './canvas.js';
import {distance, rand} from './util.js';

// reuse these across renders to reduce garbage collection time
let pixelsArray, unsetId;

/** Draws a random Voronoi diagram. */
export function drawRandomVoronoiDiagram(
    numTiles, width = window.innerWidth, height = window.innerHeight,
    container = document.body) {
  console.log('');
  console.time('drawRandomVoronoiDiagram_' + numTiles);

  const tiles = placeTiles(numTiles, width, height);
  const canvas = createCanvas(width, height);
  const pixels = calculateAndRenderPixels(tiles, canvas);

  canvas.repaint();
  canvas.attachToDom(container);

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
      {allTiles: tiles, tiles, canvas, pixels},
      {minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1},
      /* recolor= */ true);
  canvas.repaint();
  console.timeEnd('recolor');
}

/** Places tile capitals randomly. */
function placeTiles(numTiles, width, height) {
  console.time('placeTiles');
  const tiles = new Array(numTiles);
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
    const color = Uint8ClampedArray.of(rand(256), rand(256), rand(256));
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

  // TODO: expanding circles

  // Divide and conquer!
  const state = {allTiles: tiles, tiles, canvas, pixels};
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
function renderRecursive(state, {minX, minY, maxX, maxY}, recolor = false) {
  const {allTiles, tiles, canvas, pixels} = state;
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;

  if (tiles.length === 1) {
    // this box is a solid color! we can stop recursing
    const color = tiles[0].color;
    const tileIndex = tiles[0].i;
    // stop one short on right and bottom because those boundaries are always
    // filled in already (see the getBoundaryTiles* functions)
    for (let y = minY; y < maxY; ++y) {
      const rowOffset = canvas.width * y;
      canvas.setRowHorizontal(minX + rowOffset, maxX + rowOffset, color);
      for (let pixelIndex = minX + rowOffset; pixelIndex < maxX + rowOffset;
           ++pixelIndex) {
        pixels[pixelIndex] = tileIndex;
      }
    }
    return;
  }

  if (boxWidth < MIN_SIZE || boxHeight < MIN_SIZE) {
    // fill in box; stop recursing
    if (recolor) {
      // pixels already known, just need to color
      for (let y = minY; y < maxY; ++y) {
        const rowOffset = canvas.width * y;
        for (let x = minX; x < maxX; ++x) {
          const pixelIndex = x + rowOffset;
          canvas.setPixel(pixelIndex, allTiles[pixels[pixelIndex]].color);
        }
      }
    } else {
      // pixels unknown; need to calculate
      for (let y = minY; y < maxY; ++y) {
        const rowOffset = canvas.width * y;
        for (let x = minX; x < maxX; ++x) {
          const pixelIndex = x + rowOffset;
          calculatePixel(x, y, pixelIndex, state);
        }
      }
    }
    return;
  }

  let sub1, sub2, tiles1, tiles2;
  if (boxWidth > boxHeight) {
    // CUT VERTICALLY
    const middleX = (minX + maxX) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: middleX, maxY: maxY};  // left half
    sub2 = {minX: middleX, minY: minY, maxX: maxX, maxY: maxY};  // right half
    // calculate middle boundary tiles
    const midBoundary =
        [...getBoundaryTilesVertical(middleX, minY, maxY, state)];
    // calculate boundary tiles for left half
    const leftHalfTiles = new Set(midBoundary);
    getBoundaryTilesVertical(minX, minY, maxY, state, leftHalfTiles);
    getBoundaryTilesHorizontal(minY, minX, middleX, state, leftHalfTiles);
    getBoundaryTilesHorizontal(maxY, minX, middleX, state, leftHalfTiles);
    addTilesFromBox(tiles, leftHalfTiles, sub1);
    tiles1 = [...leftHalfTiles].map(i => allTiles[i]);
    // calculate boundary tiles for right half
    const rightHalfTiles = new Set(midBoundary);
    getBoundaryTilesVertical(maxX, minY, maxY, state, rightHalfTiles);
    getBoundaryTilesHorizontal(minY, middleX, maxX, state, rightHalfTiles);
    getBoundaryTilesHorizontal(maxY, middleX, maxX, state, rightHalfTiles);
    addTilesFromBox(tiles, rightHalfTiles, sub2);
    tiles2 = [...rightHalfTiles].map(i => allTiles[i]);
  } else {
    // CUT HORIZONTALLY
    const middleY = (minY + maxY) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: maxX, maxY: middleY};  // top half
    sub2 = {minX: minX, minY: middleY, maxX: maxX, maxY: maxY};  // bottom half
    // calculate middle boundary tiles
    const midBoundary =
        [...getBoundaryTilesHorizontal(middleY, minX, maxX, state)];
    // calculate boundary tiles for top half
    const topHalfTiles = new Set(midBoundary);
    getBoundaryTilesHorizontal(minY, minX, maxX, state, topHalfTiles);
    getBoundaryTilesVertical(minX, minY, middleY, state, topHalfTiles);
    getBoundaryTilesVertical(maxX, minY, middleY, state, topHalfTiles);
    addTilesFromBox(tiles, topHalfTiles, sub1);
    tiles1 = [...topHalfTiles].map(i => allTiles[i]);
    // calculate boundary tiles for bottom half
    const bottomHalfTiles = new Set(midBoundary);
    getBoundaryTilesHorizontal(maxY, minX, maxX, state, bottomHalfTiles);
    getBoundaryTilesVertical(minX, middleY, maxY, state, bottomHalfTiles);
    getBoundaryTilesVertical(maxX, middleY, maxY, state, bottomHalfTiles);
    addTilesFromBox(tiles, bottomHalfTiles, sub2);
    tiles2 = [...bottomHalfTiles].map(i => allTiles[i]);
  }

  renderRecursive({allTiles, tiles: tiles1, canvas, pixels}, sub1, recolor);
  renderRecursive({allTiles, tiles: tiles2, canvas, pixels}, sub2, recolor);
}

/**
 * Adds to `boundaryTiles` the tileIndexes of all tiles that have at least one
 * pixel on the specified vertical line. Colors in previously unknown pixels.
 */
// TODO: binary search
function getBoundaryTilesVertical(
    x, minY, maxY, state, boundaryTiles = new Set()) {
  if (x === 0) {
    // don't do outermost left boundary
    return;
  }
  // cut off 1 pixel from the end because that will be handled by horizontal
  // boundaries
  const canvasWidth = state.canvas.width;
  for (let y = minY; y < maxY; ++y) {
    const pixelIndex = x + canvasWidth * y;
    const tileIndex = calculatePixel(x, y, pixelIndex, state);
    boundaryTiles.add(tileIndex);
  }
  return boundaryTiles;
}

/**
 * Adds to `boundaryTiles` the tileIndexes of all tiles that have at least one
 * pixel on the specified horizontal line. Colors in previously unknown pixels.
 */
function getBoundaryTilesHorizontal(
    y, minX, maxX, state, boundaryTiles = new Set()) {
  if (y === 0) {
    // don't do outermost top boundary - note that we will miss the top right
    // pixel, so we fill that in separately
    return;
  }
  const {allTiles, canvas, pixels} = state;
  const rowOffset = canvas.width * y;
  let left = minX;

  while (left <= maxX) {
    const leftTileIndex = calculatePixel(left, y, left + rowOffset, state);
    boundaryTiles.add(leftTileIndex);

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
    const color = allTiles[leftTileIndex].color;
    for (let pixelIndex = left + rowOffset; pixelIndex <= right + rowOffset;
         ++pixelIndex) {
      canvas.setPixel(pixelIndex, color);
      pixels[pixelIndex] = leftTileIndex;
    }

    left = right + 1;
  }
  return boundaryTiles;
}

/**
 * Adds to `tileSet` the tileIndexes from the subset of `tiles` whose capitals
 * are inside the given bounding box.
 */
function addTilesFromBox(tiles, tileSet, {minX, minY, maxX, maxY}) {
  for (const tile of tiles) {
    if (minX < tile.x && tile.x < maxX && minY < tile.y && tile.y < maxY) {
      tileSet.add(tile.i);
    }
  }
}

/**
 * Looks up or calculates (& stores) the pixel-to-tile mapping for a pixel.
 * Returns the tileIndex of the closest tile.
 */
function calculatePixel(x, y, pixelIndex, {tiles, canvas, pixels}) {
  let tileIndex = pixels[pixelIndex];
  if (tileIndex === unsetId) {
    const tile = findClosestTile(x, y, tiles);
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
