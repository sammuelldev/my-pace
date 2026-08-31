# Configurar Firebase no Pace

O site funciona normalmente no modo local antes desta configuração. Depois de conectado, ele sincroniza dados e foto entre aparelhos usando uma conta privada.

## 1. Criar o projeto e o aplicativo Web

1. Acesse `https://console.firebase.google.com/` e crie um projeto.
2. Na página inicial do projeto, clique no ícone **Web** (`</>`).
3. Dê o nome `Pace` ao aplicativo e conclua o cadastro.
4. O Firebase mostrará um objeto chamado `firebaseConfig`.
5. Abra `js/firebase-config.js` e substitua os valores de exemplo pelos valores exibidos no console.

## 2. Criar seu login privado

1. No menu do Firebase, abra **Authentication**.
2. Clique em **Começar**.
3. Em **Método de login**, habilite **E-mail/senha**.
4. Abra a aba **Usuários** e clique em **Adicionar usuário**.
5. Cadastre seu e-mail e uma senha forte. Não é necessário criar cadastro público no site.

## 3. Criar o Firestore

1. Abra **Firestore Database** e clique em **Criar banco de dados**.
2. Escolha uma região próxima dos seus usuários.
3. Depois da criação, abra a aba **Regras**.
4. Copie todo o conteúdo de `firebase/firestore.rules`, cole no editor e clique em **Publicar**.

## 4. Foto de perfil sem plano pago

A foto é recortada para 420 × 420 px, comprimida e salva dentro do documento privado do Firestore. Isso evita depender do Cloud Storage, que atualmente exige o plano Blaze com faturamento ativado. Para este painel pessoal, o tamanho da imagem permanece dentro do limite do documento.

## 5. Autorizar o endereço do GitHub Pages

1. Em **Authentication → Configurações → Domínios autorizados**, adicione o domínio usado no GitHub Pages, normalmente `seuusuario.github.io`.
2. Não inclua `https://`, barras ou o caminho do repositório.

## 6. Publicar no GitHub Pages

Envie o conteúdo da pasta `Pace-HTML-CSS-JS` para o repositório. Em **Settings → Pages**, publique a branch principal e mantenha `index.html` na raiz publicada.

Ao abrir o painel, vá em **Configurações → Entrar na nuvem**. No primeiro login, se ainda não existir informação na nuvem, os dados que estavam salvos no navegador serão enviados automaticamente. Depois disso, alterações em treinos, peso, equipamentos, perfil e foto serão sincronizadas.

## Segurança

O objeto `firebaseConfig` pode aparecer no JavaScript público; ele identifica o projeto, mas não substitui autenticação. A proteção depende das regras do Firestore. Não publique o site com regras abertas como `allow read, write: if true`.
