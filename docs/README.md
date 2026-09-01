# Documentação técnica — Indoor Player

## Controle do documento

| Campo                | Valor                              |
| -------------------- | ---------------------------------- |
| Sistema              | Indoor Player                      |
| Estado               | Baseline técnico do ambiente atual |
| Última revisão       | 19/08/2026                         |
| Branch de referência | `develop`                          |
| Player Android       | `eba1d73`                          |
| API                  | `90dc237`                          |
| Painel Web           | `d880d1e`                          |

Esta documentação descreve o funcionamento técnico observado no código. Ela deve ser atualizada no mesmo pull request sempre que uma mudança alterar arquitetura, variáveis de ambiente, contrato HTTP, modelo de dados, processo de implantação ou comportamento operacional.

## Objetivo e escopo

O Indoor Player é uma solução de sinalização digital composta por um painel administrativo, uma API central e um aplicativo Android instalado em TV Boxes. O sistema permite cadastrar mídias, montar playlists, configurar barras fixas, criar agendamentos e acompanhar dispositivos e eventos de auditoria.

Estão cobertos:

- arquitetura e responsabilidades dos componentes;
- autenticação de usuários e dispositivos;
- cadastro, vínculo e estado dos players;
- biblioteca de imagens e vídeos;
- playlists, orientação, áudio e duração;
- barras fixas e conteúdo dinâmico;
- agendamentos e distribuição da programação;
- reprodução e cache offline no Android;
- logs, auditoria, monitoramento, backup e recuperação;
- instalação local, build e implantação em produção.

## Repositórios

| Componente     | Repositório                                                            | Tecnologia principal               |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Player Android | [IndoorPlayer-app](https://github.com/Matheus23dev/IndoorPlayer-app)   | React Native 0.85 / Android nativo |
| API            | [indoor-player-api](https://github.com/Matheus23dev/indoor-player-api) | NestJS 11 / Prisma / MySQL         |
| Painel Web     | [indoor-player-web](https://github.com/Matheus23dev/indoor-player-web) | React 19 / Vite / Tailwind CSS     |

## Mapa da documentação

1. [Arquitetura da solução](ARQUITETURA.md)
2. [Fluxos técnicos e regras de negócio](FLUXOS.md)
3. [Player Android](PLAYER_ANDROID.md)
4. [Controle de energia por HDMI-CEC](HDMI_CEC.md)
5. [Instalação e implantação](IMPLANTACAO.md)
6. [Operação, segurança e continuidade](OPERACAO_E_SEGURANCA.md)
7. [Referência HTTP da API](https://github.com/Matheus23dev/indoor-player-api/blob/develop/docs/REFERENCIA_API.md)
8. [Modelo de dados](https://github.com/Matheus23dev/indoor-player-api/blob/develop/docs/MODELO_DE_DADOS.md)
9. [Arquitetura do painel Web](https://github.com/Matheus23dev/indoor-player-web/blob/develop/docs/ARQUITETURA_FRONTEND.md)

## Responsabilidades por componente

| Responsabilidade                  |     Web      |             API              |                        Player                        |
| --------------------------------- | :----------: | :--------------------------: | :--------------------------------------------------: |
| Administração de conteúdo         |     Sim      |    Regras e persistência     |                         Não                          |
| Autenticação de usuários          |  Interface   |      JWT e autorização       |                         Não                          |
| Autenticação do dispositivo       |     Não      | Emissão e validação do token |             Armazenamento e uso do token             |
| Armazenamento principal de mídias |     Não      |             Sim              |                     Cache local                      |
| Cálculo da programação            | Visualização |             Sim              |            Seleção da ocorrência recebida            |
| Reprodução                        |    Prévia    |     Estado e telemetria      |                         Sim                          |
| Atualização em tempo real         | Cliente HTTP |          Socket.IO           |                  Cliente Socket.IO                   |
| Auditoria                         |   Consulta   |  Persistência e isolamento   | Eventos locais; telemetria não persistida atualmente |

## Glossário

| Termo       | Definição                                                                         |
| ----------- | --------------------------------------------------------------------------------- |
| Player      | Dispositivo/TV Box vinculado a uma empresa.                                       |
| Mídia       | Imagem ou vídeo armazenado pela API.                                              |
| Playlist    | Sequência ordenada de mídias, com orientação e barras associadas.                 |
| Barra fixa  | Elemento reutilizável sobre ou ao redor do conteúdo da playlist.                  |
| Agendamento | Regra que associa player, playlist, intervalo de datas, horário e dias da semana. |
| Ocorrência  | Janela concreta de execução calculada a partir de um agendamento.                 |
| Heartbeat   | Atualização periódica enviada pelo Player com presença e estado de reprodução.    |
| Programação | Conjunto versionado de ocorrências, playlists, mídias e barras enviado ao Player. |
