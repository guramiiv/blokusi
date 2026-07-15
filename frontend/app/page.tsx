"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  api,
  clearAuth,
  GameSummary,
  getToken,
  getUsername,
  shortName,
} from "@/lib/api";
import RulesModal from "@/components/RulesModal";

interface LeaderboardEntry {
  username: string;
  games: number;
  wins: number;
  points: number;
}

const SEAT_COLORS = ["blue", "yellow", "red", "green"];

// ---- decorative floating pieces in the page background ----

const SHAPE_T5 = [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]];
const SHAPE_L5 = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]];
const SHAPE_W = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]];
const SHAPE_X = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
const SHAPE_S4 = [[0, 0], [1, 0], [1, 1], [2, 1]];
const SHAPE_O4 = [[0, 0], [1, 0], [0, 1], [1, 1]];
const SHAPE_I4 = [[0, 0], [1, 0], [2, 0], [3, 0]];
const SHAPE_V3 = [[0, 0], [1, 0], [1, 1]];

const BG_PIECES = [
  { cells: SHAPE_T5, color: "var(--c-blue)", cell: 34, left: "3%", top: "10%", rot: -16, dur: 9, delay: 0, op: 0.14 },
  { cells: SHAPE_X, color: "var(--c-red)", cell: 28, left: "88%", top: "8%", rot: 12, dur: 11, delay: 1.2, op: 0.13 },
  { cells: SHAPE_L5, color: "var(--c-yellow)", cell: 26, left: "78%", top: "38%", rot: 24, dur: 8, delay: 0.6, op: 0.12 },
  { cells: SHAPE_W, color: "var(--c-green)", cell: 30, left: "6%", top: "55%", rot: 8, dur: 10, delay: 2, op: 0.13 },
  { cells: SHAPE_S4, color: "var(--c-yellow)", cell: 30, left: "14%", top: "82%", rot: -20, dur: 12, delay: 0.3, op: 0.12 },
  { cells: SHAPE_O4, color: "var(--c-red)", cell: 26, left: "42%", top: "90%", rot: 14, dur: 9, delay: 1.7, op: 0.11 },
  { cells: SHAPE_I4, color: "var(--c-green)", cell: 24, left: "93%", top: "66%", rot: -70, dur: 10, delay: 0.9, op: 0.12 },
  { cells: SHAPE_V3, color: "var(--c-blue)", cell: 32, left: "63%", top: "78%", rot: 30, dur: 11, delay: 2.4, op: 0.11 },
];

function BgPieces() {
  return (
    <div className="bg-pieces" aria-hidden>
      {BG_PIECES.map((p, i) => {
        const w = Math.max(...p.cells.map((c) => c[0])) + 1;
        const h = Math.max(...p.cells.map((c) => c[1])) + 1;
        return (
          <svg
            key={i}
            className="bg-piece"
            viewBox={`0 0 ${w} ${h}`}
            style={
              {
                width: w * p.cell,
                left: p.left,
                top: p.top,
                opacity: p.op,
                "--rot": `${p.rot}deg`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              } as React.CSSProperties
            }
          >
            {p.cells.map(([x, y], j) => (
              <rect
                key={j}
                x={x + 0.03}
                y={y + 0.03}
                width={0.94}
                height={0.94}
                rx={0.12}
                fill={p.color}
              />
            ))}
          </svg>
        );
      })}
    </div>
  );
}

function SeatDots({ count }: { count: number }) {
  return (
    <span className="seats">
      {SEAT_COLORS.map((c, i) => (
        <i key={c} className={i < count ? c : ""} />
      ))}
    </span>
  );
}

export default function LobbyPage() {
  const router = useRouter();
  const [openGames, setOpenGames] = useState<GameSummary[]>([]);
  const [myGames, setMyGames] = useState<GameSummary[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showRules, setShowRules] = useState(false);
  // Read from localStorage only after mount — the server prerender has no
  // localStorage, and rendering it directly causes a hydration mismatch.
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(getUsername());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [games, lb] = await Promise.all([
        api<{ open: GameSummary[]; mine: GameSummary[] }>("/games/"),
        api<LeaderboardEntry[]>("/leaderboard/"),
      ]);
      setOpenGames(games.open);
      setMyGames(games.mine);
      setLeaders(lb);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games.");
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh, router]);

  async function createGame(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const game = await api<GameSummary>("/games/", {
        method: "POST",
        body: { name },
      });
      router.push(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game.");
    }
  }

  async function joinGame(id: number) {
    setError("");
    try {
      await api(`/games/${id}/join/`, { method: "POST" });
      router.push(`/game/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game.");
    }
  }

  function logout() {
    clearAuth();
    router.replace("/login");
  }

  return (
    <div className="container lobby-main">
      <BgPieces />

      <header className="lobby-header">
        <div className="brand">
          <div className="brand-mark">
            <i className="blue" />
            <i className="yellow" />
            <i className="green" />
            <i className="red" />
          </div>
          <div>
            <h1>Blokus</h1>
            <span className="tagline muted">online · 4 players · 20×20</span>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowRules(true)}>📖 წესები</button>
          <div className="user-chip" title={username ?? undefined}>
            <span className="avatar">
              {(username ?? "?").charAt(0).toUpperCase()}
            </span>
            {shortName(username ?? "")}
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="lobby-grid">
        <div className="lobby-col">
          <div
            className="card lobby-card"
            style={{ "--hdr": "var(--c-blue)" } as React.CSSProperties}
          >
            <h2>Create a game</h2>
            <form onSubmit={createGame} style={{ display: "flex", gap: 10 }}>
              <input
                placeholder="Game name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="primary" style={{ whiteSpace: "nowrap" }}>
                Create
              </button>
            </form>
            <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
              A game starts automatically when 4 players have joined.
            </p>
          </div>

          {myGames.length > 0 && (
            <div
              className="card lobby-card"
              style={{ "--hdr": "var(--c-green)" } as React.CSSProperties}
            >
              <h2>Your games</h2>
              <div className="game-list">
                {myGames.map((g) => (
                  <div className="game-row" key={g.id}>
                    <div>
                      <strong>{g.name}</strong>
                      <span className="muted game-meta">
                        {g.status === "waiting" ? (
                          <>
                            waiting <SeatDots count={g.player_count} />
                          </>
                        ) : (
                          "in progress"
                        )}
                      </span>
                    </div>
                    <button onClick={() => router.push(`/game/${g.id}`)}>
                      {g.status === "waiting" ? "Open" : "Resume"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            className="card lobby-card"
            style={{ "--hdr": "var(--c-yellow)" } as React.CSSProperties}
          >
            <h2>Open games</h2>
            {loaded && openGames.length === 0 && (
              <p className="muted">No open games right now — create one!</p>
            )}
            <div className="game-list">
              {openGames.map((g) => (
                <div className="game-row" key={g.id}>
                  <div>
                    <strong>{g.name}</strong>
                    <span className="muted game-meta" title={g.created_by}>
                      by {shortName(g.created_by)}{" "}
                      <SeatDots count={g.player_count} />
                    </span>
                  </div>
                  <button className="primary" onClick={() => joinGame(g.id)}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lobby-col">
          <div
            className="card lobby-card"
            style={{ "--hdr": "var(--c-red)" } as React.CSSProperties}
          >
            <h2>🏆 Leaderboard</h2>
            {loaded && leaders.length === 0 && (
              <p className="muted">No finished games yet — be the first!</p>
            )}
            {leaders.length > 0 && (
              <div className="lb">
                <div className="lb-row lb-head">
                  <span className="lb-rank">#</span>
                  <span className="lb-name">Player</span>
                  <span className="lb-stat">Wins</span>
                  <span className="lb-stat">Games</span>
                  <span className="lb-stat">Pts</span>
                </div>
                {leaders.map((l, i) => (
                  <div
                    className={`lb-row ${l.username === username ? "me" : ""}`}
                    key={l.username}
                  >
                    <span className="lb-rank">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </span>
                    <span className="lb-name" title={l.username}>
                      {shortName(l.username)}
                    </span>
                    <span className="lb-stat">{l.wins}</span>
                    <span className="lb-stat">{l.games}</span>
                    <span className="lb-stat">{l.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
