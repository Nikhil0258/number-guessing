import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Users, Trophy, Clock, AlertCircle, Copy, Check } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function NumberGuessingGame() {
  // UI + game state
  const [gameState, setGameState] = useState("login"); // login, lobby, setup, playing, finished
  const [usernameInput, setUsernameInput] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null); // the row from Supabase
  const [secretInput, setSecretInput] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(15);

  // Helper: generate readable code
  const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  // Subscribe to realtime updates for the current room
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`public:games:id=eq.${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${room.id}` },
        (payload) => {
          // payload.record is the new row after change
          const newRow = payload.record;
          setRoom(newRow);

          // handle transition to playing state
          if (newRow.secret_player1 && newRow.secret_player2 && gameState !== "playing" && (newRow.player1 === currentUser || newRow.player2 === currentUser)) {
            setGameState("playing");
            setTimeLeft(15);
          }

          // handle winner screen
          if (newRow.winner) {
            setGameState("finished");
            clearInterval(timerRef.current);
          }
        }
      )
      .subscribe((status) => {
        // console.log("channel status", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, currentUser]);

  // Timer for turns (client-side visual)
  useEffect(() => {
    if (gameState === "playing" && !room?.winner) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimeout();
            return 15;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, room?.current_turn, room?.winner]);

  // Timeout: auto-guess & increment warnings by updating the DB row
  const handleTimeout = async () => {
    if (!room) return;
    const playerKey = room.current_turn; // 'player1' or 'player2'
    const opponentSecret = playerKey === "player1" ? room.secret_player2 : room.secret_player1;
    if (!opponentSecret) return;

    const autoGuess = Math.floor(1000 + Math.random() * 9000).toString();
    const feedback = calculateFeedback(autoGuess, opponentSecret);

    const newGuesses = Array.isArray(room.guesses) ? [...room.guesses, { player: room[playerKey], guess: autoGuess, feedback, auto: true }] : [{ player: room[playerKey], guess: autoGuess, feedback, auto: true }];

    const newWarnings = { ...(room.warnings || { player1: 0, player2: 0 }) };
    newWarnings[playerKey] = (newWarnings[playerKey] || 0) + 1;

    // update DB: guesses, warnings, switch turn
    await supabase
      .from("games")
      .update({
        guesses: newGuesses,
        warnings: newWarnings,
        current_turn: playerKey === "player1" ? "player2" : "player1"
      })
      .eq("id", room.id);
  };

  const calculateFeedback = (guess, secret) => {
    if (!guess || !secret) return { totalMatches: 0, correctPositions: 0 };
    let correctPositions = 0;
    let correctDigits = 0;
    const guessArr = guess.split("");
    const secretArr = secret.split("");
    const usedSecret = new Array(4).fill(false);
    const usedGuess = new Array(4).fill(false);
    for (let i = 0; i < 4; i++) {
      if (guessArr[i] === secretArr[i]) {
        correctPositions++; usedSecret[i] = true; usedGuess[i] = true;
      }
    }
    for (let i = 0; i < 4; i++) {
      if (!usedGuess[i]) {
        for (let j = 0; j < 4; j++) {
          if (!usedSecret[j] && guessArr[i] === secretArr[j]) { correctDigits++; usedSecret[j] = true; break; }
        }
      }
    }
    return { totalMatches: correctDigits + correctPositions, correctPositions };
  };

  // Create a room as player1
  const createRoom = async () => {
    const username = usernameInput.trim();
    if (!username) return;
    const code = generateCode();
    const { data, error } = await supabase.from("games").insert([{
      code,
      player1: username,
      current_turn: "player1",
      guesses: [],
      warnings: { player1: 0, player2: 0 }
    }]).select().single();
    if (error) {
      alert("Error creating room: " + error.message);
      return;
    }
    setRoom(data);
    setRoomCode(code);
    setCurrentUser(username);
    setGameState("lobby");
  };

  // Join existing room as player2
  const joinRoom = async () => {
    const username = usernameInput.trim();
    if (!username) return;
    if (!inviteInput.trim()) { alert("Enter invite code"); return; }
    const code = inviteInput.trim().toUpperCase();
    // fetch room
    const { data: roomRow, error: fetchErr } = await supabase.from("games").select().eq("code", code).single();
    if (fetchErr || !roomRow) {
      alert("Room not found");
      return;
    }
    if (roomRow.player2) {
      alert("Room already has player2");
      return;
    }
    // update to add player2
    const { data, error } = await supabase.from("games").update({ player2: username }).eq("id", roomRow.id).select().single();
    if (error) { alert("Error joining room: " + error.message); return; }
    setRoom(data);
    setRoomCode(code);
    setCurrentUser(username);
    setGameState("setup");
  };

  // Set secret number (writes to DB)
  const setSecretNumber = async (num) => {
    if (!num || !/^\d{4}$/.test(num)) { alert("Enter 4 digits"); return; }
    const playerKey = room && currentUser === room.player1 ? "secret_player1" : "secret_player2";
    const { data, error } = await supabase.from("games").update({ [playerKey]: num }).eq("id", room.id).select().single();
    if (error) { alert("Error setting secret: " + error.message); return; }
    setRoom(data);
    setSecretInput("");
    // if both secrets are set, server-side change will switch to playing via subscription
  };

  // Make a guess (writes to DB)
  const makeGuess = async () => {
    if (!/^\d{4}$/.test(inputValue)) { alert("Enter 4 digits"); return; }
    if (!room) return;
    const myKey = room.player1 === currentUser ? "player1" : "player2";
    const amIturn = (room.current_turn === (myKey === "player1" ? "player1" : "player2"));
    if (!amIturn) { alert("Not your turn"); return; }

    const opponentSecret = myKey === "player1" ? room.secret_player2 : room.secret_player1;
    if (!opponentSecret) { alert("Opponent hasn't set their secret"); return; }

    const feedback = calculateFeedback(inputValue, opponentSecret);
    const newGuesses = [...(room.guesses || []), { player: currentUser, guess: inputValue, feedback, auto: false }];
    let updates = { guesses: newGuesses };

    // Check win
    if (feedback.correctPositions === 4) {
      updates.winner = currentUser;
    } else {
      // switch turn
      updates.current_turn = room.current_turn === "player1" ? "player2" : "player1";
    }

    const { data, error } = await supabase.from("games").update(updates).eq("id", room.id).select().single();
    if (error) { alert("Error submitting guess: " + error.message); return; }

    setRoom(data);
    setInputValue("");
  };

  // Copy invite code
  const copyInvite = async () => {
    if (!room?.code) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.error(e); }
  };

  // Reset: delete room if exists, and reset state locally
  const resetGame = async () => {
    if (room?.id) {
      await supabase.from("games").delete().eq("id", room.id);
    }
    setGameState("login");
    setUsernameInput("");
    setInviteInput("");
    setCurrentUser(null);
    setRoom(null);
    setRoomCode("");
    setSecretInput("");
    setInputValue("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ---------- UI render ----------
  if (gameState === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/5 rounded-3xl p-8 max-w-md w-full">
          <div className="flex justify-center mb-6"><Users className="w-16 h-16 text-blue-300" /></div>
          <h1 className="text-3xl font-bold mb-2">Number Guessing - Supabase</h1>
          <p className="mb-4">Enter username to create or join a room</p>

          <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Your name" className="w-full p-3 mb-3 rounded" />
          <div className="mb-2 text-sm">Join existing game (paste code):</div>
          <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value.toUpperCase())} placeholder="Invite code" className="w-full p-3 mb-3 rounded" />

          <div className="flex gap-2">
            <button onClick={createRoom} className="flex-1 p-3 rounded bg-blue-600 text-white">Create Room</button>
            <button onClick={joinRoom} className="flex-1 p-3 rounded bg-green-600 text-white">Join Room</button>
          </div>
        </div>
      </div>
    );
  }

  // Lobby (player1 waiting)
  if (gameState === "lobby") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/5 rounded-3xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Waiting for Player 2</h2>
          <p>Share this invite code:</p>
          <div className="font-mono text-2xl my-3">{room?.code}</div>
          <button onClick={copyInvite} className="mb-3 p-3 rounded bg-blue-600 text-white">{copied ? "Copied" : "Copy Code"}</button>
          <div>Waiting for opponent to join...</div>
          <div className="mt-4 text-sm">Or cancel: <button onClick={resetGame} className="text-red-500">Cancel</button></div>
        </div>
      </div>
    );
  }

  if (gameState === "setup") {
    const hasSet = (room?.player1 === currentUser && room?.secret_player1) || (room?.player2 === currentUser && room?.secret_player2);
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/5 rounded-3xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-2">Set Your Secret</h2>
          {!hasSet ? (
            <>
              <input value={secretInput} onChange={(e) => setSecretInput(e.target.value.replace(/\D/g, ""))} maxLength={4} placeholder="4 digits" className="w-full p-3 mb-3 rounded text-center" />
              <button onClick={() => setSecretNumber(secretInput)} className="w-full p-3 rounded bg-green-600 text-white">Set Secret</button>
            </>
          ) : (
            <div>Secret set — waiting for opponent...</div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === "playing") {
    const isMyTurn = (room.current_turn === (room.player1 === currentUser ? "player1" : "player2"));
    const mySecret = room.player1 === currentUser ? room.secret_player1 : room.secret_player2;

    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/5 p-4 rounded mb-4 flex justify-between items-center">
            <div>
              <div className="font-semibold">{room.player1} {room.current_turn === 'player1' && <span className="text-sm text-blue-400">◀ turn</span>}</div>
              <div className="font-semibold">{room.player2} {room.current_turn === 'player2' && <span className="text-sm text-blue-400">◀ turn</span>}</div>
            </div>
            <div className="text-2xl font-bold">{timeLeft}s</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white/5 p-4 rounded">
              <h3 className="mb-3">{isMyTurn ? "Your turn — make a guess" : `Waiting for ${room.current_turn === 'player1' ? room.player1 : room.player2}`}</h3>

              <div className="flex gap-2 mb-4">
                <input value={inputValue} onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ""))} maxLength={4} placeholder="4 digits" className="flex-1 p-3 rounded text-center" disabled={!isMyTurn} />
                <button onClick={makeGuess} disabled={!isMyTurn} className="p-3 rounded bg-blue-600 text-white">Guess</button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(room.guesses || []).slice().reverse().map((g, i) => (
                  <div key={i} className="p-3 rounded bg-white/10">
                    <div className="flex justify-between"><div className="font-semibold">{g.player}</div>{g.auto && <div className="text-sm text-yellow-300">Auto (timeout)</div>}</div>
                    <div className="font-mono mt-2">{g.guess} → {g.feedback.totalMatches} digits, {g.feedback.correctPositions} positions</div>
                  </div>
                ))}
                {(!room.guesses || room.guesses.length === 0) && <div className="p-8 text-center text-sm">No guesses yet.</div>}
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-white/5 rounded text-center">
                <h4 className="font-semibold mb-2">Your Secret</h4>
                <div className="font-mono text-xl">{mySecret || "—"}</div>
              </div>

              <div className="p-4 bg-white/5 rounded">
                <h4 className="font-semibold mb-2">Rules</h4>
                <div className="text-sm">Guess the 4-digit number. 15s per turn. First to guess wins.</div>
              </div>

              <div className="p-4 bg-white/5 rounded">
                <h4 className="font-semibold mb-2">Stats</h4>
                <div className="text-sm">Total guesses: {(room.guesses || []).length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === "finished") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/5 rounded-3xl p-8 max-w-md w-full text-center">
          <Trophy className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{room?.winner} wins!</h2>
          <div className="mb-4">Total guesses: {(room?.guesses || []).length}</div>
          <button onClick={resetGame} className="p-3 rounded bg-blue-600 text-white">Play Again</button>
        </div>
      </div>
    );
  }

  return null;
}
