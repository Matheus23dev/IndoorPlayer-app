# Controle de energia por HDMI-CEC

## Objetivo

O Indoor Player liga e coloca somente a TV em standby conforme a programação. O TV Box permanece acordado, com o processo do Player e a rede ativos, para continuar recebendo atualizações da API.

O comando de standby é direcionado ao endereço lógico da TV. Ele não usa `PowerManager.goToSleep`, não simula o botão de energia do Android e não deve suspender o TV Box.

## Requisitos

- TV Box com hardware e serviço Android `hdmi_control` funcionais;
- HDMI-CEC ativado no TV Box e na TV;
- opção que desliga o TV Box junto com a TV desativada;
- APK provisionado como aplicativo privilegiado;
- permissão protegida `android.permission.HDMI_CEC` na allowlist do firmware;
- assinatura estável para todas as atualizações do APK.

Uma instalação comum por `adb install` continua reproduzindo conteúdo, mas o módulo informa `UNAVAILABLE` e não controla a energia da TV. O Android não permite conceder `HDMI_CEC` como permissão de runtime.

## Fluxo no aplicativo

1. O `PlayerEngine` identifica se existe uma ocorrência ativa.
2. Ao iniciar conteúdo, o `TvPowerManager` envia One Touch Play para ligar a TV e selecionar a entrada do Player.
3. Sem ocorrência ativa, o watchdog consulta o estado real da TV.
4. Se a TV estiver ligada, o Player envia standby apenas para o endereço lógico da TV.
5. O processo Android, o Wi-Fi/Ethernet, o Socket.IO e os heartbeats permanecem ativos no TV Box.
6. Todos os comandos e falhas são registrados em `cec-power-events.log` e nos logs operacionais do Player.

## Provisionamento do TV Box

Gere primeiro um APK com assinatura oficial:

```powershell
npm run validate
npm run android:release:production
```

Com o TV Box conectado e autorizado no ADB:

```powershell
.\android\provisioning\provision-hdmi-cec.ps1 `
  -Serial PRO26JAN024301 `
  -ApkPath .\android\app\build\outputs\apk\release\app-release.apk
```

O script valida o dispositivo, confirma o serviço CEC, salva os arquivos anteriores, instala o APK em `/system/priv-app`, adiciona a allowlist, preserva permissões de arquivo, reinicia o equipamento e confirma que `HDMI_CEC` foi concedida.

Esse procedimento exige ADB root fornecido pelo fabricante. Em uma frota de produção, a opção recomendada é incluir o APK e a allowlist diretamente na imagem OEM, evitando modificações manuais por unidade.

## Rollback

```powershell
.\android\provisioning\rollback-hdmi-cec.ps1 `
  -Serial PRO26JAN024301 `
  -ReplacementApkPath .\android\app\build\outputs\apk\release\app-release.apk
```

O rollback remove somente os dois caminhos criados pelo provisionamento, reinicia o equipamento e, opcionalmente, reinstala o APK como aplicativo comum.

Quando o provisionamento exigir a substituição de um aplicativo de fábrica por falta de
espaço em `/system`, informe também o diretório do backup validado. No SmartPro
homologado, o Globoplay pode ser restaurado junto com a remoção do Indoor Player:

```powershell
.\android\provisioning\rollback-hdmi-cec.ps1 `
  -Serial PRO26JAN024301 `
  -GloboplayBackupPath .\android\provisioning\backups\PRO26JAN024301-globoplay-20260901-090000\Globoplay `
  -ReplacementApkPath .\android\app\build\outputs\apk\release\app-release.apk
```

O script valida os quatro APKs do backup antes de alterar o dispositivo, restaura
proprietário e permissões originais e confirma o estado após a reinicialização.

## Validação

1. confirme `android.permission.HDMI_CEC: granted=true` no pacote;
2. deixe o Player sem programação ativa e confirme que somente a TV entra em standby;
3. confirme no Android que o estado permanece `Awake`;
4. confirme que o processo `com.indoorplayer` permanece ativo e a rede continua validada;
5. ative uma programação e confirme que a TV liga e seleciona a entrada HDMI;
6. valide heartbeats, atualização por Socket.IO e reprodução após o ciclo completo;
7. verifique se não existem falhas recorrentes no arquivo `cec-power-events.log`.

## Limitações

O HDMI-CEC depende do firmware do TV Box e da implementação da TV. A presença física da porta HDMI não garante compatibilidade. Modelos novos devem passar pelo diagnóstico e pelo ciclo completo de liga/standby antes de entrar na frota.
