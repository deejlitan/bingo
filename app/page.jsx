'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [joinErr, setJoinErr] = useState('');

  async function handleJoin(e) {
    e.preventDefault();
    setJoinErr('');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('games')
      .select('id, code')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error || !data) {
      setJoinErr('Game not found. Check the code.');
      return;
    }
    router.push(`/player/${data.code}`);
  }

  return (
    <div className="min-h-screen bg-amber-50 text-stone-900">
      <div className="mx-auto max-w-3xl px-6 py-16 md:px-12 md:py-24">
        <div className="border-b border-stone-900 pb-6">
          <div className="font-serif text-7xl leading-none tracking-tight md:text-9xl">
            Bingo<span className="text-stone-400">.</span>
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-stone-500">
            A live bingo experience · Real-time
          </div>
        </div>

        <div className="mt-16 grid gap-10 md:grid-cols-2">
          <div className="space-y-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">For the caller</div>
            <div className="font-serif text-3xl leading-tight">
              Set up a new game. Configure cards, characters, and winning patterns.
            </div>
            <button
              onClick={() => router.push('/setup')}
              className="group inline-flex items-center gap-3 rounded-sm bg-stone-900 px-6 py-3 font-serif text-lg text-amber-50 transition-all hover:gap-5"
            >
              Create a Game
              <ArrowRight className="h-4 w-4 transition-transform" />
            </button>
          </div>

          <div className="space-y-5 border-l border-stone-300 md:pl-10">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">For players</div>
            <div className="font-serif text-3xl leading-tight">
              Got a game code? Drop it in and grab your card.
            </div>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="GAME CODE"
                maxLength={6}
                className="w-full rounded-sm border-2 border-stone-300 bg-transparent px-4 py-3 font-serif text-2xl tracking-[0.3em] focus:border-stone-900 focus:outline-none"
              />
              {joinErr && <div className="text-xs text-red-600">{joinErr}</div>}
              <button
                type="submit"
                disabled={code.length < 4}
                className="group inline-flex items-center gap-3 rounded-sm border-2 border-stone-900 px-5 py-2.5 font-serif text-base text-stone-900 transition-all hover:gap-5 hover:bg-stone-900 hover:text-amber-50 disabled:opacity-40"
              >
                Join
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
