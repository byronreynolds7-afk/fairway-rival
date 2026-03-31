import { useState, useEffect, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, onSnapshot, addDoc, deleteDoc, query, where,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

// ─────────────────────────────────────────────────────────────────────────────
// WHS HANDICAP MATH (USGA / GHIN compatible)
// ─────────────────────────────────────────────────────────────────────────────
function calcDifferential(gross, courseRating, slope) {
  return parseFloat((((gross - courseRating) * 113) / slope).toFixed(1));
}

function calcHandicapIndex(differentials) {
  if (!differentials || differentials.length < 3) return null;
  const sorted = [...differentials].sort((a, b) => a - b);
  const useCount = Math.max(1, Math.round(sorted.length * 0.4));
  const best = sorted.slice(0, useCount);
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return parseFloat((avg * 0.96).toFixed(1));
}

function calcCourseHandicap(hcpIndex, slope, courseRating, par = 36) {
  if (hcpIndex === null) return null;
  return Math.round(hcpIndex * (slope / 113) + (courseRating - par));
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --deep:#071410;--dark:#0d1f18;--card:#112a1c;--card2:#173524;
  --border:rgba(50,200,120,0.13);--green:#28b360;--gl:#45d97a;
  --gold:#c9973a;--gol:#f0c060;--cream:#eee8d6;--muted:#628070;
  --red:#d95050;--w:#fff;--r:12px;--rs:8px;
}
body{background:var(--deep);color:var(--cream);font-family:'DM Sans',sans-serif;min-height:100vh;font-size:15px;line-height:1.5}
.app{min-height:100vh;display:flex;flex-direction:column}
.topbar{background:var(--dark);border-bottom:1px solid var(--border);padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:2px;color:var(--gl);display:flex;align-items:center;gap:6px}
.logo span{color:var(--gold)}
.nav{display:flex;gap:4px}
.nb{background:none;border:none;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;padding:6px 13px;border-radius:6px;cursor:pointer;transition:all .15s}
.nb:hover{color:var(--cream);background:var(--card)}
.nb.active{color:var(--gl);background:rgba(40,179,96,.13)}
.uchip{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.avatar{width:30px;height:30px;border-radius:50%;background:var(--green);color:var(--deep);font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
.avatar.gold{background:var(--gold)}
.page{padding:32px 24px;max-width:880px;margin:0 auto;width:100%;flex:1}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:24px;margin-bottom:16px}
.card2{background:var(--card2)}
.csm{background:var(--card);border:1px solid var(--border);border-radius:var(--rs);padding:16px;margin-bottom:10px}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:2px;color:var(--w);margin-bottom:4px}
.psub{color:var(--muted);font-size:13px;margin-bottom:28px;font-style:italic}
.stitle{font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:1.5px;color:var(--gold);margin-bottom:14px}
.lbl{font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.fr{display:flex;gap:12px;flex-wrap:wrap}
.fg{display:flex;flex-direction:column;flex:1;min-width:130px}
input,select{background:var(--deep);border:1px solid var(--border);border-radius:var(--rs);color:var(--cream);font-family:'DM Sans',sans-serif;font-size:14px;padding:10px 12px;outline:none;transition:border .15s;width:100%}
input:focus,select:focus{border-color:var(--green)}
input::placeholder{color:var(--muted)}
select option{background:var(--dark)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:var(--rs);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;padding:10px 20px;cursor:pointer;transition:all .15s}
.bp{background:var(--green);color:var(--deep)}.bp:hover{background:var(--gl)}
.bg_{background:var(--gold);color:var(--deep)}.bg_:hover{background:var(--gol)}
.bgh{background:transparent;color:var(--muted);border:1px solid var(--border)}.bgh:hover{color:var(--cream);border-color:var(--muted)}
.bd{background:transparent;color:var(--red);border:1px solid var(--red)}.bd:hover{background:var(--red);color:#fff}
.bsm{padding:6px 12px;font-size:12px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.srow{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.sbox{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px 22px;flex:1;min-width:110px}
.snum{font-family:'Bebas Neue',sans-serif;font-size:38px;line-height:1;color:var(--w)}
.snum.g{color:var(--gl)}.snum.gold{color:var(--gold)}
.slbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
.mc{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:12px;display:flex;align-items:center;gap:16px}
.mvs{font-family:'Bebas Neue',sans-serif;font-size:14px;color:var(--muted);letter-spacing:1px;flex-shrink:0;text-align:center}
.mpl{flex:1}
.mname{font-weight:600;font-size:15px}
.mscore{font-family:'Bebas Neue',sans-serif;font-size:30px;line-height:1}
.snet{font-size:11px;color:var(--muted)}
.wbadge{background:var(--gold);color:var(--deep);font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:2px 8px;border-radius:4px;margin-left:6px}
.stbl{width:100%;border-collapse:collapse}
.stbl th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border)}
.stbl td{padding:12px 14px;border-bottom:1px solid rgba(50,200,120,.07);font-size:14px}
.stbl tr:last-child td{border-bottom:none}
.rnk{font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--muted)}
.rnk.top{color:var(--gold)}
.pill{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.4px}
.pg{background:rgba(40,179,96,.15);color:var(--gl)}
.po{background:rgba(201,151,58,.15);color:var(--gol)}
.pm{background:rgba(98,128,112,.15);color:var(--muted)}
.pr{background:rgba(217,80,80,.15);color:var(--red)}
.aw{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--deep);padding:24px}
.ab{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:40px;width:100%;max-width:400px}
.alogo{font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:3px;color:var(--gl);text-align:center;margin-bottom:4px}
.alogo span{color:var(--gold)}
.atag{text-align:center;color:var(--muted);font-size:13px;margin-bottom:32px;font-style:italic}
.atabs{display:flex;gap:8px;margin-bottom:24px}
.atab{flex:1;padding:8px;text-align:center;border-radius:var(--rs);cursor:pointer;font-size:13px;font-weight:600;border:1px solid var(--border);color:var(--muted);background:none;transition:all .15s}
.atab.active{background:var(--green);color:var(--deep);border-color:var(--green)}
.fb{display:flex;justify-content:space-between;align-items:center}
.mt8{margin-top:8px}.mt16{margin-top:16px}.mt24{margin-top:24px}.mb16{margin-bottom:16px}
.tm{color:var(--muted);font-size:13px}
.tc{text-align:center}
.fw{width:100%}
.err{color:var(--red);font-size:13px;margin-top:8px}
.ok{color:var(--gl);font-size:13px;margin-top:8px}
.empty{text-align:center;padding:40px;color:var(--muted);font-style:italic}
.hval{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--gold)}
.hpend{font-size:12px;color:var(--muted);font-style:italic;margin-top:4px}
.loading{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--deep);font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;color:var(--muted)}
@media(max-width:600px){.page{padding:20px 16px}.topbar{padding:0 16px}.fr{flex-direction:column}.mc{flex-direction:column;align-items:flex-start}.srow{flex-direction:column}.nav .nb{font-size:11px;padding:5px 8px}}
`;

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser]     = useState(undefined); // undefined = loading
  const [players,  setPlayers]      = useState([]);
  const [matchups, setMatchups]     = useState([]);
  const [rounds,   setRounds]       = useState([]);
  const [season,   setSeason]       = useState(1);
  const [tab,      setTab]          = useState("dashboard");

  // ── Firebase Auth listener ──
  useEffect(() => {
    return onAuthStateChanged(auth, user => setAuthUser(user || null));
  }, []);

  // ── Firestore real-time listeners (only when logged in) ──
  useEffect(() => {
    if (!authUser) return;

    const unsubs = [
      onSnapshot(collection(db, "players"),  snap => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "matchups"), snap => setMatchups(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "rounds"),   snap => setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, "settings", "global"), snap => { if (snap.exists()) setSeason(snap.data().season || 1); }),
    ];

    return () => unsubs.forEach(u => u());
  }, [authUser]);

  const state = { players, matchups, rounds, season };

  // ── Firestore write helpers ──
  const fsUpdate = {
    addPlayer:    (data)    => setDoc(doc(db, "players", data.id), data),
    updatePlayer: (id, upd) => updateDoc(doc(db, "players", id), upd),
    removePlayer: (id)      => deleteDoc(doc(db, "players", id)),
    addMatchup:   (data)    => setDoc(doc(db, "matchups", data.id), data),
    updateMatchup:(id, upd) => updateDoc(doc(db, "matchups", id), upd),
    deleteMatchup:(id)      => deleteDoc(doc(db, "matchups", id)),
    addRound:     (data)    => setDoc(doc(db, "rounds", data.id), data),
    deleteRoundsByMatchup: async (matchupId) => {
      const q = query(collection(db, "rounds"), where("matchupId", "==", matchupId));
      // Simple approach: filter from local state and delete each
      rounds.filter(r => r.matchupId === matchupId).forEach(r => deleteDoc(doc(db, "rounds", r.id)));
    },
    setSeason:    (s)       => setDoc(doc(db, "settings", "global"), { season: s }, { merge: true }),
  };

  const currentPlayer = authUser ? players.find(p => p.firebaseUid === authUser.uid) || null : null;

  // Loading state
  if (authUser === undefined) {
    return <><style>{STYLES}</style><div className="loading">⛳ Loading...</div></>;
  }

  if (!authUser) {
    return <><style>{STYLES}</style><AuthScreen fsUpdate={fsUpdate} playerCount={players.length} /></>;
  }

  // Still waiting for player doc to load after login
  if (authUser && !currentPlayer) {
    return <><style>{STYLES}</style><div className="loading">Loading your profile...</div></>;
  }

  const navItems = [
    { key: "dashboard", label: "Dashboard" },
    { key: "matchups",  label: "Matchups" },
    { key: "rounds",    label: "Post Round" },
    { key: "standings", label: "Standings" },
    { key: "h2h",       label: "Rivalry" },
    ...(currentPlayer?.isCommissioner ? [{ key: "comm", label: "⚙ Commish" }] : []),
  ];

  const handleSignOut = () => { signOut(auth); setTab("dashboard"); };

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">
        <div className="topbar">
          <div className="logo">FAIR<span>WAY</span> RIVAL</div>
          <nav className="nav">
            {navItems.map(n => (
              <button key={n.key} className={`nb ${tab === n.key ? "active" : ""}`} onClick={() => setTab(n.key)}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="uchip">
            <div className={`avatar ${currentPlayer?.isCommissioner ? "gold" : ""}`}>
              {currentPlayer?.name?.charAt(0).toUpperCase() || "?"}
            </div>
            <span style={{ fontSize: 13 }}>{currentPlayer?.name}</span>
            <button className="btn bgh bsm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
        <div className="page">
          {tab === "dashboard"  && <Dashboard state={state} cp={currentPlayer} setTab={setTab} />}
          {tab === "matchups"   && <Matchups state={state} cp={currentPlayer} />}
          {tab === "rounds"     && <PostRound state={state} fsUpdate={fsUpdate} cp={currentPlayer} />}
          {tab === "standings"  && <Standings state={state} />}
          {tab === "h2h"        && <HeadToHead state={state} cp={currentPlayer} />}
          {tab === "comm" && currentPlayer?.isCommissioner && <Commissioner state={state} fsUpdate={fsUpdate} />}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
const COMM_CODE = "FAIRWAY2024";

function AuthScreen({ fsUpdate, playerCount }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setErr(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (e) {
      setErr("Invalid email or password.");
    }
    setLoading(false);
  };

  const register = async () => {
    setErr(""); setLoading(true);
    if (!name.trim() || !email.trim() || !pw) { setErr("All fields are required."); setLoading(false); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      const isComm = code.toUpperCase() === COMM_CODE || playerCount === 0;
      const playerId = uid();
      await fsUpdate.addPlayer({
        id: playerId,
        firebaseUid: cred.user.uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        isCommissioner: isComm,
        differentials: [],
        handicapIndex: null,
        wins: 0, losses: 0, ties: 0,
      });
    } catch (e) {
      setErr(e.code === "auth/email-already-in-use" ? "Email already registered." : "Registration failed. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="aw">
      <div className="ab">
        <div className="alogo">FAIR<span>WAY</span><br />RIVAL</div>
        <div className="atag">Your long-distance golf rivalry, tracked.</div>
        <div className="atabs">
          <button className={`atab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Sign In</button>
          <button className={`atab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Register</button>
        </div>
        {mode === "register" && (
          <div className="fg mb16">
            <div className="lbl">Your Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Byron Reynolds" />
          </div>
        )}
        <div className="fg mb16">
          <div className="lbl">Email</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
        </div>
        <div className="fg mb16">
          <div className="lbl">Password</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
        </div>
        {mode === "register" && (
          <div className="fg mb16">
            <div className="lbl">Commissioner Code (optional)</div>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Enter code if you have one" />
            <div className="tm mt8">First player to register becomes commissioner automatically.</div>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        <div style={{ marginTop: 20 }}>
          <button className="btn bp fw" onClick={mode === "login" ? login : register} disabled={loading}>
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ state, cp, setTab }) {
  if (!cp) return null;
  const { rounds, matchups, season } = state;
  const myRounds = rounds.filter(r => r.playerId === cp.id);
  const recentMatchups = matchups
    .filter(m => (m.player1Id === cp.id || m.player2Id === cp.id) && m.status === "complete")
    .sort((a, b) => new Date(b.roundDate || 0) - new Date(a.roundDate || 0))
    .slice(0, 3);

  return (
    <div>
      <div className="ptitle">Welcome back, {cp.name.split(" ")[0]}.</div>
      <div className="psub">Season {season || 1} · Bi-Weekly Challenge</div>
      <div className="srow">
        <div className="sbox">
          <div className={`snum ${cp.handicapIndex !== null ? "gold" : ""}`}>{cp.handicapIndex ?? "—"}</div>
          <div className="slbl">Handicap Index</div>
        </div>
        <div className="sbox">
          <div className="snum g">{cp.wins || 0}</div>
          <div className="slbl">Wins</div>
        </div>
        <div className="sbox">
          <div className="snum">{cp.losses || 0}</div>
          <div className="slbl">Losses</div>
        </div>
        <div className="sbox">
          <div className="snum">{myRounds.length}</div>
          <div className="slbl">Rounds</div>
        </div>
      </div>
      {cp.handicapIndex === null && (
        <div className="card card2" style={{ marginBottom: 24 }}>
          <div className="fb">
            <div>
              <div className="lbl">Handicap Status</div>
              <div className="mt8">
                <span className="pill po">{cp.differentials?.length || 0}/3 rounds posted</span>
                <span className="tm" style={{ marginLeft: 10 }}>
                  Post {3 - (cp.differentials?.length || 0)} more round{3 - (cp.differentials?.length || 0) !== 1 ? "s" : ""} to get your handicap index.
                </span>
              </div>
            </div>
            <button className="btn bp bsm" onClick={() => setTab("rounds")}>Post Round →</button>
          </div>
        </div>
      )}
      <div className="stitle">Recent Results</div>
      {recentMatchups.length === 0
        ? <div className="empty">No completed matchups yet. Get out there! ⛳</div>
        : recentMatchups.map(m => <MatchupCard key={m.id} m={m} state={state} myId={cp.id} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCHUP CARD
// ─────────────────────────────────────────────────────────────────────────────
function MatchupCard({ m, state }) {
  const { players, rounds } = state;
  const p1 = players.find(p => p.id === m.player1Id);
  const p2 = players.find(p => p.id === m.player2Id);
  const r1 = rounds.find(r => r.matchupId === m.id && r.playerId === m.player1Id);
  const r2 = rounds.find(r => r.matchupId === m.id && r.playerId === m.player2Id);
  if (!p1 || !p2) return null;

  const net1 = r1?.netScore ?? null;
  const net2 = r2?.netScore ?? null;
  const winner = net1 !== null && net2 !== null
    ? net1 < net2 ? m.player1Id : net2 < net1 ? m.player2Id : "tie"
    : null;

  const renderSide = (player, round, align) => (
    <div className="mpl" style={{ textAlign: align }}>
      <div className="mname">
        {player.name}
        {winner === player.id && <span className="wbadge">W</span>}
        {winner === "tie" && <span className="pill pm" style={{ marginLeft: 6 }}>TIE</span>}
      </div>
      {round ? (
        <>
          <div className="mscore" style={{ color: winner === player.id ? "var(--gol)" : "var(--cream)" }}>
            {round.netScore ?? "—"}
          </div>
          <div className="snet">{round.grossScore} gross · {round.course}</div>
        </>
      ) : (
        <div className="tm" style={{ marginTop: 4 }}>Awaiting round...</div>
      )}
    </div>
  );

  return (
    <div className="mc">
      {renderSide(p1, r1, "left")}
      <div className="mvs">
        VS
        {m.roundDate && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            {new Date(m.roundDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}
      </div>
      {renderSide(p2, r2, "right")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCHUPS PAGE
// ─────────────────────────────────────────────────────────────────────────────
function Matchups({ state, cp }) {
  if (!cp) return null;
  const mine = state.matchups
    .filter(m => m.player1Id === cp.id || m.player2Id === cp.id)
    .sort((a, b) => new Date(b.roundDate || 0) - new Date(a.roundDate || 0));
  const pending = mine.filter(m => m.status !== "complete");
  const done    = mine.filter(m => m.status === "complete");
  return (
    <div>
      <div className="ptitle">My Matchups</div>
      <div className="psub">Your bi-weekly challenge schedule</div>
      {pending.length > 0 && <><div className="stitle">Active / Upcoming</div>{pending.map(m => <MatchupCard key={m.id} m={m} state={state} />)}</>}
      {done.length    > 0 && <><div className="stitle mt24">History</div>{done.map(m => <MatchupCard key={m.id} m={m} state={state} />)}</>}
      {mine.length    === 0 && <div className="empty">No matchups yet — ask your commissioner to create one.</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORECARD SCANNER  (Claude Vision — tee-aware)
// ─────────────────────────────────────────────────────────────────────────────
function ScorecardScanner({ onFill }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedTee, setSelectedTee] = useState("");
  const [scanErr, setScanErr] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanErr(""); setScanResult(null); setSelectedPlayer(""); setSelectedTee("");
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
    const b64Reader = new FileReader();
    b64Reader.onload = async () => {
      const b64 = b64Reader.result.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      setScanning(true);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: `You are reading a golf scorecard image. Extract all data and return ONLY valid JSON with no markdown or explanation.
Return this exact structure:
{
  "course": "Course name",
  "holes": 9,
  "tees": [
    { "color": "Blue", "gender": "M", "front9": { "rating": 35.2, "slope": 118, "par": 36 }, "back9": { "rating": 34.8, "slope": 115, "par": 36 } }
  ],
  "players": [
    { "name": "Player name", "front9holes": [4,5,4,3,5,4,4,3,5], "back9holes": [4,4,5,3,4,5,3,4,4], "front9total": 37, "back9total": 36, "total18": 73 }
  ]
}
Rules: Extract every tee row (Black/Blue/White/Gold/Red). For each tee extract front9 and back9 rating/slope/par. If only 18-hole values visible, divide rating by 2, keep slope same. Extract every player row with name and scores. Use null for unreadable fields. Return ONLY the JSON.` }
            ]}]
          })
        });
        const data = await resp.json();
        const text = data.content?.find(b => b.type === "text")?.text || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setScanResult(parsed);
        if (parsed.players?.length === 1) setSelectedPlayer(parsed.players[0].name);
        if (parsed.tees?.length === 1) setSelectedTee(parsed.tees[0].color);
      } catch { setScanErr("Couldn't read the scorecard. Try a clearer photo or enter manually."); }
      setScanning(false);
    };
    b64Reader.readAsDataURL(file);
  };

  const handleConfirm = (nineChoice) => {
    const player = scanResult?.players?.find(p => p.name === selectedPlayer);
    const tee = scanResult?.tees?.find(t => t.color === selectedTee);
    if (!player) { setScanErr("Select your name."); return; }
    if (!tee) { setScanErr("Select your tee color."); return; }
    const teeNine = nineChoice === "back9" ? tee.back9 : tee.front9;
    const gross = nineChoice === "back9"
      ? (player.back9total ?? player.back9holes?.reduce((a,b)=>a+b,0) ?? null)
      : (player.front9total ?? player.front9holes?.reduce((a,b)=>a+b,0) ?? null);
    onFill({
      course: scanResult.course || "", teeColor: tee.color || "",
      rating: teeNine?.rating?.toString() || "", slope: teeNine?.slope?.toString() || "",
      par: teeNine?.par?.toString() || "36", gross: gross?.toString() || "",
      holeScores: nineChoice === "back9" ? (player.back9holes || []) : (player.front9holes || []),
      nineUsed: nineChoice === "back9" ? "Back 9" : "Front 9",
    });
    setScanResult(null); setPreview(null); setSelectedPlayer(""); setSelectedTee("");
  };

  const hasBoth = scanResult?.holes === 18 || scanResult?.players?.some(p => p.back9total);

  return (
    <div className="card card2" style={{ marginBottom: 20 }}>
      <div className="lbl" style={{ marginBottom: 6 }}>📷 Scan Scorecard</div>
      <div className="tm" style={{ marginBottom: 12 }}>Upload or snap a photo — AI reads tees, ratings, slopes, and scores automatically.</div>
      <label style={{ display:"inline-flex",alignItems:"center",gap:8,background:"var(--green)",color:"var(--deep)",padding:"10px 18px",borderRadius:"var(--rs)",fontWeight:600,fontSize:14,cursor:"pointer",opacity:scanning?0.6:1 }}>
        {scanning ? "⛳ Reading scorecard..." : "📷 Upload / Take Photo"}
        <input type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleFile} disabled={scanning} />
      </label>
      {preview && !scanning && <div className="mt8"><img src={preview} alt="Scorecard" style={{ maxWidth:"100%",maxHeight:180,borderRadius:8,border:"1px solid var(--border)",objectFit:"contain" }} /></div>}
      {scanResult && !scanning && (
        <div className="mt16">
          <div className="lbl" style={{ marginBottom:8 }}>
            {scanResult.course && <span className="pill pg" style={{ marginRight:8 }}>⛳ {scanResult.course}</span>}
            <span className="pill pm">{scanResult.tees?.length || 0} tee sets detected</span>
          </div>
          {scanResult.tees?.length > 0 && (
            <div className="fg mt8" style={{ marginBottom:12 }}>
              <div className="lbl">Which tees did you play?</div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:6 }}>
                {scanResult.tees.map((t, i) => {
                  const COLORS = { black:"#222",blue:"#1a6db5",white:"#ddd",gold:"#c9973a",red:"#c0392b",green:"#28b360",silver:"#aaa" };
                  const bg = COLORS[t.color?.toLowerCase()] || "#888";
                  const sel = selectedTee === t.color;
                  return (
                    <button key={i} onClick={() => setSelectedTee(t.color)} style={{ padding:"8px 14px",borderRadius:8,border:`2px solid ${sel?"var(--gl)":"var(--border)"}`,background:sel?"rgba(69,217,122,0.1)":"var(--deep)",cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ width:12,height:12,borderRadius:"50%",background:bg,display:"inline-block" }} />
                      <span style={{ color:"var(--cream)",fontSize:13,fontWeight:600 }}>{t.color}</span>
                      {t.front9 && <span style={{ color:"var(--muted)",fontSize:11 }}>{t.front9.rating}/{t.front9.slope}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {scanResult.players?.length > 0 && (
            <div className="fg mt8" style={{ marginBottom:12 }}>
              <div className="lbl">Which row is you?</div>
              <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
                <option value="">— Select your name —</option>
                {scanResult.players.map((p,i) => (
                  <option key={i} value={p.name}>{p.name} {p.front9total?`— F: ${p.front9total}`:""}{p.back9total?` B: ${p.back9total}`:""}</option>
                ))}
              </select>
            </div>
          )}
          {scanErr && <div className="err">{scanErr}</div>}
          {selectedPlayer && selectedTee && (
            <div className="mt8">
              {hasBoth ? (
                <>
                  <div className="lbl" style={{ marginBottom:8 }}>Which 9 counts for this matchup?</div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button className="btn bp" onClick={() => handleConfirm("front9")}>✓ Front 9</button>
                    <button className="btn bg_" onClick={() => handleConfirm("back9")}>✓ Back 9</button>
                  </div>
                </>
              ) : (
                <button className="btn bp" onClick={() => handleConfirm("front9")}>✓ Use This Data</button>
              )}
              <button className="btn bgh" style={{ marginLeft:8 }} onClick={() => { setScanResult(null); setPreview(null); }}>Clear</button>
            </div>
          )}
        </div>
      )}
      {scanErr && !scanResult && <div className="err mt8">{scanErr}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST ROUND  (writes directly to Firestore)
// ─────────────────────────────────────────────────────────────────────────────
function PostRound({ state, fsUpdate, cp }) {
  const [matchupId, setMatchupId] = useState("");
  const [course, setCourse]       = useState("");
  const [teeColor, setTeeColor]   = useState("");
  const [rating, setRating]       = useState("");
  const [slope, setSlope]         = useState("");
  const [par, setPar]             = useState("36");
  const [nineUsed, setNineUsed]   = useState("Front 9");
  const [holeMode, setHoleMode]   = useState("total");
  const [holeScores, setHoleScores] = useState(Array(9).fill(""));
  const [gross, setGross]         = useState("");
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg]             = useState("");
  const [err, setErr]             = useState("");
  const [saving, setSaving]       = useState(false);

  if (!cp) return null;

  const handleScanFill = ({ course:c, teeColor:tc, rating:r, slope:sl, par:p, gross:g, holeScores:hs, nineUsed:nu }) => {
    if (c) setCourse(c); if (tc) setTeeColor(tc); if (r) setRating(r);
    if (sl) setSlope(sl); if (p) setPar(p); if (nu) setNineUsed(nu);
    if (hs && hs.length === 9 && hs.some(s => s)) {
      setHoleScores(hs.map(s => s?.toString() || "")); setHoleMode("holes");
      setGross(hs.reduce((a,b) => a+(parseInt(b)||0),0).toString());
    } else if (g) { setGross(g); }
  };

  const holesSum = holeScores.reduce((a,b) => a+(parseInt(b)||0), 0);
  const effectiveGross = holeMode === "holes" ? (holesSum > 0 ? holesSum : "") : gross;

  const openMatchups = state.matchups.filter(m => {
    const isMe   = m.player1Id === cp.id || m.player2Id === cp.id;
    const posted = state.rounds.some(r => r.matchupId === m.id && r.playerId === cp.id);
    return isMe && !posted;
  });

  const prevDiff = effectiveGross && rating && slope ? calcDifferential(parseInt(effectiveGross), parseFloat(rating), parseFloat(slope)||113) : null;
  const prevCH   = cp.handicapIndex !== null && slope && rating ? calcCourseHandicap(cp.handicapIndex, parseFloat(slope), parseFloat(rating), parseFloat(par)) : null;
  const prevNet  = prevCH !== null && effectiveGross ? parseInt(effectiveGross) - prevCH : null;

  const submit = async () => {
    setErr(""); setMsg(""); setSaving(true);
    const g = parseInt(effectiveGross), sl = parseFloat(slope), cr = parseFloat(rating), p = parseFloat(par);
    if (!course || !rating || !slope || !effectiveGross) { setErr("Fill in all fields."); setSaving(false); return; }
    if (isNaN(g)||isNaN(sl)||isNaN(cr)) { setErr("Invalid numbers."); setSaving(false); return; }

    const diff     = calcDifferential(g, cr, sl);
    const newDiffs = [...(cp.differentials || []), diff];
    const newHcp   = calcHandicapIndex(newDiffs);
    const courseHcp = newHcp !== null ? calcCourseHandicap(newHcp, sl, cr, p) : null;
    const netScore  = courseHcp !== null ? g - courseHcp : null;

    const round = {
      id: uid(), playerId: cp.id, matchupId: matchupId || null,
      course, teeColor, nineUsed, rating: cr, slope: sl, par: p,
      grossScore: g, netScore, courseHandicap: courseHcp, differential: diff,
      holeScores: holeMode === "holes" ? holeScores.map(Number) : null, date,
    };

    try {
      // Save round
      await fsUpdate.addRound(round);

      // Update player handicap
      await fsUpdate.updatePlayer(cp.id, { differentials: newDiffs, handicapIndex: newHcp });

      // Check if matchup is now complete
      if (matchupId) {
        const matchup = state.matchups.find(m => m.id === matchupId);
        if (matchup) {
          const otherId    = matchup.player1Id === cp.id ? matchup.player2Id : matchup.player1Id;
          const otherRound = state.rounds.find(r => r.matchupId === matchupId && r.playerId === otherId);
          if (otherRound && netScore !== null && otherRound.netScore !== null) {
            let wId = null, lId = null, tie = false;
            if (netScore < otherRound.netScore) { wId = cp.id; lId = otherId; }
            else if (otherRound.netScore < netScore) { wId = otherId; lId = cp.id; }
            else { tie = true; }
            await fsUpdate.updateMatchup(matchupId, { status: "complete" });
            const winner = state.players.find(p => p.id === wId);
            const loser  = state.players.find(p => p.id === lId);
            if (winner) await fsUpdate.updatePlayer(wId, { wins: (winner.wins||0)+1 });
            if (loser)  await fsUpdate.updatePlayer(lId, { losses: (loser.losses||0)+1 });
            if (tie) {
              const pl1 = state.players.find(p => p.id === cp.id);
              const pl2 = state.players.find(p => p.id === otherId);
              if (pl1) await fsUpdate.updatePlayer(cp.id,    { ties: (pl1.ties||0)+1 });
              if (pl2) await fsUpdate.updatePlayer(otherId,  { ties: (pl2.ties||0)+1 });
            }
          }
        }
      }

      const statusMsg = newHcp !== null ? `Handicap index: ${newHcp}.` : `${newDiffs.length}/3 rounds toward your handicap.`;
      setMsg(`Round posted! Diff: ${diff.toFixed(1)}. ${statusMsg}`);
      setCourse(""); setTeeColor(""); setRating(""); setSlope(""); setGross("");
      setHoleScores(Array(9).fill("")); setMatchupId(""); setHoleMode("total");
    } catch (e) {
      setErr("Failed to save round. Check your connection.");
    }
    setSaving(false);
  };

  const myRounds = state.rounds.filter(r => r.playerId === cp.id).sort((a,b) => new Date(b.date)-new Date(a.date));

  return (
    <div>
      <div className="ptitle">Post a Round</div>
      <div className="psub">Your handicap index updates automatically with each round</div>
      <ScorecardScanner onFill={handleScanFill} />
      <div className="card card2" style={{ marginBottom:24 }}>
        <div className="fb">
          <div>
            <div className="lbl">Current Handicap Index</div>
            {cp.handicapIndex !== null ? <div className="hval">{cp.handicapIndex}</div> : <div className="hpend">{cp.differentials?.length||0}/3 rounds posted — keep going!</div>}
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="lbl">Rounds in System</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28 }}>{cp.differentials?.length||0}</div>
          </div>
        </div>
        {cp.differentials?.length > 0 && (
          <div className="mt8">
            <div className="lbl">Recent differentials</div>
            <div className="tm">{[...cp.differentials].slice(-5).map((d,i) => <span key={i} className="pill pm" style={{ marginRight:4 }}>{d.toFixed(1)}</span>)}</div>
          </div>
        )}
      </div>
      <div className="card">
        {openMatchups.length > 0 && (
          <div className="fg mb16">
            <div className="lbl">Link to Matchup</div>
            <select value={matchupId} onChange={e => setMatchupId(e.target.value)}>
              <option value="">— Practice / no matchup —</option>
              {openMatchups.map(m => {
                const opp = state.players.find(p => p.id !== cp.id && (p.id===m.player1Id||p.id===m.player2Id));
                return <option key={m.id} value={m.id}>vs {opp?.name} · {m.roundDate ? new Date(m.roundDate).toLocaleDateString() : "Open"}</option>;
              })}
            </select>
          </div>
        )}
        <div className="fr">
          <div className="fg"><div className="lbl">Course Name</div><input value={course} onChange={e=>setCourse(e.target.value)} placeholder="Riviera CC" /></div>
          <div className="fg"><div className="lbl">Date Played</div><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        </div>
        <div className="fr mt16">
          <div className="fg"><div className="lbl">Tee Color</div><input value={teeColor} onChange={e=>setTeeColor(e.target.value)} placeholder="Blue, White, Red..." /></div>
          <div className="fg"><div className="lbl">9 Holes Played</div><select value={nineUsed} onChange={e=>setNineUsed(e.target.value)}><option>Front 9</option><option>Back 9</option></select></div>
        </div>
        <div className="fr mt16">
          <div className="fg"><div className="lbl">Course Rating (9-hole)</div><input type="number" step="0.1" value={rating} onChange={e=>setRating(e.target.value)} placeholder="35.2" /></div>
          <div className="fg"><div className="lbl">Slope</div><input type="number" value={slope} onChange={e=>setSlope(e.target.value)} placeholder="113" /></div>
          <div className="fg"><div className="lbl">Par</div><select value={par} onChange={e=>setPar(e.target.value)}><option value="35">35</option><option value="36">36</option><option value="37">37</option></select></div>
        </div>
        <div className="mt16">
          <div className="lbl" style={{ marginBottom:8 }}>Score Entry</div>
          <div style={{ display:"flex",gap:8,marginBottom:12 }}>
            <button className={`btn bsm ${holeMode==="total"?"bp":"bgh"}`} onClick={() => setHoleMode("total")}>Total Only</button>
            <button className={`btn bsm ${holeMode==="holes"?"bp":"bgh"}`} onClick={() => setHoleMode("holes")}>Hole by Hole</button>
          </div>
          {holeMode === "total" ? (
            <div className="fg"><div className="lbl">Gross Score ({nineUsed})</div><input type="number" value={gross} onChange={e=>setGross(e.target.value)} placeholder="45" style={{ maxWidth:120 }} /></div>
          ) : (
            <div>
              <div className="lbl" style={{ marginBottom:8 }}>Hole Scores — {nineUsed}</div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(9, 1fr)",gap:6 }}>
                {holeScores.map((s,i) => (
                  <div key={i} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:10,color:"var(--muted)",marginBottom:2 }}>{nineUsed==="Back 9"?i+10:i+1}</div>
                    <input type="number" value={s} onChange={e=>{ const n=[...holeScores];n[i]=e.target.value;setHoleScores(n); }} style={{ textAlign:"center",padding:"8px 4px",fontSize:14 }} placeholder="—" />
                  </div>
                ))}
              </div>
              {holesSum > 0 && <div className="mt8 tm">Total: <strong style={{ color:"var(--cream)" }}>{holesSum}</strong></div>}
            </div>
          )}
        </div>
        {effectiveGross && rating && slope && (
          <div className="card card2 mt16">
            <div className="lbl">Round Preview · {nineUsed}{teeColor?` · ${teeColor} tees`:""}</div>
            <div className="fr mt8" style={{ gap:24 }}>
              <div><div className="tm">Differential</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gl)" }}>{prevDiff!==null?prevDiff.toFixed(1):"—"}</div></div>
              <div><div className="tm">Course Handicap</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gold)" }}>{prevCH!==null?prevCH:"Pending"}</div></div>
              <div><div className="tm">Net Score</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--cream)" }}>{prevNet!==null?prevNet:"—"}</div></div>
            </div>
            {cp.handicapIndex===null && <div className="tm mt8" style={{ fontSize:12 }}>⚠ Net score will calculate once you have 3+ rounds posted.</div>}
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <div className="mt24"><button className="btn bp" onClick={submit} disabled={saving}>{saving?"Saving...":"Submit Round"}</button></div>
      </div>
      {myRounds.length > 0 && (
        <>
          <div className="stitle mt24">My Round History</div>
          {myRounds.map(r => (
            <div className="csm" key={r.id}>
              <div className="fb">
                <div>
                  <div style={{ fontWeight:600 }}>{r.course}</div>
                  <div className="tm">{new Date(r.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}{r.teeColor&&<span className="pill pm" style={{ marginLeft:8 }}>{r.teeColor} tees</span>}{r.nineUsed&&<span className="pill pm" style={{ marginLeft:6 }}>{r.nineUsed}</span>}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:22 }}>{r.grossScore} <span className="tm" style={{ fontSize:13 }}>gross</span>{r.netScore!==null&&<> · {r.netScore} <span className="tm" style={{ fontSize:13 }}>net</span></>}</div>
                  <div className="tm" style={{ fontSize:12 }}>Diff: {r.differential?.toFixed(1)} · {r.rating}/{r.slope}</div>
                </div>
              </div>
              {r.holeScores && (
                <div style={{ display:"grid",gridTemplateColumns:"repeat(9, 1fr)",gap:4,marginTop:8 }}>
                  {r.holeScores.map((s,i) => (
                    <div key={i} style={{ textAlign:"center",background:"var(--deep)",borderRadius:4,padding:"3px 0",fontSize:13 }}>
                      <div style={{ fontSize:9,color:"var(--muted)" }}>{r.nineUsed==="Back 9"?i+10:i+1}</div>{s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS
// ─────────────────────────────────────────────────────────────────────────────
function Standings({ state }) {
  const { players, matchups, season } = state;
  const sorted = [...players].sort((a,b) => {
    if ((b.wins||0)!==(a.wins||0)) return (b.wins||0)-(a.wins||0);
    return (a.losses||0)-(b.losses||0);
  });
  const completed = matchups.filter(m => m.status==="complete").sort((a,b) => new Date(b.roundDate||0)-new Date(a.roundDate||0));
  return (
    <div>
      <div className="ptitle">Season Standings</div>
      <div className="psub">Season {season||1} · Win-Loss Record</div>
      <div className="card">
        <table className="stbl">
          <thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>T</th><th>Handicap</th><th>Rounds</th></tr></thead>
          <tbody>
            {sorted.map((pl,i) => (
              <tr key={pl.id}>
                <td><div className={`rnk ${i===0&&(pl.wins||0)>0?"top":""}`}>{i+1}</div></td>
                <td><div style={{ fontWeight:600 }}>{pl.name}</div>{pl.isCommissioner&&<span className="pill po" style={{ marginTop:2 }}>Commish</span>}</td>
                <td style={{ color:"var(--gl)",fontWeight:700 }}>{pl.wins||0}</td>
                <td style={{ color:"var(--red)" }}>{pl.losses||0}</td>
                <td style={{ color:"var(--muted)" }}>{pl.ties||0}</td>
                <td>{pl.handicapIndex!==null?<span className="pill po">{pl.handicapIndex}</span>:<span className="pill pm">{pl.differentials?.length||0}/3</span>}</td>
                <td className="tm">{pl.differentials?.length||0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length===0&&<div className="empty">No players yet.</div>}
      </div>
      {completed.length>0&&<><div className="stitle mt24">All Results</div>{completed.map(m=><MatchupCard key={m.id} m={m} state={state} />)}</>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEAD-TO-HEAD RIVALRY PAGE
// ─────────────────────────────────────────────────────────────────────────────
function HeadToHead({ state, cp }) {
  const { players, matchups, rounds } = state;
  const others = players.filter(p => p.id !== cp?.id);
  const [oppId, setOppId] = useState(others[0]?.id || "");
  if (!cp) return null;
  const opp = players.find(p => p.id === oppId);

  const completed = matchups.filter(m =>
    m.status==="complete" &&
    ((m.player1Id===cp.id&&m.player2Id===oppId)||(m.player1Id===oppId&&m.player2Id===cp.id))
  ).sort((a,b) => new Date(a.roundDate||0)-new Date(b.roundDate||0));

  const results = completed.map(m => {
    const myR  = rounds.find(r => r.matchupId===m.id && r.playerId===cp.id);
    const oppR = rounds.find(r => r.matchupId===m.id && r.playerId===oppId);
    const myNet=myR?.netScore??null, oppNet=oppR?.netScore??null;
    const margin = myNet!==null&&oppNet!==null ? oppNet-myNet : null;
    const winner = margin===null?null:margin>0?"me":margin<0?"opp":"tie";
    return { m, myR, oppR, myNet, oppNet, margin, winner, date:m.roundDate };
  });

  const wins=results.filter(r=>r.winner==="me").length;
  const losses=results.filter(r=>r.winner==="opp").length;
  const ties=results.filter(r=>r.winner==="tie").length;
  const total=results.length;
  const avg=arr=>arr.length?(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1):"—";
  const myNets=results.filter(r=>r.myNet!==null).map(r=>r.myNet);
  const oppNets=results.filter(r=>r.oppNet!==null).map(r=>r.oppNet);
  const margins=results.filter(r=>r.margin!==null).map(r=>Math.abs(r.margin));
  const closest=margins.length?Math.min(...margins):null;
  const biggest=margins.length?Math.max(...margins):null;
  const closestMatch=results.find(r=>r.margin!==null&&Math.abs(r.margin)===closest);
  const biggestMatch=results.find(r=>r.margin!==null&&Math.abs(r.margin)===biggest);

  let streak=0,streakLabel="";
  for (let i=results.length-1;i>=0;i--) {
    const w=results[i].winner;
    if (i===results.length-1){streak=1;streakLabel=w;}
    else if(w===streakLabel)streak++;
    else break;
  }
  const streakStr=total===0?"—":streakLabel==="me"?`🔥 You ${streak}`:streakLabel==="opp"?`${opp?.name?.split(" ")[0]} ${streak}`:`${streak} tied`;
  let longestWin=0,cur=0;
  results.forEach(r=>{ if(r.winner==="me"){cur++;longestWin=Math.max(longestWin,cur);}else cur=0; });

  const hardMy=results.filter(r=>r.myR?.slope>=120&&r.myNet!==null).map(r=>r.myNet);
  const hardOpp=results.filter(r=>r.oppR?.slope>=120&&r.oppNet!==null).map(r=>r.oppNet);
  const easyMy=results.filter(r=>r.myR?.slope<120&&r.myNet!==null).map(r=>r.myNet);
  const easyOpp=results.filter(r=>r.oppR?.slope<120&&r.oppNet!==null).map(r=>r.oppNet);

  const chartData=results.slice(-8);
  const allNets=chartData.flatMap(r=>[r.myNet,r.oppNet]).filter(n=>n!==null);
  const chartMin=allNets.length?Math.min(...allNets)-2:30;
  const chartMax=allNets.length?Math.max(...allNets)+2:50;
  const chartRange=chartMax-chartMin||1;
  const toY=(val,h)=>val===null?null:h-((val-chartMin)/chartRange)*h;
  const CW=480,CH=120,PAD=32;
  const step=chartData.length>1?(CW-PAD*2)/(chartData.length-1):0;
  const myPts=chartData.map((r,i)=>r.myNet!==null?[PAD+i*step,toY(r.myNet,CH)]:null).filter(Boolean);
  const oppPts=chartData.map((r,i)=>r.oppNet!==null?[PAD+i*step,toY(r.oppNet,CH)]:null).filter(Boolean);
  const toPath=pts=>pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  return (
    <div>
      <div className="ptitle">Rivalry Stats</div>
      <div className="psub">Head-to-head breakdown · all time</div>
      {others.length>1&&(
        <div className="fg mb16" style={{ maxWidth:260 }}>
          <div className="lbl">Rivalry</div>
          <select value={oppId} onChange={e=>setOppId(e.target.value)}>
            {others.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      {!opp&&<div className="empty">No opponent found.</div>}
      {opp&&total===0&&(
        <div className="card tc" style={{ padding:48 }}>
          <div style={{ fontSize:48,marginBottom:12 }}>⛳</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"var(--cream)" }}>No completed matchups yet</div>
          <div className="tm mt8">Play some rounds and come back to see who's really better.</div>
        </div>
      )}
      {opp&&total>0&&(
        <>
          <div className="card" style={{ background:"linear-gradient(135deg,var(--card2) 0%,var(--card) 100%)",marginBottom:16 }}>
            <div style={{ textAlign:"center",padding:"8px 0 16px" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:13,letterSpacing:2,color:"var(--muted)",marginBottom:8 }}>
                {cp.name.split(" ")[0].toUpperCase()} VS {opp.name.split(" ")[0].toUpperCase()} · ALL TIME
              </div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:24 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:72,lineHeight:1,color:wins>losses?"var(--gl)":"var(--cream)" }}>{wins}</div>
                  <div style={{ fontSize:11,color:"var(--muted)",letterSpacing:1,textTransform:"uppercase" }}>{cp.name.split(" ")[0]}</div>
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--muted)" }}>{ties>0?`— ${ties}T —`:"—"}</div>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:72,lineHeight:1,color:losses>wins?"var(--red)":"var(--cream)" }}>{losses}</div>
                  <div style={{ fontSize:11,color:"var(--muted)",letterSpacing:1,textTransform:"uppercase" }}>{opp.name.split(" ")[0]}</div>
                </div>
              </div>
              <div style={{ marginTop:12 }}>
                {wins>losses&&<span className="pill pg">You lead the series</span>}
                {losses>wins&&<span className="pill pr">{opp.name.split(" ")[0]} leads the series</span>}
                {wins===losses&&<span className="pill pm">Dead even</span>}
              </div>
            </div>
          </div>
          <div className="srow">
            <div className="sbox"><div className="slbl">Current Streak</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:streakLabel==="me"?"var(--gl)":streakLabel==="opp"?"var(--red)":"var(--muted)",marginTop:4 }}>{streakStr}</div></div>
            <div className="sbox"><div className="slbl">Your Longest Win Streak</div><div className="snum g">{longestWin||"—"}</div></div>
            <div className="sbox"><div className="slbl">Avg Net · You</div><div className="snum gold">{avg(myNets)}</div></div>
            <div className="sbox"><div className="slbl">Avg Net · {opp.name.split(" ")[0]}</div><div className="snum">{avg(oppNets)}</div></div>
          </div>
          {chartData.length>1&&(
            <div className="card" style={{ marginBottom:16 }}>
              <div className="stitle" style={{ marginBottom:16 }}>Net Score Trend</div>
              <div style={{ display:"flex",gap:16,marginBottom:12 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}><div style={{ width:24,height:3,background:"var(--gl)",borderRadius:2 }} /><span style={{ fontSize:12,color:"var(--muted)" }}>{cp.name.split(" ")[0]}</span></div>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}><div style={{ width:24,height:3,background:"var(--gold)",borderRadius:2 }} /><span style={{ fontSize:12,color:"var(--muted)" }}>{opp.name.split(" ")[0]}</span></div>
              </div>
              <svg viewBox={`0 0 ${CW} ${CH+24}`} style={{ width:"100%",overflow:"visible" }}>
                {[0,0.25,0.5,0.75,1].map((t,i)=>{const y=t*CH;const val=Math.round(chartMax-t*chartRange);return(<g key={i}><line x1={PAD} y1={y} x2={CW-PAD} y2={y} stroke="rgba(100,180,130,0.1)" strokeWidth="1"/><text x={PAD-6} y={y+4} textAnchor="end" fill="rgba(107,128,112,0.8)" fontSize="10">{val}</text></g>);})}
                {myPts.length>1&&<path d={toPath(myPts)} fill="none" stroke="var(--gl)" strokeWidth="2.5" strokeLinejoin="round"/>}
                {oppPts.length>1&&<path d={toPath(oppPts)} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeDasharray="6,3" strokeLinejoin="round"/>}
                {myPts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4" fill="var(--gl)" stroke="var(--deep)" strokeWidth="2"/>)}
                {oppPts.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4" fill="var(--gold)" stroke="var(--deep)" strokeWidth="2"/>)}
                {chartData.map((r,i)=><text key={i} x={PAD+i*step} y={CH+18} textAnchor="middle" fill="rgba(107,128,112,0.8)" fontSize="10">{r.date?new Date(r.date).toLocaleDateString("en-US",{month:"numeric",day:"numeric"}):`R${i+1}`}</text>)}
              </svg>
            </div>
          )}
          {(closestMatch||biggestMatch)&&(
            <div className="fr" style={{ gap:12,marginBottom:16 }}>
              {closestMatch&&<div className="card" style={{ flex:1 }}><div className="lbl" style={{ marginBottom:6 }}>🎯 Closest Match</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gl)" }}>{Math.abs(closestMatch.margin)} stroke{Math.abs(closestMatch.margin)!==1?"s":""}</div><div className="tm" style={{ marginTop:4 }}>{closestMatch.winner==="me"?"You won":`${opp.name.split(" ")[0]} won`}{closestMatch.date&&` · ${new Date(closestMatch.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}</div>{closestMatch.myR?.course&&<div className="tm" style={{ fontSize:12 }}>{closestMatch.myR.course}</div>}</div>}
              {biggestMatch&&biggest!==closest&&<div className="card" style={{ flex:1 }}><div className="lbl" style={{ marginBottom:6 }}>💥 Biggest Blowout</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--red)" }}>{Math.abs(biggestMatch.margin)} strokes</div><div className="tm" style={{ marginTop:4 }}>{biggestMatch.winner==="me"?"You won":`${opp.name.split(" ")[0]} won`}{biggestMatch.date&&` · ${new Date(biggestMatch.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}</div>{biggestMatch.myR?.course&&<div className="tm" style={{ fontSize:12 }}>{biggestMatch.myR.course}</div>}</div>}
            </div>
          )}
          {(hardMy.length>0||easyMy.length>0)&&(
            <div className="card" style={{ marginBottom:16 }}>
              <div className="stitle" style={{ marginBottom:12 }}>Course Difficulty Breakdown</div>
              <div className="fr" style={{ gap:12 }}>
                {easyMy.length>0&&<div style={{ flex:1,background:"var(--deep)",borderRadius:8,padding:16 }}><div className="lbl" style={{ marginBottom:6 }}>Easier Courses (Slope &lt;120)</div><div style={{ display:"flex",gap:20 }}><div><div className="tm">You avg</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"var(--gl)" }}>{avg(easyMy)}</div></div><div><div className="tm">{opp.name.split(" ")[0]} avg</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"var(--gold)" }}>{avg(easyOpp)}</div></div></div></div>}
                {hardMy.length>0&&<div style={{ flex:1,background:"var(--deep)",borderRadius:8,padding:16 }}><div className="lbl" style={{ marginBottom:6 }}>Harder Courses (Slope ≥120)</div><div style={{ display:"flex",gap:20 }}><div><div className="tm">You avg</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"var(--gl)" }}>{avg(hardMy)}</div></div><div><div className="tm">{opp.name.split(" ")[0]} avg</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:"var(--gold)" }}>{avg(hardOpp)}</div></div></div></div>}
              </div>
            </div>
          )}
          <div className="stitle">Last {Math.min(5,results.length)} Matchups</div>
          {results.slice(-5).reverse().map(({ m, myNet, oppNet, winner, margin }) => {
            const myR=rounds.find(r=>r.matchupId===m.id&&r.playerId===cp.id);
            const oppR=rounds.find(r=>r.matchupId===m.id&&r.playerId===oppId);
            return (
              <div className="csm" key={m.id}>
                <div className="fb">
                  <div>
                    <div style={{ fontWeight:600,fontSize:14 }}>{myR?.course||oppR?.course||"Unknown Course"}</div>
                    <div className="tm" style={{ fontSize:12 }}>{m.roundDate?new Date(m.roundDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""}{myR?.teeColor&&<span className="pill pm" style={{ marginLeft:8 }}>{myR.teeColor} tees</span>}{myR?.nineUsed&&<span className="pill pm" style={{ marginLeft:6 }}>{myR.nineUsed}</span>}</div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:16,textAlign:"right" }}>
                    <div><div style={{ fontSize:11,color:"var(--muted)" }}>{cp.name.split(" ")[0]}</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:winner==="me"?"var(--gl)":"var(--cream)" }}>{myNet??"—"}</div></div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:13,color:"var(--muted)" }}>vs</div>
                    <div><div style={{ fontSize:11,color:"var(--muted)" }}>{opp.name.split(" ")[0]}</div><div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:winner==="opp"?"var(--red)":"var(--cream)" }}>{oppNet??"—"}</div></div>
                    <div>{winner==="me"&&<span className="pill pg">+{Math.abs(margin)}</span>}{winner==="opp"&&<span className="pill pr">-{Math.abs(margin)}</span>}{winner==="tie"&&<span className="pill pm">TIE</span>}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSIONER  (writes directly to Firestore)
// ─────────────────────────────────────────────────────────────────────────────
function Commissioner({ state, fsUpdate }) {
  const { players, matchups, rounds } = state;
  const [p1, setP1]     = useState("");
  const [p2, setP2]     = useState("");
  const [rDate, setRDate] = useState("");
  const [season, setSeason] = useState(state.season||1);
  const [msg, setMsg]   = useState("");
  const [err, setErr]   = useState("");

  const createMatchup = async () => {
    setErr(""); setMsg("");
    if (!p1||!p2||p1===p2) { setErr("Select two different players."); return; }
    const m = { id:uid(), season:state.season||1, player1Id:p1, player2Id:p2, roundDate:rDate||null, status:"pending" };
    await fsUpdate.addMatchup(m);
    setMsg("Matchup created!"); setP1(""); setP2(""); setRDate("");
  };

  const deleteMatchup = async (id) => {
    if (!confirm("Delete this matchup and its rounds?")) return;
    await fsUpdate.deleteRoundsByMatchup(id);
    await fsUpdate.deleteMatchup(id);
  };

  const removePlayer = async (id) => {
    if (!confirm("Remove this player?")) return;
    await fsUpdate.removePlayer(id);
  };

  const updateSeason = async () => {
    await fsUpdate.setSeason(season);
    setMsg(`Season set to ${season}.`);
  };

  return (
    <div>
      <div className="ptitle">Commissioner</div>
      <div className="psub">Manage players, matchups, and season settings</div>
      <div className="stitle">Season Settings</div>
      <div className="card mb16">
        <div className="fr" style={{ alignItems:"flex-end" }}>
          <div className="fg"><div className="lbl">Season Number</div><input type="number" value={season} onChange={e=>setSeason(parseInt(e.target.value)||1)} min={1} /></div>
          <button className="btn bg_" onClick={updateSeason}>Update</button>
        </div>
      </div>
      <div className="stitle">Create Matchup</div>
      <div className="card">
        <div className="fr">
          <div className="fg"><div className="lbl">Player 1</div><select value={p1} onChange={e=>setP1(e.target.value)}><option value="">— Select —</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="fg"><div className="lbl">Player 2</div><select value={p2} onChange={e=>setP2(e.target.value)}><option value="">— Select —</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="fg"><div className="lbl">Round Window</div><input type="date" value={rDate} onChange={e=>setRDate(e.target.value)} /></div>
        </div>
        {err&&<div className="err">{err}</div>}
        {msg&&<div className="ok">{msg}</div>}
        <div className="mt16"><button className="btn bp" onClick={createMatchup}>Create Matchup</button></div>
      </div>
      <div className="stitle mt24">All Matchups</div>
      {matchups.length===0&&<div className="empty">No matchups yet.</div>}
      {matchups.map(m => {
        const a=players.find(p=>p.id===m.player1Id), b=players.find(p=>p.id===m.player2Id);
        return (
          <div className="csm" key={m.id}>
            <div className="fb">
              <div>
                <span style={{ fontWeight:600 }}>{a?.name}</span><span className="tm"> vs </span><span style={{ fontWeight:600 }}>{b?.name}</span>
                <span className="pill pm" style={{ marginLeft:8 }}>S{m.season}</span>
                <span className={`pill ${m.status==="complete"?"pg":"po"}`} style={{ marginLeft:6 }}>{m.status==="complete"?"Complete":"Pending"}</span>
              </div>
              <button className="btn bd bsm" onClick={()=>deleteMatchup(m.id)}>Delete</button>
            </div>
            {m.roundDate&&<div className="tm mt8" style={{ fontSize:12 }}>Window: {new Date(m.roundDate).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>}
          </div>
        );
      })}
      <div className="stitle mt24">Registered Players</div>
      {players.map(pl => (
        <div className="csm" key={pl.id}>
          <div className="fb">
            <div>
              <div style={{ fontWeight:600 }}>{pl.name}{pl.isCommissioner&&<span className="pill po" style={{ marginLeft:8 }}>Commissioner</span>}</div>
              <div className="tm">{pl.email}</div>
            </div>
            <div style={{ display:"flex",gap:12,alignItems:"center" }}>
              <span className="tm">{pl.differentials?.length||0} rounds · HCP: {pl.handicapIndex??"pending"}</span>
              {!pl.isCommissioner&&<button className="btn bd bsm" onClick={()=>removePlayer(pl.id)}>Remove</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
