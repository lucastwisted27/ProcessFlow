# Plano de migração do ProcessFlow

**Status:** análise concluída e fundação web multiusuário iniciada
**Data da análise:** 29/09/2026
**Princípio:** preservar primeiro, migrar depois, melhorar por último

### Progresso de implementação

Após a análise, foram criados `frontend/` e `backend/` em paralelo. A fundação atual já inclui autenticação Supabase, workspaces compartilhados, convite temporário entre usuários, processos e financeiro associados ao mesmo workspace, migration inicial do PostgreSQL e importador legado com dry run. O Electron deixou de ser requisito da arquitetura final e permanece somente como referência temporária até a conferência dos dados.

## Resumo executivo

O ProcessFlow atual é uma aplicação desktop offline e monousuário. A interface inteira está em `index.html`, `style.css` e `app.js`; o processo principal do Electron (`main.js`) faz a persistência em arquivos JSON, abre arquivos, salva backups e abre links externos; `preload.js` expõe essas operações ao navegador por IPC.

A migração recomendada é incremental. A versão Electron deve continuar funcionando durante a construção de uma aplicação paralela com frontend React/TypeScript/Vite, API FastAPI/Pydantic/SQLAlchemy e PostgreSQL, preferencialmente no Supabase. O primeiro recorte funcional deve ser pequeno e vertical: autenticação, espaço de trabalho compartilhado e leitura de processos; só depois devem entrar escrita, dashboard, financeiro, Trello e backup.

Antes de importar dados, é obrigatório localizar os JSONs realmente usados pela instalação do Electron. Os arquivos na raiz do projeto são apenas sementes: ao iniciar, o aplicativo os copia para `app.getPath("userData")/data`, e passa a ler e gravar a cópia. Portanto, os JSONs da raiz podem estar desatualizados.

Achados de dados que impedem uma importação ingênua:

- `processos.json` contém 148 registros, mas somente 137 IDs numéricos distintos; os IDs de 1 a 11 aparecem duas vezes.
- `trello_id` é único nos 148 registros e é uma chave de reconciliação melhor para essa base.
- `concluido` e `status` divergem em 3 registros; a interface atual usa `status`, não `concluido`.
- `financeiro.json` da raiz está vazio (`[]`), mas isso não prova que o arquivo em `userData` esteja vazio.
- O export original do Trello contém dados pessoais e operacionais adicionais que não devem ser copiados integralmente para o novo banco.

## 1. Arquitetura atual

### 1.1 Tecnologias

| Camada | Implementação atual |
|---|---|
| Runtime desktop | Electron `^38.2.0` |
| Processo principal | Node.js/CommonJS em `main.js` |
| Ponte segura | `preload.js`, `contextBridge` e `ipcRenderer` |
| Interface | HTML, CSS e JavaScript sem framework |
| Persistência | Arquivos JSON locais, gravados por `fs` |
| Empacotamento/build | Não configurado |
| Testes/lint/formatação | Não configurados |
| Controle de versão | A pasta analisada não contém repositório Git |
| Dependências reproduzíveis | Não há `package-lock.json` |

O `BrowserWindow` usa `contextIsolation: true` e `nodeIntegration: false`, o que é uma boa separação básica. A janela tem 1440×920 e mínimo de 1120×720, reforçando que o uso atual é voltado a desktop.

### 1.2 Estrutura atual

```text
ProcessFlow/
├── package.json
├── main.js                     # Electron, arquivos, diálogos e IPC
├── preload.js                  # API permitida ao renderer
├── index.html                  # todas as páginas e modais
├── style.css                   # tema e responsividade parcial
├── app.js                      # estado, regras e renderização
├── processos.json              # semente de processos
├── financeiro.json             # semente financeira
├── trello_export_original.json # export bruto usado na origem
└── README.md
```

### 1.3 Fluxo de execução e persistência

1. O Electron cria `<userData>/data`.
2. Se `processos.json` ou `financeiro.json` ainda não existir em `userData`, a semente da raiz é copiada.
3. Se o arquivo local for um array vazio e a semente correspondente tiver dados, a semente também sobrescreve o array vazio. Essa regra merece atenção: um usuário que tenha esvaziado intencionalmente a base pode receber novamente a semente na inicialização.
4. O renderer solicita os arrays completos por IPC.
5. A interface mantém ambos os arrays inteiros em memória.
6. Cada alteração regrava o arquivo JSON inteiro de forma síncrona no processo principal.

Não há servidor, login, isolamento por usuário, controle de concorrência, histórico de alterações ou recuperação transacional. Duas instâncias gravando o mesmo arquivo podem perder alterações.

### 1.4 Separação atual de responsabilidades

| Arquivo | Responsabilidades observadas |
|---|---|
| `main.js` | janela Electron; criação e leitura das sementes; leitura/gravação JSON; normalização do Trello; diálogos de importar/salvar; backup; abertura de URL externa; handlers IPC |
| `preload.js` | expõe 9 operações permitidas em `window.api` |
| `index.html` | layout, navegação, quatro páginas, quatro modais e formulários |
| `app.js` | estado global, eventos, CRUD, regras de prazo, filtros, cálculos financeiros, parcelamento e HTML gerado por strings |
| `style.css` | identidade visual escura, grids, tabelas, modais e breakpoints de 1050 px e 760 px |

## 2. Arquitetura proposta

### 2.1 Visão geral

```text
ProcessFlow/
├── frontend/
│   ├── src/
│   │   ├── app/                # rotas, providers e configuração
│   │   ├── components/         # componentes de interface reutilizáveis
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── processes/
│   │   │   ├── attention/
│   │   │   ├── finance/
│   │   │   └── import-export/
│   │   ├── lib/                # cliente HTTP, datas e moeda
│   │   └── types/
│   ├── package.json
│   ├── vite.config.ts
│   └── vercel.json             # somente se necessário
├── backend/
│   ├── app/
│   │   ├── api/v1/             # rotas HTTP versionadas
│   │   ├── core/               # configuração, autenticação e erros
│   │   ├── models/             # modelos SQLAlchemy
│   │   ├── schemas/            # modelos Pydantic de entrada/saída
│   │   ├── repositories/       # acesso ao banco
│   │   ├── services/           # regras de negócio
│   │   └── main.py
│   ├── alembic/                # migrações do banco
│   ├── scripts/                # importação validada dos JSONs
│   ├── tests/
│   ├── pyproject.toml
│   └── .env.example
├── docs/
├── legacy-electron/            # destino opcional, somente após estabilização
└── README.md
```

Enquanto a migração estiver em andamento, os arquivos atuais devem permanecer onde estão. A movimentação para `legacy-electron/` é opcional e só deve ocorrer quando não quebrar o uso existente.

### 2.2 Responsabilidades futuras

| Camada | Responsabilidade |
|---|---|
| React/TypeScript/Vite | interface responsiva, formulários, navegação, upload/download e consumo da API |
| Tailwind CSS | opcional; deve reproduzir primeiro os tokens visuais atuais, não motivar um redesign |
| FastAPI | contratos HTTP, autenticação, autorização, validação, erros e documentação OpenAPI |
| Services | regras de prazo, parcelamento, importação, recebimento e backup |
| Repositories | consultas sempre limitadas ao espaço de trabalho autorizado |
| SQLAlchemy/Alembic | modelo relacional e migrações versionadas |
| PostgreSQL/Supabase | persistência transacional, índices e integridade referencial |
| Supabase Auth | identidade; tokens JWT verificados pelo backend |
| Vercel | frontend estático/SPA |
| Hospedagem Python independente | backend FastAPI; não depender do runtime do frontend na Vercel |

### 2.3 Autenticação e compartilhamento

Para permitir contas diferentes acessando os mesmos dados, a separação não deve ser apenas por `user_id`. O modelo mínimo necessário é um **espaço de trabalho** compartilhado:

```text
auth.users ──< workspace_members >── workspaces
                                        ├──< processes ──< process_attachments
                                        └──< financial_entries ──< installments
```

- `admin`: gerencia membros e pode executar todas as operações no espaço.
- `member` (usuário comum): usa processos e financeiro conforme a política definida.
- Todo processo e lançamento financeiro pertence a um `workspace_id`.
- O backend valida a associação antes de qualquer leitura ou escrita.
- Se Supabase for usado, RLS deve ser uma segunda barreira. A chave `service_role` nunca deve ir para o frontend.

### 2.4 API inicial sugerida

Os nomes abaixo são contratos propostos, não código já implementado:

```text
GET    /health
GET    /api/v1/processes
POST   /api/v1/processes
GET    /api/v1/processes/{id}
PATCH  /api/v1/processes/{id}
DELETE /api/v1/processes/{id}
GET    /api/v1/dashboard/summary
GET    /api/v1/attention

GET    /api/v1/financial-entries
POST   /api/v1/financial-entries
GET    /api/v1/financial-entries/{id}
PATCH  /api/v1/financial-entries/{id}
DELETE /api/v1/financial-entries/{id}
POST   /api/v1/financial-entries/{id}/installments/{number}/receive

POST   /api/v1/imports/trello/preview
POST   /api/v1/imports/trello/commit
GET    /api/v1/backup
```

Filtros, busca, ordenação e paginação devem ser parâmetros da API. A prévia da importação é uma melhoria de segurança; durante a migração, sua transformação deve produzir exatamente os mesmos campos que a regra atual.

## 3. Funcionalidades existentes

### 3.1 Telas

| Tela | Conteúdo e comportamento |
|---|---|
| Visão geral | data atual; métricas de total, andamento, atenção e concluídos; até 6 prazos críticos; gráfico donut por status; 8 processos mais recentes |
| Processos | busca textual; filtros; ordenação por prazo; tabela; cadastro; detalhe; edição; conclusão/reabertura; exclusão |
| Atenção | processos não concluídos, vencidos ou com vencimento em até 3 dias |
| Financeiro | mês/ano; métricas; resumo anual; próximas e atrasadas; gráfico anual; categorias; histórico; cadastro, edição e exclusão; recebimento de parcela |

### 3.2 Navegação e interação

- Navegação lateral entre as quatro páginas sem roteamento por URL.
- Botão de atualização recarrega ambos os JSONs.
- Modais para processo, detalhe de processo, movimentação financeira e detalhe financeiro.
- Tecla Escape fecha qualquer modal aberto.
- Toasts de sucesso e erro.
- Confirmação nativa antes de excluir processo ou movimentação.
- Links de anexos são preservados nos dados, mas a interface atual não os mostra no detalhe do processo.

### 3.3 Pesquisa e filtros de processos

- A busca é `case-insensitive` e pesquisa `cliente`, `numero`, `tipo`, `proxima_acao` e `observacoes`.
- Filtros: Todos, Atrasados, Urgentes, Atenção, Em andamento, Sobrestado e Concluído.
- A lista é ordenada pelo prazo mais próximo; registros sem prazo vão para o fim.
- Não há paginação.

### 3.4 Importação e backup

- A importação abre um seletor de arquivo JSON e acrescenta todos os cartões encontrados aos processos existentes.
- Não há prévia, detecção de duplicidade, transação ou registro da importação.
- O backup abre um diálogo “Salvar como” e gera um JSON com metadados, processos e financeiro.
- Não existe restauração de backup na interface atual.

### 3.5 Responsividade atual

O CSS contém breakpoints em 1050 px e 760 px: grids passam para uma ou duas colunas, formulários passam para uma coluna e tabelas podem rolar horizontalmente. Porém, em telas de até 760 px a barra lateral inteira é ocultada e não existe navegação móvel substituta. A janela Electron também impede largura abaixo de 1120 px. Portanto, há adaptação visual parcial, mas ainda não há um fluxo mobile utilizável.

## 4. Funcionalidades e regras que precisam ser preservadas

### 4.1 Processos

- Cadastro exige somente `cliente`; os outros campos podem ficar vazios.
- Novos registros começam com prioridade `Normal` e status `Em andamento`.
- Edição preserva campos desconhecidos do registro porque usa atualização parcial no objeto atual e adiciona `atualizado_em`.
- Inclusão adiciona `criado_em`.
- Concluir troca o status para `Concluído`; reabrir troca para `Em andamento`.
- O campo legado `concluido` não participa dessa operação e hoje pode ficar desatualizado.
- Exclusão remove o registro após confirmação.

### 4.2 Regras de prazo

Para processos não concluídos:

| Diferença para hoje | Estado visual | Entra em Atenção? |
|---|---|---|
| prazo vencido | vermelho | sim |
| vence hoje | laranja | sim |
| vence em 1 a 3 dias | amarelo | sim |
| vence em 4 a 7 dias | azul | não |
| vence em mais de 7 dias | verde | não |
| sem prazo | neutro | não |

Processos concluídos são sempre verdes. As comparações usam a data local do computador e datas no formato `YYYY-MM-DD`.

### 4.3 Financeiro

- Tipos permitidos: receita e despesa.
- Data, descrição e valor positivo são obrigatórios.
- Lançamento parcelado é sempre forçado para receita.
- Periodicidades: semanal (+7 dias), quinzenal (+15 dias) e mensal.
- No mensal, quando o dia não existe no mês de destino, usa-se o último dia desse mês.
- O valor total é dividido igualmente; arredondamento de centavos é corrigido na última parcela.
- A primeira parcela pode nascer recebida; as demais nascem pendentes.
- Marcar como recebida grava a data local atual.
- Em lançamentos parcelados, só parcelas recebidas viram movimentos de receita no histórico e nos totais.
- Receitas não parceladas e despesas entram pela data do lançamento.
- `saldo = receitas - despesas`.
- O cartão geral “A receber” soma todas as parcelas pendentes, independentemente do filtro de mês/ano.
- O resumo “A receber em {ano}” limita as pendências pelo ano do vencimento.
- Próximas e atrasadas exibem no máximo 7 itens em cada lista.
- O gráfico compara receitas e despesas, mês a mês, para o ano escolhido.
- O resumo por categoria mostra até 8 categorias do período filtrado.
- Editar um lançamento parcelado regenera as parcelas; estados de recebimento anteriores podem ser perdidos. Esse comportamento deve ser preservado na paridade inicial e depois revisto como melhoria explícita.

### 4.4 Importação do Trello

Regra implementada em `main.js`:

- um cartão vira um processo;
- `cliente` recebe o nome do cartão;
- `numero` recebe `idShort`;
- `tipo` recebe o nome da lista;
- prazo recebe os 10 primeiros caracteres de `due`;
- lista contendo `FINALIZ` gera status `Concluído`;
- lista contendo `SOBREST` gera status `Sobrestado`;
- demais listas geram `Em andamento`;
- rótulo contendo “urg”, “vermelh” ou “red” gera prioridade `Urgente`;
- rótulo contendo “alta”, “orange” ou “laranja” gera prioridade `Alta`;
- rótulo contendo “prazo” ou “deadline” gera próxima ação `Verificar prazo`; senão, `Acompanhar`;
- descrição vira observações;
- anexos preservam apenas nome e URL;
- origem é `Trello`.

O importador atual não preserva `trello_id` nem `url_trello`, embora a semente atual tenha esses campos. Essa divergência deve ser resolvida antes da nova importação.

### 4.5 Aparência e usabilidade

A identidade atual — tema escuro, hierarquia do painel, cores de estado, tabelas e modais — deve ser tratada como referência. A migração para componentes não autoriza um redesign. No mobile, a mesma funcionalidade precisa receber padrões apropriados: navegação inferior ou menu acessível, cartões no lugar de tabelas largas quando necessário e ações com áreas de toque adequadas.

## 5. Estrutura atual dos dados JSON

### 5.1 `processos.json`

Perfil da semente analisada:

| Medida | Valor |
|---|---:|
| Registros | 148 |
| IDs numéricos distintos | 137 |
| Grupos de ID duplicado | 11 (`1` a `11`) |
| `trello_id` distintos | 148 |
| Com prazo | 9 |
| Com anexos | 76 |
| Anexos no total | 356 |
| Em andamento | 99 |
| Concluídos | 31 |
| Sobrestados | 18 |
| Prioridade Normal | 146 |
| Prioridade Urgente | 2 |

Campos observados em todos os registros:

| Campo | Tipo atual | Uso atual | Observação de migração |
|---|---|---|---|
| `id` | inteiro | identificação na UI | não é confiável como chave única da importação |
| `cliente` | texto | título/parte | obrigatório na UI |
| `numero` | texto | busca e exibição | na semente corresponde ao `idShort`; também tem duplicidades |
| `tipo` | texto | tipo/lista Trello | valores hoje representam listas heterogêneas |
| `data_prazo` | texto | prazo | vazio ou `YYYY-MM-DD` |
| `proxima_acao` | texto | busca e exibição | regras mais ricas na semente do que no importador atual |
| `prioridade` | texto | filtro/badge | Normal, Alta, Urgente ou Baixa aceitos pela UI |
| `status` | texto | principal estado do processo | fonte usada por toda a interface |
| `observacoes` | texto | detalhe e busca | pode estar vazio |
| `origem` | texto | procedência | semente contém `Trello` |
| `anexos` | array | metadados de link | 0..N objetos `{nome, url}`; ainda não exibidos na UI |
| `concluido` | booleano | não usado pela UI | redundante e divergente em 3 registros |
| `trello_id` | texto | rastreabilidade | único na semente; deve apoiar deduplicação |
| `url_trello` | texto | rastreabilidade | URL HTTP(S) presente em todos os registros |

A semente não possui `criado_em` ou `atualizado_em`. O importador atual adiciona `criado_em`, e a edição adiciona `atualizado_em`, de modo que o arquivo ativo pode conter um esquema misto.

### 5.2 `financeiro.json`

A semente é um array vazio. A estrutura abaixo foi inferida do código e deve ser confirmada no arquivo ativo em `userData`:

```json
{
  "id": 1,
  "tipo": "receita | despesa",
  "data": "YYYY-MM-DD",
  "descricao": "texto",
  "categoria": "texto",
  "valor": 100.00,
  "observacoes": "texto",
  "parcelado": true,
  "periodicidade": "semanal | quinzenal | mensal",
  "parcelas": [
    {
      "numero": 1,
      "totalParcelas": 2,
      "dataVencimento": "YYYY-MM-DD",
      "dataRecebimento": "YYYY-MM-DD ou vazio",
      "status": "recebida | pendente",
      "valor": 50.00
    }
  ]
}
```

Para lançamento não parcelado, `parcelado` é `false` e `parcelas` é `[]`; `periodicidade` pode não existir.

### 5.3 `trello_export_original.json`

O export bruto contém:

- 148 cartões, todos representados na semente por `trello_id`;
- 17 listas;
- 16 rótulos;
- 4 checklists;
- 4 membros e 4 associações;
- 1.000 ações;
- 9 cartões com prazo;
- 76 cartões com anexos;
- 26 cartões arquivados (`closed`);
- 3 cartões com `dueComplete`.

Somente os campos necessários do cartão, lista, rótulos e anexos devem atravessar a migração. Ações, membros, preferências do quadro e metadados internos não têm uso no ProcessFlow atual e ampliariam desnecessariamente a exposição de dados.

## 6. Modelo de banco de dados proposto

### 6.1 Entidades necessárias

| Tabela | Campos principais | Observações |
|---|---|---|
| `workspaces` | `id UUID PK`, `name`, timestamps | unidade compartilhada por Carlos e demais usuários |
| `workspace_members` | `workspace_id FK`, `user_id UUID`, `role`, timestamps | PK composta; papéis `admin` e `member` |
| `processes` | `id UUID PK`, `workspace_id FK`, `legacy_id`, `client`, `number`, `type`, `due_date`, `next_action`, `priority`, `status`, `notes`, `origin`, `trello_id`, `trello_url`, timestamps | `legacy_id` não deve ser único; unicidade opcional de `(workspace_id, trello_id)` quando não nulo |
| `process_attachments` | `id UUID PK`, `process_id FK`, `name`, `url`, timestamps | no MVP representa link, não arquivo armazenado |
| `financial_entries` | `id UUID PK`, `workspace_id FK`, `legacy_id`, `kind`, `entry_date`, `description`, `category`, `amount NUMERIC`, `notes`, `is_installment`, `frequency`, timestamps | moeda em `NUMERIC`, nunca `float` |
| `installments` | `id UUID PK`, `financial_entry_id FK`, `number`, `total_installments`, `due_date`, `received_date`, `status`, `amount NUMERIC`, timestamps | unicidade `(financial_entry_id, number)` |

Uma tabela `profiles` só deve ser criada se a interface precisar guardar nome de exibição ou preferências além do que o provedor de autenticação oferece. Categorias também devem permanecer texto no MVP; criar uma entidade de categorias agora não é necessário para preservar o comportamento.

### 6.2 Restrições e índices

- FKs com comportamento de exclusão explícito e testado.
- Índices por `workspace_id`, `status`, `due_date`, `entry_date` e `due_date` das parcelas.
- Índice de busca inicial por campos usados hoje; busca PostgreSQL mais sofisticada pode vir depois da paridade.
- `amount > 0`, números de parcela positivos e estados limitados por enum/constraint.
- Datas armazenadas como `DATE`; timestamps em UTC como `TIMESTAMPTZ`.
- `status` deve ser a única fonte de conclusão após a reconciliação.
- Exclusão física preserva o comportamento atual no MVP; auditoria ou soft delete é melhoria posterior.

### 6.3 Correspondência dos campos

| JSON | PostgreSQL |
|---|---|
| `processos.id` | `processes.legacy_id` |
| nova chave | `processes.id` UUID |
| `cliente` | `client` |
| `numero` | `number` |
| `tipo` | `type` |
| `data_prazo` | `due_date` |
| `proxima_acao` | `next_action` |
| `observacoes` | `notes` |
| `anexos[]` | linhas em `process_attachments` |
| `financeiro.id` | `financial_entries.legacy_id` |
| `parcelas[]` | linhas em `installments` |

Os nomes em inglês no banco são uma convenção proposta para o código. Manter nomes em português também é válido, desde que a convenção seja única em models, migrations e schemas.

## 7. Dependências e integrações do Electron

| Canal/integração | Função atual | Substituição web |
|---|---|---|
| `data:load` | carrega todos os processos | `GET /processes` |
| `data:save` | sobrescreve todos os processos | endpoints CRUD transacionais |
| `finance:load` | carrega todo o financeiro | `GET /financial-entries` |
| `finance:save` | sobrescreve todo o financeiro | endpoints CRUD e de recebimento |
| `trello:import` | abre arquivo e normaliza cartões | `<input type=file>` + preview/commit na API |
| `backup:create` | diálogo e gravação em caminho local | resposta JSON para download no navegador |
| `shell:open` | abre URL HTTP(S) externamente | link seguro com `target="_blank"` e `rel="noopener noreferrer"` |
| `app:get-data-path` | diagnóstico do diretório local | não necessário na versão web |
| `app:get-process-file` | diagnóstico do arquivo local | não necessário na versão web |
| `app:get-finance-file` | diagnóstico do arquivo local | não necessário na versão web |

Nenhuma API de Electron deve ser usada pelo frontend React. Durante a transição, Electron e web podem coexistir, mas não devem gravar simultaneamente fontes diferentes após o início do corte de dados sem uma estratégia explícita de sincronização.

## 8. O que será migrado

- Todas as telas e fluxos listados na seção 3.
- Regras de prazo e de financeiro da seção 4.
- Processos, anexos, lançamentos e parcelas.
- Identificadores do Trello necessários para rastreabilidade e deduplicação.
- Busca, filtros, resumos, alertas, gráfico e navegação.
- Importação Trello e exportação de backup.
- Identidade visual atual, adaptada por componentes responsivos.
- Tratamento de erros atualmente representado por toasts, com mensagens consistentes da API.

O migrador deve:

1. aceitar caminhos explícitos para os JSONs de origem;
2. nunca modificar os arquivos de origem;
3. validar schema e datas;
4. gerar relatório de contagens, duplicidades e divergências;
5. oferecer `--dry-run`;
6. usar uma transação no commit;
7. registrar a chave legada e o `trello_id`;
8. ser idempotente, impedindo duplicação em uma segunda execução;
9. conferir totais e amostras após a carga.

## 9. O que será substituído

| Atual | Futuro |
|---|---|
| estado global mutável em `app.js` | estado por feature e dados remotos tipados |
| HTML gerado por strings | componentes React |
| eventos com `onclick` global | handlers tipados de componentes |
| arrays inteiros regravados | operações CRUD transacionais |
| validação somente no navegador | Pydantic no servidor + validação de formulário |
| IDs incrementais frágeis | UUIDs gerados pelo banco/aplicação |
| JSON local | PostgreSQL |
| seleção/salvamento nativos | upload e download do navegador |
| cálculo duplicável no renderer | regras críticas testadas em services; UI apenas apresenta |
| modo monousuário | autenticação e autorização por workspace |

## 10. O que será removido

Nada deve ser removido nesta primeira etapa.

Após paridade funcional, validação dos dados e aceite:

- runtime Electron, `main.js` e `preload.js` deixam de ser necessários na distribuição web;
- operações IPC e caminhos locais deixam de existir na versão web;
- `concluido` pode ser eliminado após reconciliar os 3 conflitos e adotar `status` como fonte única;
- `legacy_id` pode deixar de aparecer na aplicação, mas deve ser mantido no banco pelo período de auditoria;
- o export bruto do Trello não deve ser publicado, enviado à Vercel ou incluído em artefatos de produção;
- a versão desktop só deve ser arquivada depois de um período de operação paralela e de um backup validado.

## 11. Ordem recomendada de implementação

### Etapa 0 — segurança e baseline

- Inicializar Git e criar o primeiro snapshot sem alterar comportamento.
- Localizar e copiar, em modo somente leitura, os JSONs ativos em `userData`.
- Calcular checksums e guardar backups fora da pasta de trabalho.
- Definir um conjunto de casos reais anonimizados para testes.
- Registrar contagens esperadas e decidir os 3 conflitos `concluido` × `status`.

**Saída:** fontes autoritativas identificadas e recuperação testada.

### Etapa 1 — caracterização das regras atuais

- Criar testes de caracterização para prazos, filtros, importação Trello, periodicidade mensal, arredondamento e totais.
- Congelar os contratos de dados usados na paridade.

**Saída:** comportamento atual executável como especificação.

### Etapa 2 — scaffolding paralelo

- Criar `frontend/` com React, TypeScript e Vite.
- Criar `backend/` com FastAPI, Pydantic, SQLAlchemy, Alembic e testes.
- Adicionar `.env.example`, configuração por ambiente, CORS restrito e health check.
- Manter os arquivos Electron intactos.

**Saída:** frontend e backend mínimos rodando separadamente.

### Etapa 3 — identidade, workspace e banco

- Configurar Supabase PostgreSQL e Auth.
- Criar migrations de workspace, membros, processos, anexos, financeiro e parcelas.
- Implementar verificação JWT, autorização por workspace e RLS quando aplicável.

**Saída:** acesso autenticado e isolamento validado por testes.

### Etapa 4 — migrador de dados

- Implementar dry run e relatório de reconciliação.
- Resolver IDs repetidos por UUID e preservar `legacy_id`.
- Deduplicar por `trello_id` dentro do workspace.
- Importar processos e anexos; importar o financeiro ativo quando encontrado.
- Comparar contagens, somas financeiras e amostras.

**Saída:** carga repetível, idempotente e auditável em ambiente de homologação.

### Etapa 5 — processos, primeiro recorte vertical

- Autenticação no frontend.
- Lista, busca, filtros, detalhe, criação, edição, conclusão/reabertura e exclusão.
- Estados de loading, vazio, erro e reconexão.
- Layout desktop e mobile desde o primeiro componente.

**Saída:** processos com paridade funcional sobre PostgreSQL.

### Etapa 6 — dashboard e atenção

- Métricas, distribuição por status, recentes e alertas.
- Fixar a interpretação de “hoje” no fuso do workspace (`America/Manaus` inicialmente, se confirmado).

**Saída:** visão operacional equivalente à atual.

### Etapa 7 — financeiro

- CRUD de lançamentos, geração de parcelas, recebimento, filtros, métricas, gráfico, categorias e histórico.
- Testar centavos, virada de mês/ano e datas como 29–31.

**Saída:** financeiro com somas reconciliadas contra a fonte.

### Etapa 8 — Trello e backup

- Importação com prévia, relatório de duplicidades e commit transacional.
- Download de backup versionado e documentação de restauração.
- Preservar URLs de cartão/anexo estritamente necessárias.

**Saída:** ferramentas operacionais completas.

### Etapa 9 — responsividade, acessibilidade e observabilidade

- Navegação móvel real, formulários por etapas quando necessário e tabelas adaptadas.
- Teclado, foco, contraste e leitores de tela.
- Logs estruturados sem dados sensíveis, captura de erros e métricas básicas.

**Saída:** aceite em desktop, tablet e celular.

### Etapa 10 — deploy e corte gradual

- Deploy do frontend na Vercel.
- Deploy independente da API FastAPI.
- Configurar domínios, HTTPS, CORS, secrets e backups do banco.
- Operação piloto, comparação diária e janela de congelamento para carga final.
- Somente após aceite, tornar Electron somente leitura e depois arquivá-lo.

**Saída:** web como fonte oficial, com retorno possível ao backup validado.

## 12. Riscos da migração

| Risco | Impacto | Mitigação |
|---|---|---|
| JSON da raiz não ser a fonte mais recente | perda de dados | localizar `userData`, comparar datas/checksums e escolher a fonte autoritativa |
| IDs 1–11 duplicados | associação ao registro errado | UUID novo; `legacy_id` apenas informativo; deduplicar por `trello_id` |
| `concluido` divergir de `status` | estado incorreto | usar `status` como comportamento atual e revisar os 3 casos manualmente |
| esquema ativo ser misto | falha na importação | schemas tolerantes de entrada, relatório por registro e correção explícita |
| importar o Trello bruto inteiro | exposição de dados | whitelist de campos e exclusão de ações/membros/metadados desnecessários |
| URLs de anexos expirarem ou exigirem login | anexos inacessíveis | validar amostra; decidir depois se haverá armazenamento próprio, com consentimento |
| datas variarem por fuso | alertas ou recebimentos no dia errado | usar `DATE` para datas civis e definir fuso do workspace para “hoje” |
| valores monetários com ponto flutuante | centavos divergentes | `Decimal` no Python e `NUMERIC` no PostgreSQL |
| edição de parcelado regenerar parcelas recebidas | perda de histórico | teste de paridade; depois exigir confirmação e preservar parcelas quando possível |
| importação Trello duplicar registros | base inflada | chave `(workspace_id, trello_id)`, preview e importação idempotente |
| autorização incompleta entre usuários | vazamento de dados | escopo por workspace em repository, testes negativos e RLS |
| frontend e Electron gravarem em paralelo | divergência de fontes | definir janela de congelamento e uma única fonte oficial por fase |
| ausência de testes atuais | regressões silenciosas | testes de caracterização antes de reimplementar regras |
| mobile perder navegação | sistema inutilizável no celular | navegação móvel como requisito de aceite do primeiro recorte |
| ausência de Git e lockfile | difícil reproduzir/reverter | versionar baseline e fixar dependências antes da implementação |
| secrets no frontend ou repositório | comprometimento | variáveis de ambiente, secret manager e `.env.example` sem valores reais |
| backend ser tratado como função da Vercel sem avaliação | falhas de runtime/conexão | hospedar FastAPI separadamente e documentar o endpoint público |

## Critérios de paridade e aceite

A versão web só pode substituir a atual quando:

- todos os processos, anexos, lançamentos e parcelas tiverem contagens reconciliadas;
- somas financeiras por mês e ano coincidirem;
- todos os filtros e estados de prazo passarem nos testes de caracterização;
- criar, editar, concluir/reabrir e excluir funcionarem sob as permissões corretas;
- duas contas diferentes acessarem o mesmo workspace sem enxergar outro workspace;
- importação repetida do mesmo Trello não duplicar dados;
- o backup puder ser baixado e restaurado em homologação;
- fluxos essenciais forem aprovados em desktop e celular;
- backups, logs e rollback do corte estiverem documentados.

## Próximo passo recomendado

Executar somente a **Etapa 0**: colocar a versão atual sob controle de versão, identificar os arquivos ativos na pasta de dados do Electron, criar cópias verificadas e produzir um relatório de reconciliação. Depois disso, criar os testes de caracterização. Ainda não é seguro começar pelo backend completo nem carregar a semente diretamente no Supabase.

## Decisões que deverão ser confirmadas antes da implementação

- Qual instalação contém os JSONs oficiais e mais recentes?
- Os 3 conflitos entre `concluido` e `status` devem seguir o `status` atual?
- Os links de anexos do Trello precisam apenas continuar como links ou devem ser copiados para armazenamento próprio?
- O usuário comum pode excluir dados ou essa operação deve ser exclusiva do administrador?
- O fuso operacional deve ser `America/Manaus` para todos os usuários?
- Por quanto tempo a versão Electron ficará disponível em modo de contingência?
