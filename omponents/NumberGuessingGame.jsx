import React, { useState, useEffect, useRef } from 'react';
import { Users, Trophy, Clock, AlertCircle, Copy, Check } from 'lucide-react';

export default function NumberGuessingGame() {
  const [gameState, setGameState] = useState('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  const [secretNumbers, setSecretNumbers] = useState({});
  const [guesses, setGuesses] = useState([]);
  const [currentTurn, setCurrentTurn] = useState('player1');
  const [timeLeft, setTimeLeft] = useState(15);
  const [warnings, setWarnings] = useState({ player1: 0, player2: 0 });
  const [winner, setWinner] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const timerRef = useRef(null);

  const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  useEffect(() => {
    if (gameState === 'playing' && !winner) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimeout();
            return 15;
          }
          return prev - 1;
        });
      }, 1000);

      return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, currentTurn, winner]);

  const handleTimeout = () => {
    const playerKey = currentTurn;
    const player = playerKey === 'player1' ? player1 : player2;
    const opponentSecret = playerKey === 'player1' ? secretNumbers.player2 : secretNumbers.player1;
    if (!opponentSecret) return;
    const autoGuess = Math.floor(1000 + Math.random() * 9000).toString();
    const feedback = calculateFeedback(autoGuess, opponentSecret);
    setGuesses(prev => [...prev, { player, guess: autoGuess, feedback, auto: true }]);
    setWarnings(prev => ({ ...prev, [playerKey]: (prev[playerKey] || 0) + 1 }));
    setCurrentTurn(prev => (prev === 'player1' ? 'player2' : 'player1'));
    setTimeLeft(15);
  };

  const calculateFeedback = (guess, secret) => {
    if (!guess || !secret) return { totalMatches: 0, correctPositions: 0 };
    let correctPositions = 0;
    let correctDigits = 0;
    const guessArr = guess.split('');
    const secretArr = secret.split('');
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

  const handleLogin = () => {
    const username = usernameInput.trim();
    if (!username) return;
    if (!player1) {
      const code = generateCode();
      setPlayer1(username); setCurrentUser(username); setInviteCode(code); setGameState('lobby');
    } else if (!player2 && username !== player1) {
      setPlayer2(username); setCurrentUser(username); setGameState('setup');
    }
    setUsernameInput('');
  };

  const joinGame = (code) => { if (code === inviteCode && player1) setGameState('setup'); };

  const setSecretNumber = (number) => {
    if (number.length !== 4 || !/^\d{4}$/.test(number)) { alert('Please enter exactly 4 digits'); return; }
    const playerKey = currentUser === player1 ? 'player1' : 'player2';
    setSecretNumbers(prev => {
      const next = { ...prev, [playerKey]: number };
      if (next.player1 && next.player2) { setGameState('playing'); setWaitingForOpponent(false); setTimeLeft(15); } else { setWaitingForOpponent(true); }
      return next;
    });
    setSecretInput('');
  };

  const makeGuess = () => {
    if (inputValue.length !== 4 || !/^\d{4}$/.test(inputValue)) { alert('Please enter exactly 4 digits'); return; }
    const myTurn = (currentUser === player1 && currentTurn === 'player1') || (currentUser === player2 && currentTurn === 'player2');
    if (!myTurn) { alert('Not your turn!'); return; }
    const opponentSecret = currentTurn === 'player1' ? secretNumbers.player2 : secretNumbers.player1;
    if (!opponentSecret) { alert('Opponent has not set their number yet'); return; }
    const feedback = calculateFeedback(inputValue, opponentSecret);
    setGuesses(prev => [...prev, { player: currentUser, guess: inputValue, feedback, auto: false }]);
    if (feedback.correctPositions === 4) {
      setWinner(currentUser); setGameState('finished'); if (timerRef.current) clearInterval(timerRef.current);
    } else {
      setCurrentTurn(prev => (prev === 'player1' ? 'player2' : 'player1')); setTimeLeft(15);
    }
    setInputValue('');
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(inviteCode); }
      else { const tmp = document.createElement('textarea'); tmp.value = inviteCode; document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp); }
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.error('Copy failed', e); }
  };

  const resetGame = () => {
    setGameState('login'); setCurrentUser(null); setPlayer1(null); setPlayer2(null); setInviteCode(''); setSecretNumbers({}); setGuesses([]);
    setCurrentTurn('player1'); setTimeLeft(15); setWarnings({ player1: 0, player2: 0 }); setWinner(null); setInputValue(''); setSecretInput(''); setWaitingForOpponent(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (gameState === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/20">
          <div className="flex justify-center mb-6"><Users className="w-16 h-16 text-blue-300" /></div>
          <h1 className="text-4xl font-bold text-white text-center mb-2">Number Guessing Game</h1>
          <p className="text-blue-200 text-center mb-8">Enter your username to start</p>
          <input type="text" placeholder="Enter username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4" onKeyPress={(e) => e.key === 'Enter' && handleLogin()} />
          <button onClick={handleLogin} className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-600 transition-all transform hover:scale-105">Continue</button>
        </div>
      </div>
    );
  }

  if (gameState === 'lobby' && currentUser === player1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/20">
          <h2 className="text-3xl font-bold text-white text-center mb-6">Waiting for Player 2</h2>
          <div className="bg-white/20 rounded-xl p-6 mb-6">
            <p className="text-blue-200 text-sm mb-2">Share this invite code:</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white/30 rounded-lg px-4 py-3 text-white font-mono text-2xl text-center">{inviteCode}</div>
              <button onClick={copyInviteCode} className="bg-blue-500 p-3 rounded-lg hover:bg-blue-600 transition-colors">{copied ? <Check className="w-6 h-6 text-white" /> : <Copy className="w-6 h-6 text-white" />}</button>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="animate-pulse text-blue-300 text-center">
              <div className="flex gap-2 justify-center mb-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              Waiting for opponent to join...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'setup') {
    const hasSetNumber = currentUser === player1 ? secretNumbers.player1 : secretNumbers.player2;
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/20">
          <h2 className="text-3xl font-bold text-white text-center mb-2">Setup Your Secret Number</h2>
          <p className="text-blue-200 text-center mb-8">Choose a 4-digit number</p>
          {!hasSetNumber && !waitingForOpponent ? (
            <>
              <input type="text" maxLength="4" placeholder="Enter 4 digits" value={secretInput} onChange={(e) => setSecretInput(e.target.value.replace(/\D/g, ''))} className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white text-center text-2xl font-mono placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4" onKeyPress={(e) => e.key === 'Enter' && setSecretNumber(secretInput)} />
              <button onClick={() => setSecretNumber(secretInput)} className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105">Confirm Secret Number</button>
            </>
          ) : (
            <div className="text-center">
              <div className="bg-green-500/20 border border-green-400/50 rounded-xl p-6 mb-6">
                <Check className="w-12 h-12 text-green-400 mx-auto mb-2" />
                <p className="text-green-300 font-semibold">Secret number set!</p>
              </div>
              <div className="animate-pulse text-blue-300">
                <div className="flex gap-2 justify-center mb-2">
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                Waiting for opponent...
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'playing') {
    const isMyTurn = (currentUser === player1 && currentTurn === 'player1') || (currentUser === player2 && currentTurn === 'player2');
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-4 border border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`px-4 py-2 rounded-lg ${currentTurn === 'player1' ? 'bg-blue-500' : 'bg-white/20'}`}>
                  <p className="text-white font-semibold">{player1}</p>
                  {warnings.player1 > 0 && (<p className="text-yellow-300 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {warnings.player1} warning(s)</p>)}
                </div>
                <div className="text-white text-xl">VS</div>
                <div className={`px-4 py-2 rounded-lg ${currentTurn === 'player2' ? 'bg-blue-500' : 'bg-white/20'}`}>
                  <p className="text-white font-semibold">{player2}</p>
                  {warnings.player2 > 0 && (<p className="text-yellow-300 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {warnings.player2} warning(s)</p>)}
                </div>
              </div>
              <div className="flex items-center gap-3"><Clock className="w-6 h-6 text-blue-300" /><span className={`text-3xl font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>{timeLeft}s</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">{isMyTurn ? 'Your Turn - Make a Guess' : `Waiting for ${currentTurn === 'player1' ? player1 : player2}...`}</h3>
              <div className="flex gap-3 mb-6">
                <input type="text" maxLength="4" placeholder="Enter 4 digits" value={inputValue} onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))} disabled={!isMyTurn} className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white text-center text-2xl font-mono placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50" onKeyPress={(e) => e.key === 'Enter' && isMyTurn && makeGuess()} />
                <button onClick={makeGuess} disabled={!isMyTurn} className="px-6 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-purple-600 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">Guess</button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {guesses.slice().reverse().map((g, idx) => (
                  <div key={idx} className={`p-4 rounded-xl ${g.player === currentUser ? 'bg-blue-500/30' : 'bg-purple-500/30'} border border-white/20`}>
                    <div className="flex items-center justify-between mb-2"><span className="text-white font-semibold">{g.player}</span>{g.auto && (<span className="text-yellow-300 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Auto-guess (Timeout)</span>)}</div>
                    <div className="flex items-center gap-4"><div className="text-white font-mono text-xl">{g.guess}</div><div className="text-blue-200 text-sm">→ {g.feedback.totalMatches} digit(s), {g.feedback.correctPositions} position(s)</div></div>
                  </div>
                ))}
                {guesses.length === 0 && (<div className="text-center text-blue-300 py-8">No guesses yet. Start guessing!</div>)}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h3 className="text-lg font-bold text-white mb-3">Your Secret</h3>
                <div className="bg-white/20 rounded-xl px-4 py-3 text-white font-mono text-2xl text-center">{currentUser === player1 ? secretNumbers.player1 : secretNumbers.player2}</div>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h3 className="text-lg font-bold text-white mb-3">Game Rules</h3>
                <ul className="text-blue-200 text-sm space-y-2"><li>• Guess the 4-digit number</li><li>• Get feedback on digits & positions</li><li>• 15 seconds per turn</li><li>• First to guess wins!</li></ul>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h3 className="text-lg font-bold text-white mb-2">Statistics</h3>
                <div className="text-blue-200 text-sm space-y-1"><p>Total Guesses: {guesses.length}</p><p>Your Guesses: {guesses.filter(g => g.player === currentUser).length}</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl border border-white/20 text-center">
          <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-4 animate-bounce" />
          <h1 className="text-4xl font-bold text-white mb-2">🎉 {winner} Wins! 🎉</h1>
          <p className="text-blue-200 mb-6">Congratulations on guessing the number!</p>
          <div className="bg-white/20 rounded-xl p-4 mb-6">
            <p className="text-blue-200 text-sm mb-2">Game Statistics</p>
            <div className="text-white space-y-1"><p>Total Guesses: {guesses.length}</p><p>{player1}'s Guesses: {guesses.filter(g => g.player === player1).length}</p><p>{player2}'s Guesses: {guesses.filter(g => g.player === player2).length}</p></div>
          </div>
          <button onClick={resetGame} className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-purple-600 transition-all transform hover:scale-105">Play Again</button>
        </div>
      </div>
    );
  }

  return null;
}
