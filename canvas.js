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
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  console.timeEnd('createCanvas');

  const setPixel = (pixelIndex, rgb) => {
    const red = pixelIndex << 2;
    data[red] = rgb[0];
    data[red + 1] = rgb[1];
    data[red + 2] = rgb[2];
  };

  const setRowHorizontal = (leftIndex, rightIndex, rgb) => {
    for (let i = (leftIndex << 2); i < (rightIndex << 2) + 1; i += 4) {
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
    }
  };

  const nullFunction = () => {};

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
    /** Pass-through */
    toDataURL(...args) {
      return el.toDataURL(...args);
    },
    /**
     * Repaints the canvas, which will display any modifications made via
     * setPixel.
     */
    repaint() {
      ctx.putImageData(imageData, 0, 0);
    },
    /** Draws a circle. No need to repaint. */
    drawCircle(x, y, r, color = '#000') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    /** Gets the RGB hex value of the specified pixel. */
    getPixel(pixelIndex) {
      const red = pixelIndex << 2;
      return (data[red] << 16) | (data[red + 1] << 8) | data[red + 2];
    },
    /** Sets the given pixel to the given color. Does not repaint the canvas. */
    setPixel(pixelIndex, rgb) {
      setPixel(pixelIndex, rgb);
    },
    /**
     * Sets all the pixels in [leftIndex, rightIndex] to the given color. Does
     * not repaint the canvas.
     */
    setRowHorizontal(leftIndex, rightIndex, rgb) {
      setRowHorizontal(leftIndex, rightIndex, rgb);
    },
    /** Toggles the set* functions on or off. */
    togglePixelSetters(on) {
      if (on) {
        this.setPixel = setPixel;
        this.setRowHorizontal = setRowHorizontal;
      } else {
        this.setPixel = nullFunction;
        this.setRowHorizontal = nullFunction;
      }
    },
  };
}
