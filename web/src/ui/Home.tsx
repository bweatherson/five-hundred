// The opening screen, and the waiting room before a game with friends.
import { useEffect, useMemo, useState } from "react";
import { HostSession, Session } from "../game/session.ts";
import { Table } from "../game/table.ts";
import { GuestRoom, HostRoom, cleanCode } from "../net/peer.ts";
import App from "./App.tsx";
import { CardSvg, SvgDefs } from "./Card.tsx";
import { HouseRules, loadRules, saveRules, toRulesConfig } from "../game/houseRules.ts";
import { RulesEditor, RulesSummary } from "./Rules.tsx";

// A claude.ai page can't make the direct connections that games with friends use.
const NETWORK = import.meta.env.MODE !== "artifact";

type Screen =
  | { kind: "home" }
  | { kind: "solo"; session: HostSession }
  | { kind: "host"; room: HostRoom }
  | { kind: "guest"; room: GuestRoom };

function stored(key: string) {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}

function useSubscribe(obj: { subscribe(fn: () => void): () => void } | null) {
  const [, setTick] = useState(0);
  useEffect(() => (obj ? obj.subscribe(() => setTick((n) => n + 1)) : undefined), [obj]);
}

export default function Root() {
  const joinCode = useMemo(() => cleanCode(new URLSearchParams(location.hash.slice(1)).get("join") ?? ""), []);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });

  const leave = () => {
    if (screen.kind === "solo") screen.session.close();
    else if (screen.kind !== "home") screen.room.close();
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    setScreen({ kind: "home" });
  };

  if (screen.kind === "solo") {
    const s = screen.session;
    return <App key={s.t.gameNo} session={s} onNewGame={() => s.newGame()} onLeave={leave} />;
  }
  if (screen.kind === "host") return <HostScreen room={screen.room} onLeave={leave} />;
  if (screen.kind === "guest") return <GuestScreen room={screen.room} onLeave={leave} />;
  return (
    <Home
      joinCode={joinCode}
      onSolo={() => setScreen({ kind: "solo", session: new HostSession(new Table(undefined, undefined, toRulesConfig(loadRules()))) })}
      onHost={(name) => setScreen({ kind: "host", room: new HostRoom(name, loadRules()) })}
      onJoin={(code, name) => setScreen({ kind: "guest", room: new GuestRoom(code, name) })}
    />
  );
}

function Home({ joinCode, onSolo, onHost, onJoin }: {
  joinCode: string; onSolo: () => void; onHost: (name: string) => void; onJoin: (code: string, name: string) => void;
}) {
  const [mode, setMode] = useState<"pick" | "host" | "join" | "rules">(joinCode ? "join" : "pick");
  const [rules, setRules] = useState<HouseRules>(loadRules);
  const [name, setName] = useState(stored("five-hundred-name"));
  const [code, setCode] = useState(joinCode);
  const nameOk = name.trim().length > 0;
  const go = (f: () => void) => { store("five-hundred-name", name.trim()); f(); };

  return (
    <div className="home">
      <SvgDefs />
      <div className="home-fan" aria-hidden>
        {["JK", "JH", "AS", "KD", "QC"].map((c, i) => (
          <div key={c} className="home-card" style={{ "--k": i - 2 } as React.CSSProperties}><CardSvg card={c} /></div>
        ))}
      </div>
      <h1 className="home-title">Five Hundred</h1>
      <p className="home-sub">Four players, two partnerships, first to 500.</p>

      {mode === "pick" && (
        <div className="home-buttons">
          <button className="primary big" onClick={onSolo}>Play against the computer</button>
          {NETWORK ? (
            <>
              <button className="ghost big" onClick={() => setMode("host")}>Host a game with friends</button>
              <button className="ghost big" onClick={() => setMode("join")}>Join a friend's game</button>
            </>
          ) : (
            <p className="lobby-note">Games with friends need the web version of this page; this copy plays against the computer only.</p>
          )}
          <button className="link rules-link" onClick={() => setMode("rules")}>House rules</button>
        </div>
      )}

      {mode === "rules" && (
        <div className="home-rules">
          <RulesEditor value={rules} onChange={(h) => { setRules(h); saveRules(h); }} />
          <div className="home-form-buttons">
            <button className="primary" onClick={() => setMode("pick")}>Done</button>
          </div>
        </div>
      )}

      {(mode === "host" || mode === "join") && (
        <form
          className="home-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameOk) return;
            if (mode === "host") go(() => onHost(name.trim()));
            else if (code.length === 5) go(() => onJoin(code, name.trim()));
          }}
        >
          <label>
            Your name
            <input value={name} maxLength={16} autoFocus={!name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
          </label>
          {mode === "join" && (
            <label>
              Room code
              <input
                className="code-input" value={code} autoFocus={!!name} inputMode="text" autoCapitalize="characters"
                autoComplete="off" spellCheck={false} placeholder="BKTRW" onChange={(e) => setCode(cleanCode(e.target.value))}
              />
            </label>
          )}
          <div className="home-form-buttons">
            <button type="button" className="ghost" onClick={() => setMode("pick")}>Back</button>
            <button type="submit" className="primary" disabled={!nameOk || (mode === "join" && code.length !== 5)}>
              {mode === "host" ? "Open a table" : "Join"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const SEAT_LABEL = ["You (host)", "West", "Your partner", "East"];

function HostScreen({ room, onLeave }: { room: HostRoom; onLeave: () => void }) {
  useSubscribe(room);
  const [copied, setCopied] = useState(false);
  const [editRules, setEditRules] = useState(false);
  if (room.session) return <App session={room.session} onNewGame={() => room.session!.newGame()} onLeave={onLeave} />;
  const info = room.seatInfo();
  const link = `${location.origin}${location.pathname}#join=${room.code}`;
  const connected = room.guests.filter((g) => g.connected);
  return (
    <div className="home lobby">
      <h1 className="home-title small">Your table</h1>
      {room.error ? (
        <p className="lobby-error">{room.error}</p>
      ) : !room.ready ? (
        <p className="home-sub">Opening the table…</p>
      ) : (
        <>
          <p className="home-sub">Friends join with this code:</p>
          <div className="room-code">{room.code}</div>
          <button
            className="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {});
            }}
          >
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </>
      )}
      <div className="lobby-seats">
        {info.map((s, seat) => (
          <div key={seat} className={`lobby-seat team-${seat % 2}`}>
            <span className="lobby-pos">{SEAT_LABEL[seat]}</span>
            {seat === 0 ? (
              <span className="lobby-name">{s.name}</span>
            ) : (
              <select value={room.seats[seat] ?? ""} onChange={(e) => room.assign(seat, e.target.value || null)}>
                <option value="">Computer</option>
                {connected.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="lobby-rules">
        <RulesSummary value={room.rules} />
        <button className="link" onClick={() => setEditRules(!editRules)}>{editRules ? "Done" : "Change"}</button>
      </div>
      {editRules && <RulesEditor value={room.rules} onChange={(h) => { room.setRules(h); saveRules(h); }} />}
      <p className="lobby-note">
        {connected.length === 0 ? "Waiting for friends to join. Empty seats are played by the computer." : `${connected.length} joined. Choose who sits where, then start.`}
      </p>
      <div className="home-form-buttons">
        <button className="ghost" onClick={onLeave}>Close table</button>
        <button className="primary" disabled={!room.ready} onClick={() => room.start()}>Start the game</button>
      </div>
    </div>
  );
}

function GuestScreen({ room, onLeave }: { room: GuestRoom; onLeave: () => void }) {
  useSubscribe(room);
  if (room.phase === "playing") return <App session={room as Session} onLeave={onLeave} />;
  return (
    <div className="home lobby">
      <h1 className="home-title small">Table {room.code}</h1>
      {room.phase === "connecting" && <p className="home-sub">Connecting…</p>}
      {room.phase === "closed" && <p className="lobby-error">{room.error ?? "Disconnected."}</p>}
      {room.phase === "lobby" && (
        <>
          <p className="home-sub">You're in. Waiting for the host to start.</p>
          <div className="lobby-seats">
            {room.seats.map((s, seat) => (
              <div key={seat} className={`lobby-seat team-${seat % 2}`}>
                <span className="lobby-pos">{["Host's seat", "West", "Host's partner", "East"][seat]}</span>
                <span className="lobby-name">{s.kind === "computer" ? "Computer" : s.name}</span>
              </div>
            ))}
          </div>
          <RulesSummary value={room.rules} />
        </>
      )}
      <div className="home-form-buttons">
        <button className="ghost" onClick={onLeave}>{room.phase === "closed" ? "Back" : "Leave"}</button>
      </div>
    </div>
  );
}
