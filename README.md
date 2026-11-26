# PMC Quiz Arena 🎉

Mini-Kahoot multiplayer para a festa do PMC. Interface responsiva, salas públicas por código, até 30 jogadores, perguntas de múltipla escolha, cronômetro, pontuação com bônus de velocidade e ranking.

## Requisitos
- Node.js 20+
- Projeto Supabase (plano gratuito é suficiente para testes pequenos)

## 1. Preparar o Supabase
1. Crie um projeto em https://supabase.com/.
2. Abra **SQL Editor → New query**.
3. Cole e execute todo o conteúdo de `supabase/schema.sql`.
4. Em **Project Settings → API**, copie a Project URL e a chave `anon`/publishable. Nunca use `service_role` no navegador.

## 2. Rodar localmente
```bash
npm install
cp .env.example .env
```
Preencha `.env`:
```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```
Depois:
```bash
npm run dev
```
Abra o endereço mostrado pelo Vite. Para jogar em dispositivos diferentes, publique o app (passo 3) ou exponha seu servidor local por uma ferramenta de túnel HTTPS.

## 3. Publicar na Vercel
1. Envie esta pasta para um repositório GitHub.
2. Importe o repositório em https://vercel.com/.
3. Framework preset: **Vite**; Build command: `npm run build`; Output directory: `dist`.
4. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas Environment Variables.
5. Faça o deploy e compartilhe o endereço público.

## Como jogar
- Apresentadora: **Criar partida** → defina o tempo → crie a sala → compartilhe código ou link → aguarde jogadores → **Começar partida**.
- Participantes: abram o link, digitem apelido e código e aguardem.
- A apresentadora avança as rodadas e encerra no resultado final.
- O ranking atualiza automaticamente por consulta ao banco a cada 1,2 segundo.

## Personalização
A tela de configuração permite editar o texto das perguntas e das alternativas. O índice da alternativa correta fica no array `correct` (começa em zero). O projeto vem com cinco perguntas de exemplo, que podem ser substituídas antes da partida.

## Segurança e limites da primeira versão
- As operações de escrita são feitas por funções SQL `SECURITY DEFINER`; não há permissão direta de escrita nas tabelas.
- O token de apresentador é secreto e mantido na sessão do navegador. Não compartilhe o link de administração.
- A primeira versão usa atualização periódica a cada 1,2 s para sincronizar o estado (quase em tempo real), em vez de Supabase Realtime subscriptions.
- Salas e dados ficam no banco até serem removidos. Para produção recorrente, implemente expiração/limpeza automática de salas antigas, moderação de apelidos e limites de requisição.
- Esta versão foi preparada para um ambiente pequeno de evento; faça um teste completo com vários navegadores antes da festa.

## Arquitetura
React + Vite no frontend, Supabase Postgres + RPC para estado, respostas e pontuação. As respostas corretas só são retornadas quando a rodada termina.
