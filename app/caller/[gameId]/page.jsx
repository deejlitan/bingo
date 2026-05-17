'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, RotateCcw, Trophy, Copy, Check, Eye, Users, Home, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PATTERN_LABEL } from '@/lib/bingo';
import { fireConfetti } from '@/lib/confetti';

export default function CallerPage() {
  const { gameId: code } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tickValue, setTickValue] = useState(null);
  const [copied, setCopied] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const playersRef = useRef([]);
  const seenVerified = useRef(new Set());

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Initial load + subscribe
  useEffect(() => {
    let cancelled = false;
    let gameChannel, playersChannel, claimsChannel;

    async function load() {
      const { data: g } = await supabase.from('games').select('*').eq('code', code).maybeSingle();
      if (cancelled) return;
      if (!g) {
        router.push('/');
        return;
      }
      setGame(g);

      const { data: ps } = await supabase.from('players').select('*').eq('game_id', g.id).order('joined_at');
      setPlayers(ps || []);

      const { data: cs } = await supabase
        .from('claims')
        .select('*')
        .eq('game_id', g.id)
        .order('claimed_at', { ascending: false });
      setClaims(cs || []);
      // Seed the set so existing verified claims don't re-fire on reload
      (cs || []).filter((c) => c.status === 'verified').forEach((c) => seenVerified.current.add(c.id));

      // Realtime subscriptions
      gameChannel = supabase
        .channel(`game:${g.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${g.id}` }, (payload) => {
          setGame(payload.new);
        })
        .subscribe();

      playersChannel = supabase
        .channel(`players:${g.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${g.id}` }, async () => {
          const { data: ps2 } = await supabase.from('players').select('*').eq('game_id', g.id).order('joined_at');
          setPlayers(ps2 || []);
        })
        .subscribe();

      claimsChannel = supabase
        .channel(`claims:${g.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `game_id=eq.${g.id}` }, async (payload) => {
          const { data: cs2 } = await supabase
            .from('claims')
            .select('*')
            .eq('game_id', g.id)
            .order('claimed_at', { ascending: false });
          setClaims(cs2 || []);
          const row = payload.new;
          if (row && row.status === 'verified' && !seenVerified.current.has(row.id)) {
            seenVerified.current.add(row.id);
            const winner = playersRef.current.find((p) => p.id === row.player_id);
            setCelebration({ name: winner?.name || 'Someone', pattern: row.pattern });
            fireConfetti();
          }
        })
        .subscribe();
    }

    load();
    return () => {
      cancelled = true;
      if (gameChannel) supabase.removeChannel(gameChannel);
      if (playersChannel) supabase.removeChannel(playersChannel);
      if (claimsChannel) supabase.removeChannel(claimsChannel);
    };
  }, [code, supabase, router]);

  const pool = game?.pool || [];
  const drawn = game?.drawn || [];
  const remaining = useMemo(() => pool.filter((c) => !drawn.includes(c)), [pool, drawn]);
  const lastDrawn = drawn[0] || null;
  const activePatterns = game ? Object.entries(game.patterns).filter(([, v]) => v).map(([k]) => k) : [];
  const pendingClaims = claims.filter((c) => c.status === 'pending');

  async function handleDraw() {
    if (!game || !remaining.length || isDrawing) return;
    setIsDrawing(true);

    let ticks = 0;
    const totalTicks = 12;
    const interval = setInterval(() => {
      setTickValue(remaining[Math.floor(Math.random() * remaining.length)]);
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(interval);
      }
    }, 70);

    // Wait for the animation, then commit
    setTimeout(async () => {
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      const newDrawn = [pick, ...drawn];
      const { data, error } = await supabase
        .from('games')
        .update({ drawn: newDrawn, status: 'live' })
        .eq('id', game.id)
        .select()
        .single();
      if (!error && data) setGame(data);
      setTickValue(null);
      setIsDrawing(false);
    }, totalTicks * 70 + 50);
  }

  async function resetGame() {
    if (!game) return;
    if (!confirm('Reset the game? All draws and claims will be cleared.')) return;
    await supabase.from('claims').delete().eq('game_id', game.id);
    const { data } = await supabase
      .from('games')
      .update({ drawn: [], status: 'lobby' })
      .eq('id', game.id)
      .select()
      .single();
    if (data) setGame(data);
  }

  function copyJoinLink() {
    const url = `${window.location.origin}/player/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 font-serif text-2xl text-stone-500">
        Loading game…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900">
      <WinCelebration celebration={celebration} onClose={() => setCelebration(null)} />
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-12 md:py-12">
        {/* Header */}
        <div className="flex items-baseline justify-between border-b border-stone-300 pb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Caller View · Live</div>
            <div className="mt-1 flex items-baseline gap-4">
              <div className="font-serif text-3xl tracking-tight">In Progress</div>
              <button
                onClick={copyJoinLink}
                className="inline-flex items-center gap-2 rounded-sm border border-stone-300 px-2.5 py-1 font-serif text-base tracking-[0.3em] hover:border-stone-900"
                title="Copy join link"
              >
                {code}
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Stat label="Players" value={players.length} />
            <Stat label="Drawn" value={drawn.length} />
            <Stat label="Remaining" value={remaining.length} />
            <button
              onClick={() => {
                if (confirm('Leave the caller console and go home? The game will keep running.')) router.push('/');
              }}
              title="Home"
              className="rounded-sm border border-stone-300 p-2 text-stone-600 hover:border-stone-900 hover:text-stone-900"
            >
              <Home className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push(`/admin/${code}`)}
              className="inline-flex items-center gap-2 rounded-sm border border-stone-300 px-3 py-2 text-xs uppercase tracking-[0.2em] hover:border-stone-900"
            >
              <Eye className="h-3.5 w-3.5" />
              Verify
              {pendingClaims.length > 0 && (
                <span className="rounded-sm bg-stone-900 px-1.5 py-0.5 text-amber-50">{pendingClaims.length}</span>
              )}
            </button>
            <button
              onClick={resetGame}
              title="Reset"
              className="rounded-sm border border-stone-300 p-2 text-stone-600 hover:border-stone-900 hover:text-stone-900"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="relative flex aspect-square max-h-[520px] w-full items-center justify-center overflow-hidden rounded-sm border-2 border-stone-900 bg-stone-900 text-amber-50">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                  backgroundSize: '4px 4px',
                }}
              />
              <div className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.3em] opacity-50">Now Calling</div>
              <div className="absolute right-4 top-4 text-[10px] uppercase tracking-[0.3em] opacity-50">
                {game.char_type === 'numbers' ? '№' : 'Name'}
              </div>
              <div className="absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.3em] opacity-50">
                {game.grid_size}×{game.grid_size}
              </div>
              <div className="absolute bottom-4 right-4 text-[10px] uppercase tracking-[0.3em] opacity-50 tabular-nums">
                {String(drawn.length).padStart(3, '0')} / {String(pool.length).padStart(3, '0')}
              </div>

              <AnimatePresence mode="wait">
                {isDrawing ? (
                  <motion.div key={'tick-' + tickValue} className="text-center">
                    <div
                      className="font-serif tracking-tight opacity-60"
                      style={{
                        fontSize:
                          game.char_type === 'numbers'
                            ? 'clamp(8rem, 22vw, 16rem)'
                            : 'clamp(3rem, 8vw, 6rem)',
                        lineHeight: 1,
                      }}
                    >
                      {tickValue || '·'}
                    </div>
                  </motion.div>
                ) : lastDrawn ? (
                  <motion.div
                    key={lastDrawn + drawn.length}
                    initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 1.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    className="text-center"
                  >
                    <div
                      className="font-serif tracking-tight"
                      style={{
                        fontSize:
                          game.char_type === 'numbers'
                            ? 'clamp(8rem, 22vw, 16rem)'
                            : 'clamp(3rem, 8vw, 6rem)',
                        lineHeight: 1,
                      }}
                    >
                      {lastDrawn}
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-center opacity-50">
                    <div className="font-serif text-2xl">Awaiting first draw</div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.3em]">Share code · {code}</div>
                  </div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleDraw}
              disabled={!remaining.length || isDrawing}
              className="group mt-4 flex w-full items-center justify-between rounded-sm border-2 border-stone-900 bg-amber-50 px-6 py-5 font-serif text-2xl text-stone-900 transition-all hover:bg-stone-900 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-3">
                <Shuffle className={`h-5 w-5 ${isDrawing ? 'animate-spin' : ''}`} />
                {isDrawing ? 'Drawing…' : remaining.length ? 'Draw Next' : 'Pool Exhausted'}
              </span>
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Active Patterns</div>
                <Trophy className="h-3 w-3 text-stone-400" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activePatterns.map((p) => (
                  <span key={p} className="rounded-sm border border-stone-900 px-2.5 py-1 font-serif text-sm">
                    {PATTERN_LABEL[p]}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
                <Users className="h-3 w-3" /> Players · {players.length}
              </div>
              <div className="flex flex-wrap gap-1">
                {players.map((p) => (
                  <span key={p.id} className="rounded-sm border border-stone-300 px-2 py-1 font-serif text-sm">
                    {p.name}
                  </span>
                ))}
                {!players.length && (
                  <div className="text-xs text-stone-400">Waiting for players to join…</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">Draw History</div>
              <div className="max-h-[300px] overflow-y-auto">
                <div className={`grid gap-1.5 ${game.char_type === 'numbers' ? 'grid-cols-6' : 'grid-cols-3'}`}>
                  <AnimatePresence>
                    {drawn.map((d, i) => (
                      <motion.div
                        key={d}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`flex items-center justify-center rounded-sm border font-serif tabular-nums ${
                          i === 0
                            ? 'border-stone-900 bg-stone-900 text-amber-50'
                            : 'border-stone-300 bg-amber-50 text-stone-700'
                        } ${game.char_type === 'numbers' ? 'aspect-square text-xl' : 'px-2 py-2 text-sm'}`}
                      >
                        {d}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {!drawn.length && (
                  <div className="border border-dashed border-stone-300 p-6 text-center text-xs uppercase tracking-[0.2em] text-stone-400">
                    No draws yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/80 px-6"
        >
          <motion.div
            initial={{ scale: 0.7, rotate: -3 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="relative w-full max-w-md rounded-sm border-2 border-stone-900 bg-amber-50 p-10 text-center"
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 text-stone-400 hover:text-stone-900"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
            <Trophy className="mx-auto h-10 w-10 text-stone-900" />
            <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-stone-500">
              Winner confirmed
            </div>
            <div className="mt-3 font-serif text-6xl leading-none tracking-tight">
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

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <div className="font-serif text-3xl leading-none tabular-nums">
        {String(value).padStart(2, '0')}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-stone-500">{label}</div>
    </div>
  );
}
