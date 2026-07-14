"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  api,
  clearAuth,
  GameSummary,
  getToken,
  getUsername,
} from "@/lib/api";

export default function LobbyPage() {
  const router = useRouter();
  const [openGames, setOpenGames] = useState<GameSummary[]>([]);
  const [myGames, setMyGames] = useState<GameSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ open: GameSummary[]; mine: GameSummary[] }>(
        "/games/"
      );
      setOpenGames(res.open);
      setMyGames(res.mine);
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
    <div className="container">
      <div className="topbar">
        <h1>🟦 Blokus Lobby</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="muted">{getUsername()}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>

      {error && <div className="banner error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 12, fontSize: 17 }}>Create a game</h2>
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
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12, fontSize: 17 }}>Your games</h2>
          <div className="game-list">
            {myGames.map((g) => (
              <div className="game-row" key={g.id}>
                <div>
                  <strong>{g.name}</strong>{" "}
                  <span className="muted">
                    · {g.status === "waiting" ? `${g.player_count}/4 players` : "in progress"}
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

      <div className="card">
        <h2 style={{ marginBottom: 12, fontSize: 17 }}>Open games</h2>
        {loaded && openGames.length === 0 && (
          <p className="muted">No open games right now — create one!</p>
        )}
        <div className="game-list">
          {openGames.map((g) => (
            <div className="game-row" key={g.id}>
              <div>
                <strong>{g.name}</strong>{" "}
                <span className="muted">
                  · by {g.created_by} · {g.player_count}/4 players
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
  );
}
