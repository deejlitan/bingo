# Bingo

A real-time bingo app built with Next.js and Supabase. Caller draws characters from a configurable pool, players see them instantly on their phones, mark their cards manually, and submit Bingo claims that the caller verifies.

## What's inside

- **`/`** — landing page; create a game or join with a code
- **`/setup`** — configure card size, character type, and winning patterns
- **`/caller/[code]`** — live game console; draw characters, see players join, jump to verification
- **`/player/[code]`** — mobile-first card view; tap to mark, manual marking only
- **`/admin/[code]`** — verify Bingo claims with automated cheat detection

Real-time updates flow through Supabase's Postgres listener — when the caller draws a number, every connected player sees it within a few hundred milliseconds.

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project. Once it finishes provisioning:

- Open the **SQL Editor**
- Paste the contents of `supabase/schema.sql`
- Run it

This creates the `games`, `players`, and `claims` tables, plus enables real-time subscriptions on all three.

### 3. Add environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in Supabase under **Project Settings → API**.

### 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Go to [vercel.com](https://vercel.com), import the repo.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables in the Vercel dashboard.
4. Deploy.

That's it. Vercel auto-detects Next.js.

## How a game runs

1. **Caller** opens `/`, clicks **Create a Game**, picks 4×4 or 5×5, chooses numbers or names, picks which patterns count as wins.
2. **Caller** lands on `/caller/ABC123` and shares the join URL (or the code) with players.
3. **Players** open `/`, enter the code, type their name. Each gets a unique random card.
4. **Caller** taps **Draw Next** — the game's `drawn` column is updated, and every player's phone shows the new character within milliseconds.
5. **Players** tap tiles to mark them as they hear/see calls. The app shows a small sparkle on tiles whose character has been called, but the player still has to tap.
6. When a player's marked tiles form an active winning pattern, the **Bingo!** overlay appears. They can tap **Claim Bingo** to send a claim.
7. **Caller** sees a badge on the **Verify** button — clicks through to `/admin/ABC123`, sees the player's card with the winning pattern highlighted in green, any invalid marks in red, called-but-unmarked tiles in dashed amber.
8. **Caller** taps **Confirm Win** or **Reject Claim**.

## Notes & caveats

- **RLS policies are open** for this demo (anyone can read/write). Before using this in production, add Supabase Auth and tighten the policies to restrict callers to their own games and players to their own cards.
- **No icon files yet** — the manifest references `/icon-192.png` and `/icon-512.png`. Add these to `public/` for proper PWA install.
- **Reset clears the game** — there's a reset button in the caller view that wipes draws and claims so you can replay with the same players.
- **Players persist via localStorage** — if a player closes the tab and reopens, they get their same card back. To force a new card, they leave the game.

## What's not built (yet)

- Caller authentication — anyone with the URL can act as caller
- Public shareable display (TV/projector view)
- Sound effects
- Game history / past games
