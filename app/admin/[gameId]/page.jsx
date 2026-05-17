'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, ArrowLeft, Trophy, ShieldCheck, ShieldAlert, Megaphone, Home } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PATTERN_LABEL, getPatternCells, findWinningLine } from '@/lib/bingo';

export default function AdminPage() {
  const { gameId: code } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [selectedClaimId, setSelectedClaimId] = useState(null);

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

      const { data: ps } = await supabase.from('players').select('*').eq('game_id', g.id);
      setPlayers(ps || []);

      const { data: cs } = await supabase
        .from('claims')
        .select('*')
        .eq('game_id', g.id)
        .order('claimed_at', { ascending: false });
      setClaims(cs || []);
      if (cs?.length) setSelectedClaimId(cs[0].id);

      gameChannel = supabase
        .channel(`admin:game:${g.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${g.id}` }, (payload) => {
          setGame(payload.new);
        })
        .subscribe();

      playersChannel = supabase
        .channel(`admin:players:${g.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${g.id}` }, async () => {
          const { data: ps2 } = await supabase.from('players').select('*').eq('game_id', g.id);
          setPlayers(ps2 || []);
        })
        .subscribe();

      claimsChannel = supabase
        .channel(`admin:claims:${g.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', filter: `game_id=eq.${g.id}` }, async () => {
          const { data: cs2 } = await supabase
            .from('claims')
            .select('*')
            .eq('game_id', g.id)
            .order('claimed_at', { ascending: false });
          setClaims(cs2 || []);
          if (cs2?.length && !cs2.find((c) => c.id === selectedClaimId)) setSelectedClaimId(cs2[0].id);
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

  const selectedClaim = claims.find((c) => c.id === selectedClaimId);
  const selectedPlayer = selectedClaim ? players.find((p) => p.id === selectedClaim.player_id) : null;

  const analysis = useMemo(() => {
    if (!game || !selectedPlayer || !selectedClaim) return null;
    const n = game.grid_size;
    const called = game.drawn || [];

    const invalidMarks = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (selectedPlayer.marked[r][c] && selectedPlayer.card[r][c] !== '★' && !called.includes(selectedPlayer.card[r][c])) {
          invalidMarks.push({ r, c, val: selectedPlayer.card[r][c] });
        }
      }
    }

    let patternCells = getPatternCells(selectedClaim.pattern, n);
    let patternComplete = false;
    if (selectedClaim.pattern === 'line') {
      patternCells = findWinningLine(selectedPlayer.marked, n);
      patternComplete = patternCells !== null;
    } else if (patternCells) {
      patternComplete = patternCells.every((row, r) =>
        row.every((needed, c) => !needed || selectedPlayer.marked[r][c])
      );
    }

    let legitimatelyComplete = false;
    if (patternCells) {
      legitimatelyComplete = patternCells.every((row, r) =>
        row.every((needed, c) => {
          if (!needed) return true;
          const val = selectedPlayer.card[r][c];
          return val === '★' || called.includes(val);
        })
      );
    }

    const valid = patternComplete && invalidMarks.length === 0 && legitimatelyComplete;
    return { invalidMarks, patternCells, patternComplete, legitimatelyComplete, valid };
  }, [game, selectedPlayer, selectedClaim]);

  async function setStatus(status) {
    if (!selectedClaim) return;
    await supabase.from('claims').update({ status }).eq('id', selectedClaim.id);
  }

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 font-serif text-2xl text-stone-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-12 md:py-12">
        <div className="flex items-baseline justify-between border-b border-stone-900 pb-6">
          <div className="flex items-baseline gap-6">
            <button
              onClick={() => {
                if (confirm('Leave the admin view and go home?')) router.push('/');
              }}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-900"
            >
              <Home className="h-3 w-3" /> Home
            </button>
            <button
              onClick={() => router.push(`/caller/${code}`)}
              className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-900"
            >
              <ArrowLeft className="h-3 w-3" /> Caller
            </button>
            <div>
              <div className="font-serif text-4xl leading-none tracking-tight md:text-5xl">Verify a Claim</div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
                Admin · {code}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Called so far</div>
            <div className="font-serif text-3xl tabular-nums">{(game.drawn || []).length}</div>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[280px_1fr]">
          <div>
            <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">
              Claims · {claims.length}
            </div>
            <div className="space-y-2">
              {!claims.length && (
                <div className="rounded-sm border border-dashed border-stone-300 p-6 text-center text-xs uppercase tracking-[0.2em] text-stone-400">
                  No claims yet
                </div>
              )}
              {claims.map((c) => {
                const p = players.find((x) => x.id === c.player_id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClaimId(c.id)}
                    className={`group relative w-full overflow-hidden rounded-sm border-2 px-4 py-3 text-left transition-all ${
                      selectedClaimId === c.id
                        ? 'border-stone-900 bg-stone-900 text-amber-50'
                        : 'border-stone-300 hover:border-stone-900'
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="font-serif text-xl">{p?.name || '?'}</div>
                        <div
                          className={`mt-0.5 text-[9px] uppercase tracking-[0.2em] ${
                            selectedClaimId === c.id ? 'text-amber-50/60' : 'text-stone-500'
                          }`}
                        >
                          {PATTERN_LABEL[c.pattern]}
                        </div>
                      </div>
                      {c.status === 'verified' && <Check className="h-4 w-4 text-emerald-500" />}
                      {c.status === 'rejected' && <X className="h-4 w-4 text-red-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {!selectedClaim || !selectedPlayer || !analysis ? (
              <div className="flex h-full items-center justify-center rounded-sm border-2 border-dashed border-stone-300 p-12 text-center font-serif text-2xl text-stone-400">
                Select a claim to review
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key={selectedClaim.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="flex items-baseline justify-between border-b border-stone-200 pb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Reviewing</div>
                      <div className="mt-1 font-serif text-4xl leading-none tracking-tight">{selectedPlayer.name}</div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                        Claims <span className="text-stone-900">{PATTERN_LABEL[selectedClaim.pattern]}</span>
                      </div>
                    </div>
                    <Verdict status={selectedClaim.status} valid={analysis.valid} />
                  </div>

                  <div className="mt-8 grid gap-8 md:grid-cols-[1fr_280px]">
                    <div>
                      <div className="relative rounded-sm border-2 border-stone-900 bg-amber-50 p-3">
                        <div className="absolute -top-2 left-3 bg-amber-50 px-2 text-[9px] uppercase tracking-[0.3em] text-stone-500">
                          Card · {game.grid_size}×{game.grid_size}
                        </div>
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${game.grid_size}, 1fr)` }}>
                          {selectedPlayer.card.flatMap((row, r) =>
                            row.map((val, c) => {
                              const m = selectedPlayer.marked[r][c];
                              const called = (game.drawn || []).includes(val) || val === '★';
                              const isPart = analysis.patternCells?.[r]?.[c];
                              const invalid = m && !called;
                              const missed = !m && called && val !== '★';
                              return (
                                <div
                                  key={`${r}-${c}`}
                                  className={`relative aspect-square overflow-hidden rounded-sm border-2 ${
                                    invalid
                                      ? 'border-red-500 bg-red-500 text-amber-50'
                                      : m
                                      ? isPart && analysis.valid
                                        ? 'border-emerald-500 bg-emerald-500 text-amber-50'
                                        : 'border-stone-900 bg-stone-900 text-amber-50'
                                      : missed
                                      ? 'border-amber-500 border-dashed bg-amber-100/50 text-stone-700'
                                      : 'border-stone-200 bg-white text-stone-700'
                                  }`}
                                >
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span
                                      className="relative font-serif tabular-nums"
                                      style={{ fontSize: 'clamp(1.1rem, 3.5vw, 1.6rem)' }}
                                    >
                                      {val}
                                    </span>
                                  </div>
                                  {invalid && (
                                    <div className="absolute right-1 top-1">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                    </div>
                                  )}
                                  {missed && (
                                    <div className="absolute right-1 top-1 text-[7px] uppercase tracking-wider text-amber-700">
                                      miss
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                        <Legend swatch="bg-stone-900" label="Marked" />
                        <Legend swatch="bg-emerald-500" label="Wins pattern" />
                        <Legend swatch="bg-red-500" label="Invalid mark" />
                        <Legend swatch="border-2 border-dashed border-amber-500 bg-amber-100/50" label="Called, unmarked" />
                      </div>
                    </div>

                    <div className="space-y-5">
                      <CheckRow ok={analysis.patternComplete} title="Pattern complete" detail={analysis.patternComplete ? `${PATTERN_LABEL[selectedClaim.pattern]} formed on card.` : `Marks do not form ${PATTERN_LABEL[selectedClaim.pattern]}.`} />
                      <CheckRow ok={analysis.legitimatelyComplete} title="All needed tiles called" detail={analysis.legitimatelyComplete ? 'Every tile in the pattern was drawn.' : 'Pattern uses tiles that were not drawn.'} />
                      <CheckRow ok={analysis.invalidMarks.length === 0} title="No invalid marks" detail={analysis.invalidMarks.length === 0 ? 'Every marked tile was actually called.' : `${analysis.invalidMarks.length} mark${analysis.invalidMarks.length === 1 ? '' : 's'} on uncalled tile${analysis.invalidMarks.length === 1 ? '' : 's'}.`} warn />

                      <div className="space-y-2 pt-2">
                        <button
                          onClick={() => setStatus('verified')}
                          className={`flex w-full items-center justify-center gap-2 rounded-sm border-2 px-4 py-3 font-serif text-lg transition-all ${
                            selectedClaim.status === 'verified'
                              ? 'border-emerald-600 bg-emerald-600 text-amber-50'
                              : 'border-stone-900 bg-stone-900 text-amber-50 hover:bg-emerald-700 hover:border-emerald-700'
                          }`}
                        >
                          <ShieldCheck className="h-4 w-4" /> Confirm Win
                        </button>
                        <button
                          onClick={() => setStatus('rejected')}
                          className={`flex w-full items-center justify-center gap-2 rounded-sm border-2 px-4 py-3 text-xs uppercase tracking-[0.2em] transition-all ${
                            selectedClaim.status === 'rejected'
                              ? 'border-red-600 bg-red-600 text-amber-50'
                              : 'border-stone-300 text-stone-600 hover:border-red-500 hover:text-red-600'
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" /> Reject Claim
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 border-t border-stone-200 pt-6">
                    <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">
                      <Megaphone className="h-3 w-3" /> Called this game
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(game.drawn || []).map((c) => {
                        const onCard = selectedPlayer.card.flat().includes(c);
                        return (
                          <span
                            key={c}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-sm border font-serif text-sm tabular-nums ${
                              onCard ? 'border-stone-900 bg-stone-900 text-amber-50' : 'border-stone-300 bg-amber-50 text-stone-500'
                            }`}
                          >
                            {c}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Verdict({ status, valid }) {
  if (status === 'verified') {
    return (
      <div className="flex items-center gap-2 rounded-sm border-2 border-emerald-600 bg-emerald-600 px-3 py-2 text-amber-50">
        <Trophy className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.2em]">Confirmed</span>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 rounded-sm border-2 border-red-600 bg-red-600 px-3 py-2 text-amber-50">
        <X className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.2em]">Rejected</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 rounded-sm border-2 px-3 py-2 ${valid ? 'border-emerald-600 text-emerald-700' : 'border-amber-500 text-amber-700'}`}>
      {valid ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <span className="text-xs uppercase tracking-[0.2em]">{valid ? 'Looks valid' : 'Review needed'}</span>
    </div>
  );
}

function CheckRow({ ok, title, detail, warn }) {
  return (
    <div className="flex items-start gap-3 border-l-2 pl-3" style={{ borderColor: ok ? '#059669' : warn ? '#dc2626' : '#d97706' }}>
      <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm ${ok ? 'bg-emerald-600 text-amber-50' : 'bg-red-600 text-amber-50'}`}>
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </div>
      <div>
        <div className="font-serif text-base leading-tight">{title}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-stone-500">{detail}</div>
      </div>
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
