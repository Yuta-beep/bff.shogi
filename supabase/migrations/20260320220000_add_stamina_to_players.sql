-- Add stamina columns to the players table.
-- stamina: current stamina (recovered over time, consumed per stage played)
-- max_stamina: upper cap (default 50)
-- stamina_updated_at: timestamp used to compute recovery since last write

ALTER TABLE public.players
  ADD COLUMN stamina             integer     NOT NULL DEFAULT 50,
  ADD COLUMN max_stamina         integer     NOT NULL DEFAULT 50,
  ADD COLUMN stamina_updated_at  timestamptz NOT NULL DEFAULT now();

-- Existing stages had stamina_cost defaulting to 0; set them to 5.
UPDATE master.m_stage SET stamina_cost = 5 WHERE stamina_cost = 0;

-- New stages should also default to 5.
ALTER TABLE master.m_stage ALTER COLUMN stamina_cost SET DEFAULT 5;
