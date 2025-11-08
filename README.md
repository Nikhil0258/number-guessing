# Number Guessing Multiplayer (Next.js + Supabase)

Files:
- pages/_app.jsx
- pages/index.jsx
- components/NumberGuessingGame.jsx
- styles/globals.css
- package.json

How to deploy (no local dev):
1. Create repo in GitHub and paste these files via the web UI.
2. Create a Supabase project and run the `games` table SQL (see earlier instructions or use the provided SQL):
   - id uuid primary key (default gen_random_uuid())
   - code text unique
   - player1 text
   - player2 text
   - secret_player1 text
   - secret_player2 text
   - current_turn text default 'player1'
   - guesses jsonb default '[]'
   - warnings jsonb default '{"player1":0,"player2":0}'
   - winner text
3. In Supabase Dashboard → Settings → API copy Project URL and anon key.
4. In Vercel project settings add Environment Variables:
   - NEXT_PUBLIC_SUPABASE_URL = <your Supabase URL>
   - NEXT_PUBLIC_SUPABASE_ANON_KEY = <your anon key>
5. Import GitHub repo into Vercel and deploy.

Notes:
- If realtime payloads are missing, enable Realtime / Database Changes for `public.games` in Supabase.
- Use the debug panel (top-right) or press `R` to manually refresh.
