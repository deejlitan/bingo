'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Trophy, RotateCcw, X, Megaphone, ArrowRight, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PATTERN_LABEL, generateCard, emptyMarked, winChecks } from '@/lib/bingo';
import { fireConfetti } from '@/lib/confetti';

export default function PlayerPage() {
  const { gameId: code } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState(null);
  const [player, setPlayer] = useState(null);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [tab, setTab] = useState('card');
  const [latest, setLatest] = useState(null);
  const [showLatest, setShowLatest] = useState(false);
  const [won, setWon] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const playerRef = useRef(null);
  const seenVerified = useRef(new Set());

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // Load game
  useEffect(() => {
    let cancelled = false;
    let gameChannel, claimsChannel;

    async function load() {
      const { data: g } = await supabase.from('games').select('*').eq('code', code).maybeSingle();
      if (cancelled) return;
      if (!g) {
        router.push('/');
        return;
      }
      setGame(g);

      // Restore player from localStorage if previously joined
      const stored = localStorage.getItem(`bingo:${code}:player`);
      if (stored) {
        const { data: p } = await supabase.from('players').select('*').eq('id', stored).maybeSingle();
        if (p && !cancelled) setPlayer(p);
      }

      // Seed verified-claim set so existing wins don't re-fire on reload
      const { data: existing } = await supabase
        .from('claims')
        .select('id, status')
        .eq('game_id', g.id)
        .eq('status', 'verified');
      (existing || []).forEach((c) => seenVerified.current.add(c.id));

      // Subscribe to game updates (new draws)
      gameChannel = supabase
        .channel(`game:${g.id}:player`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${g.id}` },
          (payload) => {
            const prev = (game?.drawn || []).length;
            const next = payload.new.drawn?.length || 0;
            setGame(payload.new);
            if (next > prev && payload.new.drawn[0]) {
              setLatest(payload.new.drawn[0]);
              setShowLatest(true);
              setTimeout(() => setShowLatest(false), 2800);
            }
          }
        )
        .subscribe();

      // Subscribe to claim updates for win celebrations
      claimsChannel = supabase
        .channel(`claims:${g.id}:player`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'claims', filter: `game_id=eq.${g.id}` },
          async (payload) => {
            const row = payload.new;
            if (!row || row.status !== 'verified' || seenVerified.current.has(row.id)) return;
            seenVerified.current.add(row.id);
            const { data: winner } = await supabase
              .from('players')
              .select('id, name')
              .eq('id', row.player_id)
              .maybeSingle();
            const isSelf = playerRef.current && playerRef.current.id === row.player_id;
            setCelebration({
              name: winner?.name || 'Someone',
              pattern: row.pattern,
              isSelf,
            });
            fireConfetti();
          }
        )
        .subscribe();
    }

    load();
    return () => {
      cancelled = true;
      if (gameChannel) supabase.removeChannel(gameChannel);
      if (claimsChannel) supabase.removeChannel(claimsChannel);
    };
  }, [code, supabase, router]);

  // Track latest draw separately so we get notifications even on initial load join
  useEffect(() => {
    if (!game) return;
    const top = game.drawn?.[0];
    if (top && top !== latest) {
      setLatest(top);
    }
  }, [game]);

  // Win check
  useEffect(() => {
    if (!player || !game) return;
    const n = game.grid_size;
    const activePatterns = Object.entries(game.patterns).filter(([, v]) => v).map(([k]) => k);
    for (const p of activePatterns) {
      if (winChecks[p](player.marked, n)) {
        setWon(p);
        return;
      }
    }
    setWon(null);
  }, [player, game]);

  async function handleJoin(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !game || joining) return;
    setJoining(true);
    setJoinError('');

    // Pre-check: name already taken in this game (case-insensitive)
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', game.id)
      .ilike('name', trimmed)
      .maybeSingle();
    if (existing) {
      setJoinError('That name is already taken in this game. Pick another.');
      setJoining(false);
      return;
    }

    const card = generateCard(game.pool, game.grid_size);
    const marked = emptyMarked(game.grid_size);
    const { data, error } = await supabase
      .from('players')
      .insert({ game_id: game.id, name: trimmed, card, marked })
      .select()
      .single();
    if (data && !error) {
      localStorage.setItem(`bingo:${code}:player`, data.id);
      setPlayer(data);
    } else if (error?.code === '23505') {
      // Race: another player claimed this name between the pre-check and insert
      setJoinError('That name was just taken. Pick another.');
    } else {
      setJoinError('Could not join. Please try again.');
    }
    setJoining(false);
  }

  async function toggleCell(r, c) {
    if (!player || !game) return;
    const n = game.grid_size;
    if (n % 2 === 1 && r === Math.floor(n / 2) && c === Math.floor(n / 2)) return;
    const newMarked = player.marked.map((row, i) =>
      row.map((v, j) => (i === r && j === c ? !v : v))
    );
    // Optimistic update
    setPlayer({ ...player, marked: newMarked });
    setClaimSent(false);
    const { error } = await supabase.from('players').update({ marked: newMarked }).eq('id', player.id);
    if (error) console.error('Mark update failed', error);
  }

  async function claimWin() {
    if (!won || !player || !game || claiming) return;
    setClaiming(true);
    const { error } = await supabase.from('claims').insert({
      game_id: game.id,
      player_id: player.id,
      pattern: won,
      status: 'pending',
    });
    if (!error) setClaimSent(true);
    setClaiming(false);
  }

  function leaveGame() {
    if (!confirm('Leave the game? Your card will be lost.')) return;
    if (player) supabase.from('players').delete().eq('id', player.id);
    localStorage.removeItem(`bingo:${code}:player`);
    setPlayer(null);
  }

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 font-serif text-2xl text-stone-500">
        Loading game…
      </div>
    );
  }

  // ─── JOIN FORM ───
  if (!player) {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-900">
        <WinCelebration celebration={celebration} onClose={() => setCelebration(null)} />
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="flex items-baseline justify-between border-b border-stone-900 pb-6">
            <div>
              <div className="font-serif text-5xl leading-none tracking-tight">
                Bingo<span className="text-stone-400">.</span>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
                Joining game · <span className="text-stone-900">{code}</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm('Go back to the start page?')) router.push('/');
              }}
              title="Home"
              className="rounded-sm border border-stone-300 p-2 text-stone-500 hover:border-stone-900 hover:text-stone-900"
            >
              <Home className="h-3.5 w-3.5" />
            </button>
          </div>
          <form onSubmit={handleJoin} className="mt-10 space-y-5">
            <div>
              <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">Your Name</div>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (joinError) setJoinError('');
                }}
                placeholder="Type your name…"
                autoFocus
                className={`w-full rounded-sm border-2 bg-transparent px-4 py-3 font-serif text-xl focus:outline-none ${
                  joinError ? 'border-red-500 focus:border-red-600' : 'border-stone-300 focus:border-stone-900'
                }`}
              />
              {joinError && (
                <div className="mt-2 text-xs text-red-600">{joinError}</div>
              )}
            </div>
            <button
              type="submit"
              disabled={!name.trim() || joining}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-sm bg-stone-900 px-6 py-3 font-serif text-lg text-amber-50 transition-all hover:gap-5 disabled:bg-stone-300"
            >
              {joining ? 'Joining…' : 'Take My Card'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── GAME VIEW ───
  const n = game.grid_size;
  const drawn = game.drawn || [];
  const activePatterns = Object.entries(game.patterns).filter(([, v]) => v).map(([k]) => k);
  const markedCount = player.marked.flat().filter(Boolean).length - (n % 2 === 1 ? 1 : 0);

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900">
      <WinCelebration celebration={celebration} onClose={() => setCelebration(null)} />
      <div className="mx-auto max-w-md px-5 pb-32 pt-8">
        <div className="flex items-baseline justify-between border-b border-stone-900 pb-4">
          <div>
            <div className="font-serif text-3xl leading-none tracking-tight">
              Bingo<span className="text-stone-400">.</span>
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.3em] text-stone-500">
              Playing as <span className="text-stone-900">{player.name}</span> · {code}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm('Go back to the start page? You can rejoin with the game code.')) router.push('/');
              }}
              className="rounded-sm border border-stone-300 p-2 text-stone-500 hover:border-stone-900 hover:text-stone-900"
              title="Home"
            >
              <Home className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={leaveGame}
              className="rounded-sm border border-stone-300 p-2 text-stone-500 hover:border-stone-900 hover:text-stone-900"
              title="Leave"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-1 rounded-sm border border-stone-300 p-1">
          {[
            { v: 'card', l: 'My Card', n: markedCount },
            { v: 'called', l: 'Called', n: drawn.length },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={`flex-1 rounded-sm py-2 text-xs uppercase tracking-[0.2em] transition-all ${
                tab === t.v ? 'bg-stone-900 text-amber-50' : 'text-stone-500'
              }`}
            >
              {t.l} <span className="ml-1 tabular-nums opacity-60">{String(t.n).padStart(2, '0')}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-500">
          <Trophy className="h-3 w-3" />
          <span>Win on:</span>
          {activePatterns.map((p) => (
            <span
              key={p}
              className={`rounded-sm border px-1.5 py-0.5 ${
                won === p ? 'border-stone-900 bg-stone-900 text-amber-50' : 'border-stone-300'
              }`}
            >
              {PATTERN_LABEL[p]}
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'card' ? (
            <motion.div key="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6">
              <div className="relative rounded-sm border-2 border-stone-900 bg-amber-50 p-3">
                <div className="absolute -top-2 left-3 bg-amber-50 px-2 text-[9px] uppercase tracking-[0.3em] text-stone-500">
                  Card · {n}×{n}
                </div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
                  {player.card.flatMap((row, r) =>
                    row.map((val, c) => {
                      const isMarked = player.marked[r][c];
                      const isFree = val === '★';
                      return (
                        <button
                          key={`${r}-${c}`}
                          onClick={() => toggleCell(r, c)}
                          disabled={isFree}
                          className={`relative aspect-square overflow-hidden rounded-sm border-2 transition-all active:scale-95 ${
                            isMarked
                              ? 'border-stone-900 bg-stone-900 text-amber-50'
                              : 'border-stone-200 bg-white text-stone-700'
                          }`}
                        >
                          <span
                            className="relative font-serif tabular-nums"
                            style={{
                              fontSize:
                                game.char_type === 'numbers' ? 'clamp(1.1rem, 5vw, 1.6rem)' : 'clamp(0.7rem, 2.6vw, 0.95rem)',
                              lineHeight: 1,
                            }}
                          >
                            {val}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-stone-500">
                <Megaphone className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>
                  Listen for the caller. Tap a tile to mark it yourself — the caller can verify your card if you win.
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="called" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6">
              {!drawn.length ? (
                <div className="rounded-sm border border-dashed border-stone-300 px-6 py-16 text-center">
                  <Megaphone className="mx-auto h-6 w-6 text-stone-300" />
                  <div className="mt-3 font-serif text-xl text-stone-700">Waiting for the caller…</div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                    Drawn characters will appear here
                  </div>
                </div>
              ) : (
                <div className={`grid gap-1.5 ${game.char_type === 'numbers' ? 'grid-cols-5' : 'grid-cols-3'}`}>
                  <AnimatePresence>
                    {drawn.map((c, i) => (
                      <motion.div
                        key={c}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`flex items-center justify-center rounded-sm border-2 font-serif tabular-nums ${
                          i === 0 ? 'border-stone-900 bg-stone-900 text-amber-50' : 'border-stone-200 bg-white text-stone-700'
                        } ${game.char_type === 'numbers' ? 'aspect-square text-xl' : 'px-2 py-3 text-sm'}`}
                      >
                        {c}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showLatest && latest && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            className="fixed left-1/2 top-4 z-50 -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-sm border-2 border-stone-900 bg-amber-50 px-4 py-3 shadow-lg">
              <BellRing className="h-4 w-4 text-stone-900" />
              <div>
                <div className="text-[9px] uppercase tracking-[0.3em] text-stone-500">Just called</div>
                <div className="font-serif text-2xl leading-none tabular-nums">{latest}</div>
              </div>
              <button onClick={() => setShowLatest(false)} className="text-stone-400 hover:text-stone-900">
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {won && !claimSent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/90 px-6">
            <motion.div
              initial={{ scale: 0.8, rotate: -3 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 14 }}
              className="relative w-full max-w-sm rounded-sm border-2 border-amber-50 bg-amber-50 p-8 text-center"
            >
              <Trophy className="mx-auto h-8 w-8 text-stone-900" />
              <div className="mt-4 font-serif text-7xl leading-none tracking-tight">
                Bingo<span className="text-stone-400">.</span>
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">{PATTERN_LABEL[won]}</div>
              <div className="mt-1 font-serif text-xl text-stone-700">Send your claim to the caller?</div>
              <button
                onClick={claimWin}
                disabled={claiming}
                className="mt-6 w-full rounded-sm bg-stone-900 px-4 py-3 text-xs uppercase tracking-[0.2em] text-amber-50 hover:bg-stone-700 disabled:opacity-50"
              >
                {claiming ? 'Sending…' : 'Claim Bingo'}
              </button>
              <button
                onClick={() => setClaimSent(true)}
                className="mt-2 w-full text-[10px] uppercase tracking-[0.2em] text-stone-500"
              >
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {claimSent && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-stone-300 bg-stone-900 text-amber-50">
          <div className="mx-auto max-w-md px-5 py-3 text-center">
            <div className="text-[9px] uppercase tracking-[0.3em] opacity-70">Claim submitted</div>
            <div className="font-serif text-lg">Waiting for the caller to verify…</div>
          </div>
        </div>
      )}
    </div>
  );
}

function WinCelebration({ celebration, onClose }) {
  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/85 px-6"
        >
          <motion.div
            initial={{ scale: 0.7, rotate: -3 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="relative w-full max-w-sm rounded-sm border-2 border-stone-900 bg-amber-50 p-8 text-center"
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 text-stone-400 hover:text-stone-900"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <Trophy className="mx-auto h-9 w-9 text-stone-900" />
            <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-stone-500">
              {celebration.isSelf ? 'You won' : 'Winner confirmed'}
            </div>
            <div className="mt-3 font-serif text-5xl leading-none tracking-tight">
              {celebration.name}
            </div>
            <div className="mt-4 font-serif text-2xl text-stone-700">
              Bingo<span className="text-stone-400">.</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-stone-500">
              {PATTERN_LABEL[celebration.pattern]}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
