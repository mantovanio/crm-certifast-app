# crm_certifast profissional

Esta pasta inicia a migração do CRM para uma arquitetura profissional, com backend real, banco, storage e processamento no servidor.

## Objetivo

Sair do modelo atual, onde o navegador faz quase tudo, e migrar para:

- `web`: frontend do CRM
- `api`: backend centralizando autenticação, usuários, parceiros, importações e relatórios
- `postgres`: banco principal
- `minio`: storage privado para planilhas e anexos

## Arquitetura alvo

```text
Navegador
  -> Web app
  -> API
     -> PostgreSQL
     -> MinIO
```

## Vantagens

- login mais previsível
- importação de planilhas fora do navegador
- controle real de sessão
- regras de comissão e renovação centralizadas
- menor dependência de cache/localStorage
- caminho claro para auditoria, fila e processamento assíncrono

## Escopo mínimo da primeira fase

1. autenticação por sessão/cookie no backend
2. gestão de usuários e parceiros
3. upload de planilhas para storage privado
4. processamento server-side de `P`, `R`, `V` e `Renovações`
5. relatório de comissão por parceiro
6. área administrativa de renovações

## Estrutura

```text
platform/
  api/
  web/
  docker-compose.yml
  .env.example
```

## Estratégia de migração

1. estabilizar a base profissional em paralelo
2. reaproveitar o layout e regras que já funcionam
3. mover autenticação para backend
4. mover importação para backend
5. só depois desligar o frontend antigo

## Observação

O projeto antigo continua existindo em `app/` até a nova base ficar pronta para assumir.
