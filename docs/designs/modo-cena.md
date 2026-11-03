# Modo Cena: conversa por voz guiada por roteiro

*   **Autor:** Emerson Oliveira
*   **Status:** Proposed
*   **Data:** 2026-11-03

--------------------------------------------------------------------------------

## Overview

O FluencyGo é um app local (Node 22 + React, servidor em `127.0.0.1`) para praticar inglês e espanhol com explicações em português. Hoje a conversa é por texto:
- o ditado do navegador preenche a caixa de mensagem e o aluno revisa antes de enviar;
- cada resposta do professor é uma chamada nova ao Codex CLI ou ao Claude CLI;
- a leitura em voz alta usa a voz do navegador.

Este design adiciona um **modo Cena**: o aluno aprende um diálogo situado num lugar (café, aeroporto, hotel…) e depois o vive por voz com o professor, sem ler. O modo tem duas fases:

1. **Ensino.** O Claude CLI gera, numa chamada só, o diálogo da cena e um **mapa da cena** com:
   - as falas do professor;
   - as respostas esperadas do aluno, com as variações aceitas;
   - os erros prováveis, com a correção já escrita;
   - frases de recuperação.

   O aluno ouve, vê a tradução e repete fala por fala.
2. **Conversa.** O aluno fala e o professor responde por voz. A passagem é gradual, em três passos:
   1. com o texto na tela;
   2. só com dicas;
   3. só voz.

   No caminho previsto, o navegador compara o que ouviu com o mapa e responde na hora, com áudio já gerado. O Claude CLI só é chamado quando o aluno sai do roteiro ou comete um erro que o mapa não previu.

Este design também fixa estas decisões:
- **Voz:** a do professor sai do Piper, um sintetizador local e grátis. Kokoro e a voz do navegador ficam como alternativas.
- **Idiomas:** inglês e espanhol da América Latina, níveis A1 a B1.
- **Codex:** fora do modo Cena. A conversa por texto e a aba de pronúncia continuam como estão.

## The Problem

Quem estuda pelo FluencyGo hoje treina leitura e escrita, não conversa. Uma conversa real tem quatro coisas que o app não oferece:

- **Ritmo.** Numa conversa de verdade, a resposta vem em um ou dois segundos. No app, cada resposta exige clicar, revisar o texto ditado, enviar e esperar o CLI terminar. O CLI abre um processo novo a cada turno e só devolve a resposta inteira no fim (`provider.js:8-9`, `provider.js:41-51`). A espera estimada é de vários segundos. Nada foi medido ainda.
- **Ouvido sem apoio de texto.** O aluno sempre vê a frase escrita. Ele nunca precisa entender só pelo som, que é o que trava a conversa fora da sala de aula.
- **Correção no momento do erro.** O professor do app comenta cada mensagem em português, mas não corrige como uma pessoa: repetindo a frase do jeito certo e seguindo a conversa.
- **Preparação antes da conversa.** O app joga o aluno direto no diálogo. Não ensina antes as frases que ele vai precisar, como pedir para repetir ("Sorry, can you repeat?").

O caminho óbvio seria pôr voz no chat atual, uma chamada ao CLI por fala. Isso deixaria um silêncio estimado de 4 a 15 s por turno, que soa como walkie-talkie, não como conversa. A proposta inverte o papel do CLI. Ele trabalha antes da conversa, gerando o mapa, e durante a conversa só entra quando o mapa não cobre o que aconteceu.

## Goals

*   **G1. Cena de 5 minutos só com voz.** No passo 3 da fase de conversa, o aluno sustenta uma cena com:
    *   pelo menos 300 s de duração;
    *   pelo menos 10 turnos dele (no A1);
    *   nenhum clique ou toque;
    *   nenhum texto no idioma estudado na tela.

    O app mede e mostra esses números no fim da cena.
*   **G2. Resposta rápida no caminho previsto.** Quando a fala do aluno bate com o mapa, o áudio do professor começa em até 1,5 s depois do fim da pausa de silêncio, na mediana medida na máquina do usuário.
*   **G3. Espera aceitável fora do roteiro.** Quando o Claude CLI precisa ser chamado, o professor diz uma frase de espera ("um momento…"). A resposta completa começa em até 8 s no percentil 95. Se o CLI não responder em 25 s, o professor diz uma frase de recuperação e a cena continua.
*   **G4. Correção como um professor.**
    *   Na maioria dos erros, o professor repete a frase do aluno do jeito certo, dentro da cena, e segue.
    *   A correção explícita, curta e em português, só aparece quando o erro muda o sentido ou é o que a cena está treinando.
    *   No máximo uma correção explícita por turno.
    *   No A1 o professor tolera mais. No B1 aponta também o que soa estranho.
*   **G5. Interromper o professor.** Com fone de ouvido, se o aluno começa a falar enquanto o professor fala, o áudio do professor para em até 300 ms.
*   **G6. Fim de fala configurável.** O tempo de silêncio que marca o fim da fala do aluno é ajustável de 0,6 a 3 s, com padrão próprio por nível (mais longo no A1).
*   **G7. Saber o estado sem ler.** O aluno sempre sabe se o app está ouvindo, pensando ou falando. Isso vem por som curto e por uma forma grande na tela, sem texto no idioma estudado.
*   **G8. Ajuda dentro do treino.** O aluno pede repetição ou ajuda no idioma da cena ("Sorry, can you repeat?", "¿Puede repetir, por favor?"), e a fase de ensino ensina essas frases. Sair e pausar ficam num botão grande e numa tecla.
*   **G9. Voz grátis.** Nenhuma etapa do modo Cena exige serviço pago. A voz roda na máquina do usuário (Piper). O reconhecimento usa o do navegador.
*   **G10. Cena salva.** O estado da cena é salvo no navegador e sobrevive a recarregar a página, sem depender de memória do CLI e sem tocar no histórico atual (`lingua-v1`).

## Non-Goals

*   **Interromper o aluno no meio da frase.** A correção vem logo depois da pausa dele.
*   **Avaliar pronúncia durante a conversa.** O reconhecimento do navegador devolve texto e tende a "consertar" o que o aluno disse. A avaliação de pronúncia continua na aba atual, com Azure.
*   **Interromper o professor usando alto-falante.** Sem fone, cada um fala na sua vez.
*   **Usar o Codex no modo Cena.** O Claude CLI é o único cérebro aqui.
*   **Serviços de voz pagos** (ElevenLabs, OpenAI Realtime, Azure TTS).
*   **VoiceStudio nesta versão.** A API não está documentada e a licença é AGPL.
*   **Reconhecimento de fala local (whisper.cpp) nesta versão.**
*   **Embutir no repositório modelos ou programas de voz.** O usuário instala o Piper, e o app o encontra pelo `.env`.
*   **Velocidade de assistente comercial em full duplex.**
*   **Uso por várias pessoas, hospedagem remota, níveis acima de B1.**
*   **Mudar a conversa por texto (`/api/chat`) ou a aba de pronúncia (`/api/speech`).**

## Open Questions

*   **Formato `stream-json` do Claude CLI entre versões.** O teste usou o Claude Code 2.1.316. Uma atualização pode mudar os eventos. O adaptador precisa falhar de forma clara ("atualize o FluencyGo") em vez de travar.
*   **Piper no Windows.** Falta confirmar como rodar o Piper nesta máquina e quanto tempo ele leva para cada frase: o pacote `piper-tts` do Python (3.12 está instalado) com servidor HTTP, ou o executável. O Piper ainda não está instalado.
*   **Código do espanhol latino.** O Chrome/Edge reconhecem melhor `es-MX`, `es-US` ou `es-419`? Qual voz Piper corresponde?
*   **Voz em português para as correções.** Existe voz Piper pt-BR com qualidade e velocidade aceitáveis nesta máquina?
*   **Erro do aluno ou erro do reconhecedor.** Como saber se o aluno errou ou se o reconhecedor ouviu errado? Pela regra, se a frase reconhecida parecer estranha, o professor pede para repetir em vez de corrigir.
*   **O que é uma "dica" no passo 2.** A primeira palavra da fala esperada, a tradução em português, ou uma imagem?
*   **Escuta contínua no Chrome/Edge.** O navegador encerra a sessão de reconhecimento sozinho. Com que frequência isso acontece, e o reinício automático perde fala do aluno?
*   **Haiku ou modelo padrão no processo aberto.** O Haiku respondeu em cerca de 2,3 s e o padrão em 3 a 4 s. Falta comparar a qualidade das correções. O plano deixa o modelo configurável, com o Haiku como padrão.

## Medições (2026-11-03)

Feitas nesta máquina: i7-1355U, 16 GB de RAM, sem GPU NVIDIA, Claude Code 2.1.316. As flags são as mesmas do `provider.js:9`. Os scripts ficaram fora do repositório.

| Forma de chamar o Claude | Modelo padrão | Haiku |
|---|---|---|
| `claude -p` novo a cada turno (como hoje) | 11,8 / 14,6 / 16,0 s | 11,6 / 8,1 / 11,5 s |
| `claude -p` novo para gerar o mapa de 8 turnos (~4,9 KB de JSON) | 30,7 s | 27,8 s |
| **Processo aberto (`--input-format stream-json`)**, 1º turno (inclui a inicialização) | 6,2 s | 8,3 s |
| **Processo aberto**, turnos 2 a 5 | 3,3 / 4,1 / 3,5 / 3,3 s | 2,1 / 2,3 / 2,5 / 2,3 s |

O processo aberto lembrou o contexto entre os turnos ("big coffee", depois o preço) e devolveu JSON válido em todos. Abrir um processo novo custa entre 6 e 12 s. Por isso, um processo por turno não atinge a G3, e um processo aberto por cena atinge.

## Critical User Journeys (CUJs)

### CUJ 1: Aprender e viver uma cena de café (A1, inglês)

*   **Given**: Claude CLI autenticado, Piper instalado e configurado no `.env`, fone conectado e microfone permitido no Chrome/Edge.
*   **When**:
    1. O aluno abre a aba Cena, escolhe "Café" e clica em Começar.
    2. Na fase de ensino, ouve cada fala, vê a tradução e repete.
    3. Faz a conversa no passo 1 (com texto), depois no passo 2 (dicas) e depois no passo 3 (só voz).
*   **Then**: O passo 3 dura pelo menos 300 s e tem pelo menos 10 turnos do aluno, sem clique. No fim, a tela mostra o resumo: duração, turnos, espera mediana e percentil 95, correções e trechos fora do roteiro.

### CUJ 2: Erro previsto pelo mapa

*   **Given**: Passo 3. A fala esperada é "I'd like a large coffee, please".
*   **When**: O aluno diz "I want a coffee big".
*   **Then**: Em até 1,5 s, o professor repete a frase do jeito certo dentro da cena ("A large coffee, sure!") e segue. A ordem do adjetivo é o ponto que a cena treina, então ele também diz uma correção curta em português. Nenhuma chamada ao Claude é feita.

### CUJ 3: O aluno sai do roteiro

*   **Given**: Passo 3, processo Claude da cena já aberto.
*   **When**: O aluno pergunta algo fora do mapa ("Do you have Wi-Fi?").
*   **Then**:
    *   O professor diz uma frase de espera curta ("Hmm…").
    *   Em até 8 s, ele responde dentro da cena e puxa de volta para o roteiro.
    *   Se o Claude não responder em 25 s, o professor diz uma frase de recuperação do mapa e a cena continua.

### CUJ 4: O aluno interrompe o professor

*   **Given**: Fone conectado, o professor falando.
*   **When**: O aluno começa a falar.
*   **Then**: O áudio do professor para em até 300 ms e o app passa a ouvir o aluno.

### CUJ 5: O aluno pede para repetir

*   **Given**: Passo 3.
*   **When**: O aluno diz "Sorry, can you repeat?".
*   **Then**: O professor repete a última fala mais devagar, sem chamar o Claude e sem contar isso como erro.

### CUJ 6: Recarregar a página no meio da cena

*   **Given**: Cena em andamento no passo 2.
*   **When**: O aluno recarrega a página.
*   **Then**:
    *   A cena volta no mesmo turno e no mesmo passo.
    *   O servidor encerra o processo Claude antigo e abre outro, que recebe o mapa e as últimas falas.
    *   A conversa por texto e o histórico `lingua-v1` não são afetados.

## Technical Plan (Architecture)

### Ideia central

**Antes da conversa:**
- Uma chamada ao Claude gera o **mapa da cena**.
- Todo o áudio previsível é gerado com antecedência: falas do professor, correções do mapa, frases de recuperação e frases de espera.

**Durante a conversa:**
- O navegador decide sozinho tudo o que o mapa cobre.
- Só o que o mapa não cobre vai para um **processo Claude aberto durante a cena**. Medido: 2 a 4 s por turno (seção Medições).
- O áudio novo que essa resposta exige é gerado pelo Piper na hora.

```text
 NAVEGADOR (React)                                       SERVIDOR (Node, 127.0.0.1)
 ┌───────────────────────────────────────────┐          ┌────────────────────────────────────┐
 │ SceneTab (interface)                      │          │ rotas (tabela)                     │
 │   │                                       │ POST     │  /api/scene      ─► sceneMap.js ───┼─► claude -p (1 vez, ~30 s)
 │   ▼                                       │ ───────► │  /api/scene/live ─► liveTutor.js ──┼─► claude aberto (stream-json)
 │ engine.js (máquina de estados, pura)      │          │  /api/scene/turn ─┘   fila, timeout│     1 por cena, 2–4 s/turno
 │   ▲   │                                   │          │  /api/scene/end                    │
 │   │   ├─► matcher.js (fala x mapa)        │ GET/POST │  /api/tts        ─► tts.js ────────┼─► Piper (local, grátis)
 │   │   ├─► player.js (áudio, stop)  ◄──────┼──────────┤                     cache em memória│
 │   │   └─► métricas por turno              │ áudio WAV│  /api/chat, /api/speech (iguais)   │
 │ turnDetector.js (SpeechRecognition        │          └────────────────────────────────────┘
 │   contínuo + timer de silêncio)           │
 │ bargeIn.js (microfone com cancelamento    │
 │   de eco, energia > limiar por 300 ms)    │
 └───────────────────────────────────────────┘
 localStorage: fluencygo-scenes-v1 (mapa, passo, turno atual, métricas)
```

### 1. Mapa da cena (`/api/scene`)

- Uma chamada `claude -p`, com as mesmas flags de hoje (`provider.js:9`), mais `--model` configurável. Ela devolve o JSON abaixo. O servidor valida e, se faltar campo, recusa com erro claro. Não tenta consertar.
- A chamada usa a trava `busy` atual. Gerar o mapa leva uns 30 s, então a interface mostra "Preparando sua cena…" com uma barra que não depende de tempo exato.

```text
SceneMap v1
{ schemaVersion: 1, language: "en"|"es", level: "A1"|"A2"|"B1", place: string, title: string,
  helpPhrases: [{ text, translation_ptbr }]          // "Sorry, can you repeat?" etc.
  recovery: [string]                                  // falas para puxar de volta à cena
  fillers: [string]                                   // "Hmm…", "Let me see…"
  nodes: [{ id, tutor, tutor_ptbr, hint_ptbr,
            expected: [{ text, variants: [string] }],
            likelyErrors: [{ pattern, recast, explain_ptbr, trained: boolean }],
            next: id | null }] }                     // limites: 6–14 nós, textos ≤ 300 caracteres
```

### 2. Processo Claude aberto (`/api/scene/live`, `/api/scene/turn`, `/api/scene/end`)

- **Abertura.** `liveTutor.js` abre um processo `claude -p --input-format stream-json --output-format stream-json --verbose --tools '' --disallowedTools 'mcp__*' --no-session-persistence --model <CLAUDE_SCENE_MODEL>` numa pasta temporária.
  - O isolamento atual continua: sem ferramentas, sem MCP, sem salvar sessão. Muda só que o processo vive a cena toda.
  - A primeira mensagem leva as regras do professor, o mapa e a política de correção do nível.
- **Quando abre.** No começo da fase de conversa, enquanto o professor fala a primeira fala do mapa. Assim a inicialização (6 a 8 s) fica escondida.
- **Turnos.**
  - Um turno por vez, numa fila por cena.
  - Cada turno tem timeout de 25 s. Ao estourar, a resposta é `{timeout: true}` e o navegador usa uma fala de `recovery`.
  - Se o processo morrer, o próximo turno abre outro e envia o mapa e as últimas 6 falas.
- **Encerramento.** O processo é encerrado com `killTree` (`provider.js:30`) em qualquer destes casos:
  - `/api/scene/end`;
  - 10 minutos sem turno;
  - uma nova cena;
  - o servidor fechando.

  Só existe um processo aberto por vez.
- **Resposta de cada turno:**

```text
TurnReply v1
{ say: string,                 // fala do professor no idioma da cena (≤ 300)
  correction_ptbr: string,     // vazio, ou correção curta em português (≤ 300)
  recast: string,              // vazio, ou a frase do aluno corrigida (≤ 300)
  backTo: nodeId | null }      // nó do mapa para onde a cena volta
```

- `/api/chat` e `/api/speech` continuam com a trava `busy` e o `claude -p` por chamada. O processo aberto tem trava própria e não bloqueia nem é bloqueado por eles.

### 3. Voz (`/api/tts`)

- **Contrato.** `tts.js` define o contrato `synthesize(text, voice, {signal}) → WAV`. A primeira implementação é o Piper, rodando como processo separado instalado pelo usuário:
  - `PIPER_URL`, para um servidor HTTP do Piper;
  - ou `PIPER_BIN` mais as pastas dos modelos.

  Qual das duas formas usar é a pergunta em aberto "Piper no Windows". Nada do Piper entra no repositório, por causa da licença GPL.
- **Vozes.** Uma por idioma: inglês (en-US), espanhol latino e português (pt-BR), configuradas no `.env`.
- **Cache.** Fica em memória, com chave `sha256(voz + texto)`. Na fase de ensino, o navegador pede de antemão o áudio de todas as falas do mapa, correções, recuperações e fillers.
- **Fora da trava do CLI.** `/api/tts` responde `audio/wav` (corpo binário) e não usa a trava do CLI. A CSP já permite tocar áudio de `self` e `blob:` (`server.js:12`), então ela não muda.
- **Sem Piper.** O navegador volta para `speechSynthesis`. A interrupção do professor fica desligada, porque essa voz não passa pelo cancelamento de eco, e a tela avisa.

### 4. Turno no navegador (`engine.js`)

**Estados:**
- ensino: `TEACH`;
- conversa: `TUTOR_SPEAKING`, `LISTENING`, `ENDPOINTING`, `THINKING`, `CORRECTING`;
- controle: `PAUSED`, `DONE`.

**Regras:**
- `engine.js` é JavaScript puro, sem React nem DOM. Recebe eventos (`speechFinal`, `silence`, `bargeIn`, `ttsEnded`, `turnReply`, `timeout`) e devolve ações (`play`, `stop`, `listen`, `callLive`, `save`).
- Cada turno tem um `turnId`. Resposta de um turno antigo é descartada.
- O relógio é injetado, para testar sem esperar.

**Decisão do turno:**
1. O `turnDetector` junta os resultados do reconhecimento até passar `pauseMs` sem fala nova. O padrão é 1,5 s no A1, 1,2 s no A2 e 1,0 s no B1, ajustável de 0,6 a 3 s.
2. `matcher.js` normaliza o texto: minúsculas, sem pontuação, contrações expandidas. Depois compara com o nó atual, nesta ordem:
   1. frase de ajuda → repetir a fala mais devagar;
   2. `expected`/`variants` com semelhança ≥ 0,8 → próxima fala;
   3. `likelyErrors` → `recast`, mais `explain_ptbr` se `trained` ou se o nível for A1 e o erro mudar o sentido.
3. Sem correspondência: toca um filler e chama `/api/scene/turn` com a fala e o nó atual. Toca `correction_ptbr` (voz pt-BR), depois `recast`, depois `say`, e vai para `backTo`.
4. Se o aluno não falar, a resposta vem em escada: aos 8 s repete a pergunta, aos 16 s dá a dica (`hint_ptbr`, em português), e depois oferece pausar.
5. O texto reconhecido nunca vira avaliação de pronúncia. Se parecer fora de contexto (semelhança < 0,3 com tudo e menos de 3 palavras), o professor pede para repetir antes de chamar o Claude.

**Passos da fase de conversa:**
1. A tela mostra a fala do professor e a esperada.
2. A tela mostra só `hint_ptbr`, em português.
3. A tela mostra só o indicador de estado. A métrica G1 conta neste passo.

### 5. Escuta, interrupção e eco

- **Reconhecimento.** `turnDetector.js` usa `SpeechRecognition` com `continuous = true` e `interimResults = true`. Ele se reinicia sozinho quando o navegador encerra a sessão, salvo se o motivo for `not-allowed`, que encerra a cena com aviso.
- **Interrupção.** `bargeIn.js` abre o microfone com `echoCancellation`, `noiseSuppression` e `autoGainControl`. Enquanto o professor fala, mede a energia do som. Acima do limiar por 300 ms, ele para o `player` e muda o estado para `LISTENING`. O limiar é calibrado por 2 s de silêncio no começo da conversa.
- **Fone.** A interrupção só fica ligada se o aluno marcar "estou de fone". Sem fone, o microfone fica fechado enquanto o professor fala, e cada um fala na sua vez.
- **Eco.** Texto reconhecido enquanto o professor fala, sem interrupção detectada, é descartado. Assim a voz do professor não vira fala do aluno.

### 6. Sinais sem texto

- **Sons curtos gerados pelo navegador (WebAudio, sem arquivos):**
  - "sua vez", quando a escuta começa;
  - "ouvi", quando a pausa fecha o turno.
- **Indicador de estado em tela cheia**, com forma diferente para ouvindo, pensando e falando.
- **Botões grandes:** Pausar, Repetir, Sair. Atalhos: espaço pausa, R repete, Esc sai.
- **Erros** (Claude caiu, Piper caiu, microfone negado) são ditos em português pela voz pt-BR ou pelo navegador, e aparecem em texto.

### 7. Dados e métricas

- **Armazenamento.** A chave nova `fluencygo-scenes-v1` guarda:
  - o mapa;
  - o passo e o nó atual;
  - as últimas 20 falas;
  - as métricas.

  A chave `lingua-v1` não é lida nem escrita pelo modo Cena.
- **Métricas por turno:**
  - momentos: fim da fala, decisão, primeiro som do professor;
  - caminho: mapa, Claude, recuperação;
  - correções.

  O resumo do fim da cena calcula a G1 (duração, turnos, cliques) e a G2/G3 (mediana e percentil 95).
- **Exportar progresso** (`src/main.jsx:55`) passa a incluir as cenas.
- **No servidor**, o `/api/status` passa a informar:
  - se o Piper está configurado;
  - se há processo Claude aberto;
  - o tempo do último turno.

### 8. Configuração (`.env`)

`CLAUDE_SCENE_MODEL` (padrão `haiku`), `PIPER_URL_EN`, `PIPER_URL_ES`, `PIPER_URL_PT` (um endereço por voz; podem ser iguais se um servidor Piper atender várias vozes), `SCENE_TURN_TIMEOUT_MS` (padrão 25000), `SCENE_IDLE_MS` (padrão 600000). Ajuste feito no plano de implementação: o caminho `PIPER_BIN` saiu, e só o servidor HTTP do Piper é usado. Ver o arquivo 6.

### 9. Organização do código

O `src/main.jsx` (59 linhas muito longas) é dividido **antes** da feature, sem mudar comportamento. Os testes atuais precisam passar iguais:
- `src/chat.jsx`;
- `src/voice.jsx`;
- `src/api.js`;
- `src/main.jsx`, que fica só com o shell e as abas.

O modo Cena fica em `src/scene/`. No servidor, a sequência de `if` (`server.js:17-36`) vira uma tabela de rotas, e o leitor de JSON passa para um `json.js` usado por `provider.js`, `speech.js` e o modo Cena.

## Alternatives Considered

### Alternativa A: um `claude -p` novo a cada fala do aluno (voz em cima do chat atual)

*   **Prós**: Reaproveita `teach()` e `runProcess()` quase sem mudança. Mantém o isolamento de hoje, com um processo descartável por chamada.
*   **Contras**: Medido de 8 a 16 s por turno, com Haiku ou com o modelo padrão (seção Medições). Quase todo esse tempo é abrir o processo, então resposta em streaming não ajuda.
*   **Motivo da rejeição**: Não atinge a G2 nem a G3. Numa cena de 5 minutos, boa parte do tempo seria silêncio.

### Alternativa B: sem Claude durante a conversa (só mapa e frases de recuperação)

*   **Prós**: Toda resposta vem do mapa e é rápida. Nenhum processo fica aberto. Gasta menos cota.
*   **Contras**: Quando o aluno diz algo razoável que o mapa não previu, o professor só consegue puxá-lo de volta ("Sorry, would you like a coffee?"). Isso parece não entender.
*   **Motivo da rejeição**: Contraria a decisão do brainstorm de que o professor pode sair do roteiro como uma pessoa faria. O processo aberto mostrou que isso cabe na G3. A alternativa continua como plano B: se o processo aberto quebrar numa versão futura do CLI, o modo Cena funciona assim.

### Alternativa C: Codex CLI como professor do modo Cena

*   **Prós**: Mantém a escolha de professor que o app já oferece.
*   **Contras**: O Codex não foi medido em modo de processo aberto, e um segundo adaptador ao vivo dobra o trabalho e os testes.
*   **Motivo da rejeição**: O usuário decidiu usar o Claude CLI em tudo no modo Cena.

### Alternativa D: ElevenLabs, ElevenLabs Agents, OpenAI Realtime ou outra API paga

*   **Prós**: Voz de alta qualidade. Os agentes prontos já resolvem detecção de fim de fala, interrupção e latência baixa.
*   **Contras**: Custam por caractere ou por minuto. Os agentes também trocam o Claude CLI por uma API paga.
*   **Motivo da rejeição**: O usuário exigiu voz grátis e o Claude CLI como cérebro.

### Alternativa E: VoiceStudio como voz

*   **Prós**: Local e grátis, com várias vozes, clonagem e whisper.cpp incluídos.
*   **Contras**:
    *   Exige um app Electron inteiro rodando.
    *   A API local (porta 3900) não está documentada.
    *   A página não diz quanto tempo leva para gerar a fala nem se faz streaming, e não confirma inglês e espanhol pelo nome.
    *   É AGPL-3.0, dentro de um projeto MIT.
*   **Motivo da rejeição**: Risco alto sem ganho sobre o Piper nesta versão. Pode entrar depois como mais uma implementação do contrato de `tts.js`, depois de um teste que documente a API.

### Alternativa F: Kokoro como voz padrão

*   **Prós**: Vozes mais naturais que as do Piper, segundo relatos. Licença Apache.
*   **Contras**: Mais pesado. Nesta máquina (i7-1355U, sem GPU NVIDIA) pode ficar perto do tempo real e atrasar as respostas fora do roteiro. Não foi medido.
*   **Motivo da rejeição**: Fica como alternativa no mesmo contrato de `tts.js`. O Piper é o padrão porque é leve em CPU.

### Alternativa G: voz do navegador (`speechSynthesis`) como padrão

*   **Prós**: Já existe (`src/main.jsx:8`). Não exige instalar nada.
*   **Contras**: A qualidade e as vozes variam por sistema. O som sai fora do cancelamento de eco do navegador, então a interrupção do professor fica insegura. A API também não permite gerar o áudio antes nem saber quanto ele dura.
*   **Motivo da rejeição**: Fica só como reserva quando o Piper não está configurado, com a interrupção desligada.

### Alternativa H: LLM local (Ollama ou similar)

*   **Prós**: Respostas possivelmente mais rápidas e sem cota.
*   **Contras**: Exige baixar e rodar um modelo grande numa máquina sem GPU dedicada, e a qualidade das correções em espanhol e inglês é incerta.
*   **Motivo da rejeição**: Viola a restrição de usar o Claude CLI.

### Alternativa I: reconhecimento de fala local (whisper.cpp)

*   **Prós**: Não manda áudio para a nuvem. Transcreve mais fielmente o que o aluno disse, inclusive os erros.
*   **Contras**: Pesado em CPU sem GPU, e ainda exigiria detecção de fim de fala própria. O usuário aceitou o reconhecimento em nuvem do navegador.
*   **Motivo da rejeição**: Adiada para outra versão. O `turnDetector` isola o reconhecimento, então trocar depois não muda o `engine.js`.

### Alternativa J: chamar o Claude com o texto parcial, antes do aluno terminar de falar

*   **Prós**: Ganharia de 1 a 2 s fora do roteiro.
*   **Contras**: Chamadas em dobro, cota em dobro, e respostas jogadas fora quando a frase muda no fim. O processo aberto atende um turno por vez.
*   **Motivo da rejeição**: Os 2 a 4 s medidos já cumprem a G3.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Segurança e privacidade**:
    *   O processo Claude aberto usa as mesmas travas de hoje: sem ferramentas, sem MCP, sem salvar sessão, numa pasta temporária apagada no fim.
    *   A fala do aluno vai como conteúdo de mensagem, nunca como argumento de linha de comando. O texto da fala é limitado a 500 caracteres, e o `nodeId` a `^[a-z0-9_-]{1,32}$`.
    *   O servidor continua só em `127.0.0.1`, com as checagens de Host/Origin e a CSP sem mudança.
    *   O reconhecimento contínuo do Chrome/Edge envia áudio à nuvem durante a cena. O usuário aceitou, e o README avisa.
    *   O áudio do Piper não sai da máquina.
*   **Desempenho**: G2 e G3, medidas pelas métricas da cena. Só existe um processo Claude aberto por vez, e ele é encerrado após 10 minutos sem uso.
*   **Cota**: O processo aberto acumula o contexto da cena: mapa, mais umas 30 falas curtas. Uma cena consome a cota de uma conversa curta do Claude Code.
*   **Rollout e rollback**: O modo Cena é uma aba nova. `/api/chat`, `/api/speech` e a chave `lingua-v1` não mudam. Voltar o commit remove a aba, e a chave `fluencygo-scenes-v1` fica órfã no navegador sem afetar nada.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Ordem de trabalho. Cada etapa termina com `npm run check` e `npm test` verdes.

- **0. Testes de viabilidade**, sem tocar o repositório.
- **1. Divisão do código.** Arquivos 1 a 5.
- **2. Servidor.** Arquivos 6 a 9.
- **3. Navegador.** Arquivos 10 a 18.
- **4. Documentação e configuração.** Arquivos 19 a 21.
- **5. Testes.** Arquivos 22 a 28, escritos junto de cada etapa.

### Etapa 0: testes de viabilidade (fora do repositório, no scratchpad)

Cada teste tem um critério que decide o caminho.

1.  **Piper.**
    *   Instalar com `pip install piper-tts`.
    *   Baixar as vozes `en_US-lessac-medium`, `es_MX-claude-high` e `pt_BR-faber-medium`.
    *   Subir o servidor HTTP do pacote e medir o tempo de uma frase de 60 caracteres em cada voz.
    *   **Critério:** ≤ 600 ms por frase. Se passar disso, testar a variante `-low` da mesma voz. Se o servidor atender uma voz por processo, rodar três servidores; por isso a configuração tem um endereço por voz.
2.  **Escuta contínua no Chrome e no Edge.**
    *   Página de teste com `continuous=true` em `es-MX` e `en-US`, durante 5 minutos.
    *   Registrar quantas vezes a sessão encerra sozinha e quanta fala se perde no reinício.
    *   **Critério:** perda ≤ 1 fala em 5 minutos. Se passar disso, o `turnDetector` reinicia já no `onspeechend`, sem esperar o `onend`.
3.  **Eco com fone.**
    *   Tocar o WAV do Piper por `<audio>` com o microfone aberto (`echoCancellation: true`).
    *   Medir a energia captada com o professor falando e sem fala do aluno.
    *   **Critério:** o limiar calibrado não dispara em 5 frases seguidas.
4.  **Haiku ou modelo padrão.**
    *   Rodar os mesmos 10 erros típicos de brasileiro nos dois modelos, no processo aberto.
    *   **Critério:** se o Haiku errar ou inventar correção em mais de 2 de 10, o padrão de `CLAUDE_SCENE_MODEL` passa a ser o modelo padrão.

### Arquivos a criar ou modificar

#### 1. `src/api.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: Recebe a função `api(path, body)` que hoje está em `src/main.jsx`, sem mudar o comportamento. Ganha `apiAudio(path, body, {signal}) → Blob`, que faz POST JSON e devolve o corpo binário, e `apiSignal`, para cancelar `fetch` com `AbortController`.
*   **Por quê**: o modo Cena precisa das mesmas chamadas e de áudio binário.

#### 2. `src/chat.jsx` (Create)

*   **Tipo**: componente React.
*   **Mudanças**: Recebe a aba Conversação que hoje está em `src/main.jsx`: tópicos, mensagens, `turn`, exportação e ditado. O código é movido sem mudança de comportamento.
*   **Por quê**: o `src/main.jsx` tem tudo em 59 linhas longas. Pôr o modo Cena ali tornaria as condições de corrida difíceis de achar.

#### 3. `src/voice.jsx` (Create)

*   **Tipo**: componente React.
*   **Mudanças**: Recebe `VoicePractice`, `useMicrophone` e `speak` de `src/main.jsx`, sem mudança. `speak` passa a devolver uma Promise que resolve no `onend`, porque o modo Cena usa a voz do navegador como reserva.
*   **Por quê**: o mesmo da divisão anterior.

#### 4. `src/main.jsx` (Modify)

*   **Tipo**: shell do app React.
*   **Mudanças**:
    *   Fica só com o onboarding, o cabeçalho, as abas e a seleção de configuração.
    *   Ganha uma terceira aba, "▶ Cena", que monta `src/scene/SceneTab.jsx`. A aba só aparece se o Claude estiver instalado (`/api/status`).
    *   A exportação de progresso passa a incluir `fluencygo-scenes-v1`.
*   **Por quê**: ponto de entrada da nova aba. O `build.mjs` continua usando `src/main.jsx` como entrada.

#### 5. `json.js` (Create, raiz)

*   **Tipo**: módulo Node.
*   **Mudanças**: `parseJsonLoose(raw) → any`.
    *   Tira cercas `` ```json ``.
    *   Se o texto não for JSON puro, extrai o primeiro bloco `{…}` balanceado.
    *   Se falhar, lança `Error('formato inesperado')`.
*   **Por quê**: substitui as duas cópias de hoje (`provider.js:65`, `speech.js:37`) e é usado pelo mapa e pelo processo aberto.

#### 6. `tts.js` (Create, raiz)

*   **Tipo**: módulo Node.
*   **Mudanças**:
    *   `ttsConfigured(env) → {en:boolean, es:boolean, pt:boolean}`.
    *   `validateTts({text, voice})`: texto de 1 a 400 caracteres, voz `en|es|pt`.
    *   `synthesize({text, voice}, {env, fetcher, signal}) → Buffer`. Faz POST para `PIPER_URL_<VOZ>` com JSON `{text}`, timeout de 10 s, e confere o cabeçalho RIFF/WAVE da resposta.
    *   Cache em memória: `Map` com no máximo 300 entradas, chave `sha256(voice + '\0' + text)`, removendo a mais antiga.
    *   Os endereços aceitos são só `http://127.0.0.1:<porta>` ou `http://localhost:<porta>`. Qualquer outro é recusado na leitura do `.env`.
*   **Por quê**: é o ponto de troca da voz (Kokoro ou VoiceStudio entram aqui depois). O áudio não sai da máquina.
*   **Ajuste ao Technical Plan**: só o servidor HTTP do Piper. Rodar o executável a cada frase recarregaria o modelo a cada vez.

#### 7. `scene.js` (Create, raiz)

*   **Tipo**: módulo Node.
*   **Mudanças**:
    *   `validateSceneRequest({language, level, place})`: `place` vem de uma lista fixa (`cafe`, `airport`, `hotel`, `restaurant`, `shop`, `street`).
    *   `scenePrompt(data)`: em português. Pede o JSON `SceneMap v1` do Technical Plan com 8 a 12 nós. Para espanhol, pede espanhol da América Latina (México). Inclui as regras de correção por nível (G4) e exige `helpPhrases` com pelo menos "repetir" e "mais devagar".
    *   `validateSceneMap(obj)`: aplica cada limite do schema, ids únicos, todo `next` apontando para um nó existente ou `null`, e o primeiro nó alcançando um nó final.
    *   `buildScene(data, runner)`: chama `claude -p` com `--model`, numa pasta temporária, como `teach()`, com timeout de 90 s.
*   **Por quê**: a fase de ensino e o mapa que o navegador usa.

#### 8. `live.js` (Create, raiz)

*   **Tipo**: módulo Node.
*   **Mudanças**: Classe `LiveTutor`.
    *   `liveCommand(model)` monta os argumentos do Technical Plan, seção 2. Usa `resolveBinary` de `provider.js`.
    *   `open({map, level, history})`:
        *   cria a pasta temporária, faz o spawn e envia a mensagem inicial: regras, mapa, histórico (no máximo 6 falas) e "responda apenas {\"ready\":true}";
        *   resolve no primeiro evento `result`;
        *   devolve `sceneId` (`randomUUID()`).
    *   `turn({sceneId, transcript, nodeId}, {signal})`:
        *   uma fila com um turno por vez;
        *   escreve uma linha `{"type":"user","message":{"role":"user","content":"<JSON {fala, nó}>"}}`;
        *   espera o próximo evento `type:"result"`, aplica `parseJsonLoose` em `result` e valida `TurnReply v1`, com `backTo` existente no mapa ou `null`;
        *   o timeout vem de `SCENE_TURN_TIMEOUT_MS`;
        *   `is_error`, JSON inválido ou timeout viram `{timeout:true}`. Isso não derruba o processo, salvo se ele tiver morrido.
    *   `close()`: `killTree` mais a remoção da pasta. Também roda no temporizador `SCENE_IDLE_MS` e no `process.on('exit')`.
    *   Linhas que não são JSON, ou eventos desconhecidos, são ignoradas. Se nenhum `result` chegar e o processo sair, o erro é "formato do Claude CLI mudou; atualize o FluencyGo".
*   **Por quê**: é a escolha medida para cumprir a G3.

#### 9. `server.js` (Modify)

*   **Tipo**: servidor HTTP.
*   **Mudanças**:
    *   Troca os `if` (linhas 17 a 36) por uma tabela `{'GET /api/status': fn, 'POST /api/chat': fn, …}`, com leitura de corpo e limite por rota: chat 64 KB, speech 1,4 MB, scene 8 KB, live 64 KB, turn 4 KB, tts 4 KB.
    *   `send()` ganha `sendBinary(status, buffer, type)`.
    *   **Rotas novas:**
        *   `POST /api/scene`, sob a trava `busy`, chama `buildScene`.
        *   `POST /api/scene/live` recebe `{map, level, history}`, valida o mapa de novo e chama `live.open`. Fecha o processo anterior, se existir.
        *   `POST /api/scene/turn` chama `live.turn`. Um `sceneId` diferente responde 409. Se a requisição fechar (`req.on('close')`), o turno é abortado.
        *   `POST /api/scene/end` chama `live.close`.
        *   `POST /api/tts` responde `audio/wav`. Sem a voz configurada, responde 503 `{error}`.
    *   As rotas live, turn e tts **não** usam `busy`.
    *   `/api/status` ganha `tts: ttsConfigured()` e `live: {open:boolean, lastTurnMs:number|null}`.
    *   `createApp` passa a receber `live` e `synth`, que podem ser trocados nos testes, como hoje `teacher` e `evaluator`.
*   **Por quê**: as rotas do modo Cena, com uma trava própria que não bloqueia o chat atual.

#### 10. `src/scene/engine.js` (Create)

*   **Tipo**: módulo puro, sem React nem DOM.
*   **Mudanças**: `createEngine({map, level, stage, pauseMs, headset, now}) → {state, dispatch(event) → actions[]}`.
    *   Estados e regras de decisão: Technical Plan, seção 4.
    *   Eventos: `start`, `ttsEnded`, `speechFinal(text)`, `silenceTimeout`, `bargeIn`, `turnReply(reply, turnId)`, `turnTimeout(turnId)`, `pause`, `resume`, `repeat`, `exit`.
    *   Ações: `play({voice,text,rate})`, `stop`, `listen`, `unlisten`, `callLive({transcript,nodeId,turnId})`, `earcon(kind)`, `save(snapshot)`, `metric(entry)`.
    *   A escada do silêncio é de 8 s e 16 s. Depois de 3 turnos seguidos fora do roteiro, o próximo `recovery` é forçado, para voltar ao mapa.
    *   O fim da cena acontece no nó com `next:null` ou ao sair. Gera `summary` com duração, turnos, cliques, mediana e p95 da espera, correções e turnos fora do roteiro.
*   **Por quê**: concentra a lógica que tem condições de corrida num lugar testável sem navegador.

#### 11. `src/scene/matcher.js` (Create)

*   **Tipo**: módulo puro.
*   **Mudanças**:
    *   `normalize(text, language)`: minúsculas, sem acento só para comparar, sem pontuação, e expansão de contrações (`i'd`→`i would`, `what's`→`what is`).
    *   `similarity(a, b)`: Dice sobre bigramas de palavras mais unigramas, de 0 a 1.
    *   `match(text, node, map) → {kind:'help'|'expected'|'error'|'unclear'|'none', item}`, com os limiares do Technical Plan: 0,8 para aceitar e 0,3 para "não entendi".
*   **Por quê**: decide os turnos no caminho previsto sem chamar o Claude (G2).

#### 12. `src/scene/turnDetector.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: `createTurnDetector({lang, pauseMs, Recognition, setTimeout})`, com eventos `onFinal(text)`, `onSpeechStart` e `onError(kind)`.
    *   Usa `continuous=true` e `interimResults=true`.
    *   O temporizador de silêncio reinicia a cada resultado e, ao estourar, dispara `onFinal` com o texto juntado.
    *   Reinicia sozinho em `onend`, `no-speech` e `network`, até 5 vezes por minuto. O erro `not-allowed` vira `onError('mic')`.
    *   `lang`: `en-US` ou `es-MX`.
*   **Por quê**: o fim de fala configurável (G6) e a escuta contínua.

#### 13. `src/scene/bargeIn.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: `createBargeIn({getUserMedia, AudioContext})` com `calibrate(2000)`, `arm()`, `disarm()` e o evento `onBargeIn`.
    *   O limiar é a energia média medida na calibração mais 12 dB.
    *   O disparo exige o limiar ultrapassado por 300 ms seguidos, em janelas de 20 ms.
*   **Por quê**: interromper o professor (G5).

#### 14. `src/scene/player.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: `createPlayer({apiAudio, speak})` com:
    *   `preload(items)`: busca os WAVs em paralelo, 4 por vez, e guarda as URLs `blob:`;
    *   `play({voice,text,rate}) → Promise`, que resolve no fim do áudio;
    *   `stop()`.

    O `rate` lento usa `playbackRate=0.8`. Sem Piper, usa `speak()` de `src/voice.jsx`.
*   **Por quê**: o áudio gerado antes (G2) e a possibilidade de parar a voz no meio (G5).

#### 15. `src/scene/earcons.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: `earcon(kind)` gera com WebAudio um tom de 120 ms: "sua vez" sobe de 660 para 880 Hz, "ouvi" toca 440 Hz.
*   **Por quê**: saber o estado sem ler (G7), sem arquivos de áudio.

#### 16. `src/scene/store.js` (Create)

*   **Tipo**: módulo do navegador.
*   **Mudanças**: `loadScenes()` e `saveScene(snapshot)` na chave `fluencygo-scenes-v1`.
    *   Formato: `{version:1, current:{map, stage, nodeId, history[≤20], pauseMs, headset}, sessions:[{date, language, level, place, stage, summary}]}`, com no máximo 50 sessões.
    *   `try/catch` em toda leitura e escrita. Um JSON inválido volta ao estado vazio.
*   **Por quê**: cena salva (G10), separada de `lingua-v1`.

#### 17. `src/scene/SceneTab.jsx` (Create)

*   **Tipo**: componente React.
*   **Mudanças**:
    *   **Escolha da cena:** lugar e "estou de fone". A pausa tem três opções (curta 1,0 s, média 1,5 s, longa 2,2 s), mais um campo avançado de 0,6 a 3 s.
    *   **Ensino:** lista das falas com tradução, botão "ouvir" e repetição pelo microfone.
    *   **Conversa:** o passo 1, 2 ou 3 escolhido, um indicador grande de estado e os botões Pausar, Repetir e Sair. Atalhos de teclado: espaço, R e Esc.
    *   **Resumo:** métricas da G1 e "Tentar de novo no passo seguinte".
    *   O componente liga `engine` a `turnDetector`, `bargeIn`, `player`, `earcons`, `store` e `api`.
    *   **Ao desmontar ou trocar de aba:** para o áudio, fecha o microfone e chama `/api/scene/end`.
    *   Se o Piper não estiver configurado, mostra um aviso e trava "estou de fone" em desligado.
*   **Por quê**: a interface do modo Cena.

#### 18. `public/style.css` (Modify)

*   **Tipo**: estilos.
*   **Mudanças**: Classes para a aba Cena:
    *   indicador de estado em tela cheia, com formas para ouvindo (círculo pulsando), pensando (três pontos) e falando (ondas);
    *   botões grandes (mínimo 64 px);
    *   o resumo.

    Tudo segue os tokens e o estilo do CSS atual.
*   **Por quê**: G7.

#### 19. `.env.example` (Modify)

*   **Tipo**: configuração.
*   **Mudanças**: um bloco comentado "Modo Cena", com `CLAUDE_SCENE_MODEL=haiku` e `PIPER_URL_EN=http://127.0.0.1:5001`. Os comentários dizem que cada voz Piper roda separada, como iniciar o servidor HTTP do Piper com a voz de cada idioma, e dão exemplos para `PIPER_URL_ES`, `PIPER_URL_PT`, `SCENE_TURN_TIMEOUT_MS` e `SCENE_IDLE_MS`.
*   **Por quê**: o usuário instala o Piper e o app o encontra pelo `.env`.

#### 20. `README.md` (Modify)

*   **Tipo**: documentação.
*   **Mudanças**: Seção "Modo Cena" com:
    *   o que é;
    *   como instalar o Piper e as três vozes (comandos `pip` e download);
    *   o fone obrigatório para interromper;
    *   o aviso de que a escuta contínua envia áudio ao provedor do navegador;
    *   a nota de licença: Piper é GPL e fica fora do repositório.

    O CLI aparece como `claude -p --input-format stream-json …` em "Operação local", e os arquivos novos entram na tabela "Estrutura".
*   **Por quê**: instalação e transparência.

#### 21. `package.json` (Modify)

*   **Tipo**: configuração do build.
*   **Mudanças**: o script `check` ganha `node --check json.js && node --check tts.js && node --check scene.js && node --check live.js`. Nenhuma dependência nova.
*   **Por quê**: manter o `check` cobrindo todo o servidor.

#### 22. `test/scene.test.js` (Create)

*   **Tipo**: testes unitários.
*   **Casos**:
    *   `validateSceneMap` aceita um mapa válido;
    *   recusa `next` apontando para um nó inexistente, ids repetidos, textos acima do limite, um mapa sem nó final e `place` fora da lista;
    *   `buildScene` usa um runner falso (padrão de `test/app.test.js`);
    *   `parseJsonLoose` com cercas, texto em volta e JSON quebrado.

#### 23. `test/live.test.js` (Create)

*   **Tipo**: testes de integração com CLI falso.
*   **Casos**: Um script Node em `test/fixtures/fake-claude-stream.mjs` lê linhas JSON da entrada e responde com eventos `system/init`, `assistant` e `result` com atraso configurável. Testa:
    *   `open` mais 3 turnos em ordem;
    *   a fila com dois turnos simultâneos;
    *   timeout virando `{timeout:true}`;
    *   `backTo` inválido recusado;
    *   o processo morto reabrindo no próximo turno;
    *   `close` matando o processo e apagando a pasta.

#### 24. `test/fixtures/fake-claude-stream.mjs` (Create)

*   **Tipo**: fixture.
*   **Mudanças**: o CLI falso do item 23. O comportamento vem de variáveis de ambiente: atraso, falha e JSON inválido.

#### 25. `test/tts.test.js` (Create)

*   **Tipo**: testes unitários.
*   **Casos**:
    *   `synthesize` com `fetcher` falso devolvendo um WAV válido;
    *   cache acertando na segunda chamada;
    *   resposta sem RIFF recusada;
    *   endereço fora de localhost recusado;
    *   texto acima de 400 caracteres recusado.

#### 26. `test/engine.test.js` (Create)

*   **Tipo**: testes unitários do `engine.js` e do `matcher.js`.
*   **Casos**:
    *   caminho esperado: o próximo nó toca sem `callLive`;
    *   erro previsto: recast mais `explain_ptbr` só quando `trained`;
    *   frase de ajuda: repete com `rate` lento;
    *   fora do roteiro: filler, `callLive`, depois a resposta na ordem correção, recast, say;
    *   `turnReply` com `turnId` velho descartado;
    *   interrupção gerando `stop` e `listen`;
    *   escada de silêncio de 8 s e 16 s com relógio falso;
    *   3 desvios seguidos forçando `recovery`;
    *   resumo com mediana e p95 corretos.

#### 27. `test/react.test.js` (Modify)

*   **Tipo**: teste de interface com JSDOM.
*   **Casos**: os testes atuais passam sem mudança depois da divisão (arquivos 1 a 4). Caso novo: a aba Cena com `fetch`, `SpeechRecognition` e `Audio` falsos percorre escolha, ensino, passo 3, uma fala esperada, uma fala fora do roteiro e o resumo.

#### 28. `test/app.test.js` (Modify)

*   **Tipo**: testes do servidor.
*   **Casos**:
    *   a tabela de rotas mantém as respostas atuais (404, 415, 413, 429, 403);
    *   `/api/scene/turn` funciona enquanto `/api/chat` está ocupado, e vice-versa;
    *   `sceneId` errado responde 409;
    *   `/api/tts` responde `audio/wav`, ou 503 sem configuração;
    *   `/api/status` traz `tts` e `live`.

#### Arquivos sem mudança

*   `build.mjs` mantém a entrada `src/main.jsx`.
*   `provider.js` muda só no uso de `json.js` (linha 65) e exporta `killTree`, que `live.js` usa.
*   `speech.js` muda só no uso de `json.js` (linha 37).
*   `src/audio.js` e `.github/workflows/ci.yml` não mudam. O CI já roda `npm test`.
*   `public/app.js` é gerado pelo `npm run build`.

### Verification Plan

*   **Build**: `npm run check`, que inclui `npm run build`.
*   **Testes**: `npm test` (`node --test`), sem CLI real nem Piper, usando os falsos.
*   **Lint**: o projeto não tem linter. O `node --check` do `check` cobre a sintaxe.
*   **Cobertura**: todo estado e todo evento do `engine.js` tem pelo menos um teste. Todo limite de `validateSceneMap` tem um teste de recusa.
*   **Aceitação manual** (G1 a G5), nesta máquina, com fone, Claude CLI autenticado e Piper rodando:
    1. Uma cena de café em inglês A1 e outra em espanhol A1 até o passo 3. O resumo precisa mostrar pelo menos 300 s, pelo menos 10 turnos, 0 cliques, espera mediana no mapa ≤ 1,5 s e p95 fora do roteiro ≤ 8 s.
    2. Interromper o professor 5 vezes: o áudio para em todas, medido pelo log de métricas (`bargeIn` → `stop` ≤ 300 ms).
    3. Sem fone, falar durante a fala do professor não gera turno.
    4. Recarregar no meio do passo 2: a cena volta no mesmo nó.
    5. Derrubar o Piper no meio da cena: o aviso é falado pela voz do navegador e a cena segue sem interrupção.
    6. Conferir que `/api/chat` e `/api/speech` funcionam como antes, com Codex e com Claude.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
