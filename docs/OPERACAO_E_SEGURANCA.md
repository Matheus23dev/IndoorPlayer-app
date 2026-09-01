# Operação, segurança e continuidade

## Monitoramento mínimo

| Item                   | Verificação             | Alerta recomendado                            |
| ---------------------- | ----------------------- | --------------------------------------------- |
| API                    | `GET /health/ready`     | indisponível por 2 verificações consecutivas  |
| Processo Node          | estado e reinícios      | processo parado ou reinícios repetidos        |
| MySQL                  | conexão, espaço e locks | indisponibilidade ou disco acima de 80%       |
| Armazenamento de mídia | espaço e permissões     | disco acima de 80% ou erro de escrita         |
| Players                | último heartbeat        | sem heartbeat por 1 minuto                    |
| WebSocket              | conexões e erros        | crescimento de falhas de autenticação/conexão |
| Backup                 | conclusão e tamanho     | falha, ausência ou variação anormal           |
| Certificado TLS        | validade                | menos de 30 dias para expirar                 |

O endpoint `/health` confirma que o processo está executando. `/health/ready` também testa a conexão com o MySQL e deve ser usado para prontidão. Sistema de arquivos e provedor de clima ainda exigem monitoramento complementar.

## Logs

Manter separados:

- saída padrão e erros da API;
- access/error log do proxy Web;
- logs do MySQL;
- auditoria funcional em `DeviceLog`;
- `adb logcat` somente durante diagnóstico do Player.

Defina retenção, rotação e acesso conforme a política da empresa. Dados como JWT, segredo de ativação, token do dispositivo, senha, string de conexão e conteúdo de cookies nunca devem aparecer em logs.

## Backup

O backup completo exige duas fontes consistentes:

1. dump do banco MySQL;
2. cópia do diretório configurado em `MEDIA_STORAGE_PATH`.

Também devem ser preservados fora do servidor:

- arquivos `.env` de produção em cofre de segredos;
- keystore Android de produção e suas credenciais;
- configuração do proxy e do gerenciador de processos;
- inventário de versões publicadas e checksums dos APKs.

Política mínima sugerida para MVP:

- backup diário do banco e das mídias;
- retenção diária de 7 dias, semanal de 4 semanas e mensal conforme exigência da empresa;
- cópia em região, conta ou provedor diferente da VPS;
- criptografia em trânsito e em repouso;
- teste de restauração mensal.

RPO e RTO oficiais devem ser definidos pelo responsável de negócio; não existem valores formalizados no código.

## Restauração

1. interromper gravações administrativas e uploads;
2. provisionar MySQL compatível;
3. restaurar o dump;
4. restaurar as mídias no mesmo caminho configurado;
5. publicar a versão da API compatível com o schema restaurado;
6. executar apenas migrations posteriores previamente testadas;
7. validar contagem de registros e presença física de arquivos;
8. iniciar API e Web;
9. validar login, download e programação de um Player piloto;
10. liberar os demais dispositivos.

## Rollback

### Web

Reaponte o servidor estático para o diretório `dist` da versão anterior. Como não há persistência no frontend, o rollback é direto quando o contrato da API continua compatível.

### API

Republique o artefato anterior somente se ele for compatível com o schema atual. Migrations Prisma não são revertidas automaticamente. Mudanças destrutivas exigem script de rollback testado ou restauração de backup.

### Player

Instale o APK anterior assinado pela mesma chave. Se houve mudança incompatível no armazenamento local ou no contrato da programação, valide o downgrade em um Player piloto antes de distribuir.

## Matriz de acesso atual

| Recurso                                  | OWNER | ADMIN | OPERATOR |
| ---------------------------------------- | :---: | :---: | :------: |
| Dashboard                                |  Sim  |  Sim  |   Sim    |
| Dispositivos e prévia                    |  Sim  |  Sim  |   Sim    |
| Mídias, playlists, barras e agendamentos |  Sim  |  Sim  |   Sim    |
| Usuários                                 |  Sim  |  Sim  |   Não    |
| Logs individuais do Player               |  Sim  |  Sim  |   Não    |
| Auditoria geral                          |  Sim  |  Sim  |   Não    |

A autorização deve sempre existir na API; ocultar um menu no Web não é controle de segurança suficiente.

## Controles já implementados

- senhas armazenadas com bcrypt;
- JWT assinado e validado com expiração;
- hash de segredo de ativação e token do dispositivo;
- comparação segura do segredo;
- revogação do token em desvínculo/exclusão;
- DTOs com whitelist e rejeição de campos desconhecidos;
- consultas administrativas filtradas por empresa;
- nome de upload sanitizado e arquivo limitado a 500 MB;
- cabeçalho `x-powered-by` desabilitado;
- auditoria restrita a `OWNER` e `ADMIN`;
- CORS HTTP e Socket.IO restrito pela mesma lista de `CORS_ORIGINS` quando configurada;
- endpoints separados de vida (`/health`) e prontidão com banco (`/health/ready`);
- validação automática de formato, tipos, lint e testes no CI.

## Pendências antes da produção

As seguintes medidas são obrigatórias ou fortemente recomendadas:

1. configurar, proteger e testar o keystore de produção antes da distribuição do APK;
2. usar HTTPS/WSS e remover a dependência de tráfego HTTP liberado no Android;
3. definir `CORS_ORIGINS` em produção; sem essa variável, HTTP e Socket.IO aceitam qualquer origem;
4. armazenar segredos fora do repositório e aplicar rotação;
5. proteger ou desabilitar em produção os endpoints públicos de criação de empresa conforme o processo comercial;
6. adicionar rate limiting a login, registro, ativação e upload;
7. avaliar cookie `HttpOnly` ou outra estratégia que reduza exposição do JWT a XSS;
8. adicionar headers de segurança no proxy, incluindo CSP, HSTS e proteção de framing;
9. executar a API e o banco com usuários sem privilégios administrativos;
10. restringir MIME e extensão de upload com validação do conteúdo do arquivo;
11. centralizar logs, métricas e alertas;
12. automatizar e testar backup/restauração;
13. documentar retenção e tratamento de dados pessoais;
14. criar ambiente de homologação separado da produção;
15. remover ou proteger ADB remoto após manutenção.

## Risco conhecido nas dependências do Player

Na revisão de 19 de agosto de 2026, `npm audit` permaneceu com oito alertas de severidade alta e nenhum crítico no Player. Os alertas pertencem à mesma cadeia transitiva do React Native/Metro, concentrada no parser `image-size`. A correção automática oferecida pelo npm faria downgrade do React Native 0.85.3 para 0.72.17, uma alteração incompatível e mais arriscada para o Player.

Não execute `npm audit fix --force` sem uma migração planejada. Acompanhe as atualizações do React Native e do Metro pelo Dependabot, valide a correção assim que houver uma versão compatível e evite processar arquivos ICNS, JXL ou HEIF não confiáveis no ambiente de build. API e Web não apresentaram vulnerabilidades conhecidas na mesma auditoria.

## Diagnóstico rápido

| Sintoma                         | Verificações                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| Web abre, mas não carrega dados | URL do build, CORS, `/health`, cookie e resposta `401`               |
| Player não vincula              | alcance da API, código, segredo salvo, relógio e logs de ativação    |
| Player aparece offline          | heartbeat, token, rede, processo API e diferença superior a 60 s     |
| Mudança demora a chegar         | Socket.IO, proxy WebSocket e sincronização de 15 s                   |
| Mídia não reproduz              | arquivo no storage, URL pública, espaço local e download no logcat   |
| Vídeo vertical não gira         | patch do `react-native-video`, APK recompilado e `TextureView`       |
| Barra diverge da prévia         | orientação, resolução/overscan, escala, offsets e versão do APK      |
| Clima não atualiza              | saída HTTPS, Open-Meteo, localização e cache de 15 min               |
| Upload falha                    | limite de 500 MB, MIME, espaço e permissão do diretório              |
| Retomada após reinício falha    | `AsyncStorage`, cache local, ocorrência ainda válida e boot receiver |

## Gestão de mudanças

Cada release deve registrar:

- versão e commit de Web, API e Player;
- migrations incluídas;
- mudanças de variáveis de ambiente;
- compatibilidade mínima do APK;
- evidência de testes;
- responsável e horário da publicação;
- procedimento específico de rollback;
- resultado da validação pós-implantação.
