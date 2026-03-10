-- Allow authenticated users to create their own players row when missing.
-- This complements signup trigger paths and enables safe client-side upsert by id.

create policy "players: self insert"
  on public.players for insert
  with check (auth.uid() = id);
