"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  Color,
  GameState,
  getToken,
  PieceShapes,
  shortName,
  WS_BASE,
} from "@/lib/api";
import {
  BOARD_SIZE,
  bbox,
  candidateAnchors,
  clampAnchor,
  isLegalPlacement,
  orientationAfter,
  placementCells,
} from "@/lib/rules";
import RulesModal from "@/components/RulesModal";

const COLOR_LABEL: Record<Color, string> = {
  blue: "Blue",
  yellow: "Yellow",
  red: "Red",
  green: "Green",
};

// How far (in cells) a touch-dragged piece floats above the finger so it
// stays visible. Mouse drags need no lift.
const TOUCH_LIFT_CELLS = 2.6;

export default function GamePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [game, setGame] = useState<GameState | null>(null);
  const [shapes, setShapes] = useState<PieceShapes | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [orientation, setOrientation] = useState(0);
  // Staged placement: the piece sits on the board waiting for ✓.
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  // Drag of the already-staged piece across the board.
  const [pendDrag, setPendDrag] = useState<{
    dx: number;
    dy: number;
    touch: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  // Color of the player whose remaining pieces are shown in a modal.
  const [viewPlayer, setViewPlayer] = useState<Color | null>(null);
  // Board cell of my own placed piece that was tapped to open the
  // piece picker; the chosen piece is staged corner-adjacent to it.
  // The mobile "Add piece" button opens it targeting the board center.
  const [picker, setPicker] = useState<[number, number] | null>(null);
  const [showRules, setShowRules] = useState(false);
  // Briefly blink the freshly staged piece so it is easy to spot.
  const [flashPending, setFlashPending] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const me = game?.players.find((p) => p.is_you) ?? null;
  const isMyTurn = !!(game && me && game.current_color === me.color);
  const isFirstMove = !!(me && me.remaining_pieces.length === 21);
  const orient = selected && shapes ? shapes[selected][orientation] : null;

  // --- data loading + websocket -----------------------------------------

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    api<PieceShapes>("/pieces/", { auth: false }).then(setShapes);

    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`${WS_BASE}/ws/game/${id}/?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") {
          setGame(msg.game);
        } else if (msg.type === "error") {
          setError(msg.message);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    }
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [id, router]);

  // Clear selection/staging once the piece has been placed or the turn moved on.
  useEffect(() => {
    if (selected && me && !me.remaining_pieces.includes(selected)) {
      setSelected(null);
      setPending(null);
      setOrientation(0);
    }
  }, [selected, me]);

  useEffect(() => {
    if (!isMyTurn) setPending(null);
  }, [isMyTurn]);

  // --- staging / confirming -------------------------------------------------

  const stageCentered = useCallback(
    (cellX: number, cellY: number) => {
      if (!orient || !isMyTurn) return;
      const { w, h } = bbox(orient);
      const [ax, ay] = clampAnchor(
        cellX - Math.floor((w - 1) / 2),
        cellY - Math.floor((h - 1) / 2),
        w,
        h
      );
      setPending({ x: ax, y: ay });
    },
    [orient, isMyTurn]
  );

  const pendingLegal = useMemo(() => {
    if (!pending || !orient || !game || !me) return false;
    return isLegalPlacement(
      game.board,
      me.color,
      orient,
      pending.x,
      pending.y,
      isFirstMove,
      game.start_corners[me.color]
    );
  }, [pending, orient, game, me, isFirstMove]);

  const confirmPending = useCallback(() => {
    if (!pending || !pendingLegal || !selected || !wsRef.current) return;
    setError("");
    wsRef.current.send(
      JSON.stringify({
        action: "place",
        piece: selected,
        orientation,
        x: pending.x,
        y: pending.y,
      })
    );
  }, [pending, pendingLegal, selected, orientation]);

  const cancelPending = useCallback(() => {
    setPending(null);
    setSelected(null);
    setOrientation(0);
    setError("");
  }, []);

  const rotate = useCallback(
    (op: "cw" | "ccw" | "flip") => {
      if (!selected || !shapes) return;
      const next = orientationAfter(shapes, selected, orientation, op);
      setOrientation(next);
      // Keep the staged piece visually centered where it was.
      if (pending && orient) {
        const oldB = bbox(orient);
        const newB = bbox(shapes[selected][next]);
        const cx = pending.x + (oldB.w - 1) / 2;
        const cy = pending.y + (oldB.h - 1) / 2;
        const [ax, ay] = clampAnchor(
          Math.round(cx - (newB.w - 1) / 2),
          Math.round(cy - (newB.h - 1) / 2),
          newB.w,
          newB.h
        );
        setPending({ x: ax, y: ay });
      }
    },
    [selected, shapes, orientation, pending, orient]
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!pending || !orient) return;
      const { w, h } = bbox(orient);
      const [ax, ay] = clampAnchor(pending.x + dx, pending.y + dy, w, h);
      setPending({ x: ax, y: ay });
    },
    [pending, orient]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") rotate("cw");
      if (e.key === "f" || e.key === "F") rotate("flip");
      if (e.key === "Escape") {
        if (showRules) setShowRules(false);
        else if (picker) setPicker(null);
        else if (viewPlayer) setViewPlayer(null);
        else cancelPending();
      }
      if (e.key === "Enter") confirmPending();
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (e.key === "ArrowLeft") nudge(-1, 0);
        if (e.key === "ArrowRight") nudge(1, 0);
        if (e.key === "ArrowUp") nudge(0, -1);
        if (e.key === "ArrowDown") nudge(0, 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate, cancelPending, confirmPending, nudge, viewPlayer, picker, showRules]);

  // --- shared drag geometry ---------------------------------------------------

  function boardStride(): { rect: DOMRect; stride: number } | null {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { rect, stride: (rect.width - 4) / BOARD_SIZE };
  }

  // Fresh state for window-level pointer listeners (avoids stale closures).
  const ctxRef = useRef<{
    pending: typeof pending;
    pendDrag: typeof pendDrag;
    orient: number[][] | null;
    isMyTurn: boolean;
  }>({ pending: null, pendDrag: null, orient: null, isMyTurn: false });
  ctxRef.current = { pending, pendDrag, orient, isMyTurn };

  function swallowNextClick() {
    suppressClickRef.current = true;
    setTimeout(() => (suppressClickRef.current = false), 0);
  }

  // Staged-piece drag: the pending overlay itself follows the finger/mouse.
  useEffect(() => {
    if (!pendDrag) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const c = ctxRef.current;
      if (!c.pendDrag || !c.orient) return;
      const geo = boardStride();
      if (!geo) return;
      const lift = c.pendDrag.touch ? TOUCH_LIFT_CELLS * geo.stride : 0;
      const cellX = Math.floor((e.clientX - geo.rect.left - 2) / geo.stride);
      const cellY = Math.floor((e.clientY - lift - geo.rect.top - 2) / geo.stride);
      const { w, h } = bbox(c.orient);
      const [ax, ay] = clampAnchor(
        cellX - c.pendDrag.dx,
        cellY - c.pendDrag.dy,
        w,
        h
      );
      setPending({ x: ax, y: ay });
    };
    const onUp = () => {
      setPendDrag(null);
      swallowNextClick();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pendDrag]);

  // --- board overlays -----------------------------------------------------

  // Cells of the staged piece.
  const pendingCells = useMemo(() => {
    if (!pending || !orient) return null;
    const set = new Set<string>();
    for (const [cx, cy] of placementCells(orient, pending.x, pending.y)) {
      set.add(`${cx},${cy}`);
    }
    return set;
  }, [pending, orient]);

  function handleCellClick(x: number, y: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!isMyTurn || !game || !me) return;
    // Tapping one of my own placed pieces opens the piece picker.
    if (game.board[y][x] === me.color) {
      setPicker([x, y]);
      return;
    }
    if (!selected) return;
    if (pendingCells?.has(`${x},${y}`)) return; // taps on the piece don't restage
    stageCentered(x, y);
  }

  function triggerFlash() {
    setFlashPending(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashPending(false), 1800);
  }

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  // Stage the piece at the nearest legal corner-touching spot to the
  // target cell (falls back to staging beside it in red), and blink it
  // so the user sees where it landed. It is then adjusted on the board.
  function stagePiece(pid: string, target: [number, number]) {
    if (!shapes || !game || !me) return;
    setSelected(pid);
    setError("");
    triggerFlash();

    // Possible corner anchors, nearest to the tapped cell first.
    const anchors = candidateAnchors(
      game.board, me.color, isFirstMove, game.start_corners[me.color]
    );
    anchors.sort(
      (a, b) =>
        (a[0] - target[0]) ** 2 + (a[1] - target[1]) ** 2 -
        ((b[0] - target[0]) ** 2 + (b[1] - target[1]) ** 2)
    );

    for (const [cx, cy] of anchors) {
      for (let oi = 0; oi < shapes[pid].length; oi++) {
        for (const [dx, dy] of shapes[pid][oi]) {
          const ax = cx - dx, ay = cy - dy;
          if (
            isLegalPlacement(
              game.board, me.color, shapes[pid][oi], ax, ay,
              isFirstMove, game.start_corners[me.color]
            )
          ) {
            setOrientation(oi);
            setPending({ x: ax, y: ay });
            return;
          }
        }
      }
    }

    // No legal spot for this piece: stage it (shown red) at the position
    // with the most empty cells nearest the target, so it is always
    // visible and draggable even on a crowded board.
    setOrientation(0);
    const cells0 = shapes[pid][0];
    const { w, h } = bbox(cells0);
    let best: { x: number; y: number; empty: number; dist: number } | null =
      null;
    for (let ay = 0; ay <= BOARD_SIZE - h; ay++) {
      for (let ax = 0; ax <= BOARD_SIZE - w; ax++) {
        let empty = 0;
        for (const [dx, dy] of cells0) {
          if (game.board[ay + dy][ax + dx] === null) empty++;
        }
        const dist =
          (ax + (w - 1) / 2 - target[0]) ** 2 +
          (ay + (h - 1) / 2 - target[1]) ** 2;
        if (
          !best ||
          empty > best.empty ||
          (empty === best.empty && dist < best.dist)
        ) {
          best = { x: ax, y: ay, empty, dist };
        }
      }
    }
    setPending({ x: best!.x, y: best!.y });
    setError(
      "No legal spot for this piece right now — move or rotate it, or press ✕ and pick another piece."
    );
  }

  // Picker choice: stage the chosen piece near the tapped cell.
  function choosePiece(pid: string) {
    const target = picker;
    setPicker(null);
    if (target) stagePiece(pid, target);
  }

  function handleCellPointerDown(
    e: React.PointerEvent,
    x: number,
    y: number
  ) {
    if (!pending || !pendingCells?.has(`${x},${y}`)) return;
    e.preventDefault();
    setPendDrag({
      dx: x - pending.x,
      dy: y - pending.y,
      touch: e.pointerType === "touch",
    });
  }

  // --- render helpers -------------------------------------------------------

  const cornerOwner = useMemo(() => {
    const m = new Map<string, Color>();
    if (game) {
      for (const [color, [x, y]] of Object.entries(game.start_corners)) {
        m.set(`${x},${y}`, color as Color);
      }
    }
    return m;
  }, [game]);

  function pieceThumb(
    pid: string,
    color: Color,
    clickable: boolean,
    onPick?: (pid: string) => void
  ) {
    if (!shapes) return null;
    // The selected piece mirrors its current rotation/flip in the tray.
    const cells =
      clickable && selected === pid
        ? shapes[pid][orientation]
        : shapes[pid][0];
    const { w, h } = bbox(cells);
    const filled = new Set(cells.map(([x, y]) => `${x},${y}`));
    return (
      <div
        key={pid}
        className={`piece ${selected === pid && clickable ? "selected" : ""}`}
        style={{ cursor: onPick || clickable ? "pointer" : "default" }}
        title={pid}
        onClick={() => {
          if (onPick) {
            onPick(pid);
            return;
          }
          // Clicking a tray piece stages it on the board right away;
          // from there it is dragged, nudged or rotated into place.
          if (!clickable || !isMyTurn) return;
          stagePiece(pid, [
            Math.floor(BOARD_SIZE / 2),
            Math.floor(BOARD_SIZE / 2),
          ]);
        }}
      >
        <div
          className="piece-grid"
          style={{ gridTemplateColumns: `repeat(${w}, var(--sq, 12px))` }}
        >
          {Array.from({ length: h }, (_, y) =>
            Array.from({ length: w }, (_, x) => (
              <div
                key={`${x},${y}`}
                className={`sq ${filled.has(`${x},${y}`) ? `filled ${color}` : "empty"}`}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // --- page ------------------------------------------------------------------

  if (!game || !shapes) {
    return (
      <div className="container">
        <p className="muted">Loading game…</p>
      </div>
    );
  }

  const winner =
    game.status === "finished"
      ? [...game.players].sort((a, b) => (b.score ?? -99) - (a.score ?? -99))[0]
      : null;

  const showActionBar = !!me && game.status === "active" && !!selected;
  // On mobile one of the two bottom bars is always present during a game.
  const hasBottomBar = !!me && game.status === "active";

  return (
    <div className={`container game-container ${hasBottomBar ? "has-bar" : ""}`}>
      <div className="topbar">
        <h1>{game.name}</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!connected && <span className="error-text">reconnecting…</span>}
          <button onClick={() => setShowRules(true)} title="თამაშის წესები">
            📖
          </button>
          <button onClick={() => router.push("/")}>← Lobby</button>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {game.status === "waiting" && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Waiting for players… {game.players.filter((p) => p.username).length}/
          {game.human_seats ?? 4} joined. Share the game name with friends so
          they can join from the lobby.
          {(game.human_seats ?? 4) < 4 &&
            " Bots will take the remaining seats."}
        </div>
      )}

      {game.status === "active" && (
        <div
          className={`banner ${isMyTurn ? "your-turn" : ""}`}
          style={{ marginBottom: 16 }}
        >
          {isMyTurn ? (
            <>
              <strong>Your turn ({COLOR_LABEL[me!.color]}).</strong>{" "}
              {pending
                ? "Drag or nudge the piece into position, rotate it, then tap ✓."
                : "Pick a piece from your tray, or tap one of your glowing pieces on the board."}
            </>
          ) : (
            <>
              Waiting for{" "}
              <strong>
                {shortName(
                  game.players.find((p) => p.color === game.current_color)
                    ?.username ??
                    game.current_color ??
                    ""
                )}
              </strong>{" "}
              ({COLOR_LABEL[game.current_color as Color]}) to move…
            </>
          )}
        </div>
      )}

      {game.status === "finished" && winner && (
        <div className="banner your-turn" style={{ marginBottom: 16 }}>
          🏆 Game over — <strong>{shortName(winner.username ?? "")}</strong> (
          {COLOR_LABEL[winner.color]}) wins with {winner.score} points!
        </div>
      )}

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="game-layout">
        <div className="board" ref={boardRef}>
          {game.board.map((row, y) =>
            row.map((cell, x) => {
              const key = `${x},${y}`;
              const corner = !cell && cornerOwner.get(key);
              // Painted even over occupied cells so the staged piece never
              // hides behind placed pieces (e.g. right after a rotation).
              const isPending = pendingCells?.has(key);
              // My placed pieces are tappable (open the piece picker):
              // pulse them gently while I'm choosing what to play.
              const clickHint =
                !!cell &&
                !!me &&
                cell === me.color &&
                isMyTurn &&
                !selected &&
                game.status === "active";
              return (
                <div
                  key={key}
                  className={[
                    "cell",
                    cell ?? "",
                    corner ? `corner-${corner}` : "",
                    clickHint ? "hint" : "",
                    isPending
                      ? `pending ${me?.color ?? ""} ${pendingLegal ? "ok" : "bad"} ${
                          flashPending ? "flash" : ""
                        }`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleCellClick(x, y)}
                  onPointerDown={(e) => handleCellPointerDown(e, x, y)}
                />
              );
            })
          )}
        </div>

        <div className="side">
          <div className="player-strip">
            {game.players.map((p) => (
              <div
                key={p.color}
                className={`player-chip ${
                  game.status === "active" && game.current_color === p.color
                    ? "current"
                    : ""
                } ${p.username ? "clickable" : ""}`}
                onClick={() => p.username && setViewPlayer(p.color)}
                title={p.username ?? undefined}
              >
                <span className={`dot ${p.color}`} />
                <span>
                  {p.username ? (
                    shortName(p.username)
                  ) : (
                    <em className="muted">waiting…</em>
                  )}
                  {p.is_you && " (you)"}
                </span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {game.status === "finished"
                    ? `${p.score} pts`
                    : p.is_blocked
                      ? "blocked"
                      : `${p.remaining_pieces.length} left`}
                </span>
              </div>
            ))}
          </div>

          {me && game.status !== "finished" && (
            <div className="card tray-card">
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>Your pieces</h2>
              <div className="piece-tray">
                {me.remaining_pieces.map((pid) =>
                  pieceThumb(pid, me.color, true)
                )}
              </div>
              <p className="muted key-hints">
                R rotate · F flip · arrows nudge · Enter place · Esc cancel
              </p>
            </div>
          )}

          {game.status === "finished" && (
            <div className="card">
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>Final scores</h2>
              <div className="scores">
                {[...game.players]
                  .sort((a, b) => (b.score ?? -99) - (a.score ?? -99))
                  .map((p) => (
                    <div className="score-row" key={p.color}>
                      <span>
                        <span
                          className={`dot ${p.color}`}
                          style={{
                            display: "inline-block",
                            marginRight: 8,
                          }}
                        />
                        {shortName(p.username ?? "")}
                      </span>
                      <strong>{p.score} pts</strong>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {hasBottomBar && !showActionBar && (
        <div className="add-piece-bar">
          {isMyTurn ? (
            <button
              className="primary"
              onClick={() =>
                setPicker([Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2)])
              }
            >
              ➕ Add piece
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => me && setViewPlayer(me.color)}
            >
              👀 See pieces
            </button>
          )}
        </div>
      )}

      {showActionBar && (
        <div className="action-bar">
          <button className="rot" onClick={() => rotate("ccw")} title="Rotate left">
            <IconRotateCcw />
          </button>
          <button className="rot" onClick={() => rotate("cw")} title="Rotate right (R)">
            <IconRotateCw />
          </button>
          <button className="flip" onClick={() => rotate("flip")} title="Flip (F)">
            <IconFlip />
          </button>
          <button className="cancel" onClick={cancelPending} title="Cancel (Esc)">
            <IconX />
          </button>
          <button
            className="primary confirm"
            onClick={confirmPending}
            disabled={!pending || !pendingLegal}
            title="Place piece (Enter)"
          >
            <IconCheck /> Place
          </button>
        </div>
      )}

      {viewPlayer &&
        (() => {
          const p = game.players.find((pl) => pl.color === viewPlayer);
          if (!p) return null;
          return (
            <div className="modal-backdrop" onClick={() => setViewPlayer(null)}>
              <div className="modal card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <h2>
                    <span className={`dot ${p.color}`} />
                    {p.username}
                    {p.is_you && " (you)"}
                  </h2>
                  <button onClick={() => setViewPlayer(null)}>✕</button>
                </div>
                <p className="muted" style={{ marginBottom: 12 }}>
                  {COLOR_LABEL[p.color]} ·{" "}
                  {game.status === "finished"
                    ? `${p.score} pts`
                    : p.is_blocked
                      ? "blocked"
                      : `${p.remaining_pieces.length} piece${
                          p.remaining_pieces.length === 1 ? "" : "s"
                        } left`}
                </p>
                {p.remaining_pieces.length > 0 ? (
                  <div className="piece-tray">
                    {p.remaining_pieces.map((pid) =>
                      pieceThumb(pid, p.color, false)
                    )}
                  </div>
                ) : (
                  <p className="muted">All pieces placed! 🎉</p>
                )}
              </div>
            </div>
          );
        })()}

      {picker && me && game.status === "active" && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>
                <span className={`dot ${me.color}`} />
                Choose a piece
              </h2>
              <button onClick={() => setPicker(null)}>✕</button>
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              The piece will appear on the board (green border = ready to
              place). Drag it to adjust, then press ✓.
            </p>
            <div className="piece-tray">
              {me.remaining_pieces.map((pid) =>
                pieceThumb(pid, me.color, false, choosePiece)
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ---- action bar icons (stroke follows the button's text color) ----

const iconProps = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconRotateCcw() {
  return (
    <svg {...iconProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function IconRotateCw() {
  return (
    <svg {...iconProps}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function IconFlip() {
  return (
    <svg {...iconProps}>
      <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M12 20v2" />
      <path d="M12 14v2" />
      <path d="M12 8v2" />
      <path d="M12 2v2" />
    </svg>
  );
}

function IconX() {
  return (
    <svg {...iconProps}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...iconProps} width="1.25em" height="1.25em">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
