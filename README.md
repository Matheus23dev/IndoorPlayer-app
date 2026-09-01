# IndoorPlayer

Aplicativo Android/React Native do Indoor Player. É instalado em TV Boxes para ativação segura, sincronização da programação, cache local e reprodução contínua de imagens e vídeos.

## Tecnologias e alvo

- Node.js 22.13+
- React Native 0.85 / React 19
- Android API mínima 24; target 36
- TypeScript
- Socket.IO, Axios, AsyncStorage e React Native FS
- React Native Video com patch nativo para rotação
- Módulos Android para orientação e HDMI-CEC

O projeto contém a estrutura iOS criada pelo React Native, mas o produto e os recursos nativos atuais são voltados ao Android/TV Box.

## Configuração

```powershell
Copy-Item .env.example .env
npm ci
```

Defina uma API alcançável pelo dispositivo:

```env
API_BASE_URL=http://192.168.1.10:3000
```

No emulador Android, o fallback é `http://10.0.2.2:3000`. Em uma TV física, use IP ou domínio acessível na rede. A URL é incorporada ao APK; gere uma nova versão quando ela mudar.

## Execução e qualidade

```powershell
npm start               # Metro
npm run android         # instala build de desenvolvimento
npm run validate                   # formato, tipos, lint e testes
npm run android:release            # gera APK local (aceita chave de debug)
npm run android:release:production # exige a assinatura oficial
```

Artefato:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Funcionamento resumido

1. O Player registra o dispositivo e exibe um código.
2. Um usuário vincula esse código no painel Web.
3. O Player obtém um token próprio e abre uma sessão autenticada.
4. A programação é sincronizada por REST e atualizada por Socket.IO.
5. Imagens, vídeos e imagens de barras são baixados para cache local.
6. A ocorrência ativa é reproduzida e o estado é enviado por heartbeat.
7. Em perda de rede ou reinício, a programação e o cache válidos são restaurados.

## Estrutura

```text
src/
├── app/                         entrada e navegação
├── core/
│   ├── api/                     cliente HTTP e URLs
│   ├── events/                  eventos globais de sessão
│   ├── native/                  integração de orientação
│   └── storage/                 credenciais locais do dispositivo
└── features/
    ├── activation/              registro e vínculo
    └── player/
        ├── components/          barras e conteúdo visual
        ├── domain/              normalização e layout
        ├── engine/              ciclo de vida do Player
        ├── hooks/               integração React
        ├── logging/             eventos operacionais locais
        ├── managers/            sync, cache, playlist e reprodução
        ├── power/               HDMI-CEC e watchdog
        ├── screens/             tela de reprodução
        ├── state/               persistência da programação
        └── types/               contratos do domínio
```

## Patch obrigatório de vídeo

O `postinstall` aplica `patches/react-native-video+6.19.2.patch`. Ele faz o ExoPlayer usar uma `TextureView`, necessária para girar vídeos de playlists verticais na TV. Não remova `patch-package` nem atualize `react-native-video` sem revisar, reaplicar e testar esse comportamento em uma TV real.

## Documentação técnica

- [Índice geral](docs/README.md)
- [Arquitetura da solução](docs/ARQUITETURA.md)
- [Fluxos técnicos](docs/FLUXOS.md)
- [Detalhes do Player Android](docs/PLAYER_ANDROID.md)
- [Controle de energia por HDMI-CEC](docs/HDMI_CEC.md)
- [Instalação e implantação](docs/IMPLANTACAO.md)
- [Operação e segurança](docs/OPERACAO_E_SEGURANCA.md)

## Assinatura de produção

Copie `android/keystore.properties.example` para `android/keystore.properties`, informe o keystore oficial e mantenha ambos os segredos fora do Git. O comando `android:release:production` falha deliberadamente quando a assinatura oficial não está configurada; assim, um APK assinado com a chave de debug não é distribuído por engano.
