-- 刀スキル文言: 取ったマスの「左右」の隣の敵のみまとめて取る（前後は含まない）。

begin;

update master.m_skill s
set
  skill_desc = '前方1マスに進んで敵駒を取ったとき、そのマスの左右の隣にいる敵駒もまとめて取る。',
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b';

commit;
