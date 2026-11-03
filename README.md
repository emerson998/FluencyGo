# FluencyGo · React + voz

Aplicação **React** para praticar inglês e espanhol com explicações em português brasileiro. Você conversa na interface, escolhe **Codex CLI ou Claude CLI** na tela inicial e treina sua fala na aba **Pronúncia e fonética**.

## Executar

Requisitos: Node.js **22.9+**, npm e ao menos um CLI instalado e autenticado no PATH. Linux, macOS, Windows nativo ou WSL2. No Windows nativo, o adaptador lê o lançador npm `.cmd` (`claude.cmd`, `codex.cmd`) e executa direto o `.exe` ou o `.js` de destino, sem passar pelo shell.

1. Codex: instale com `npm install -g @openai/codex` e autentique com `codex login`. Para Claude, siga https://code.claude.com/docs/en/setup e execute `claude` no terminal para autenticar.
2. Na pasta extraída/clonada:

```bash
npm ci
npm run build
npm start
```

3. Abra **http://127.0.0.1:3210**, escolha professor, idioma e nível, e clique em Começar minha jornada.

Depois da instalação inicial, todas as interações de aprendizado são pela interface. Login/instalação do CLI e início do servidor ainda acontecem no terminal. `public/app.js` já inclui um build React no ZIP, mas `npm run build` atualiza a interface após editar `src/`.

## Conversação

- Inglês e espanhol; níveis A1, A2 e B1.
- Situações de café, viagem, trabalho e dia a dia.
- Resposta no idioma, tradução e correção em português, vocabulário e leitura em voz alta.
- Ditado com revisão antes de enviar. O reconhecimento requer suporte e permissão do navegador.
- Histórico por idioma, nível e cenário, contador de respostas praticadas e exportação JSON. Histórico anterior da versão 1 continua usando a chave `lingua-v1`.
- Clique em **Treinar pronúncia** em uma resposta para praticar essa mesma frase.

## Pronúncia e fonética: dois modos distintos

### Palavras reconhecidas + professor via CLI (sem chave de áudio)

1. Abra a aba Pronúncia e fonética, escolha uma frase ou escreva outra.
2. Clique em Ouvir devagar e em Ver fonética / IPA para receber um guia do professor.
3. Clique em Falar minha tentativa. O navegador transcreve sua fala; o Codex/Claude compara o texto com a frase e oferece um exercício.

**Este modo não avalia pronúncia.** Uma transcrição correta não comprova que os fonemas foram pronunciados corretamente. A interface não fornece nota de pronúncia neste modo, e o prompt informa ao CLI que ele não recebeu áudio. O IPA é uma orientação gerada pelo modelo e pode conter imprecisões. O navegador pode usar serviços externos para transcrever sua voz. Chrome/Edge são opções usuais; a disponibilidade depende do sistema e do navegador.

### Pronúncia no áudio · Azure Speech

Este modo grava áudio de verdade e recebe notas acústicas por frase, palavra e fonema. O CLI escolhido recebe os resultados e explica como melhorar em português. A análise acústica é feita pelo Azure Speech; o CLI não escuta o áudio.

1. Crie um recurso Azure Speech na sua conta e obtenha sua chave e o nome do recurso. A integração usa o endpoint de domínio personalizado `https://NOME_DO_RECURSO.cognitiveservices.azure.com`.
2. Copie `.env.example` para `.env` e preencha **no servidor**:

```dotenv
AZURE_SPEECH_KEY=sua_chave
AZURE_SPEECH_RESOURCE=nome-do-seu-recurso
```

3. Reinicie `npm start` e recarregue a página. Selecione Pronúncia no áudio quando aparecer “configurado”. Isso indica presença da configuração; a validade da chave é confirmada na primeira análise.
4. Escute a frase, grave até 28 segundos, pare e aguarde. A interface mostra transcrição, precisão, fluência, completude, pronúncia e os detalhes devolvidos por palavra/fonema. Você também pode ouvir sua gravação.

O navegador converte a gravação para WAV PCM mono de 16 kHz. O servidor valida o cabeçalho, formato e duração máxima de 30 segundos. Idiomas configurados: `en-US` e `es-ES`. A disponibilidade e os detalhes de notas dependem do recurso e do idioma no serviço. Notas são estimativas automáticas, não certificação. Não usamos um limiar arbitrário para declarar que uma pessoa “fala certo” ou “fala errado”. As palavras sinalizadas pelo serviço são mostradas individualmente.

Áudio é enviado ao Azure apenas neste modo; transcrição e notas são enviadas ao CLI para orientação. O áudio não é salvo pelo servidor nem pelo histórico local: permanece temporariamente no navegador para reprodução, sujeito às políticas do serviço externo. Azure e CLIs podem ter custos e cotas. Nunca publique `.env` ou credenciais.

Se o CLI falhar depois da avaliação acústica, as notas ainda aparecem com aviso de que a orientação não foi gerada. Se o serviço de voz falhar, a interface mostra o erro; não substitui a nota por uma pontuação inventada.

## Modo Cena · conversa por voz

Aba **▶ Cena** (aparece quando o Claude CLI está instalado). Design: [docs/designs/modo-cena.md](docs/designs/modo-cena.md).

1. **Aprenda.** O Claude CLI gera uma cena (café, aeroporto, hotel…) com falas, respostas esperadas, erros típicos já corrigidos e frases de ajuda. Uma chamada, de 30 s a 1 min. Você ouve, vê a tradução e repete.
2. **Viva a cena** em três passos: com texto, só com dicas e só com voz. No caminho previsto, o navegador compara sua fala com a cena e o professor responde na hora, sem chamar o Claude. Quando você sai do roteiro, um Claude aberto durante a cena responde em cerca de 2 a 4 s.

O professor corrige como um professor: repete sua frase do jeito certo e segue a cena. Ele explica em português quando o erro muda o sentido ou é o ponto treinado. Para pedir ajuda, fale no idioma ("Sorry, can you repeat?"). Espaço pausa, R repete, Esc sai. O resumo final mostra duração, falas, correções e o tempo de resposta do professor.

**Voz grátis (Piper).** Sem Piper a cena usa a voz do navegador e não é possível interromper o professor. Para instalar (testado com Python 3.12 e piper-tts 1.8.0 no Windows), numa pasta fora deste repositório:

```bash
python -m venv piper-venv
piper-venv/Scripts/python -m pip install "piper-tts[http]"      # Linux/macOS: piper-venv/bin/python
piper-venv/Scripts/python -m piper.download_voices --download-dir voices en_US-lessac-medium es_MX-claude-high pt_BR-faber-medium
piper-venv/Scripts/python -m piper.http_server --host 127.0.0.1 --port 5001 -m en_US-lessac-medium --data-dir voices
```

Um servidor atende as três vozes. Use sempre `--host 127.0.0.1`: o padrão do Piper aceita conexões de toda a rede. Depois defina `PIPER_URL=http://127.0.0.1:5001` no `.env` e reinicie o `npm start`. Se uma voz não estiver na pasta `voices`, o Piper fala com a voz padrão (em inglês) sem avisar, então baixe as três.

Medido num i7-1355U sem GPU: de 0,2 a 0,6 s por frase. O primeiro uso de cada voz leva de 6 a 8 s para carregar o modelo, e a fase de ensino já faz isso ao gerar o áudio da cena com antecedência. O Piper é GPL e roda como programa separado, fora deste repositório. O áudio do Piper não sai da máquina.

**Fone de ouvido.** Marque "Estou de fone" para poder interromper o professor falando por cima. Sem fone, cada um fala na sua vez: o microfone fecha enquanto o professor fala, para ele não ouvir a própria voz.

**Privacidade.** Durante a cena, a escuta contínua do Chrome/Edge envia seu áudio ao serviço de reconhecimento do navegador. O reconhecimento devolve só texto e tende a "consertar" o que você disse, por isso a cena não avalia pronúncia. Para isso, use a aba Pronúncia e fonética.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `src/main.jsx` | Shell React: configuração inicial e abas |
| `src/chat.jsx`, `src/voice.jsx`, `src/api.js` | Conversação, pronúncia/microfone e chamadas à API |
| `src/scene/` | Modo Cena: aba, máquina de estados (`engine.js`), comparação de fala, escuta contínua, interrupção, voz e armazenamento |
| `scene.js`, `live.js`, `tts.js`, `json.js` | Mapa da cena (Claude), Claude aberto por cena, voz Piper e leitura de JSON dos modelos |
| `src/audio.js` | Conversão e encoder WAV |
| `build.mjs` | Build React com esbuild, sem CDN em runtime |
| `public/` | HTML, CSS e bundle servido ao navegador |
| `server.js` | Arquivos estáticos, API local e validação de origem |
| `provider.js` | Adaptadores Codex e Claude, validação, subprocessos |
| `speech.js` | API acústica, validação WAV e orientação fonética pelo CLI |
| `test/` | Testes do servidor, voz, subprocessos e interface React |

## Desenvolvimento e testes

```bash
npm ci
npm run check
npm test
npm run dev
```

`npm run dev` compila o React e monitora o servidor. Para mudanças em `src/`, rode `npm run build` novamente e recarregue a página. O CI executa instalação, build e testes.

Os testes usam substitutos para CLI/Azure e não gastam cotas. Testes de interface usam DOM simulado, não um dispositivo físico. Para validação real: autentique cada CLI, teste uma conversa, permita microfone, teste uma frase em cada idioma/modo e confira falhas com chave inválida, microfone negado e áudio silencioso. Nenhuma credencial de serviço foi fornecida para validar chamadas reais neste ambiente.

## Operação local

O servidor escuta apenas em `127.0.0.1`, valida Host/Origin, não habilita CORS e aceita uma geração por vez. O prompt é enviado pelo stdin com `spawn` sem shell, em diretório temporário removido após o uso. Timeout de CLI: 120 segundos; áudio externo: 30 segundos. Conteúdo do modelo é renderizado como texto React.

- Codex: `codex exec --skip-git-repo-check --sandbox read-only --ephemeral -`.
- Claude: `claude -p --output-format text --tools '' --disallowedTools 'mcp__*' --no-session-persistence`.
- Modo Cena: o mapa usa o mesmo comando do Claude com `--model`. A conversa usa um processo por cena: `claude -p --input-format stream-json --output-format stream-json --verbose --tools '' --disallowedTools 'mcp__*' --no-session-persistence --model <CLAUDE_SCENE_MODEL>`. Ele é encerrado ao sair da cena, após 10 minutos sem uso ou ao fechar o servidor. O formato stream-json foi testado no Claude Code 2.1.316.

O Codex pode herdar configurações pessoais de ferramentas; para isolamento adicional, use um usuário do sistema dedicado. Limites, políticas de retenção e autenticação do CLI/provedor são independentes do histórico local. Para mudar a porta, defina `PORT=4000` em `.env`.

Esta versão funciona localmente. Hospedagem estática/Vercel serverless não executa os CLIs instalados no computador do visitante. Uma versão remota precisaria de backend persistente, autenticação e isolamento por conta.

## Referências oficiais

- https://react.dev/learn/build-a-react-app-from-scratch
- https://developers.openai.com/codex/cli/reference
- https://code.claude.com/docs/en/cli-reference
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short

Licença MIT. Projeto independente, sem afiliação com OpenAI, Anthropic ou Microsoft.
