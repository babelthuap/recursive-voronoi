// reuse these across renders to reduce garbage collection time
let canvas, pixels, unsetId;

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
  renderTiles(tiles, canvas, pixels);
  canvas.repaint();
  console.timeEnd('recolor');
}

/** Places tile capitols randomly. */
function placeTiles(numTiles, width, height) {
  console.time('placeTiles');
  const tiles = new Array(numTiles);
  const capitols = new Set();
  for (let i = 0; i < numTiles; ++i) {
    let x = rand(width);
    let y = rand(height);
    let pixelIndex = x + width * y;
    while (capitols.has(pixelIndex)) {
      x = rand(width);
      y = rand(height);
      pixelIndex = x + width * y;
    }
    capitols.add(pixelIndex);
    const color = Uint8ClampedArray.of(rand(256), rand(256), rand(256));
    tiles[i] = {i, x, y, color};
  }
  console.timeEnd('placeTiles');
  return tiles;
}

/** Returns a random integer in [0, n) */
function rand(n) {
  return Math.floor(Math.random() * n);
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
  if (pixels === undefined || pixels.length !== width * height ||
      (tiles.length >= 0xff && pixels.BYTES_PER_ELEMENT === 1)) {
    pixels = tiles.length < 0xff ? new Uint8Array(width * height) :
                                   new Uint16Array(width * height);
  }
  unsetId = tiles.length < 0xff ? 0xff : 0xffff;
  pixels.fill(unsetId);
  // Divide and conquer!
  const state = {tiles, canvas, pixels};
  renderRecursive(
      /* allTiles= */ tiles, state,
      {minX: 0, minY: 0, maxX: width - 1, maxY: height - 1});
  console.timeEnd('calculateAndRenderPixels');
  return pixels;
}

// TODO: set this based on numTiles
const MIN_SIZE = 64;

function renderRecursive(allTiles, state, {minX, minY, maxX, maxY}) {
  const {tiles, canvas, pixels} = state;
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;

  if (tiles.length === 1) {
    // this box is a solid color!
    const color = tiles[0].color;
    const tileIndex = tiles[0].i;
    for (let y = minY + 1; y < maxY; ++y) {
      const rowOffset = canvas.width * y;
      canvas.setRow(minX + rowOffset + 1, maxX + rowOffset - 1, color);
      for (let pixelIndex = minX + rowOffset + 1; pixelIndex < maxX + rowOffset;
           ++pixelIndex) {
        pixels[pixelIndex] = tileIndex;
      }
    }
    return;
  }
  if (boxWidth < MIN_SIZE || boxHeight < MIN_SIZE) {
    // fill in box; stop recursing
    for (let y = minY + 1; y < maxY; ++y) {
      const rowOffset = canvas.width * y;
      for (let x = minX + 1; x < maxX; ++x) {
        const pixelIndex = x + rowOffset;
        calculatePixel(x, y, pixelIndex, state);
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
    // calculate middle border tiles
    const midBorder = [...getBorderTilesVertical(middleX, minY, maxY, state)];
    // calculate borders tiles for left half
    const leftHalfTiles = new Set(midBorder);
    getBorderTilesVertical(minX, minY, maxY, state, leftHalfTiles);
    getBorderTilesHorizontal(minY, minX, middleX, state, leftHalfTiles);
    getBorderTilesHorizontal(maxY, minX, middleX, state, leftHalfTiles);
    addTilesFromBox(tiles, leftHalfTiles, sub1);
    tiles1 = [...leftHalfTiles].map(i => allTiles[i]);
    // calculate borders tiles for right half
    const rightHalfTiles = new Set(midBorder);
    getBorderTilesVertical(maxX, minY, maxY, state, rightHalfTiles);
    getBorderTilesHorizontal(minY, middleX, maxX, state, rightHalfTiles);
    getBorderTilesHorizontal(maxY, middleX, maxX, state, rightHalfTiles);
    addTilesFromBox(tiles, rightHalfTiles, sub2);
    tiles2 = [...rightHalfTiles].map(i => allTiles[i]);

  } else {
    // CUT HORIZONTALLY
    const middleY = (minY + maxY) >> 1;
    sub1 = {minX: minX, minY: minY, maxX: maxX, maxY: middleY};  // top half
    sub2 = {minX: minX, minY: middleY, maxX: maxX, maxY: maxY};  // bottom half
    // calculate middle border tiles
    const midBorder = [...getBorderTilesHorizontal(middleY, minX, maxX, state)];
    // calculate borders tiles for top half
    const topHalfTiles = new Set(midBorder);
    getBorderTilesHorizontal(minY, minX, maxX, state, topHalfTiles);
    getBorderTilesVertical(minX, minY, middleY, state, topHalfTiles);
    getBorderTilesVertical(maxX, minY, middleY, state, topHalfTiles);
    addTilesFromBox(tiles, topHalfTiles, sub1);
    tiles1 = [...topHalfTiles].map(i => allTiles[i]);
    // calculate borders tiles for bottom half
    const bottomHalfTiles = new Set(midBorder);
    getBorderTilesHorizontal(maxY, minX, maxX, state, bottomHalfTiles);
    getBorderTilesVertical(minX, middleY, maxY, state, bottomHalfTiles);
    getBorderTilesVertical(maxX, middleY, maxY, state, bottomHalfTiles);
    addTilesFromBox(tiles, bottomHalfTiles, sub2);
    tiles2 = [...bottomHalfTiles].map(i => allTiles[i]);

  }
  renderRecursive(allTiles, {tiles: tiles1, canvas, pixels}, sub1);
  renderRecursive(allTiles, {tiles: tiles2, canvas, pixels}, sub2);
}

function getBorderTilesVertical(x, minY, maxY, state, borderTiles = new Set()) {
  // cut off 1 pixel on either end b/c it will be handled by horizontal borders
  const canvasWidth = state.canvas.width;
  for (let y = minY + 1; y < maxY; ++y) {
    const pixelIndex = x + canvasWidth * y;
    const tileIndex = calculatePixel(x, y, pixelIndex, state);
    borderTiles.add(tileIndex);
  }
  return borderTiles;
}

function getBorderTilesHorizontal(
    y, minX, maxX, state, borderTiles = new Set()) {
  const rowOffset = state.canvas.width * y;
  for (let x = minX; x <= maxX; ++x) {
    const pixelIndex = x + rowOffset;
    const tileIndex = calculatePixel(x, y, pixelIndex, state);
    borderTiles.add(tileIndex);
  }
  return borderTiles;
}

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
    const dist = euclideanDist(x, y, tile.x, tile.y);
    if (dist < minDist) {
      minDist = dist;
      closestTile = tile;
    }
  }
  return closestTile;
}

/**
 * Returns the sqaure of the Euclidean distance between two points in R^2.
 * Sufficient for comparing distances.
 */
function euclideanDist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

/**
 * Creates a canvas element and returns a simple interface for drawing on it.
 */
function createCanvas(width, height) {
  if (canvas && canvas.width === width && canvas.height === height) {
    return canvas;
  }
  console.time('createCanvas');
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  console.timeEnd('createCanvas');
  return canvas = {
    /** Returns the width of this canvas in pixels. */
    get width() {
      return width;
    },
    /** Returns the height of this canvas in pixels. */
    get height() {
      return height;
    },
    /**
     * Removes any other elements from the given container and attaches this
     * canvas instead.
     */
    attachToDom(container) {
      if (container.children[0] !== el) {
        [...container.children].forEach(child => child.remove());
        container.appendChild(el);
      }
    },
    /**
     * Repaints the canvas, which will display any modifications made via
     * setPixel.
     */
    repaint() {
      ctx.putImageData(imageData, 0, 0);
    },
    /** Sets the given pixel to the given color. Does not repaint the canvas. */
    setPixel(pixelIndex, rgb) {
      const red = pixelIndex << 2;
      data[red] = rgb[0];
      data[red + 1] = rgb[1];
      data[red + 2] = rgb[2];
    },
    /**
     * Sets all the pixels between the given indices (inclusive) to the given
     * color. Does not repaint the canvas.
     */
    setRow(leftIndex, rightIndex, rgb) {
      for (let i = (leftIndex << 2); i < (rightIndex << 2) + 1; i += 4) {
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    },
  };
}

/**
 * Renders a list of tiles onto a Canvas given a pixelIndex-to-tileIndex map.
 */
function renderTiles(tiles, canvas, pixels) {
  console.time('renderTiles');
  for (let pixelIndex = 0; pixelIndex < canvas.width * canvas.height;
       ++pixelIndex) {
    const tileIndex = pixels[pixelIndex];
    canvas.setPixel(pixelIndex, tiles[tileIndex].color);
  }
  console.timeEnd('renderTiles');
}
