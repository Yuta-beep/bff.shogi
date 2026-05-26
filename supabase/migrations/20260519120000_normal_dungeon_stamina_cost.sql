-- ノーマルダンジョン: 入室スタミナ5
UPDATE master.m_stage
SET stamina_cost = 5
WHERE COALESCE(stage_category, 'normal') = 'normal';

ALTER TABLE master.m_stage ALTER COLUMN stamina_cost SET DEFAULT 5;
