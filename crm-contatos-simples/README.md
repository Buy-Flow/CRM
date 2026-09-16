# CRM Contatos — versão simples

Aplicação estática, mobile-first, criada de forma isolada na branch `crm-contatos-simples-novo`.

## Segurança do projeto existente

- Nenhum arquivo da branch `main` foi alterado.
- O CRM novo vive somente na pasta `crm-contatos-simples/` desta branch.
- A versão anterior do repositório também foi preservada na branch `backup-antes-crm-contatos-2026-09-16`.

## Recursos

- Importação `.xlsx`, `.xls` e `.csv`.
- Mapeamento automático dos cabeçalhos da planilha de contatos.
- Armazenamento dos contatos no IndexedDB do navegador; a lista pessoal não fica versionada no GitHub.
- Busca instantânea.
- Filtros combináveis por país, UF, DDD, contato realizado, status de prospecção, status do número, referência familiar, profissão/atividade, categoria, confiança e duplicidade.
- Ordenação A–Z, Z–A, recentes, antigos e próximo retorno.
- Status: Não contatado, Tentativa, Falou comigo, Retornar, Interessado, Sem interesse e Cliente.
- Ações rápidas de WhatsApp e ligação.
- Marcação de contato realizado.
- Observações, próximo contato e histórico de interações.
- Seleção e ações em massa.
- Exportação da lista filtrada para Excel.
- Paginação para manter desempenho com milhares de contatos.

## Arquivos

- `index.html` — interface.
- `styles.css` — design responsivo.
- `app.js` — banco local, filtros, importação, exportação e CRM.

## Observação sobre dados

Os contatos importados são salvos no navegador/dispositivo usando IndexedDB. Limpar os dados do site no navegador remove essa base local, portanto use a função de exportação para manter cópias de segurança quando necessário.
