-- Update stamina cost per stage from 5 to 10.
UPDATE master.m_stage SET stamina_cost = 10;

ALTER TABLE master.m_stage ALTER COLUMN stamina_cost SET DEFAULT 10;
