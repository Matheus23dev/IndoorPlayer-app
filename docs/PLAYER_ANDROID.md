# Player Android

## Objetivo

O Player é o software instalado na TV Box. Sua responsabilidade é manter uma sessão segura com a API, preparar conteúdo localmente e reproduzir a ocorrência ativa com o mínimo de dependência da rede durante a exibição.

## Requisitos técnicos

- Node.js 22.13 ou superior;
- JDK e Android SDK compatíveis com React Native 0.85;
- Android API mínima 24;
- `compileSdk` e `targetSdk` 36;
- TV Box ou emulador com acesso à API;
- ADB para instalação e diagnóstico em dispositivo físico.

Arquiteturas geradas: `armeabi-v7a`, `arm64-v8a`, `x86` e `x86_64`. Hermes e a nova arquitetura do React Native estão habilitados.

## Módulos internos

| Área                  | Responsabilidade                                      |
| --------------------- | ----------------------------------------------------- |
| `activation`          | Registro, polling de vínculo e obtenção do token      |
| `PlayerEngine`        | Orquestra ciclo de vida, programação e reprodução     |
| `SyncManager`         | Consulta programação e prepara cache                  |
| `ProgrammingManager`  | Persiste, normaliza e seleciona ocorrências           |
| `DownloadManager`     | Baixa e versiona arquivos locais                      |
| `CacheManager`        | Valida e remove arquivos sem uso                      |
| `PlaylistManager`     | Mantém playlist, orientação e barras ativas           |
| `PlaybackManager`     | Alterna itens, controla timers e estado de reprodução |
| `HeartbeatManager`    | Publica presença e reprodução a cada 10 segundos      |
| `DeviceSocketManager` | Mantém canal em tempo real e sessão do dispositivo    |
| `TvPowerManager`      | Executa comandos HDMI-CEC                             |
| `TvPowerWatchdog`     | Coloca a TV em standby quando não há conteúdo         |
| `PlayerEventLogger`   | Mantém eventos locais pendentes e deduplicados        |

## Inicialização

1. A aplicação lê código, segredo e token do `AsyncStorage`.
2. Sem cadastro válido, registra um novo dispositivo.
3. Com código ainda não vinculado, consulta ativação a cada três segundos.
4. Com token, abre o Player e inicia a engine.
5. A engine restaura programação ou playlist persistida antes da primeira sincronização.
6. Socket.IO, sincronização periódica, heartbeat e watchdog são iniciados.
7. A ocorrência atual é selecionada usando o relógio corrigido pelo horário da API.

## Intervalos e limites

| Parâmetro                          | Valor atual               |
| ---------------------------------- | ------------------------- |
| Verificação de ativação            | 3 s                       |
| Nova tentativa de inicialização    | 5 s                       |
| Heartbeat                          | 10 s                      |
| Sincronização periódica            | 15 s                      |
| Janela solicitada                  | 24 h                      |
| Máximo de ocorrências solicitadas  | 20                        |
| Verificação de segurança da engine | 5 s                       |
| Downloads simultâneos              | 3                         |
| Tolerância para cache vazio        | 5 min                     |
| Atualização do clima               | 15 min                    |
| Fila máxima de eventos locais      | 250                       |
| Status online calculado pela API   | heartbeat inferior a 60 s |

## Cache e retomada

As mídias ficam em `${DocumentDirectoryPath}/player-media`. O nome inclui identificador e versão derivada de data de atualização, URL e tamanho. Downloads usam arquivo temporário `.tmp` e só substituem o arquivo final após retorno HTTP bem-sucedido e validação de tamanho.

A programação fica na chave `@indoor-player/programming-state-v1`; a reprodução, em `@indoor-player/player-state-v2`. No reinício, a engine restaura a ocorrência ainda válida e reinicia o conteúdo. O cache é limpo preservando as mídias exigidas pela programação ou pela playlist em execução.

## Orientação e renderização

A atividade Android permanece fisicamente em landscape. Uma playlist vertical troca as dimensões do canvas e o rotaciona 90 graus. Isso permite instalar a TV em pé sem depender de uma rotação global instável do firmware.

Imagens e vídeos usam `contain`. O projeto mantém um patch em `patches/react-native-video+6.19.2.patch` para forçar uma `TextureView`, necessária para a rotação de vídeo. O `postinstall` reaplica o patch; uma instalação sem ele pode exibir vídeos sem rotação correta.

Barras são renderizadas em uma camada sobre o canvas. O cálculo reserva espaço quando a combinação de barras permite enquadrar o conteúdo e usa sobreposição nos demais casos, conforme a regra de layout implementada.

## Energia e modo kiosk

- A tela permanece ligada enquanto o aplicativo está ativo.
- Barras do sistema são ocultadas em modo imersivo.
- O aplicativo se declara launcher de TV e opção de tela inicial.
- `BootReceiver` tenta iniciar o aplicativo após boot e quick boot.
- O controle HDMI-CEC é específico do hardware/firmware e executa comandos nativos.
- Sem conteúdo ativo, o watchdog verifica a TV a cada 30 segundos, confirma após 10 segundos e aplica cooldown de 60 segundos entre standbys.

## Build

```powershell
npm ci
npm run validate
npm run android:release:production
```

Artefato:

```text
android/app/build/outputs/apk/release/app-release.apk
```

`API_BASE_URL` é incorporada no APK pelo `react-native-config`. Qualquer mudança nessa URL exige novo build e reinstalação.

## Instalação e diagnóstico por ADB

```powershell
adb connect <IP_DA_TV>:5555
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am force-stop com.indoorplayer
adb shell monkey -p com.indoorplayer 1
adb logcat | Select-String "INDOOR|SYNC|HEARTBEAT|SOCKET|PLAYBACK|TV POWER"
```

Confirme sempre o endereço do dispositivo antes de instalar. Não execute comandos de limpeza de dados sem autorização, pois isso remove código, token, programação e cache locais.

## Observação de produção

O build local `android:release` pode usar `android/app/debug.keystore` para homologação. Para distribuição oficial, copie `android/keystore.properties.example`, configure um keystore protegido fora do Git e use `npm run android:release:production`. Esse comando recusa a geração quando a assinatura oficial está ausente. Preserve o keystore em backup seguro: perder essa chave impede atualizar instalações existentes com o mesmo `applicationId`.
