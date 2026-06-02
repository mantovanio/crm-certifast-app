# Migração profissional do CRM Certifast

## Decisão arquitetural

O `CRM Certifast` vai seguir o mesmo padrão estrutural do `CRM_CertiID`.

Isso significa:

- frontend em `React + Vite`
- autenticação via `Supabase Auth`
- perfis e permissões em tabela `profiles`
- gestão administrativa de usuários por função administrativa semelhante a `admin-users`
- personalização visual da tela de login por configuração
- deploy em `Docker` com imagem única do frontend
- publicação por `Docker Swarm + Traefik`, igual ao `CRM_CertiID`

## O que será reaproveitado do CRM_CertiID

### 1. Modelo de acesso

- login por email e senha
- recuperação de senha
- criação de conta
- aprovação e gestão administrativa
- perfil com papel e status

Base de referência:

- `src/contexts/AuthContext.tsx`
- `src/pages/Login.tsx`
- `sql/auth_schema.sql`
- `supabase/functions/admin-users/index.ts`

### 2. Critérios de segurança

- sessão gerida pelo Supabase
- tabela `profiles` ligada ao `auth.users`
- RLS por usuário autenticado
- perfil `admin` com poderes administrativos
- status do usuário controlando acesso
- redefinição de senha por fluxo seguro

### 3. Publicação

- `Dockerfile`
- `docker-compose.yml`
- deploy por `docker stack deploy`
- roteamento por `Traefik`

## O que muda para o Certifast

O que será específico do `CRM Certifast`:

- módulos de comissão:
  - parceiros
  - vendas
  - validações
- módulos de renovação:
  - histórico
  - clientes a renovar
  - análise administrativa
- vínculo de acesso de parceiro para ver apenas:
  - suas próprias comissões
  - sua própria carteira de renovação

## Estratégia correta agora

Não vamos insistir no app estático atual como base principal.

Vamos fazer assim:

1. criar a nova base `Certifast` no mesmo padrão do `CertiID`
2. portar primeiro:
   - login
   - recuperação de senha
   - gestão de usuários
   - permissões
3. depois portar:
   - parceiros
   - importações
   - comissões
   - renovações
4. só no fim desligar o frontend antigo

## Ordem de implementação

### Fase 1

- base Vite/React
- AuthContext padrão `CertiID`
- Login padrão `CertiID`
- schema de autenticação adaptado ao `Certifast`
- tela administrativa de usuários/acessos

### Fase 2

- parceiros
- regras de comissão e imposto
- importação da planilha `P`

### Fase 3

- importação `R`
- importação `V`
- relatório híbrido por usuário

### Fase 4

- importação histórica de renovação
- leitura analítica mista por conteúdo
- carteira individual e visão admin

## Decisão operacional

O scaffold genérico `platform/` criado antes não será a base final.

A base final será:

- `Certifast` com o mesmo padrão arquitetural do `CRM_CertiID`
- com adaptação dos módulos de negócio do `Certifast`
