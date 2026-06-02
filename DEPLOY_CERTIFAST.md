# Deploy do CRM Certifast

## Domínio recomendado

Usar:

- `crm.certifast.com.br`

Não usar como rota principal:

- `certifast.com.br/crm`

## Motivo do subdomínio

- melhor para Traefik
- melhor para SSL
- melhor para login e cookies
- isola o CRM do site institucional
- evita conflito de rota base

## DNS

Criar um apontamento para:

- `crm.certifast.com.br`

Opção mais comum:

- tipo `A`
- valor: IP da VPS onde já roda o `CRM_CertiID`

Se a VPS for a mesma do `CRM_CertiID`, o subdomínio pode apontar para o mesmo servidor.

## Estrutura de deploy

Arquivos criados:

- [Dockerfile](./Dockerfile)
- [nginx.conf](./nginx.conf)
- [docker-compose.yml](./docker-compose.yml)
- [deploy.sh](./deploy.sh)

## Padrão de publicação

Mesmo modelo do `CRM_CertiID`:

1. repositório clonado na VPS
2. build da imagem Docker local
3. deploy por `docker stack deploy`
4. roteamento pelo `Traefik`

## Caminho sugerido na VPS

```bash
/opt/certifast-crm
```

## Comandos esperados na VPS

```bash
cd /opt/certifast-crm
bash deploy.sh
```

## O que este compose publica

- stack: `certifastcrm`
- serviço: `certifast`
- host público: `crm.certifast.com.br`
- rede externa: `minha_rede`

## Próxima etapa técnica

Esta base já deixa o subdomínio pronto para publicação.

O próximo passo profissional é migrar o frontend do `CRM Certifast` para o mesmo padrão do `CRM_CertiID`:

- `React + Vite`
- `Supabase Auth`
- `profiles`
- permissões por papel
- gestão administrativa de usuários

## Checklist curto

1. criar DNS `crm.certifast.com.br`
2. subir o repositório na VPS em `/opt/certifast-crm`
3. rodar `bash deploy.sh`
4. validar HTTPS
5. depois iniciar a migração funcional do login e dos módulos para o padrão do `CRM_CertiID`
