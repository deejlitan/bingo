'use client';

import React, { useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Trash2, ArrowRight, Home, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PATTERN_LABEL, shortCode } from '@/lib/bingo';

export default function Setup() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const [gridSize, setGridSize] = useState(5);
  const [charType, setCharType] = useState('numbers');
  const [numRangeMax, setNumRangeMax] = useState(75);
  const [nameList, setNameList] = useState([
    'Apollo','Athena','Hermes','Hera','Zeus','Demeter','Ares','Artemis','Poseidon','Aphrodite',
    'Dionysus','Hephaestus','Hestia','Persephone','Hades','Eros','Iris','Nike','Selene','Helios',
    'Nyx','Pan','Tyche','Eos','Hypnos'
  ]);
  const [newName, setNewName] = useState('');
  const [patterns, setPatterns] = useState({
    line: true, blackout: false, corners: false, x: false, t: false, plus: false,
  });
  const fileInputRef = useRef(null);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (!file) return;
    const text = await file.text();
    const parsed = text
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parsed.length) return;
    // De-duplicate against existing list (case-insensitive)
    const existing = new Set(nameList.map((n) => n.toLowerCase()));
    const fresh = parsed.filter((n) => {
      const k = n.toLowerCase();
      if (existing.has(k)) return false;
      existing.add(k);
      return true;
    });
    setNameList([...nameList, ...fresh]);
  }

  function clearAllNames() {
    if (!nameList.length) return;
    if (confirm(`Remove all ${nameList.length} names?`)) setNameList([]);
  }

  const pool = useMemo(() => {
    if (charType === 'numbers') return Array.from({ length: numRangeMax }, (_, i) => String(i + 1));
    return nameList.filter((n) => n.trim().length);
  }, [charType, numRangeMax, nameList]);

  const activePatterns = Object.entries(patterns).filter(([, v]) => v).map(([k]) => k);
  const canStart = pool.length >= gridSize * gridSize && activePatterns.length > 0;

  async function createGame() {
    if (!canStart || creating) return;
    setCreating(true);
    const supabase = createClient();
    const code = shortCode();
    const { data, error } = await supabase
      .from('games')
      .insert({
        code, grid_size: gridSize, char_type: charType, pool, patterns, drawn: [], status: 'lobby',
      })
      .select()
      .single();
    if (error || !data) {
      alert('Failed to create game. Have you run the SQL schema in Supabase?');
      setCreating(false);
      return;
    }
    router.push(`/caller/${data.code}`);
  }

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900">
      <div className="mx-auto max-w-4xl px-6 py-10 md:px-12 md:py-16">
        <Header
          step={1}
          onHome={() => {
            if (confirm('Go back to the start page? Your setup will be lost.')) router.push('/');
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid gap-10 md:grid-cols-2"
        >
          <div className="space-y-8">
            <Field label="Card Size">
              <div className="grid grid-cols-2 gap-3">
                {[4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setGridSize(n)}
                    className={`group relative aspect-square rounded-sm border-2 transition-all ${
                      gridSize === n
                        ? 'border-stone-900 bg-stone-900 text-amber-50'
                        : 'border-stone-300 text-stone-600 hover:border-stone-900'
                    }`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, width: '52%', height: '52%' }}
                      >
                        {Array.from({ length: n * n }).map((_, i) => (
                          <div
                            key={i}
                            className={`rounded-[1px] ${gridSize === n ? 'bg-amber-50/80' : 'bg-stone-400/60'}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="absolute bottom-3 left-3 font-serif text-2xl tracking-tight">
                      {n}×{n}
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Character Type">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: 'numbers', l: 'Numbers' },
                  { v: 'names', l: 'Names' },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setCharType(o.v)}
                    className={`rounded-sm border-2 px-5 py-4 text-left transition-all ${
                      charType === o.v
                        ? 'border-stone-900 bg-stone-900 text-amber-50'
                        : 'border-stone-300 text-stone-600 hover:border-stone-900'
                    }`}
                  >
                    <div className="font-serif text-xl">{o.l}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] opacity-70">
                      {o.v === 'numbers' ? `1 – ${numRangeMax}` : `${nameList.length} entries`}
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            {charType === 'numbers' ? (
              <Field label={`Number Range — 1 to ${numRangeMax}`}>
                <input
                  type="range"
                  min={gridSize * gridSize}
                  max={99}
                  value={numRangeMax}
                  onChange={(e) => setNumRangeMax(+e.target.value)}
                  className="w-full accent-stone-900"
                />
              </Field>
            ) : (
              <Field label="Names">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newName.trim()) {
                          setNameList([...nameList, newName.trim()]);
                          setNewName('');
                        }
                      }}
                      placeholder="Add a name…"
                      className="flex-1 rounded-sm border-2 border-stone-300 bg-transparent px-3 py-2 font-serif text-base focus:border-stone-900 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (newName.trim()) {
                          setNameList([...nameList, newName.trim()]);
                          setNewName('');
                        }
                      }}
                      className="rounded-sm border-2 border-stone-900 bg-stone-900 px-4 text-amber-50 hover:bg-stone-700"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.csv,text/plain,text/csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm border-2 border-stone-300 px-3 py-2 text-xs uppercase tracking-[0.2em] text-stone-600 hover:border-stone-900 hover:text-stone-900"
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload file
                    </button>
                    <button
                      type="button"
                      onClick={clearAllNames}
                      disabled={!nameList.length}
                      className="inline-flex items-center justify-center gap-2 rounded-sm border-2 border-stone-300 px-3 py-2 text-xs uppercase tracking-[0.2em] text-stone-600 hover:border-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-300 disabled:hover:text-stone-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Clear all
                    </button>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    Accepts .txt / .csv — one name per line or comma-separated
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-sm border border-stone-200 p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {nameList.map((n, i) => (
                        <span
                          key={i}
                          className="group inline-flex items-center gap-1 rounded-sm bg-stone-100 px-2.5 py-1 font-serif text-sm text-stone-800"
                        >
                          {n}
                          <button onClick={() => setNameList(nameList.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </button>
                        </span>
                      ))}
                      {!nameList.length && (
                        <span className="text-xs text-stone-400">No names yet — add one above or upload a file.</span>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
            )}
          </div>

          <div>
            <Field label="Winning Patterns">
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(patterns).map((k) => (
                  <button
                    key={k}
                    onClick={() => setPatterns((p) => ({ ...p, [k]: !p[k] }))}
                    className={`group relative overflow-hidden rounded-sm border-2 p-4 text-left transition-all ${
                      patterns[k]
                        ? 'border-stone-900 bg-stone-900 text-amber-50'
                        : 'border-stone-300 text-stone-600 hover:border-stone-900'
                    }`}
                  >
                    <PatternIcon kind={k} size={gridSize} active={patterns[k]} />
                    <div className="mt-3 font-serif text-base">{PATTERN_LABEL[k]}</div>
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </motion.div>

        <div className="mt-12 flex items-center justify-between border-t border-stone-900 pt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
            {pool.length} characters · {activePatterns.length} pattern{activePatterns.length === 1 ? '' : 's'}
          </div>
          <button
            disabled={!canStart || creating}
            onClick={createGame}
            className="group inline-flex items-center gap-3 rounded-sm bg-stone-900 px-6 py-3 font-serif text-lg text-amber-50 transition-all hover:gap-5 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {creating ? 'Creating…' : 'Create Game'}
            <ArrowRight className="h-4 w-4 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ step, onHome }) {
  const steps = ['Setup', 'Lobby', 'Play'];
  return (
    <div className="mb-12 flex items-baseline justify-between border-b border-stone-900 pb-6">
      <div>
        <button
          onClick={onHome}
          className="group inline-flex items-baseline gap-3 text-left"
          title="Home"
        >
          <span className="font-serif text-5xl leading-none tracking-tight md:text-6xl">
            Bingo<span className="text-stone-400">.</span>
          </span>
          <Home className="h-4 w-4 self-center text-stone-400 transition-colors group-hover:text-stone-900" />
        </button>
        <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-stone-500">Caller Console</div>
      </div>
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`text-[10px] uppercase tracking-[0.2em] ${
                i + 1 === step ? 'text-stone-900' : 'text-stone-300'
              }`}
            >
              {String(i + 1).padStart(2, '0')} {s}
            </div>
            {i < 2 && <div className="h-px w-4 bg-stone-300" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">{label}</div>
      {children}
    </div>
  );
}

function PatternIcon({ kind, size, active }) {
  const n = size;
  const cells = Array.from({ length: n * n }).map((_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    let on = false;
    if (kind === 'line') on = r === Math.floor(n / 2);
    if (kind === 'blackout') on = true;
    if (kind === 'corners') on = (r === 0 || r === n - 1) && (c === 0 || c === n - 1);
    if (kind === 'x') on = r === c || r === n - 1 - c;
    if (kind === 't') on = r === 0 || c === Math.floor(n / 2);
    if (kind === 'plus') on = r === Math.floor(n / 2) || c === Math.floor(n / 2);
    return on;
  });
  return (
    <div
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, width: 44, height: 44 }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          className={`rounded-[1px] ${
            on ? (active ? 'bg-amber-50' : 'bg-stone-900') : active ? 'bg-amber-50/20' : 'bg-stone-200'
          }`}
        />
      ))}
    </div>
  );
}
