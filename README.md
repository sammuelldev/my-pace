# Pace — experiência adaptativa em HTML, CSS e JavaScript

Esta pasta contém uma versão portátil do painel Pace, sem framework, servidor ou etapa de compilação.

## Arquivos

- `index.html`: estrutura e conteúdo do site.
- `css/styles.css`: visual premium azul, responsividade e animações.
- `js/app.js`: registros, plano adaptativo, alimentação dinâmica, provas, métricas, gráficos, perfil, foto e backup.
- `js/cloud.js`: login e sincronização com o Firestore.
- `js/firebase-config.js`: conexão com o seu projeto Firebase.
- `firebase/firestore.rules`: regras privadas do banco.
- `CONFIGURAR-FIREBASE.md`: guia completo de ativação.
- `assets/favicon.svg`: ícone da aba do navegador.

## Como abrir

Para testar no computador, use a extensão **Live Server** do VS Code. Para publicar, envie o conteúdo desta pasta para a raiz de uma hospedagem estática, como GitHub Pages, Netlify ou Cloudflare Pages. O arquivo inicial deve continuar se chamando `index.html`.

## Dados e foto de perfil

Antes de configurar o Firebase, os treinos, pesos, equipamentos, nome e foto ficam no `localStorage` do navegador. A foto é recortada, reduzida para 480 × 480 px e comprimida antes de ser salva.

Depois de configurar o Firebase e entrar na conta, os dados locais são migrados no primeiro acesso e passam a ser sincronizados pelo Firestore. O backup manual continua disponível.

## Experiência adaptativa

- O ciclo de competição só aparece quando existe uma prova agendada.
- Nome, data, distância, local e meta de tempo da próxima prova podem ser alterados.
- Os próximos treinos são recalculados usando distância e pace dos registros recentes.
- O foco alimentar de cada dia acompanha o tipo de treino previsto.
- No dia da prova — ou depois, enquanto o resultado estiver pendente — aparece o formulário de resultado oficial.
- Provas concluídas ficam separadas em vermelho, com análise de pace, evolução entre competições e gráfico de parciais.

## Firebase

Siga `CONFIGURAR-FIREBASE.md`. A integração usa Authentication por e-mail/senha e Firestore. A foto comprimida também fica no documento privado do Firestore, evitando a exigência atual de plano pago do Cloud Storage.
