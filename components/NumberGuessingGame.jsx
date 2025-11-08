// components/NumberGuessingGame.jsx
import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function NumberGuessingGame() {
  const [stage, setStage] = useState("login"); // login, lobby, setup, play, finished
  const [name, setName] = useState("");
  const [codeIn, setCodeIn] = useState("");
  const [room, setRoom] = useState(null);
  const [invite, setInvite] = useState("");
  const [secret, setSecret] = useState("");
  const [guess, setGuess] = useState("");
  const [debugSub, setDebugSub] = useState("none");
  const [payload, setPayload] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastManualFetchAt, setLastManualFetchAt] = useState(null);
  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(15);

  const gen = () => Math.random().toString(36).substring(2,8).toUpperCase();

  // ---------- Realtime subscription ----------
  useEffect(() => {
    if (!room?.id) { setDebugSub("none"); return; }
    setDebugSub("pending");

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${room.id}` },
        (p) => {
          const rec = p.record;
          setPayload(p);
          if (!rec) return;
          setRoom(rec);

          // if player2 joined, prompt player1 to set secret (lobby -> setup)
          if (rec.player2 && name && rec.player1 === name) {
            setStage(prev => (prev === 'lobby' ? 'setup' : prev));
          }

          // if both secrets present -> play
          if (rec.secret_player1 && rec.secret_player2) {
            setStage('play');
            setTimeLeft(15);
          }

          // winner -> finished
          if (rec.winner) {
            setStage('finished');
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setDebugSub("subscribed");
        else setDebugSub(status.toLowerCase());
      });

    return () => supabase.removeChannel(channel);
  }, [room?.id, name]);

  // ---------- Polling fallback while waiting (2s) ----------
  useEffect(() => {
    if (!room?.id) return;
    let id = null;
    if (stage === "lobby" || stage === "setup") {
      // run an immediate fetch
      (async () => {
        try {
          const { data } = await supabase.from("games").select().eq("id", room.id).single();
          if (data) setRoom(data);
        } catch (e) { /* ignore */ }
      })();

      id = setInterval(async () => {
        try {
          const { data } = await supabase.from("games").select().eq("id", room.id).single();
          if (data) {
            setRoom(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
            // transitions handled in separate effects and realtime callback too
          }
        } catch (e) { /* ignore */ }
      }, 2000);
    }
    return () => id && clearInterval(id);
  }, [room?.id, stage]);

  // ---------- Aggressive auto-fetcher while waiting (1.5s) ----------
  useEffect(() => {
    if (!room?.id) return;
    let id = null;
    const shouldRun = (stage === 'lobby' || stage === 'setup');
    if (!shouldRun) return;
    // immediate fetch
    (async () => {
      try {
        const { data } = await supabase.from('games').select().eq('id', room.id).single();
        if (data) setRoom(data);
      } catch (e) { /* ignore */ }
    })();

    id = setInterval(async () => {
      try {
        const { data } = await supabase.from('games').select().eq('id', room.id).single();
        if (data) {
          setRoom(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
          // UI transitions:
          if (data.player2 && name && data.player1 === name && stage === 'lobby') setStage('setup');
          if (data.secret_player1 && data.secret_player2) { setStage('play'); setTimeLeft(15); }
        }
      } catch (e) { /* ignore */ }
    }, 1500);

    return () => id && clearInterval(id);
  }, [room?.id, stage, name]);

  // ---------- Polling during play stage to pick up manual edits (2s) ----------
  // This ensures manual DB edits (like setting winner or pushing guesses) are picked up automatically.
  useEffect(() => {
    if (!room?.id) return;
    let id = null;
    if (stage === 'play') {
      // immediate fetch
      (async () => {
        try {
          const { data } = await supabase.from('games').select().eq('id', room.id).single();
          if (data) {
            if (JSON.stringify(data) !== JSON.stringify(room)) setRoom(data);
            if (data.winner) {
              setStage('finished');
              if (timerRef.current) clearInterval(timerRef.current);
            }
          }
        } catch (e) { /* ignore */ }
      })();

      id = setInterval(async () => {
        try {
          const { data } = await supabase.from('games').select().eq('id', room.id).single();
          if (data) {
            // update if row changed
            if (JSON.stringify(data) !== JSON.stringify(room)) setRoom(data);
            // if someone manually set winner via SQL/table editor, switch to finished
            if (data.winner) {
              setStage('finished');
              if (timerRef.current) clearInterval(timerRef.current);
            }
          }
        } catch (e) { /* ignore */ }
      }, 2000);
    }
    return () => id && clearInterval(id);
  }, [room?.id, stage, room]);

  // ---------- Timer for playing ----------
  useEffect(() => {
    if (stage !== "play") { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setTimeLeft(t => t <= 1 ? 15 : t - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [stage]);

  // ---------- keyboard shortcut R => manual refresh ----------
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'r' || e.key === 'R') && room?.id) manualRefresh();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [room?.id, name, stage]);

  // ---------- actions ----------
  const createRoom = async () => {
    if (!name.trim()) return alert("Enter name");
    const newCode = gen();
    const { data, error } = await supabase.from("games").insert([{
      code: newCode, player1: name, current_turn: "player1", guesses: [], warnings: { player1:0, player2:0 }
    }]).select().single();
    if (error) return alert(error.message);
    setRoom(data); setInvite(newCode); setStage("lobby");
  };

  const joinRoom = async () => {
    if (!name.trim()) return alert("Enter name");
    if (!codeIn.trim()) return alert("Enter code");
    const code = codeIn.trim().toUpperCase();
    const { data: r } = await supabase.from("games").select().eq("code", code).single();
    if (!r) return alert("Room not found");
    if (r.player2) return alert("Room already has player 2");
    const { data, error } = await supabase.from("games").update({ player2: name }).eq("id", r.id).select().single();
    if (error) return alert(error.message);
    setRoom(data); setInvite(code); setStage("setup");
  };

  const setMySecret = async () => {
    if (!/^\d{4}$/.test(secret)) return alert("Enter 4 digits");
    const playerKey = room.player1 === name ? "secret_player1" : "secret_player2";
    const { data, error } = await supabase.from("games").update({ [playerKey]: secret }).eq("id", room.id).select().single();
    if (error) return alert(error.message);
    setRoom(data); setSecret("");
    // realtime/poller will detect both secrets and move to play
  };

  const manualRefresh = async () => {
    if (!room?.id) return;
    try {
      const { data, error } = await supabase.from("games").select().eq("id", room.id).single();
      if (!error && data) {
        setRoom(data);
        if (data.player2 && name && data.player1 === name && stage === 'lobby') setStage('setup');
        if (data.secret_player1 && data.secret_player2) { setStage('play'); setTimeLeft(15); }
        if (data.winner) { setStage('finished'); if (timerRef.current) clearInterval(timerRef.current); }
        setLastManualFetchAt(new Date().toISOString());
        console.log('Manual refresh success', data);
      } else {
        console.warn('Manual refresh error', error);
      }
    } catch (e) {
      console.warn('Manual refresh exception', e);
    }
  };

  const calculateFeedback = (guessStr, secretStr) => {
    if (!guessStr || !secretStr) return { totalMatches: 0, correctPositions: 0 };
    let cp = 0, cd = 0;
    const g = guessStr.split(''), s = secretStr.split('');
    const usedS = [false,false,false,false], usedG = [false,false,false,false];
    for (let i=0;i<4;i++) if (g[i] === s[i]) { cp++; usedS[i]=true; usedG[i]=true; }
    for (let i=0;i<4;i++){
      if (!usedG[i]) for (let j=0;j<4;j++) if (!usedS[j] && g[i] === s[j]) { cd++; usedS[j]=true; break; }
    }
    return { totalMatches: cp+cd, correctPositions: cp };
  };

  const makeGuess = async () => {
    if (!/^\d{4}$/.test(guess)) return alert("Enter 4 digits");
    if (!room) return;
    const myKey = room.player1 === name ? 'player1' : 'player2';
    const isMyTurn = room.current_turn === myKey;
    if (!isMyTurn) return alert("Not your turn");
    const opponentSecret = myKey === 'player1' ? room.secret_player2 : room.secret_player1;
    if (!opponentSecret) return alert("Opponent hasn't set secret");
    const feedback = calculateFeedback(guess, opponentSecret);
    const newGuesses = [...(room.guesses || []), { player: name, guess, feedback, auto: false }];
    const updates = { guesses: newGuesses };
    if (feedback.correctPositions === 4) updates.winner = name;
    else updates.current_turn = room.current_turn === 'player1' ? 'player2' : 'player1';
    const { data, error } = await supabase.from('games').update(updates).eq('id', room.id).select().single();
    if (error) return alert(error.message);
    setRoom(data);
    setGuess('');
  };

  const handleTimeout = async () => {
    if (!room) return;
    const playerKey = room.current_turn;
    const opponentSecret = playerKey === 'player1' ? room.secret_player2 : room.secret_player1;
    if (!opponentSecret) return;
    const autoGuess = Math.floor(1000 + Math.random()*9000).toString();
    const feedback = calculateFeedback(autoGuess, opponentSecret);
    const newGuesses = [...(room.guesses || []), { player: room[playerKey], guess: autoGuess, feedback, auto: true }];
    const newWarnings = { ...(room.warnings || { player1:0, player2:0 }) };
    newWarnings[playerKey] = (newWarnings[playerKey] || 0) + 1;
    await supabase.from('games').update({
      guesses: newGuesses,
      warnings: newWarnings,
      current_turn: playerKey === 'player1' ? 'player2' : 'player1'
    }).eq('id', room.id);
  };

  // ---------- UI helpers ----------
  const topButtonStyle = { zIndex: 999999, position: 'relative', pointerEvents: 'auto' };
  const topFloatingStyle = { zIndex: 999999, pointerEvents: 'auto' };

  // ---------- UI ----------
  if (stage === "login") {
    return (
      <div className="container">
        <div className="card center-card">
          <h1 className="h1">Number Guessing — Multiplayer</h1>
          <div className="lead">Create or join a room (no local setup)</div>

          <input className="input" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" placeholder="Invite code to join (optional)" value={codeIn} onChange={e=>setCodeIn(e.target.value.toUpperCase())} />

          <div style={{display:'flex',gap:10}}>
            <button style={topButtonStyle} className="btn" onClick={createRoom}>Create Room</button>
            <button style={topButtonStyle} className="btn secondary" onClick={joinRoom}>Join Room</button>
          </div>
          <div style={{marginTop:12}} className="small">Debug: subscription {debugSub} — Press <strong>R</strong> to refresh</div>
        </div>
      </div>
    );
  }

  if (stage === "lobby") {
    return (
      <div className="container">
        <div className="card center-card center">
          <h2 className="h2">Waiting for Player 2</h2>
          <div className="mono" style={{margin:'12px 0'}}>{invite}</div>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button style={topButtonStyle} className="btn" onClick={()=>{navigator.clipboard?.writeText(invite); setCopied(true); setTimeout(()=>setCopied(false),1500)}}>{copied ? "Copied" : "Copy Code"}</button>
            <button style={topButtonStyle} className="btn ghost" onClick={manualRefresh}>Manual Refresh</button>
            <button style={topButtonStyle} className="btn warn" onClick={async()=>{ await supabase.from('games').delete().eq('id', room.id); setRoom(null); setStage('login'); }}>Cancel</button>
          </div>
          <div style={{marginTop:12}} className="small">If player joined but you still see this, Manual Refresh or press R — but auto-sync is enabled too.</div>
        </div>

        <div className="debug" style={topFloatingStyle}>
          <div><strong>Realtime:</strong> {debugSub}</div>
          <div style={{marginTop:8}}><strong>Last payload:</strong></div>
          <pre>{payload ? JSON.stringify(payload, null, 2) : '—'}</pre>
          <div style={{marginTop:8,fontSize:12}}>Last fetch: {lastManualFetchAt || '—'}</div>
        </div>
      </div>
    );
  }

  if (stage === "setup") {
    const hasSet = (room?.player1 === name && room?.secret_player1) || (room?.player2 === name && room?.secret_player2);
    return (
      <div className="container">
        <div className="card center-card center">
          <h2 className="h2">Set your secret number</h2>
          {!hasSet ? (
            <>
              <input className="input mono" placeholder="4 digits" maxLength={4} value={secret} onChange={e=>setSecret(e.target.value.replace(/\D/g,''))} />
              <button style={topButtonStyle} className="btn secondary" onClick={setMySecret}>Set Secret</button>
            </>
          ) : (
            <>
              <div className="small">Secret set — waiting for opponent</div>
              <button style={topButtonStyle} className="btn ghost" onClick={manualRefresh} style={{...topButtonStyle, marginTop:12}}>Manual Refresh</button>
            </>
          )}
          <div style={{marginTop:10}} className="small">Debug: subscription {debugSub}</div>
        </div>

        <div className="debug" style={topFloatingStyle}>
          <div><strong>Realtime:</strong> {debugSub}</div>
          <div style={{marginTop:8}}><strong>Last payload:</strong></div>
          <pre>{payload ? JSON.stringify(payload, null, 2) : '—'}</pre>
          <div style={{marginTop:8,fontSize:12}}>Last fetch: {lastManualFetchAt || '—'}</div>
        </div>
      </div>
    );
  }

  if (stage === "play") {
    const isMyTurn = room?.current_turn === (room.player1 === name ? 'player1' : 'player2');
    return (
      <div className="container">
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:700}}>{room.player1}{room.current_turn === 'player1' && ' ◀'}</div>
              <div style={{fontWeight:700}}>{room.player2}{room.current_turn === 'player2' && ' ◀'}</div>
            </div>
            <div style={{fontSize:20,fontWeight:700}}>{timeLeft}s</div>
          </div>

          <div style={{display:'flex',gap:10,marginTop:16}}>
            <input className="input mono" placeholder="4 digits" value={guess} onChange={e=>setGuess(e.target.value.replace(/\D/g,''))} maxLength={4} disabled={!isMyTurn} />
            <button style={topButtonStyle} className="btn" onClick={makeGuess} disabled={!isMyTurn}>Guess</button>
          </div>

          <div style={{marginTop:16}}>
            {(room.guesses||[]).slice().reverse().map((g,i)=>(
              <div key={i} className="guess">
                <div style={{display:'flex',justifyContent:'space-between'}}><div style={{fontWeight:600}}>{g.player}</div>{g.auto && <div style={{color:'#f59e0b'}}>Auto</div>}</div>
                <div className="mono" style={{marginTop:6}}>{g.guess} → {g.feedback.totalMatches} digits, {g.feedback.correctPositions} positions</div>
              </div>
            ))}
          </div>
        </div>

        <div className="debug" style={{ ...topFloatingStyle, right: 16, top: 16 }}>
          <div><strong>Realtime:</strong> {debugSub}</div>
          <div style={{marginTop:6}}><strong>Last payload:</strong></div>
          <pre>{payload ? JSON.stringify(payload, null, 2) : '—'}</pre>
          <div style={{marginTop:6}} className="small">Manual refresh:</div>
          <div style={{display:'flex',gap:8,marginTop:6}}>
            <button style={topButtonStyle} className="btn ghost" onClick={manualRefresh}>Refresh</button>
            <button style={topButtonStyle} className="btn warn" onClick={async ()=>{ await supabase.from('games').delete().eq('id', room.id); setRoom(null); setStage('login'); }}>End</button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "finished") {
    return (
      <div className="container">
        <div className="card center-card center">
          <h2 className="h2">{room?.winner} wins 🎉</h2>
          <div className="small">Total guesses: {(room?.guesses||[]).length}</div>
          <div style={{marginTop:12}}>
            <button style={topButtonStyle} className="btn" onClick={async ()=>{ await supabase.from('games').delete().eq('id', room.id); setStage('login'); setRoom(null); }}>Play again</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
