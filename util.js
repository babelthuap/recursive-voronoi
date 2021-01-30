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

/**
 * sorts a lattice of points by their distance from the origin, breaking ties by
 * comparing polar angles. the output array is of the form [x0, y0, x1, y1, ...]
 */
export const sortLattice = (radius) => {
  console.time('sort lattice');

  if (radius > 127) {
    radius = 127;
  }
  const maxDistance = distance(0, 0, 0, radius);
  const points = [];
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      const d = distance(0, 0, x, y);
      if (d < maxDistance) {
        points.push({x, y, d, q: quadrant(x, y)});
      }
    }
  }

  const sortedPoints = points.sort(compare);
  const sortedLatticeFlat = new Int8Array(sortedPoints.length << 1);
  for (let i = 0; i < sortedPoints.length; ++i) {
    const {x, y} = sortedPoints[i];
    sortedLatticeFlat[i << 1] = x;
    sortedLatticeFlat[(i << 1) + 1] = y;
  }

  function quadrant(x, y) {
    if (x > 0) {
      return y < 0 ? 4 : 1;
    } else {
      return y > 0 ? 2 : 3;
    }
  }

  function compare(A, B) {
    if (A.d === B.d) {
      if (A.q === B.q) {
        return A.y * B.x - B.y * A.x;
      } else {
        return A.q - B.q;
      }
    } else {
      return A.d - B.d;
    }
  }

  console.timeEnd('sort lattice');
  return sortedLatticeFlat;
};
