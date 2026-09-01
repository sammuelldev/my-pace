# Arquitetura do MyPace 2.0

## Princípios

- Aplicação estática em HTML, CSS e JavaScript modular, compatível com GitHub Pages.
- Firebase Authentication identifica a pessoa; Firestore isola dados por `uid`.
- Estado persistente, estado efêmero da interface e métricas derivadas ficam separados.
- Recomendações são determinísticas, explicáveis e conservadoras quando há poucos dados.
- Conteúdo de treinos, alimentação e regras fica em bibliotecas versionadas, fora da renderização.

## Módulos

```text
js/
  app.js                     # orquestração durante a migração
  core/
    schema.js                # schema v4, normalização e migrações
    storage.js               # localStorage, backup legado e merge
  domains/                   # modelos e regras de negócio
  data/                      # bibliotecas estáticas compartilhadas
  cloud.js                   # autenticação e persistência Firebase
```

O `app.js` será reduzido progressivamente. Não existe dependência de framework ou etapa de compilação para executar o site.

## Estado v4

O estado persistente contém perfil, objetivos, perfil declarado de treino, perfil nutricional, progresso do onboarding e coleções privadas. Métricas observadas, plano recomendado, score e tendências são calculados em tempo de execução.

## Firestore

```text
users/{uid}
users/{uid}/workouts/{id}
users/{uid}/races/{id}
users/{uid}/bodyMetrics/{id}
users/{uid}/readiness/{yyyy-mm-dd}
users/{uid}/equipment/{id}
users/{uid}/nutritionHistory/{id}
users/{uid}/recommendationFeedback/{id}
users/{uid}/achievements/{id}
users/{uid}/journal/{id}
```

O documento raiz guarda apenas perfil, preferências, onboarding e metadados. Bibliotecas compartilhadas permanecem no código para funcionar offline, evitar leituras repetidas e permitir revisão por Git.

## Migração

Estados anteriores são normalizados de forma idempotente para a versão 4. Antes da primeira conversão, o navegador cria `mypace-legacy-v3-backup`. O documento legado `users/{uid}/pace/dashboard` continua disponível como fonte somente durante a migração; ele não é apagado automaticamente.
