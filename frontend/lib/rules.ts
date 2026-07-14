// Client-side mirror of the placement rules, used only for the hover
// preview (green = legal, red = illegal). The server remains authoritative.

import type { Color, PieceShapes } from "./api";

export const BOARD_SIZE = 20;

function orientKey(cells: number[][]): string {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return JSON.stringify(
    cells
      .map(([x, y]) => [x - minX, y - minY])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  );
}

/** Index of the orientation reached by rotating/flipping the current one.
 *  Screen coordinates (y grows downward): "cw" is clockwise as the user
 *  sees it; "flip" mirrors horizontally. */
export function orientationAfter(
  shapes: PieceShapes,
  pid: string,
  index: number,
  op: "cw" | "ccw" | "flip"
): number {
  const t = shapes[pid][index].map(([x, y]) =>
    op === "cw" ? [-y, x] : op === "ccw" ? [y, -x] : [-x, y]
  );
  const key = orientKey(t);
  const found = shapes[pid].findIndex((o) => orientKey(o) === key);
  return found >= 0 ? found : index;
}

export function bbox(cells: number[][]): { w: number; h: number } {
  return {
    w: Math.max(...cells.map((c) => c[0])) + 1,
    h: Math.max(...cells.map((c) => c[1])) + 1,
  };
}

/** Clamp an anchor so the piece lies fully on the board. */
export function clampAnchor(
  ax: number,
  ay: number,
  w: number,
  h: number
): [number, number] {
  return [
    Math.max(0, Math.min(BOARD_SIZE - w, ax)),
    Math.max(0, Math.min(BOARD_SIZE - h, ay)),
  ];
}

export function placementCells(
  orientation: number[][],
  x: number,
  y: number
): [number, number][] {
  return orientation.map(([dx, dy]) => [x + dx, y + dy]);
}

export function isLegalPlacement(
  board: (Color | null)[][],
  color: Color,
  orientation: number[][],
  x: number,
  y: number,
  isFirstMove: boolean,
  startCorner: [number, number]
): boolean {
  const cells = placementCells(orientation, x, y);
  let touchesCorner = false;
  let coversStart = false;

  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_SIZE || cy < 0 || cy >= BOARD_SIZE) return false;
    if (board[cy][cx] !== null) return false;
    if (cx === startCorner[0] && cy === startCorner[1]) coversStart = true;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) return false; // same-color edge contact
      }
    }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) touchesCorner = true;
      }
    }
  }

  return isFirstMove ? coversStart : touchesCorner;
}
