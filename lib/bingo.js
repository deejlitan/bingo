// ─── Shared game logic ───

export const PATTERN_LABEL = {
  line: 'Any Line',
  blackout: 'Blackout',
  corners: 'Four Corners',
  x: 'X Shape',
  t: 'T Shape',
  plus: 'Plus',
};

export function generateCard(pool, size) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const total = size * size;
  const flat = shuffled.slice(0, total);
  if (size % 2 === 1) {
    flat[Math.floor(total / 2)] = '★';
  }
  return Array.from({ length: size }, (_, r) => flat.slice(r * size, (r + 1) * size));
}

export function emptyMarked(size) {
  const m = Array.from({ length: size }, () => Array(size).fill(false));
  if (size % 2 === 1) m[Math.floor(size / 2)][Math.floor(size / 2)] = true;
  return m;
}

export const winChecks = {
  line: (m, n) => {
    for (let r = 0; r < n; r++) if (m[r].every(Boolean)) return true;
    for (let c = 0; c < n; c++) if (m.every(row => row[c])) return true;
    if (m.every((row, i) => row[i])) return true;
    if (m.every((row, i) => row[n - 1 - i])) return true;
    return false;
  },
  blackout: (m, n) => m.every(row => row.every(Boolean)),
  corners: (m, n) => m[0][0] && m[0][n - 1] && m[n - 1][0] && m[n - 1][n - 1],
  x: (m, n) => m.every((row, i) => row[i]) && m.every((row, i) => row[n - 1 - i]),
  t: (m, n) => m[0].every(Boolean) && m.every(row => row[Math.floor(n / 2)]),
  plus: (m, n) =>
    m[Math.floor(n / 2)].every(Boolean) && m.every(row => row[Math.floor(n / 2)]),
};

export function getPatternCells(pattern, n) {
  const cells = Array.from({ length: n }, () => Array(n).fill(false));
  if (pattern === 'blackout') return cells.map(row => row.map(() => true));
  if (pattern === 'corners') {
    cells[0][0] = cells[0][n - 1] = cells[n - 1][0] = cells[n - 1][n - 1] = true;
    return cells;
  }
  if (pattern === 'x') {
    for (let i = 0; i < n; i++) {
      cells[i][i] = true;
      cells[i][n - 1 - i] = true;
    }
    return cells;
  }
  if (pattern === 't') {
    for (let c = 0; c < n; c++) cells[0][c] = true;
    for (let r = 0; r < n; r++) cells[r][Math.floor(n / 2)] = true;
    return cells;
  }
  if (pattern === 'plus') {
    for (let c = 0; c < n; c++) cells[Math.floor(n / 2)][c] = true;
    for (let r = 0; r < n; r++) cells[r][Math.floor(n / 2)] = true;
    return cells;
  }
  return null;
}

export function findWinningLine(marked, n) {
  for (let r = 0; r < n; r++)
    if (marked[r].every(Boolean)) {
      const c = Array.from({ length: n }, () => Array(n).fill(false));
      for (let i = 0; i < n; i++) c[r][i] = true;
      return c;
    }
  for (let c = 0; c < n; c++)
    if (marked.every(row => row[c])) {
      const cells = Array.from({ length: n }, () => Array(n).fill(false));
      for (let i = 0; i < n; i++) cells[i][c] = true;
      return cells;
    }
  if (marked.every((row, i) => row[i])) {
    const cells = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < n; i++) cells[i][i] = true;
    return cells;
  }
  if (marked.every((row, i) => row[n - 1 - i])) {
    const cells = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < n; i++) cells[i][n - 1 - i] = true;
    return cells;
  }
  return null;
}

export function shortCode() {
  // 6-char code for game room URLs
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
