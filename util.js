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
