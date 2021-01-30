/** Returns a random integer in [0, n) */
export function rand(n) {
  return Math.floor(Math.random() * n);
}

/**
 * Returns the sqaure of the Euclidean distance between two points in R^2.
 * Sufficient for comparing distances.
 */
export function euclideanDist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}
