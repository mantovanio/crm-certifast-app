# CRM Certifast

Sistema local para:

- login por usuário
- cadastro manual de usuários pelo administrador
- leitura das planilhas mensais `P`, `R`, `V`
- relatório híbrido de comissões por participante
- análise de clientes e renovações com cruzamento histórico

## Como rodar

```bash
cd app
npm start
```

Depois abra:

```text
http://localhost:3107
```

## Acesso inicial

- Email: `admin@certifast.local`
- Senha: `admin123`

## Regras usadas nesta versão

- `R-MMAAAA.xlsx`: base de vendas/comissão de vendas
- `V-MMAAAA.xlsx`: base de validações software/hardware
- `P-MMAAAA.xlsx`: faixa, imposto, contabilidade e vínculo do participante
- `Renovação AA mmm.xlsx`: base de clientes para oportunidade de renovação

## Cruzamentos

- comissão híbrida: soma vendas + validações por participante
- imposto: se vier como percentual no arquivo `P`, aplica sobre o bruto do participante
- total líquido: bruto - imposto - contabilidade
- renovação: compara a base atual com bases anteriores e tenta identificar conversão cruzando com a produção do mesmo período
