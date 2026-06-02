# crm_certifast

Aplicação estática pronta para Vercel, com Supabase como backend.

## Estrutura

- `index.html`: shell do app
- `app.js`: lógica do frontend, autenticação, importação e relatórios
- `styles.css`: interface
- `sql/001_crm_certifast.sql`: schema, storage e RLS
- `vercel.json`: fallback SPA

## Publicação

Pode ser publicado direto na Vercel apontando a raiz para esta pasta `app`.

## Setup do Supabase

1. Execute o SQL em `sql/001_crm_certifast.sql`
2. Faça o primeiro cadastro pelo formulário do app
3. Entre com esse usuário e use o token inicial para ativar o primeiro administrador:

```text
CRM-CERTIFAST-ADMIN-2026
```

4. Depois de ativado, esse bootstrap é desligado automaticamente
5. Entre novamente no CRM e use a área de importações para subir:
   - `P-MMAAAA.xlsx`
   - `R-MMAAAA.xlsx`
   - `V-MMAAAA.xlsx`
   - planilhas de `Renovação`

## Observação

A criação administrativa de usuários no Supabase sem service role foi desenhada com fluxo de:

1. usuário faz cadastro por email e senha
2. administrador entra no CRM
3. administrador altera o papel e vincula o participante desse usuário
