# Critérios Universais de Segurança

Este projeto deve seguir estes critérios em qualquer ambiente, integração ou evolução.

## 1. Princípios obrigatórios

- Menor privilégio: cada usuário acessa apenas o que precisa.
- Segredo fora do cliente: nenhuma `service_role`, token administrativo ou senha fica no frontend.
- Defesa em camadas: interface, banco, storage e deploy precisam validar acesso.
- Negação por padrão: sem regra explícita, o acesso deve ser negado.
- Rastreabilidade: ações críticas precisam ser auditáveis.

## 2. Regras para autenticação

- Autenticação centralizada no Supabase Auth.
- Senhas nunca são salvas manualmente em tabelas próprias.
- Sessões inválidas devem derrubar o acesso automaticamente.
- Contas administrativas devem ser raras e nomeadas.
- MFA deve ser habilitado para administradores sempre que possível.

## 3. Regras para autorização

- `admin` pode gerir usuários, importar arquivos e acessar inteligência de renovação.
- `participant` pode ver somente suas próprias comissões.
- Toda permissão deve ser reforçada por RLS, não apenas pela interface.
- Buckets privados devem aceitar upload, leitura e exclusão somente por perfis autorizados.

## 4. Regras para dados sensíveis

- Chaves e segredos apenas em variáveis de ambiente seguras.
- CSV/XLSX importados não devem ser expostos publicamente.
- Dados pessoais devem ser minimizados na interface.
- Logs nunca devem imprimir chaves, tokens, senhas ou payloads sensíveis completos.

## 5. Regras para frontend

- CSP ativa por padrão.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy` restritiva.
- Bibliotecas externas somente de origem confiável e conhecida.

## 6. Regras para banco e storage

- Todas as tabelas com RLS ativada.
- Buckets privados por padrão.
- Escrita administrativa limitada a `admin`.
- Leitura operacional limitada ao vínculo do participante.
- Processos destrutivos precisam ser intencionais e escopados por período/tipo.

## 7. Regras para auditoria

- Importações devem registrar arquivo, período, tipo, origem e autor.
- Mudanças de perfil e vínculo de usuário devem ser auditáveis.
- Exclusões de dados importados devem ser rastreáveis.

## 8. Regras para deploy

- Ambientes separados para homologação e produção.
- Sem credenciais hardcoded.
- Deploy só com revisão mínima de configuração.
- Publicação deve validar URL do Supabase, bucket, RLS e perfil admin inicial.

## 9. Regras para evolução futura

- Toda funcionalidade nova deve responder:
  - quem pode ver?
  - quem pode editar?
  - onde a regra é reforçada no backend/banco?
  - quais dados pessoais são expostos?
  - como auditar a ação?
