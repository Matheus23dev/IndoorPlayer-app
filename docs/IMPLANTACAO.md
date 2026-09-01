# Instalação e implantação

## Topologia recomendada para o MVP

A arquitetura atual é mais simples de operar em uma única VPS Linux:

```mermaid
flowchart TB
    Internet --> N["Nginx<br/>TLS e arquivos do Web"]
    N -->|"/api e /socket.io"| A["API Node.js"]
    A --> DB[("MySQL")]
    A --> M[("Diretório de mídias")]
    TV["TV Boxes"] -->|HTTPS / WSS| N
    Admin["Navegadores"] -->|HTTPS| N
    B["Backup externo"] -.-> DB
    B -.-> M
```

Banco, API e arquivos podem começar no mesmo servidor, desde que banco e diretório de mídias tenham backup externo. O banco não deve expor a porta 3306 à internet.

## Portas e conectividade

| Porta    | Exposição                     | Uso                                      |
| -------- | ----------------------------- | ---------------------------------------- |
| 80/TCP   | Pública                       | Redirecionamento para HTTPS              |
| 443/TCP  | Pública                       | Web, API, arquivos e WebSocket seguro    |
| 3000/TCP | Apenas local/rede privada     | API NestJS atrás do proxy                |
| 3306/TCP | Apenas local/rede privada     | MySQL                                    |
| 5555/TCP | Somente manutenção controlada | ADB; desativar quando não estiver em uso |

## Variáveis de ambiente

### API

| Variável                     |    Obrigatória    | Exemplo                                          | Finalidade                        |
| ---------------------------- | :---------------: | ------------------------------------------------ | --------------------------------- |
| `DATABASE_URL`               |        Sim        | `mysql://user:pass@127.0.0.1:3306/indoor_player` | Conexão Prisma                    |
| `JWT_SECRET`                 |        Sim        | valor aleatório longo                            | Assinatura dos JWTs               |
| `PORT`                       |        Não        | `3000`                                           | Porta HTTP; padrão 3000           |
| `CORS_ORIGINS`               |     Produção      | `https://painel.exemplo.com`                     | Origens Web separadas por vírgula |
| `MEDIA_STORAGE_PATH`         |        Não        | `/var/lib/indoor-player/media`                   | Diretório físico das mídias       |
| `MEDIA_PUBLIC_PATH`          |        Não        | `/files/indoor-player-api`                       | Prefixo HTTP público              |
| `WEATHER_GEOCODING_BASE_URL` |        Não        | URL do provedor                                  | Endpoint de geocodificação        |
| `WEATHER_FORECAST_BASE_URL`  |        Não        | URL do provedor                                  | Endpoint de clima                 |
| `WEATHER_API_KEY`            | Conforme provedor | segredo                                          | Chave opcional do provedor        |

Sem `CORS_ORIGINS`, a API aceita qualquer origem HTTP. Isso é conveniente localmente, mas deve ser restringido em produção.

### Web

| Variável                  | Obrigatória no build | Exemplo                                           |
| ------------------------- | :------------------: | ------------------------------------------------- |
| `VITE_BASE_URL_API`       |         Sim          | `https://api.exemplo.com`                         |
| `VITE_BASE_URL_API_FILES` |         Não          | `https://api.exemplo.com/files/indoor-player-api` |

As variáveis Vite são incorporadas ao JavaScript durante o build. Alterá-las exige novo `npm run build`.

### Player

| Variável       | Obrigatória no build | Exemplo                   |
| -------------- | :------------------: | ------------------------- |
| `API_BASE_URL` |         Sim          | `https://api.exemplo.com` |

A URL também é incorporada ao APK. Alterá-la exige gerar e instalar um novo APK.

## Ambiente local

### 1. Banco e API

```powershell
cd C:\caminho\indoor-player-api
Copy-Item .env.example .env
docker compose up -d mysql
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

Valide `http://localhost:3000/health/ready` antes de iniciar os clientes.

### 2. Painel Web

```powershell
cd C:\caminho\indoor-player-web
Copy-Item .env.example .env
npm ci
npm run dev -- --host 0.0.0.0
```

### 3. Player Android

```powershell
cd C:\caminho\IndoorPlayer
Copy-Item .env.example .env
npm ci
npm start
npm run android
```

Em TV física, use o IP ou domínio alcançável pela TV; `localhost` e `10.0.2.2` têm significados diferentes no dispositivo e no emulador.

## Implantação da API

Sequência segura:

1. gerar backup do banco e confirmar integridade;
2. preservar o diretório de mídias;
3. obter a revisão aprovada da branch de release;
4. instalar dependências com `npm ci`;
5. executar `npm run validate`;
6. executar `npm run prisma:migrate:deploy`;
7. executar `npm run build`;
8. reiniciar o processo Node de forma controlada;
9. validar `/health/ready`, login, listagem de dispositivos e Socket.IO;
10. observar erros e heartbeats após a publicação.

Comando de execução do artefato:

```sh
npm run start:prod
```

Use um gerenciador de processos, como systemd ou PM2, configurado para reinício automático e logs persistentes. A escolha não está versionada atualmente no projeto.

## Implantação do Web

```sh
npm ci
npm run validate
```

Publique o conteúdo de `dist/` em uma nova pasta versionada e troque o apontamento do servidor Web de forma atômica. Configure fallback de rotas para `index.html`; sem isso, abrir diretamente `/home/devices` retorna 404 do servidor.

Exemplo conceitual de Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name painel.exemplo.com;

    root /var/www/indoor-player-web/current;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Se API e Web compartilham domínio, o proxy também precisa manter os cabeçalhos de upgrade em `/socket.io/`.

## Geração e distribuição do APK

1. defina a URL de produção no `.env`;
2. aumente `versionCode` e `versionName` em `android/app/build.gradle`;
3. instale dependências com `npm ci` para reaplicar o patch do vídeo;
4. execute `npm run validate`;
5. copie `android/keystore.properties.example` para `android/keystore.properties` e informe o keystore oficial;
6. gere `npm run android:release:production`;
7. calcule e registre o SHA-256 do APK;
8. teste instalação limpa, atualização sobre a versão anterior, boot, vínculo, sincronização e reprodução;
9. distribua por canal controlado e mantenha a versão anterior disponível para rollback.

## Validação pós-implantação

- `/health/ready` retorna `status: ok` e `checks.database: ok`;
- login e carregamento do dashboard funcionam;
- upload e download de uma mídia de teste funcionam;
- um Player conectado aparece online;
- alteração de programação dispara sincronização no Player;
- uma imagem e um vídeo são reproduzidos;
- orientação vertical e horizontal são exibidas corretamente;
- barras de topo/rodapé e laterais respeitam a prévia;
- heartbeat e prévia ao vivo avançam;
- auditoria registra uma ação administrativa e uma reconexão;
- backup programado executou após a mudança.
