# ProcessFlow

Evolução web do sistema de gestão de processos e financeiro. A nova arquitetura permite que usuários diferentes acessem a mesma base online pelo computador ou celular.

## Estado atual

A fundação web já contém:

- frontend React, TypeScript e Vite;
- interface responsiva para desktop e celular;
- login e criação de conta pelo Supabase Auth;
- espaços de trabalho compartilhados;
- convite temporário e de uso único para adicionar outra pessoa ao mesmo espaço;
- CRUD inicial de processos, busca, status e prazos críticos;
- cadastro de receitas, despesas e recebimentos parcelados;
- recebimento de parcelas e resumo de saldo;
- Dashboard compartilhado com indicadores de processos, prazos e finanças;
- agenda compartilhada com calendário mensal, audiências, reuniões e compromissos;
- prazos dos processos exibidos automaticamente na agenda, sem duplicar cadastros;
- exportação de backup JSON por workspace;
- importação web com prévia, confirmação e deduplicação;
- compatibilidade com backup ProcessFlow, JSON legado e exportação bruta do Trello;
- API FastAPI com Pydantic e SQLAlchemy;
- PostgreSQL com migrations Alembic;
- testes das regras de prazo, periodicidade e arredondamento;
- importador idempotente dos JSONs legados;
- configuração do frontend para deploy na Vercel.

Os arquivos Electron da raiz permanecem apenas como referência e fonte de dados até a conferência final.

## Compartilhamento entre Carlos e a esposa

Os dados não pertencem isoladamente à conta que os criou. Processos, anexos, finanças e parcelas pertencem a um `workspace`:

1. Carlos cria a conta e o espaço do escritório.
2. A esposa cria a própria conta.
3. As duas contas são vinculadas uma única vez ao workspace do escritório.
4. Depois do login, cada pessoa escolhe **Escritório Carlos** na tela **Onde você quer entrar?**.
5. A opção **Novo ambiente** cria um espaço separado quando isso for necessário.

Cada requisição da API valida o token do usuário e sua associação ao workspace informado. Ambientes não autorizados não aparecem na seleção. Compartilhar uma senha não é necessário nem recomendado.

## Estrutura

```text
frontend/          React + TypeScript + Vite
backend/           FastAPI + SQLAlchemy + Alembic
docs/migracao.md   análise e plano completo de migração
*.js, *.json       versão Electron e dados legados temporários
```

## Configuração do Supabase

Crie um projeto Supabase e obtenha:

- URL do projeto;
- chave pública/anon do frontend;
- connection string PostgreSQL para o backend.

Nunca coloque senha do banco, JWT secret ou `service_role` no frontend.

### Backend

Na pasta `backend`, copie `.env.example` para `.env` e preencha. Usar campos separados evita problemas com caracteres especiais na senha:

```env
DB_HOST=YOUR_POOLER_HOST
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.YOUR_PROJECT_REF
DB_PASSWORD="YOUR_DATABASE_PASSWORD"
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
SUPABASE_JWT_AUDIENCE=authenticated
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Para ambiente local no Windows:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

A API fica em `http://localhost:8000`. Em desenvolvimento, a documentação OpenAPI fica em `/docs`.

### Frontend

Na pasta `frontend`, copie `.env.example` para `.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Depois:

```powershell
cd frontend
corepack enable
pnpm install
pnpm dev
```

O frontend fica em `http://localhost:5173`.

## Banco e migrations

A migration inicial cria:

- `workspaces`;
- `workspace_members`;
- `workspace_invitations`;
- `processes` e `process_attachments`;
- `financial_entries` e `installments`.

Use sempre migrations:

```powershell
cd backend
alembic upgrade head
```

## Importação, exportação e dados antigos

Na aplicação, abra **Importar / Exportar**. A exportação gera um backup JSON do espaço selecionado, incluindo processos, financeiro e agenda. Para importar, escolha o arquivo, revise a prévia e confirme a mesclagem. Somente administradores podem importar; a exportação está disponível a todos os membros. Backups anteriores, na versão 2, continuam compatíveis.

A interface aceita:

- backup JSON gerado pela versão web;
- backup Electron v1;
- `processos.json` e `financeiro.json` legados;
- exportação JSON bruta do Trello.

O modo padrão mescla os registros e ignora duplicados por identificadores estáveis, sem apagar o que já existe.

O importador de linha de comando continua disponível para auditoria e inicia em modo somente leitura:

```powershell
cd backend
python scripts/import_legacy.py
```

Ele relata contagens, IDs duplicados e divergências sem alterar os JSONs ou o banco. Depois de criar o workspace e revisar o relatório:

```powershell
python scripts/import_legacy.py --commit --workspace-id UUID_DO_WORKSPACE
```

O importador preserva o ID antigo apenas para auditoria, cria UUIDs novos e usa `trello_id` para não duplicar processos quando executado novamente.

## Validação

```powershell
cd backend
pytest -q
ruff check .

cd ..\frontend
pnpm typecheck
pnpm build
```

## Deploy

- `frontend/`: Vercel, com as variáveis `VITE_*` configuradas no projeto.
- `backend/`: serviço Python independente com HTTPS e as variáveis privadas do banco/Supabase.
- banco e autenticação: Supabase.

O backend FastAPI não deve ser tratado como se tivesse o mesmo runtime do frontend na Vercel.

## Documentação

O inventário da versão anterior, regras preservadas, modelo de dados, riscos e sequência completa estão em [`docs/migracao.md`](docs/migracao.md).
