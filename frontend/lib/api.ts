export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");
// ws(s):// mirror of the API base unless overridden explicitly.
export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE ?? API_BASE.replace(/^http/, "ws");

export type Color = "blue" | "yellow" | "red" | "green";

export interface PlayerState {
  color: Color;
  username: string | null;
  remaining_pieces: string[];
  is_blocked: boolean;
  score: number | null;
  is_you: boolean;
}

export interface GameState {
  id: number;
  name: string;
  status: "waiting" | "active" | "finished";
  board: (Color | null)[][];
  human_seats: number;
  current_color: Color | null;
  players: PlayerState[];
  start_corners: Record<Color, [number, number]>;
}

export interface GameSummary {
  id: number;
  name: string;
  status: string;
  created_by: string;
  player_count: number;
  human_seats: number;
  winner?: string | null; // only on finished games
}

// piece id -> orientations -> cells [x, y]
export type PieceShapes = Record<string, number[][][]>;

export function shortName(name: string): string {
  return name.length > 12 ? name.slice(0, 12) + "…" : name;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("blokus_token");
}

export function getUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("blokus_username");
}

export function saveAuth(token: string, username: string) {
  localStorage.setItem("blokus_token", token);
  localStorage.setItem("blokus_username", username);
}

export function clearAuth() {
  localStorage.removeItem("blokus_token");
  localStorage.removeItem("blokus_username");
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers["Authorization"] = `Token ${token}`;
  }
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string; detail?: string }).error ??
        (data as { detail?: string }).detail ??
        `Request failed (${res.status})`
    );
  }
  return data as T;
}
