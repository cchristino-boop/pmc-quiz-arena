import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Sparkles, Trophy, Users, Timer, Zap, Crown, Copy, Play, Plus, LogIn, RotateCcw, PartyPopper, Volume2 } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const sampleQuestions = [
  {prompt:'Qual é a missão secreta do PMC quando chega uma demanda “rapidinha”?',options:['Transformar em um projeto de 3 semanas','Abrir o arquivo e descobrir 48 ajustes','Perguntar o prazo e respirar fundo','Todas as anteriores'],correct:3},
  {prompt:'Qual frase combina mais com uma revisão de conteúdo?',options:['Só mais uma alteraçãozinha','Está perfeito de primeira','Não precisamos validar','Pode publicar sem olhar'],correct:0},
  {prompt:'Quando uma entrega envolve vários idiomas, o que não pode faltar?',options:['Tradução literal','Contexto e adaptação','Só trocar as bandeiras','Aumentar o tamanho do arquivo'],correct:1},
  {prompt:'Qual é o superpoder coletivo do time?',options:['Ler pensamentos','Entregar qualidade em equipe','Fazer tudo sem briefing','Nunca receber urgências'],correct:1},
  {prompt:'O que acontece quando alguém diz “é só ajustar um detalhe”?',options:['É realmente um detalhe','Surge uma nova versão','O universo abre um portal','As alternativas B e C'],correct:3}
];

const colors = ['#ff4d6d','#3977ff','#ffbd35','#18b98a'];
const letters = ['A','B','C','D'];
const cleanName = s => (s || '').trim().replace(/\\s+/g,' ').slice(0,18);

function App(){
  const [screen,setScreen] = useState('home');
  const [mode,setMode] = useState('host');
  const [roomCode,setRoomCode] = useState('');
  const [nickname,setNickname] = useState('');
  const [room,setRoom] = useState(null);
  const [playerId,setPlayerId] = useState(null);
  const [hostToken,setHostToken] = useState(null);
  const [state,setState] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [duration,setDuration] = useState(20);
  const [selected,setSelected] = useState(null);
  const [questionDraft,setQuestionDraft] = useState(sampleQuestions);
  const [showEditor,setShowEditor] = useState(false);

  const configured = Boolean(supabase);
  const isHost = mode === 'host';
  const current = state?.question || null;
  const players = state?.players || [];
  const leaderboard = [...players].sort((a,b)=>b.score-a.score || a.nickname.localeCompare(b.nickname));
  const myPlayer = players.find(p=>p.id===playerId);
  const answered = state?.my_answered || false;

  useEffect(()=>{ setSelected(null); },[state?.question_index]);

  useEffect(()=>{
    if(!room?.id || !supabase) return;
    let alive = true;
    const refresh = async()=>{
      const {data,error:e} = await supabase.rpc('get_room_state',{p_room_id:room.id,p_player_id:playerId});
      if(!alive) return;
      if(!e && data) setState(data);
      else if(e) setError(e.message);
    };
    refresh();
    const timer=setInterval(refresh,1200);
    return ()=>{alive=false;clearInterval(timer)};
  },[room?.id,playerId]);

  useEffect(()=>{
    if(state?.status==='question' && screen!=='game') setScreen('game');
    else if(state?.status==='reveal' && screen!=='reveal') setScreen('reveal');
    else if(state?.status==='finished' && screen!=='finished') setScreen('finished');
  },[state?.status,screen]);

  const call = async(fn,args)=>{
    if(!supabase){setError('O projeto ainda não está conectado ao Supabase. Configure as variáveis do arquivo .env.');return null;}
    setBusy(true);setError('');
    const {data,error:e}=await supabase.rpc(fn,args);
    setBusy(false);
    if(e){setError(e.message);return null;}
    return data;
  };

  const createRoom = async()=>{
    const data=await call('create_room',{p_questions:questionDraft.map(q=>({prompt:q.prompt,options:q.options,correct:q.correct})),p_duration:duration});
    if(!data) return;
    setRoom({id:data.room_id,code:data.code});setHostToken(data.host_token);setMode('host');setScreen('lobby');
    const url=`${location.origin}${location.pathname}?room=${data.code}`;
    history.replaceState({},'',url);
  };
  const joinRoom = async()=>{
    const name=cleanName(nickname);
    if(!name || roomCode.trim().length!==6){setError('Informe um apelido e um código de 6 caracteres.');return;}
    const data=await call('join_room',{p_code:roomCode.trim().toUpperCase(),p_nickname:name});
    if(!data) return;
    setRoom({id:data.room_id,code:roomCode.trim().toUpperCase()});setPlayerId(data.player_id);setMode('player');setScreen('lobby');
    history.replaceState({},'',`${location.pathname}?room=${roomCode.trim().toUpperCase()}`);
  };
  const hostAction = async(action)=>{
    const data=await call('host_action',{p_room_id:room.id,p_host_token:hostToken,p_action:action,p_duration:duration});
    if(data) setState(data);
  };
  const answer = async(index)=>{
    if(answered || selected!==null) return;
    setSelected(index);
    const data=await call('submit_answer',{p_room_id:room.id,p_player_id:playerId,p_option_index:index});
    if(data?.error) setError(data.error);
  };
  const copyCode=()=>navigator.clipboard?.writeText(room?.code || '');
  const copyLink=()=>navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${room?.code}`);
  useEffect(()=>{
    const code=new URLSearchParams(location.search).get('room');
    if(code){setRoomCode(code);setScreen('join');}
  },[]);

  if(!configured) return <SetupScreen />;
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Sparkles size={20}/></span><span>PMC <b>QUIZ ARENA</b></span></div><span className="edition">EDIÇÃO FESTA • 2026</span></header>
    <div className="confetti confetti-one">✦</div><div className="confetti confetti-two">✹</div><div className="confetti confetti-three">✦</div>
    {error && <div className="error-banner">{error}<button onClick={()=>setError('')}>×</button></div>}
    {screen==='home' && <section className="hero">
      <div className="hero-tag"><PartyPopper size={15}/> A FESTA VAI COMEÇAR</div>
      <h1>QUIZ <span>ARENA</span></h1><p className="hero-sub">Conhecimento, velocidade e uma pitada de caos. 🎉</p>
      <div className="home-card">
        <button className="primary-btn" onClick={()=>{setMode('host');setScreen('host-setup')}}><Plus/> Criar partida</button>
        <div className="or-line"><span>OU</span></div>
        <button className="secondary-btn" onClick={()=>{setMode('player');setScreen('join')}}><LogIn/> Entrar em uma partida</button>
      </div>
      <div className="feature-row"><span><Users/> Até 30 jogadores</span><span><Zap/> Ranking ao vivo</span><span><Trophy/> Pódio final</span></div>
    </section>}
    {screen==='host-setup' && <section className="panel narrow">
      <button className="back-link" onClick={()=>setScreen('home')}>← Voltar</button><div className="panel-icon"><Crown/></div><h2>Preparar a arena</h2><p>Configure a rodada e abra sua sala.</p>
      <label>Duração de cada pergunta</label><div className="duration-options">{[10,15,20,30,45].map(n=><button className={duration===n?'chosen':''} onClick={()=>setDuration(n)}>{n}s</button>)}</div>
      <button className="text-btn" onClick={()=>setShowEditor(!showEditor)}>{showEditor?'Ocultar':'Editar'} perguntas ({questionDraft.length})</button>
      {showEditor && <div className="editor">{questionDraft.map((q,i)=><div className="editor-q"><b>Pergunta {i+1}</b><input value={q.prompt} onChange={e=>setQuestionDraft(old=>old.map((x,j)=>j===i?{...x,prompt:e.target.value}:x))}/>{q.options.map((o,j)=><input value={o} onChange={e=>setQuestionDraft(old=>old.map((x,k)=>k===i?{...x,options:x.options.map((v,z)=>z===j?e.target.value:v)}:x))}/>)}<label>Alternativa correta</label><select value={q.correct} onChange={e=>setQuestionDraft(old=>old.map((x,k)=>k===i?{...x,correct:Number(e.target.value)}:x))}>{q.options.map((o,j)=><option value={j}>{letters[j]} — {o}</option>)}</select></div>)}</div>}
      <button className="primary-btn full" disabled={busy} onClick={createRoom}><Play/> Criar sala</button>
    </section>}
    {screen==='join' && <section className="panel narrow">
      <button className="back-link" onClick={()=>setScreen('home')}>← Voltar</button><div className="panel-icon"><LogIn/></div><h2>Entrar na partida</h2><p>Peça o código à apresentadora e escolha seu nome de jogador.</p>
      <label>Seu apelido</label><input className="big-input" maxLength="18" placeholder="Ex.: Camilla" value={nickname} onChange={e=>setNickname(e.target.value)}/>
      <label>Código da sala</label><input className="big-input code-input" maxLength="6" placeholder="ABC123" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}/>
      <button className="primary-btn full" disabled={busy} onClick={joinRoom}><LogIn/> Entrar na arena</button>
    </section>}
    {screen==='lobby' && <section className="panel lobby">
      <div className="lobby-head"><div><div className="live-pill"><i/> SALA ABERTA</div><h2>{isHost?'Sua arena está pronta!':'Você entrou na arena!'}</h2><p>{isHost?'Compartilhe o código com a galera.':'Aguarde a apresentadora iniciar o jogo.'}</p></div><div className="people-count"><Users/><b>{players.length}</b><small>jogadores</small></div></div>
      <div className="room-code"><small>CÓDIGO DA PARTIDA</small><strong>{room?.code}</strong><div className="code-actions"><button onClick={copyCode}><Copy size={15}/> Copiar código</button><button onClick={copyLink}><Copy size={15}/> Copiar link</button></div></div>
      <div className="player-cloud">{players.map((p,i)=><span className="player-chip"><i style={{background:colors[i%4]}}/>{p.nickname}</span>)}</div>
      {isHost && <button className="primary-btn full" disabled={busy||players.length===0} onClick={()=>hostAction('start')}><Play/> Começar partida</button>}
      {!isHost && <div className="waiting"><span className="pulse"/> Você está dentro! Prepare os dedos…</div>}
      {isHost && <button className="text-btn" onClick={()=>setScreen('home')}>Encerrar e voltar</button>}
    </section>}
    {screen==='game' && <section className="game-layout">
      <div className="game-main">
        <div className="game-meta"><span>PERGUNTA {state?.question_index+1} / {state?.total_questions}</span><span className="timer"><Timer size={17}/> {state?.remaining_seconds ?? '--'}s</span></div>
        <div className="timer-track"><i style={{width:`${Math.max(0,(state?.remaining_seconds||0)/duration*100)}%`}}/></div>
        <h2 className="question-title">{current?.prompt}</h2>
        <div className="answer-grid">{current?.options?.map((option,i)=><button disabled={answered||selected!==null||state?.status!=='question'} onClick={()=>answer(i)} className={`answer-option ${selected===i?'selected':''}`} style={{'--option':colors[i]}}><span>{letters[i]}</span>{option}</button>)}</div>
        {mode==='player' && <p className="answer-status">{answered||selected!==null?'Resposta enviada! Aguarde o resultado.':'Escolha sua resposta!'}</p>}
        {isHost && <p className="answer-status">{state?.answered_count||0} de {players.length} respostas recebidas</p>}
      </div>
      <aside className="leaderboard"><h3><Trophy/> Ranking</h3>{leaderboard.slice(0,8).map((p,i)=><div className={`rank-row ${p.id===playerId?'me':''}`}><b>{i+1}</b><span>{p.nickname}</span><strong>{p.score}</strong></div>)}</aside>
    </section>}
    {screen==='reveal' && <section className="panel reveal">
      <div className="panel-icon success"><Trophy/></div><div className="live-pill"><i/> RESULTADO DA RODADA</div><h2>{state?.correct_option!==null?`Resposta: ${letters[state?.correct_option]}`:'Tempo encerrado!'}</h2>
      <p className="revealed-question">{current?.prompt}</p>
      <div className="revealed-options">{current?.options?.map((o,i)=><div className={i===state?.correct_option?'correct':''}><b>{letters[i]}</b>{o}{i===state?.correct_option?' ✓':''}</div>)}</div>
      <div className="round-stats"><span><Users/> {state?.answered_count} responderam</span><span><Zap/> Pontos por velocidade!</span></div>
      {isHost && <button className="primary-btn full" onClick={()=>hostAction(state?.question_index+1>=state?.total_questions?'finish':'next')}><Play/> {state?.question_index+1>=state?.total_questions?'Ver pódio':'Próxima pergunta'}</button>}
      {!isHost && <div className="waiting">Aguardando a próxima rodada…</div>}
    </section>}
    {screen==='finished' && <section className="panel final-panel">
      <div className="panel-icon gold"><Trophy/></div><div className="hero-tag"><PartyPopper size={15}/> FIM DE JOGO</div><h2>Temos um campeão!</h2><div className="podium">{leaderboard.slice(0,3).map((p,i)=><div className={`podium-place place-${i+1}`}><div className="medal">{['🥇','🥈','🥉'][i]}</div><b>{p.nickname}</b><strong>{p.score} pts</strong><div className="podium-block">{i+1}º</div></div>)}</div>
      <h3>Ranking final</h3>{leaderboard.map((p,i)=><div className="rank-row"><b>{i+1}</b><span>{p.nickname}</span><strong>{p.score}</strong></div>)}
      {isHost && <button className="secondary-btn full" onClick={()=>{setRoom(null);setState(null);setScreen('home');history.replaceState({},'',location.pathname)}}><RotateCcw/> Nova partida</button>}
    </section>}
    <footer>Feito para jogar junto. <b>PMC • 2026</b></footer>
  </main>;
}

function SetupScreen(){return <main className="setup-screen"><div className="setup-card"><Sparkles size={36}/><h1>PMC Quiz Arena</h1><h2>Falta conectar a arena ao servidor</h2><p>Para habilitar salas compartilhadas, crie um projeto gratuito no Supabase, execute o script <b>supabase/schema.sql</b> e configure as variáveis de ambiente.</p><ol><li>Copie <code>.env.example</code> para <code>.env</code>.</li><li>Preencha a URL e a chave anon do Supabase.</li><li>Execute <code>npm install</code> e <code>npm run dev</code>.</li></ol><p>O passo a passo completo está no README do projeto.</p></div></main>}
export default App;
