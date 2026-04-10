-- 全ステージの必要スタミナを 0 にする（新規行のデフォルトも 0）。
UPDATE master.m_stage SET stamina_cost = 0;

ALTER TABLE master.m_stage ALTER COLUMN stamina_cost SET DEFAULT 0;
