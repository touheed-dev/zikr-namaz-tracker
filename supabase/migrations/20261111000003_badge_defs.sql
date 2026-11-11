-- Badge definitions are reference data the app needs in production, so they
-- live in a migration (seed.sql repeats them idempotently for local resets).
insert into public.badge_defs (code, grp, name, note, target, visibility, sort) values
  ('first_week',      'namaz',   'First Jamaat week',  '7 complete days in a row',             7,   'friends', 1),
  ('jumuah_jamaat',   'namaz',   'Jumuah Jamaat',      'Dhuhr in Jamaat on 4 Fridays in a row', 4,   'friends', 2),
  ('zikr_master',     'namaz',   'Zikr Master',        'Both azkar on 30 days',                30,  'friends', 3),
  ('fajr_40',         'namaz',   '40-day Fajr',        'Fajr in Jamaat 40 days in a row',      40,  'friends', 4),
  ('streak_30',       'namaz',   '30-day streak',      '30 complete days in a row',            30,  'friends', 5),
  ('first_para',      'quran',   'First para',         'Read 1 para in a day',                 20,  'private', 6),
  ('quran_7',         'quran',   '7-day Quran streak', 'Quran on 7 days in a row',             7,   'private', 7),
  ('khatam',          'quran',   'Khatam',             'All 604 pages',                        604, 'private', 8),
  ('tahajjud_nights', 'private', 'Tahajjud nights',    'Prayed 3 nights',                      3,   'private', 9),
  ('duha_21',         'private', 'Duha habit',         'Duha on 21 days',                      21,  'private', 10),
  ('witr_21',         'private', 'Witr keeper',        'Witr on 21 days',                      21,  'private', 11)
on conflict (code) do update
  set grp = excluded.grp, name = excluded.name, note = excluded.note,
      target = excluded.target, visibility = excluded.visibility, sort = excluded.sort;
