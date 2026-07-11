-- 0014_player_import_2026.sql
-- Phase 7: seed the roster as ghost profiles + 2026 season baselines.
-- Generated from the approved player_reconciliation.csv.
--
-- 75 ghost profiles total: 65 canonical roster players + 10 stats-only ghosts
-- (Igor Tall, Sal, Denis son, Yura Matchpoint, Shenthen, Andrew (sergey's son),
-- Nick Brazil, Mike father, Sergey SI, Justin). 68 of them carry a 2026 baseline;
-- 7 canonical players (Urban, Denis, Mike, Joey, Oscar, Ari, Andrey) have no 2026
-- stats and get a ghost profile only.
--
-- IDEMPOTENCY: ids are deterministic (md5 of a namespaced display name), and every
-- insert is guarded with ON CONFLICT, so a clean re-run before any claims is safe.
-- DO NOT re-run this AFTER ghosts have been claimed in the Connections panel — a
-- claim deletes the ghost row, and re-seeding would resurrect it as a duplicate.
--
-- Requires 0013_ghost_players.sql (drops the profiles->auth FK, adds ghost_profiles).
-- Baselines are written to the 2026 seasons row (seeded in 0003).

-- Everything runs inside ONE DO block (a single server statement) so the temp
-- staging table survives across the inserts. The Supabase SQL Editor pools
-- connections in transaction mode, so a temp table created as a standalone
-- statement would not be visible to the next statement — hence the block.
do $$
begin

-- Staging table: one row per roster player, with their 2026 stats (has_stats=false
-- for the 7 no-stats canonical players). Deterministic id is derived from the name.
create temp table _roster (
  id                 uuid,
  display_name       text,
  nicknames          text,
  tentative_email    text,
  approx_appearances int,
  notes              text,
  games              int,
  wins               int,
  draws              int,
  losses             int,
  plus_minus         int,
  goals              int,
  has_stats          boolean
) on commit drop;

insert into _roster
  (display_name, nicknames, tentative_email, approx_appearances, notes,
   games, wins, draws, losses, plus_minus, goals, has_stats)
values
  -- canonical roster (order = players_canonical_draft.csv) --------------------
  ('Vadim','Vadim | Vadim Palmer','vadimpalmer@yahoo.com',157,'Organizer / sender',46,21,9,16,5,1,true),
  ('Kimran','Kimran | Kemran','lazzturkkemran49@gmail.com',82,null,37,15,6,16,-1,22,true),
  ('Oleg','Oleg','o_rakov@hotmail.com',79,null,35,15,7,13,2,2,true),
  ('Emre','Emre','emre.kapuzov94@gmail.com',72,null,33,16,6,11,5,10,true),
  ('Boris','Boris','borisleya@gmail.com',69,'Distinct player from Boroda (confirmed)',36,17,9,10,7,1,true),
  ('Edik','Edik','eduard.perelman@gmail.com',66,'Eduard -> Edik',40,14,9,17,-3,6,true),
  ('Zhenya Def','Zhenya Def',null,50,'Distinct player from Zhenya Br (confirmed)',27,11,7,9,2,1,true),
  ('Sasha Ru','Sasha Ru',null,48,'Distinct player from Sasha SI (confirmed)',34,12,7,15,-3,2,true),
  ('Kirill','Kirill','kirill011594@gmail.com',46,null,20,4,5,11,-7,11,true),
  ('Matt','Matt','matthew.rakov@gmail.com',46,'DISTINCT person from Matthew - do not merge',30,13,7,10,3,21,true),
  ('Matthew','Matthiew (typo) | Matthew','matthewginzburg@gmail.com',26,'Vadim usually mistypes as Matthiew',12,6,3,3,3,14,true),
  ('Max','Max',null,43,'Distinct player from Maxim (confirmed)',22,9,3,10,-1,8,true),
  ('Alan','Alan','alan.tsigal@gmail.com',40,null,17,7,5,5,2,8,true),
  ('Mohammed','Mohammed','halid.brkanovic@gmail.com',38,'Distinct player from Mussa (confirmed)',20,11,3,6,5,5,true),
  ('Slava','Slava',null,37,null,16,5,4,7,-2,6,true),
  ('Sasha SI','Sasha SI',null,36,'Distinct player from Sasha Ru (confirmed)',20,5,4,11,-6,2,true),
  ('Igor','Igor',null,36,'Distinct from Igor Tall / Igor Young (confirmed)',18,6,4,8,-2,0,true),
  ('Muchnik','Muchnik',null,34,'Surname-style nickname',15,6,4,5,1,5,true),
  ('Dima SI','Dima SI',null,34,'Distinct player (confirmed)',15,6,2,7,-1,5,true),
  ('Boroda','Boroda',null,34,'Distinct player from Boris (confirmed)',16,7,4,5,2,0,true),
  ('Rustem','Rustem',null,29,null,18,6,4,8,-2,0,true),
  ('Semyon','Semyon',null,28,'Stats listed as Semen',20,6,3,11,-5,0,true),
  ('Misha L','Misha L',null,28,'Distinct player from other Mishas (confirmed)',7,3,2,2,1,0,true),
  ('Urban','Urban','mishkaurban@gmail.com',28,'Possibly Misha Urban',0,0,0,0,0,0,false),
  ('Dmitro','Dmitro',null,27,null,11,6,2,3,3,1,true),
  ('Sandrik','Sandrik',null,25,null,20,9,3,8,1,2,true),
  ('Vitalik','Vitalik',null,20,null,13,2,2,9,-7,1,true),
  ('Denis','Denis',null,20,'No 2026 stats of his own (Denis son is separate)',0,0,0,0,0,0,false),
  ('Lesha','Lesha',null,19,null,9,4,1,4,0,3,true),
  ('Zhenya Br','Zhenya Br',null,19,'Distinct player from Zhenya Def (confirmed)',6,2,1,3,-1,3,true),
  ('Yura Young','Yura Young',null,18,'Distinct player (confirmed)',8,4,2,2,2,9,true),
  ('Mike','Mike','levinmik@hotmail.com',18,'No 2026 stats of his own (Mike father is separate)',0,0,0,0,0,0,false),
  ('Jake','Jake',null,18,null,18,5,3,10,-5,9,true),
  ('Joe','Joe','joealonzo.jr10@gmail.com',17,'Distinct player from Joey (confirmed)',13,6,3,4,2,6,true),
  ('Mussa','Mussa',null,17,'Distinct player from Mohammed (confirmed)',9,3,0,6,-3,1,true),
  ('Gena','Gena',null,17,null,8,2,2,4,-2,2,true),
  ('Vito','Vito',null,17,null,15,7,2,6,1,0,true),
  ('Rufat','Rufat','rufat.badalov@gmail.com',16,null,1,1,0,0,1,0,true),
  ('Gera','Gera',null,15,null,4,2,1,1,1,4,true),
  ('Russell','Russell',null,15,null,15,5,3,7,-2,8,true),
  ('Maxim','Maxim','maxim.petrovsky21@sitechhs.com',14,'Distinct player from Max (confirmed)',11,3,2,6,-3,4,true),
  ('Gary','Gary','gary.stavin@gmail.com',14,null,11,6,2,3,3,12,true),
  ('Lyonchik','Lyonchik',null,14,null,16,9,2,5,4,0,true),
  ('Isaac','Isaac','imuravchiksoccer@gmail.com',14,'You',13,7,3,3,4,11,true),
  ('Joey','Joey','jalonzo920@gmail.com',13,'Distinct player from Joe (confirmed); no 2026 stats',0,0,0,0,0,0,false),
  ('Yasha','Yasha',null,12,null,25,6,7,12,-6,5,true),
  ('Varenik','Varenik','varenik5@yahoo.com',11,null,5,2,1,2,0,3,true),
  ('Mercky','Mercky',null,10,null,4,1,0,3,-2,1,true),
  ('Alik','Alik',null,10,'Goalkeeper in the sample email',8,2,2,4,-2,4,true),
  ('Bogdan','Bogdan','bogdan1@gmail.com',10,null,8,4,1,3,1,5,true),
  ('Marc','Marc','stolyarmarc18@gmail.com',9,'Stats listed as Marc Stolyar',4,2,1,1,1,6,true),
  ('Leo','Leo','leogoldenberg@yahoo.com',7,null,4,1,1,2,-1,4,true),
  ('Jonathan','Jonathan',null,7,'Stats listed as Johathan (typo)',7,1,4,2,-1,4,true),
  ('Kolya','Kolya',null,7,null,4,1,0,3,-2,1,true),
  ('Misha Forward','Misha Forward',null,7,'Distinct player from other Mishas (confirmed)',2,1,0,1,0,3,true),
  ('Eri','Eri',null,6,null,3,2,1,0,2,1,true),
  ('Vova Br','Vova Br',null,6,'Distinct player (confirmed)',6,4,0,2,2,0,true),
  ('Stas','Stas',null,6,'Stats listed as Oleg new (Stas)',9,4,3,2,2,5,true),
  ('Nicholas','Nicholas | Nick','nick.shnayderman@gmail.com',5,'Distinct from Nick Brazil',6,4,0,2,2,2,true),
  ('Elan','Elan','elan.ps195@gmail.com',4,'Low frequency - confirm regular',4,1,0,3,-2,4,true),
  ('Oscar','Oscar',null,4,'Low frequency; no 2026 stats',0,0,0,0,0,0,false),
  ('Misha SI','Misha SI',null,2,'Distinct player from other Mishas (confirmed)',3,1,1,1,0,1,true),
  ('Ari','Ari',null,3,'Low frequency; no 2026 stats',0,0,0,0,0,0,false),
  ('Constantin','Constantin','constantinople269@gmail.com',3,'Low frequency',6,2,1,3,-1,0,true),
  ('Andrey','Andrey','andreyyf@aol.com',2,'Low frequency; no 2026 stats (distinct from Andrew (sergey''s son))',0,0,0,0,0,0,false),
  -- new stats-only ghosts (action=new in reconciliation) ----------------------
  ('Igor Tall','Igor Tall',null,null,'Stats-only ghost; separate person from canonical Igor',3,3,0,0,3,1,true),
  ('Sal','Sal',null,null,'Stats-only ghost',2,2,0,0,2,0,true),
  ('Denis son','Denis son',null,null,'Stats-only ghost; separate person from canonical Denis',17,7,4,6,1,12,true),
  ('Yura Matchpoint','Yura Matchpoint',null,null,'Stats-only ghost; distinct from Yura Young',7,3,2,2,1,0,true),
  ('Shenthen','Shenthen',null,null,'Stats-only ghost',3,2,0,1,1,2,true),
  ('Andrew (sergey''s son)','Andrew (sergey''s son)',null,null,'Stats-only ghost; distinct from canonical Andrey',1,1,0,0,1,0,true),
  ('Nick Brazil','Nick Brazil',null,null,'Stats-only ghost; distinct from canonical Nicholas',1,1,0,0,1,0,true),
  ('Mike father','Mike father',null,null,'Stats-only ghost; separate person from canonical Mike (this is his name)',5,1,2,2,-1,0,true),
  ('Sergey SI','Sergey SI',null,null,'Stats-only ghost',1,0,0,1,-1,0,true),
  ('Justin','Justin',null,null,'Stats-only ghost',1,0,0,1,-1,0,true);

-- Deterministic, re-runnable id from the display name.
update _roster set id = md5('rssc-ghost:' || display_name)::uuid;

-- 1. Ghost profiles: active + player so they show on the board and are registerable.
insert into profiles (id, display_name, status, role)
select id, display_name, 'active', 'player' from _roster
on conflict (id) do nothing;

-- 2. Ghost provenance / claim-suggestion metadata (a row here == unclaimed ghost).
insert into ghost_profiles
  (profile_id, canonical_name, nicknames, tentative_email, approx_appearances, notes)
select id, display_name, nicknames, tentative_email, approx_appearances, notes
from _roster
on conflict (profile_id) do update set
  canonical_name     = excluded.canonical_name,
  nicknames          = excluded.nicknames,
  tentative_email    = excluded.tentative_email,
  approx_appearances = excluded.approx_appearances,
  notes              = excluded.notes;

-- 3. 2026 baselines for the 68 players who have stats.
insert into season_baselines
  (season_id, user_id, games_played, wins, draws, losses, plus_minus, goals)
select s.id, r.id, r.games, r.wins, r.draws, r.losses, r.plus_minus, r.goals
from _roster r
cross join (select id from seasons where year = 2026) s
where r.has_stats
on conflict (season_id, user_id) do update set
  games_played = excluded.games_played,
  wins         = excluded.wins,
  draws        = excluded.draws,
  losses       = excluded.losses,
  plus_minus   = excluded.plus_minus,
  goals        = excluded.goals;

drop table _roster;
end $$;

-- Sanity checks (run manually after import):
--   select count(*) from ghost_profiles;                    -- expect 75
--   select count(*) from season_baselines b join seasons s on s.id=b.season_id
--     where s.year=2026;                                    -- expect 68
--   select * from get_leaderboard();                        -- 75 rows, ordered
