# IndoorPlayer

Aplicativo Android/React Native para ativar um dispositivo, sincronizar a programação e reproduzir mídias locais de forma contínua.

## Configuração

1. Copie `.env.example` para `.env`.
2. Troque `192.168.137.234` pelo IP do computador que executa a API.
3. Confirme que a TV e o servidor estão na mesma rede e que as portas necessárias estão liberadas no firewall.

```env
API_BASE_URL=http://192.168.137.234:3000
```

O app usa `API_BASE_URL` para as requisições e deriva automaticamente os downloads de mídia em `API_BASE_URL/files/indoor-player-api`.

## Comandos

```sh
npm install
npm start
npm run android
npm run validate
npm run android:release
```

O APK release é gerado em `android/app/build/outputs/apk/release/app-release.apk`.

O Gradle carrega `.env` por meio do `react-native-config`; sempre gere um novo APK depois de trocar o IP. O build imprime `Reading env from: .env` quando a configuração foi incorporada.

O `postinstall` aplica o patch de `react-native-video` mantido em `patches/`. Esse patch faz o ExoPlayer usar uma `TextureView` real, necessária para girar vídeos de playlists verticais na TV Box. Não remova o `patch-package` sem substituir essa correção nativa.

## Estrutura

```text
src/
├── app/                         entrada e navegação do aplicativo
├── core/
│   ├── api/                     cliente HTTP e URLs
│   ├── events/                  eventos globais de sessão
│   └── storage/                 persistência do dispositivo
├── features/
│   ├── activation/              tela e regras de ativação
│   └── player/
│       ├── domain/              normalização e assinaturas
│       ├── engine/              ciclo de vida do player
│       ├── hooks/               integração React
│       ├── managers/            sincronização, cache e reprodução
│       ├── power/               controle de energia/CEC
│       ├── screens/             interface do player
│       ├── state/               estado em memória
│       └── types/               contratos do domínio
└── types/                       declarações externas
```
