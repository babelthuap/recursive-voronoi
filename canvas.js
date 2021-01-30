// try to reuse a single instance for efficiency
let canvas;

/**
 * Creates a canvas element and returns a simple interface for drawing on it.
 */
export function createCanvas(width, height) {
  if (canvas && canvas.width === width && canvas.height === height) {
    return canvas;
  }
  console.time('createCanvas');
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  ctx.fillStyle = 'cyan';
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
     * Sets all the pixels in [leftIndex, rightIndex) to the given color. Does
     * not repaint the canvas.
     */
    setRow(leftIndex, rightIndex, rgb) {
      for (let i = (leftIndex << 2); i < (rightIndex << 2); i += 4) {
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    },
  };
}
