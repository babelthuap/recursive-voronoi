import {createCanvas} from './canvas.js';
import {distance, rand} from './util.js';

// reuse these across renders to reduce garbage collection time
let tilesArray, colorsArray, pixelsArray, unsetId;

/** Draws a random Voronoi diagram. */
export function drawRandomVoronoiDiagram(
    numTiles, width = window.innerWidth, height = window.innerHeight,
    container = document.body) {
  console.log('');
  console.time('drawRandomVoronoiDiagram_' + numTiles);

  const tiles = placeTiles(numTiles, width, height);
  const canvas = createCanvas(width, height);
  const pixels = calculateAndRenderPixels(tiles, canvas);

  // TODO: antialias

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
      {allTiles: tiles, tilesSubset: tiles, canvas, pixels},
      {minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1});
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
  const state = {allTiles: tiles, tilesSubset: tiles, canvas, pixels};
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

  if (tilesSubset.length === 1) {
    // this box is a solid color! we can stop recursing
    const color = tilesSubset[0].color;
    const tileIndex = tilesSubset[0].i;
    for (let y = minY; y < maxY; ++y) {
      const rowOffset = canvas.width * y;
      canvas.setRowHorizontal(minX + rowOffset, maxX + rowOffset, color);
    }
    return;
  }

  if (boxWidth < MIN_SIZE || boxHeight < MIN_SIZE) {
    // fill in box; stop recursing
    for (let y = minY; y < maxY; ++y) {
      const rowOffset = canvas.width * y;
      let left = minX;

      // fill in un-colored pixels: starting at left, search for the border with
      // next color in this row, then fill the pixels in between
      while (left < maxX) {
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
    const midBoundary =
        [...getBoundaryTilesVertical(middleX, minY, maxY, state)];
    // calculate boundary tiles for left half
    const leftHalfTileIndexes = new Set(midBoundary);
    getBoundaryTilesVertical(minX, minY, maxY, state, leftHalfTileIndexes);
    getBoundaryTilesHorizontal(minY, minX, middleX, state, leftHalfTileIndexes);
    getBoundaryTilesHorizontal(maxY, minX, middleX, state, leftHalfTileIndexes);
    addTilesFromBox(tilesSubset, leftHalfTileIndexes, sub1);
    tilesSubset1 = [...leftHalfTileIndexes].map(i => allTiles[i]);
    // calculate boundary tiles for right half
    const rightHalfTileIndexes = new Set(midBoundary);
    getBoundaryTilesVertical(maxX, minY, maxY, state, rightHalfTileIndexes);
    getBoundaryTilesHorizontal(
        minY, middleX, maxX, state, rightHalfTileIndexes);
    getBoundaryTilesHorizontal(
        maxY, middleX, maxX, state, rightHalfTileIndexes);
    addTilesFromBox(tilesSubset, rightHalfTileIndexes, sub2);
    tilesSubset2 = [...rightHalfTileIndexes].map(i => allTiles[i]);
  } else {
    // CUT HORIZONTALLY
    const middleY = (minY + maxY) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: maxX, maxY: middleY};  // top half
    sub2 = {minX: minX, minY: middleY, maxX: maxX, maxY: maxY};  // bottom half
    // calculate middle boundary tiles
    const midBoundary =
        [...getBoundaryTilesHorizontal(middleY, minX, maxX, state)];
    // calculate boundary tiles for top half
    const topHalfTileIndexes = new Set(midBoundary);
    getBoundaryTilesHorizontal(minY, minX, maxX, state, topHalfTileIndexes);
    getBoundaryTilesVertical(minX, minY, middleY, state, topHalfTileIndexes);
    getBoundaryTilesVertical(maxX, minY, middleY, state, topHalfTileIndexes);
    addTilesFromBox(tilesSubset, topHalfTileIndexes, sub1);
    tilesSubset1 = [...topHalfTileIndexes].map(i => allTiles[i]);
    // calculate boundary tiles for bottom half
    const bottomHalfTileIndexes = new Set(midBoundary);
    getBoundaryTilesHorizontal(maxY, minX, maxX, state, bottomHalfTileIndexes);
    getBoundaryTilesVertical(minX, middleY, maxY, state, bottomHalfTileIndexes);
    getBoundaryTilesVertical(maxX, middleY, maxY, state, bottomHalfTileIndexes);
    addTilesFromBox(tilesSubset, bottomHalfTileIndexes, sub2);
    tilesSubset2 = [...bottomHalfTileIndexes].map(i => allTiles[i]);
  }

  renderRecursive({allTiles, tilesSubset: tilesSubset1, canvas, pixels}, sub1);
  renderRecursive({allTiles, tilesSubset: tilesSubset2, canvas, pixels}, sub2);
}

/**
 * Adds to `boundaryTiles` the tileIndexes of all tiles that have at least one
 * pixel on the specified vertical line. Colors in previously unknown pixels.
 */
function getBoundaryTilesVertical(
    x, minY, maxY, state, boundaryTiles = new Set()) {
  if (x === 0) {
    // don't do outermost left boundary
    return;
  }
  const {canvas, pixels} = state;
  const width = canvas.width;
  let top = minY;

  // cut off 1 pixel from the end because that will be handled by horizontal
  // boundaries
  while (top < maxY) {
    const topTileIndex = calculatePixel(x, top, x + width * top, state);
    boundaryTiles.add(topTileIndex);

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
  if (y === 0) {
    // don't do outermost top boundary
    return;
  }
  const {allTiles, canvas, pixels} = state;
  const rowOffset = canvas.width * y;
  let left = minX;

  while (left <= maxX) {
    const leftPixelIndex = left + rowOffset;
    const leftTileIndex = calculatePixel(left, y, leftPixelIndex, state);
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
    canvas.setRowHorizontal(leftPixelIndex, rightPixelIndex, color);

    left = right + 1;
  }
  return boundaryTiles;
}

/**
 * Adds to `tileIndexSet` the tileIndexes from the subset of `tiles` whose
 * capitals are inside the given bounding box.
 */
function addTilesFromBox(tiles, tileIndexSet, {minX, minY, maxX, maxY}) {
  // TODO: store capitals in a tree for faster retrieval
  for (const tile of tiles) {
    if (minX < tile.x && tile.x < maxX && minY < tile.y && tile.y < maxY) {
      tileIndexSet.add(tile.i);
    }
  }
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
