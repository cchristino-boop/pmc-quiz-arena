-- PMC Quiz Arena: schema inicial para Supabase
-- Execute este arquivo inteiro no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_token text not null,
  status text not null default 'lobby' check (status in ('lobby','question','reveal','finished')),
  question_index integer not null default -1,
  duration_seconds integer not null default 20,
  question_started_at timestamptz,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique(room_id,nickname)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  question_index integer not null,
  option_index integer not null,
  is_correct boolean not null,
  response_ms integer not null,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique(player_id,question_index)
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;
-- Não há políticas de acesso direto às tabelas. O cliente usa apenas RPCs controladas.

create or replace function public.create_room(p_questions jsonb, p_duration integer default 20)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_code text; v_token text;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 then
    raise exception 'Adicione pelo menos uma pergunta.';
  end if;
  if p_duration not between 5 and 90 then raise exception 'Duração inválida.'; end if;
  if jsonb_array_length(p_questions) > 40 then raise exception 'Máximo de 40 perguntas por partida.'; end if;
  v_code := upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
  while exists(select 1 from rooms where code=v_code) loop
    v_code := upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
  end loop;
  v_token := encode(gen_random_bytes(24),'hex');
  insert into rooms(code,host_token,duration_seconds,questions)
  values(v_code,v_token,p_duration,p_questions) returning id into v_id;
  return jsonb_build_object('room_id',v_id,'code',v_code,'host_token',v_token);
end $$;

create or replace function public.join_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room rooms%rowtype; v_player uuid; v_name text;
begin
  v_name := left(regexp_replace(trim(p_nickname),'\s+',' ','g'),18);
  if v_name='' then raise exception 'Informe um apelido.'; end if;
  select * into v_room from rooms where code=upper(trim(p_code));
  if not found then raise exception 'Sala não encontrada. Confira o código.'; end if;
  if v_room.status <> 'lobby' then raise exception 'Esta partida já começou.'; end if;
  if (select count(*) from players where room_id=v_room.id) >= 30 then raise exception 'Sala cheia (limite de 30 jogadores).'; end if;
  insert into players(room_id,nickname) values(v_room.id,v_name) returning id into v_player;
  return jsonb_build_object('room_id',v_room.id,'player_id',v_player);
exception when unique_violation then
  raise exception 'Este apelido já está sendo usado nesta sala.';
end $$;

create or replace function public.get_room_state(p_room_id uuid,p_player_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room rooms%rowtype; v_q jsonb; v_correct integer; v_remaining integer; v_answered boolean:=false; v_count integer;
begin
  select * into v_room from rooms where id=p_room_id;
  if not found then raise exception 'Sala não encontrada.'; end if;
  if v_room.question_index >= 0 then
    v_q := v_room.questions->v_room.question_index;
    v_correct := (v_q->>'correct')::integer;
  end if;
  if v_room.status='question' and v_room.question_started_at is not null then
    v_remaining := greatest(0,v_room.duration_seconds-floor(extract(epoch from (now()-v_room.question_started_at)))::integer);
    if v_remaining=0 then
      update rooms set status='reveal' where id=v_room.id and status='question';
      v_room.status := 'reveal';
    end if;
  end if;
  if p_player_id is not null and v_room.question_index>=0 then
    select exists(select 1 from answers where room_id=p_room_id and player_id=p_player_id and question_index=v_room.question_index) into v_answered;
  end if;
  select count(*) into v_count from answers where room_id=p_room_id and question_index=v_room.question_index;
  return jsonb_build_object(
    'room_id',v_room.id,'code',v_room.code,'status',v_room.status,'question_index',v_room.question_index,
    'total_questions',jsonb_array_length(v_room.questions),'duration_seconds',v_room.duration_seconds,
    'remaining_seconds',case when v_room.status='question' then coalesce(v_remaining,v_room.duration_seconds) else 0 end,
    'question',case when v_room.question_index>=0 then jsonb_build_object('prompt',v_q->>'prompt','options',v_q->'options') else null end,
    'correct_option',case when v_room.status in ('reveal','finished') then v_correct else null end,
    'answered_count',v_count,'my_answered',v_answered,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'score',score) order by score desc,nickname),'[]'::jsonb) from players where room_id=p_room_id)
  );
end $$;

create or replace function public.host_action(p_room_id uuid,p_host_token text,p_action text,p_duration integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room rooms%rowtype;
begin
  select * into v_room from rooms where id=p_room_id and host_token=p_host_token;
  if not found then raise exception 'Ação não autorizada.'; end if;
  if p_action='start' then
    if v_room.status<>'lobby' then raise exception 'A partida já foi iniciada.'; end if;
    if not exists(select 1 from players where room_id=p_room_id) then raise exception 'Aguardando pelo menos um jogador.'; end if;
    update rooms set status='question',question_index=0,question_started_at=now() where id=p_room_id;
  elsif p_action='next' then
    if v_room.status<>'reveal' then raise exception 'A rodada atual ainda não terminou.'; end if;
    if v_room.question_index+1 >= jsonb_array_length(v_room.questions) then raise exception 'Não há mais perguntas.'; end if;
    update rooms set status='question',question_index=question_index+1,question_started_at=now() where id=p_room_id;
  elsif p_action='finish' then
    if v_room.status not in ('reveal','question') then raise exception 'Não é possível encerrar agora.'; end if;
    update rooms set status='finished' where id=p_room_id;
  else raise exception 'Ação desconhecida.'; end if;
  return public.get_room_state(p_room_id,null);
end $$;

create or replace function public.submit_answer(p_room_id uuid,p_player_id uuid,p_option_index integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room rooms%rowtype; v_q jsonb; v_correct integer; v_elapsed integer; v_points integer; v_ok boolean;
begin
  select * into v_room from rooms where id=p_room_id for update;
  if not found or v_room.status<>'question' then raise exception 'A pergunta não está recebendo respostas.'; end if;
  if not exists(select 1 from players where id=p_player_id and room_id=p_room_id) then raise exception 'Jogador inválido.'; end if;
  v_q := v_room.questions->v_room.question_index;
  if p_option_index<0 or p_option_index >= jsonb_array_length(v_q->'options') then raise exception 'Alternativa inválida.'; end if;
  v_correct := (v_q->>'correct')::integer;
  v_ok := p_option_index=v_correct;
  v_elapsed := greatest(0,floor(extract(epoch from (now()-v_room.question_started_at))*1000)::integer);
  if v_elapsed > v_room.duration_seconds*1000 then raise exception 'O tempo acabou.'; end if;
  v_points := case when v_ok then 500 + floor(500*(1-v_elapsed::numeric/(v_room.duration_seconds*1000)))::integer else 0 end;
  insert into answers(room_id,player_id,question_index,option_index,is_correct,response_ms,points)
  values(p_room_id,p_player_id,v_room.question_index,p_option_index,v_ok,v_elapsed,v_points);
  update players set score=score+v_points where id=p_player_id;
  return jsonb_build_object('accepted',true,'points',v_points);
exception when unique_violation then
  raise exception 'Você já respondeu esta pergunta.';
end $$;

grant execute on function public.create_room(jsonb,integer) to anon,authenticated;
grant execute on function public.join_room(text,text) to anon,authenticated;
grant execute on function public.get_room_state(uuid,uuid) to anon,authenticated;
grant execute on function public.host_action(uuid,text,text,integer) to anon,authenticated;
grant execute on function public.submit_answer(uuid,uuid,integer) to anon,authenticated;
