# MyPace

Aplicação web multiusuário para corrida, construída em HTML, CSS e JavaScript modular. O MyPace combina o perfil declarado no onboarding com dados observados nos treinos para produzir recomendações determinísticas, conservadoras e explicáveis.

## O que existe

- cadastro por e-mail/senha, login Google e recuperação de senha;
- painel privado, isolado por usuário no Firebase;
- onboarding progressivo com histórico, disponibilidade, objetivos, prova, segurança e alimentação;
- calendário adaptativo, check-in de prontidão, RPE, treinos perdidos e substituições;
- biblioteca com mais de 200 refeições, slots por horário de treino, filtros de segurança, anti-repetição e feedback contextual;
- revisão semanal, recordes, conquistas, estimativa conservadora, linha do tempo e diário;
- preparação, semana da prova, resultado e leitura pós-prova;
- backup JSON, exclusão de conta, temas, PWA leve e funcionamento local durante falhas de rede.

## Executar localmente

Não há compilação. Sirva a pasta por HTTP para que módulos ES e o service worker funcionem:

```powershell
python -m http.server 4173
```

Abra `http://localhost:4173`. Para executar os testes:

```powershell
npm test
```

Abrir `index.html` diretamente pode limitar módulos, autenticação e PWA. Live Server do VS Code também funciona.

## Arquitetura

```text
index.html
css/styles.css
js/
  app.js                       # shell e orquestração da interface
  cloud.js                     # Auth e Firestore
  core/
    schema.js                  # schema v4 e normalização
    storage.js                 # cache por uid, backup e merge
  data/                        # conteúdo compartilhado versionado
  domains/                     # motores puros e testáveis
firebase/firestore.rules
manifest.webmanifest
service-worker.js
tests/
```

Detalhes e decisões estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estado e Firestore

O schema atual é `4`. Perfil, preferências e onboarding ficam em `users/{uid}`. Dados de maior crescimento usam subcoleções:

```text
users/{uid}/workouts/{id}
users/{uid}/races/{id}
users/{uid}/bodyMetrics/{id}
users/{uid}/readiness/{date}
users/{uid}/equipment/{id}
users/{uid}/nutritionHistory/{id}
users/{uid}/recommendationFeedback/{id}
users/{uid}/achievements/{id}
users/{uid}/journal/{id}
```

Gravações são comparadas com o último snapshot e apenas documentos alterados são enviados. As regras Firestore limitam cada pessoa ao próprio `uid`; bibliotecas compartilhadas são somente leitura.

## Migração e segurança dos dados

- O payload antigo continua sendo lido pela chave `pace-dashboard-portable-v1`.
- Antes da conversão, é criado o backup `mypace-legacy-v3-backup`.
- O primeiro usuário que reivindica dados locais recebe um cache separado por `uid`.
- O documento legado `users/{uid}/pace/dashboard` é lido como fallback e não é apagado automaticamente.
- Merge local/nuvem combina coleções por ID e data de atualização; nuvem mais nova não é substituída cegamente.
- Exportação e importação continuam compatíveis com o estado completo.

## Pace Engine

Os motores não usam IA generativa nem respostas aleatórias. Eles recebem estado normalizado e retornam resultados reproduzíveis com:

- `reasonCodes`;
- `sourceRuleIds`;
- versão do motor;
- nível e motivos de confiança;
- explicações em português.

O perfil declarado orienta o começo. Depois de uma amostra mínima, o perfil observado passa a ter mais peso. Estimativas só aparecem com dados suficientes e sempre como faixa. Fontes revisadas ficam em `js/data/research-sources.js`; políticas conservadoras internas são identificadas como tais.

## Alimentação adaptativa

O motor nutricional classifica a demanda do dia por tipo de sessão, duração, RPE, experiência e carga recente. A partir disso, monta refeições específicas para manhã, tarde, noite, descanso ou força. IDs não se repetem no mesmo dia; seleções recentes perdem prioridade; alergias, restrições e rejeições por segurança são exclusões absolutas.

O plano diário é determinístico e suas escolhas ficam em `nutritionHistory`, o que mantém a mesma composição após atualizar a página. `Gostei`, `Trocar` e `Não serve` alteram recomendações futuras sem substituir o restante do dia. Os 14 IDs da biblioteca anterior continuam válidos para preservar feedback já sincronizado.

## Firebase

Siga [`CONFIGURAR-FIREBASE.md`](CONFIGURAR-FIREBASE.md). O arquivo `js/firebase-config.js` contém apenas a configuração pública do aplicativo Web. Nunca adicione conta de serviço, chave privada ou segredo administrativo ao repositório.

## Publicação oficial no GitHub

O GitHub é a fonte oficial. O workflow `.github/workflows/pages.yml` testa e publica a raiz estática a cada push na branch `main`.

No repositório, abra **Settings → Pages → Source** e selecione **GitHub Actions** uma única vez. Depois disso, commits enviados para `main` atualizam o site automaticamente.

## Limites do produto

O MyPace organiza informações gerais de treino e alimentação; não diagnostica, prescreve tratamento nem substitui médico, fisioterapeuta ou nutricionista. Sinais de alerta e dor forte ou crescente prevalecem sobre qualquer recomendação do aplicativo.
