// Weighted ridge least squares, shared by the calibration scripts.
/** Weighted ridge least squares via normal equations. */
export function fit(X: number[][], y: number[], w: number[], ridge = 1e-6): number[] {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    const x = X[i];
    for (let a = 0; a < k; a++) {
      const wa = w[i] * x[a];
      if (wa === 0) continue;
      for (let b = 0; b < k; b++) A[a][b] += wa * x[b];
      A[a][k] += wa * y[i];
    }
  }
  for (let a = 1; a < k; a++) A[a][a] += ridge * X.length;
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c || A[c][c] === 0) continue;
      const m = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= m * A[c][j];
    }
  }
  return A.map((row, i) => (row[i] === 0 ? 0 : row[k] / row[i]));
}
