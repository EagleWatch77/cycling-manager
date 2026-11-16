/** Tiny OLS (normal equations, Gauss elimination) for the variance decomposition of career outcomes on the four hidden values. */
export function ols(X: number[][], y: number[]): { beta: number[]; r2: number } {
  const n = X.length, k = X[0].length + 1;
  const A: number[][] = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let r = 0; r < n; r++) {
    const row = [1, ...X[r]];
    for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += row[i] * row[j]; A[i][k] += row[i] * y[r]; }
  }
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    const d = A[i][i] || 1e-12;
    for (let j = i; j <= k; j++) A[i][j] /= d;
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i]; for (let j = i; j <= k; j++) A[r][j] -= f * A[i][j]; }
  }
  const beta = A.map((row) => row[k]);
  const my = y.reduce((s, v) => s + v, 0) / n;
  let ssT = 0, ssR = 0;
  for (let r = 0; r < n; r++) {
    const pred = beta[0] + X[r].reduce((s, v, i) => s + v * beta[i + 1], 0);
    ssT += (y[r] - my) ** 2; ssR += (y[r] - pred) ** 2;
  }
  return { beta, r2: ssT > 0 ? 1 - ssR / ssT : 0 };
}
