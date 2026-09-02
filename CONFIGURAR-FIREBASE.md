# Configurar Firebase no MyPace

Este guia separa o que já está implementado no repositório do que precisa ser habilitado uma única vez no Firebase Console.

## CODE CHANGE — já implementado

- cadastro e login com e-mail/senha;
- login Google;
- recuperação de senha;
- sessão persistente;
- dados separados por `uid` e subcoleções;
- migração do documento antigo e do `localStorage`;
- regras privadas em `firebase/firestore.rules`;
- exclusão de conta com reautenticação;
- publicação estática pelo GitHub Pages.

## MANUAL FIREBASE CONSOLE STEP 1 — aplicativo Web

1. Abra [Firebase Console](https://console.firebase.google.com/) e selecione ou crie o projeto.
2. Em **Visão geral do projeto**, adicione um aplicativo **Web** (`</>`).
3. Copie somente o objeto público `firebaseConfig`.
4. Atualize `js/firebase-config.js` com esses valores.

O `firebaseConfig` público pode ser versionado. Não use credenciais de conta de serviço, arquivos JSON administrativos ou chaves privadas no navegador.

## MANUAL FIREBASE CONSOLE STEP 2 — Authentication

1. Abra **Authentication → Sign-in method**.
2. Habilite **E-mail/senha**.
3. Habilite **Google**, escolha o e-mail de suporte e salve.

Não crie usuários manualmente: a tela **Criar conta** do MyPace faz isso com segurança.

## MANUAL FIREBASE CONSOLE STEP 3 — domínios autorizados

Em **Authentication → Settings → Authorized domains**, adicione:

- `localhost` para desenvolvimento local;
- `SEU-USUARIO.github.io` para GitHub Pages.

Informe apenas o domínio, sem `https://` e sem `/nome-do-repositorio`.

## MANUAL FIREBASE CONSOLE STEP 4 — Firestore

1. Abra **Firestore Database → Create database**.
2. Escolha uma região adequada ao público do projeto.
3. Não mantenha regras de teste abertas.

Para publicar as regras pelo Console:

1. abra **Firestore Database → Rules**;
2. copie todo o conteúdo de `firebase/firestore.rules`;
3. clique em **Publish**.

Opcionalmente, com Firebase CLI autenticado:

```powershell
firebase deploy --only firestore:rules --config firebase/firebase.json
```

As regras permitem que `users/{uid}` seja acessado apenas pelo mesmo `uid`. Bibliotecas compartilhadas, se futuramente movidas ao Firestore, são somente leitura para usuários autenticados.

## MANUAL GITHUB STEP — GitHub Pages

1. Envie o projeto para o GitHub na branch `main`.
2. No repositório, abra **Settings → Pages**.
3. Em **Source**, selecione **GitHub Actions**.
4. Aguarde o workflow **Test and deploy GitHub Pages** concluir.

O `index.html` fica na raiz. Não é necessário copiar arquivos para `dist` nem usar outra hospedagem.

## Primeiro acesso e migração

Ao entrar pela primeira vez:

- se a conta já tiver dados granulares, eles são carregados;
- se existir apenas `users/{uid}/pace/dashboard`, ele é migrado;
- se houver dados locais antigos e a nuvem estiver vazia, eles são associados à primeira conta que os reivindicar;
- o payload antigo recebe backup antes da conversão.

Nenhum documento legado é apagado automaticamente durante a migração.

## Fotos e limites

A foto é cortada para 420 × 420, comprimida e salva como Data URL no documento privado do perfil. Isso evita Cloud Storage nesta versão. O Firestore limita documentos a aproximadamente 1 MiB, por isso imagens grandes são rejeitadas e comprimidas no navegador.

## Checklist de validação

1. criar uma conta por e-mail;
2. sair e entrar novamente;
3. solicitar recuperação de senha;
4. entrar com Google;
5. completar onboarding;
6. registrar um treino e confirmar o documento em `users/{uid}/workouts`;
7. testar em janela anônima com uma segunda conta e confirmar o isolamento;
8. conferir o domínio GitHub em **Authorized domains**;
9. publicar as regras antes de divulgar o site.

Se aparecer `permission-denied`, revise se o usuário está autenticado, se as regras foram publicadas e se os documentos estão dentro de `users/{uid}` correto.
