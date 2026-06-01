const state = {
  me: null,
  files: [],
  periods: [],
  participants: [],
  users: [],
  activePage: 'dashboard',
  selectedPeriod: '',
  selectedParticipantId: '',
  report: null,
  renewalAnalysis: null,
  message: null,
  loading: false,
};

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMessage(type, text) {
  state.message = { type, text };
  render();
}

function clearMessage() {
  state.message = null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erro na requisição.');
  }
  return data;
}

async function bootstrap() {
  try {
    const response = await api('/api/me', { method: 'GET' });
    hydrate(response.data);
  } catch (error) {
    state.me = null;
    render();
  }
}

function hydrate(payload) {
  state.me = payload.me;
  state.files = payload.files || [];
  state.periods = payload.periods || [];
  state.participants = payload.participants || [];
  state.selectedPeriod = state.selectedPeriod || state.periods[0]?.value || '';
  if (state.me?.role !== 'admin') {
    state.selectedParticipantId = state.me?.participantIds?.[0] || '';
  }
  render();
}

async function submitLogin(event) {
  event.preventDefault();
  clearMessage();
  const form = new FormData(event.target);

  try {
    const response = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    hydrate(response.data);
    setMessage('ok', 'Login realizado com sucesso.');
  } catch (error) {
    setMessage('error', error.message);
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.me = null;
  state.report = null;
  state.users = [];
  setMessage('ok', 'Sessão encerrada.');
}

async function loadUsers() {
  const response = await api('/api/users', { method: 'GET' });
  state.users = response.data.users;
  state.participants = response.data.participants;
}

async function loadFiles() {
  const response = await api('/api/files', { method: 'GET' });
  state.files = response.data;
}

async function loadReport() {
  if (!state.selectedPeriod) {
    setMessage('error', 'Selecione um período.');
    return;
  }

  state.loading = true;
  render();

  try {
    const params = new URLSearchParams({ period: state.selectedPeriod });
    if (state.me.role === 'admin' && state.selectedParticipantId) {
      params.set('participantId', state.selectedParticipantId);
    }
    const response = await api(`/api/report?${params.toString()}`, { method: 'GET' });
    state.report = response.data;
    clearMessage();
  } catch (error) {
    state.report = null;
    setMessage('error', error.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadRenewals() {
  if (!state.selectedPeriod) {
    setMessage('error', 'Selecione um período para renovação.');
    return;
  }

  state.loading = true;
  render();

  try {
    const response = await api(`/api/renewals?period=${state.selectedPeriod}`, { method: 'GET' });
    state.renewalAnalysis = response.data;
    clearMessage();
  } catch (error) {
    state.renewalAnalysis = null;
    setMessage('error', error.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function submitUpload(event) {
  event.preventDefault();
  clearMessage();
  const input = document.getElementById('file-input');
  const files = Array.from(input.files || []);

  if (!files.length) {
    setMessage('error', 'Selecione pelo menos um arquivo.');
    return;
  }

  for (const file of files) {
    const contentBase64 = await readFileAsBase64(file);
    await api('/api/files', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, contentBase64 }),
    });
  }

  await loadFiles();
  await bootstrap();
  setMessage('ok', 'Arquivos enviados com sucesso.');
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

async function deleteFile(name) {
  if (!confirm(`Excluir ${name}?`)) return;
  await api(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await loadFiles();
  await bootstrap();
  setMessage('ok', 'Arquivo excluído.');
}

async function createUser(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const role = formData.get('role');
  const participantIds = Array.from(form.querySelectorAll('input[name="participantIds"]:checked')).map(item => item.value);

  await api('/api/users', {
    method: 'POST',
    body: JSON.stringify({
      nome: formData.get('nome'),
      email: formData.get('email'),
      password: formData.get('password'),
      role,
      participantIds,
    }),
  });

  form.reset();
  await loadUsers();
  setMessage('ok', 'Usuário criado.');
}

async function updateUser(userId) {
  const name = document.getElementById(`user-name-${userId}`).value;
  const email = document.getElementById(`user-email-${userId}`).value;
  const role = document.getElementById(`user-role-${userId}`).value;
  const password = document.getElementById(`user-password-${userId}`).value;
  const participantIds = Array.from(document.querySelectorAll(`input[data-user="${userId}"]:checked`)).map(item => item.value);

  await api(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      nome: name,
      email,
      role,
      password,
      participantIds,
    }),
  });

  await loadUsers();
  setMessage('ok', 'Usuário atualizado.');
}

async function deleteUser(userId, nome) {
  if (!confirm(`Excluir o usuário ${nome}?`)) return;
  await api(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await loadUsers();
  setMessage('ok', 'Usuário excluído.');
}

function navigate(page) {
  state.activePage = page;
  render();
  if (page === 'usuarios' && state.me?.role === 'admin') {
    loadUsers().then(render).catch(error => setMessage('error', error.message));
  }
}

function loginView() {
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="brand-kicker"><span class="brand-mark"></span>CRM Certifast</div>
        <h1>Comissões, clientes e renovações</h1>
        <p>Painel unificado para upload mensal, comissão híbrida por usuário e inteligência de renovação.</p>
        ${state.message ? `<div class="alert ${state.message.type === 'error' ? 'alert-error' : 'alert-ok'}">${escapeHtml(state.message.text)}</div>` : ''}
        <form class="form-grid" onsubmit="submitLogin(event)">
          <div class="field">
            <label>Email</label>
            <input type="email" name="email" placeholder="admin@certifast.local" required>
          </div>
          <div class="field">
            <label>Senha</label>
            <input type="password" name="password" placeholder="Sua senha" required>
          </div>
          <button class="btn btn-primary" type="submit">Entrar no sistema</button>
        </form>
        <p class="mini">Primeiro acesso padrão: <strong>admin@certifast.local</strong> / <strong>admin123</strong></p>
      </div>
    </div>
  `;
}

function sidebarView() {
  const pages = [
    ['dashboard', 'Painel'],
    ['relatorios', 'Relatórios'],
    ...(state.me.role === 'admin' ? [['renovacoes', 'Clientes e Renovações']] : []),
    ['arquivos', 'Arquivos'],
    ...(state.me.role === 'admin' ? [['usuarios', 'Usuários']] : []),
  ];

  return `
    <aside class="sidebar">
      <div class="brand-kicker"><span class="brand-mark"></span>CRM Certifast</div>
      <div class="page-title">
        <h1>Comissões</h1>
        <p>${escapeHtml(state.me.nome)}</p>
      </div>
      <div class="card">
        <div class="chip">${state.me.role === 'admin' ? 'Administrador' : 'Participante'}</div>
        <p class="mini">Períodos carregados: ${state.periods.length}</p>
        <p class="mini">Arquivos válidos: ${state.files.length}</p>
      </div>
      <div class="nav">
        ${pages.map(([id, label]) => `
          <button class="${state.activePage === id ? 'active' : ''}" onclick="navigate('${id}')">${label}</button>
        `).join('')}
      </div>
      <div class="actions" style="margin-top:24px">
        <button class="btn btn-secondary" onclick="logout()">Sair</button>
      </div>
    </aside>
  `;
}

function dashboardView() {
  const latestPeriod = state.periods[0]?.label || '-';
  return `
    <div class="stack">
      <div class="card">
        <div class="section-head">
          <div class="page-title">
            <h1>Painel rápido</h1>
            <p>Resumo do acervo mensal e do que já está pronto para consulta.</p>
          </div>
          ${state.me.role === 'admin' ? '<button class="btn btn-primary" onclick="navigate(\'arquivos\')">Enviar arquivos</button>' : ''}
        </div>
        <div class="grid grid-4">
          <div class="stat"><span>Último período</span><strong>${latestPeriod}</strong><small>Base detectada automaticamente</small></div>
          <div class="stat"><span>Total de períodos</span><strong>${state.periods.length}</strong><small>Meses com P, R ou V no diretório</small></div>
          <div class="stat"><span>Participantes</span><strong>${state.participants.length}</strong><small>Cadastro lido do último arquivo P</small></div>
          <div class="stat"><span>Arquivos válidos</span><strong>${state.files.length}</strong><small>Planilhas dentro do padrão Certifast</small></div>
        </div>
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Como o cálculo está sendo tratado</h2>
            <p class="muted">O sistema consolida validações e vendas no mesmo relatório do participante.</p>
          </div>
        </div>
        <div class="grid grid-3">
          <div class="stat"><span>Vendas</span><strong>R</strong><small>Usa o arquivo `R-MMAAAA.xlsx` para comissão de vendas.</small></div>
          <div class="stat"><span>Validações</span><strong>V</strong><small>Usa o arquivo `V-MMAAAA.xlsx` para software e hardware.</small></div>
          <div class="stat"><span>Parceiros</span><strong>P</strong><small>Usa o arquivo `P-MMAAAA.xlsx` para faixa, imposto e contabilidade.</small></div>
        </div>
      </div>
      ${state.me.role === 'admin' ? `
        <div class="card">
          <div class="section-head">
            <div>
              <h2>Camada comercial de renovação</h2>
              <p class="muted">A planilha de renovação agora alimenta oportunidade, histórico e conversão.</p>
            </div>
          </div>
          <div class="grid grid-3">
            <div class="stat"><span>Base de renovação</span><strong>Clientes</strong><small>Leitura mensal da planilha \`Renovação\`.</small></div>
            <div class="stat"><span>Cruzamento histórico</span><strong>Mês a mês</strong><small>Compara meses anteriores e mesmo mês de anos passados.</small></div>
            <div class="stat"><span>Oportunidade</span><strong>Conversão</strong><small>Separa quem renovou no mês contra os pendentes.</small></div>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="section-head">
            <div>
              <h2>Visão do participante</h2>
              <p class="muted">Seu acesso está focado no acompanhamento das próprias comissões.</p>
            </div>
          </div>
          <div class="grid grid-3">
            <div class="stat"><span>Comissão de vendas</span><strong>Individual</strong><small>Mostra só as vendas ligadas ao seu cadastro.</small></div>
            <div class="stat"><span>Comissão de validações</span><strong>Individual</strong><small>Mostra só as validações do seu vínculo.</small></div>
            <div class="stat"><span>Total líquido</span><strong>Direto</strong><small>Você acompanha bruto, desconto e valor previsto.</small></div>
          </div>
        </div>
      `}
    </div>
  `;
}

function filtersView() {
  const participantOptions = state.me.role === 'admin'
    ? `<option value="">Todos os participantes</option>${state.participants.map(item => `
        <option value="${item.id}" ${state.selectedParticipantId === item.id ? 'selected' : ''}>${escapeHtml(item.nome)}</option>
      `).join('')}`
    : '';

  return `
    <div class="card">
      <div class="toolbar">
        <div class="page-title">
          <h1>Relatórios mensais</h1>
          <p>Consulta híbrida de comissões por venda e validação.</p>
        </div>
        <div class="actions">
          <button class="btn btn-primary" onclick="loadReport()">Gerar relatório</button>
        </div>
      </div>
      <div class="grid ${state.me.role === 'admin' ? 'grid-3' : 'grid-2'}" style="margin-top:18px">
        <div class="field">
          <label>Período</label>
          <select onchange="state.selectedPeriod=this.value">
            ${state.periods.map(period => `
              <option value="${period.value}" ${state.selectedPeriod === period.value ? 'selected' : ''}>${period.label}</option>
            `).join('')}
          </select>
        </div>
        ${state.me.role === 'admin' ? `
          <div class="field">
            <label>Participante</label>
            <select onchange="state.selectedParticipantId=this.value">
              ${participantOptions}
            </select>
          </div>
        ` : `
          <div class="field">
            <label>Participante</label>
            <input value="${escapeHtml((state.participants.find(item => item.id === state.me.participantIds?.[0]) || {}).nome || state.me.nome)}" disabled>
          </div>
        `}
        <div class="field">
          <label>Status</label>
          <input value="${state.loading ? 'Processando relatório...' : 'Pronto para consulta'}" disabled>
        </div>
      </div>
    </div>
  `;
}

function reportView() {
  if (state.loading) {
    return '<div class="card"><div class="empty">Processando relatório...</div></div>';
  }

  if (!state.report) {
    return '<div class="card"><div class="empty">Nenhum relatório gerado ainda para esta sessão.</div></div>';
  }

  const resumo = state.report.resumoGeral;

  return `
    <div class="stack">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Resumo do período ${state.report.periodLabel}</h2>
            <p class="muted">Total consolidado com base nas planilhas P, R e V.</p>
          </div>
          <div class="chip">${state.report.participants.length} participante(s)</div>
        </div>
        <div class="grid grid-4">
          <div class="stat"><span>Comissão de vendas</span><strong>${money(resumo.comissaoVendas)}</strong><small>${resumo.qtdeVendas} venda(s)</small></div>
          <div class="stat"><span>Comissão de validações</span><strong>${money(resumo.comissaoValidacoes)}</strong><small>${resumo.qtdeValidacoes} validação(ões)</small></div>
          <div class="stat"><span>Descontos</span><strong>${money(resumo.contabilidade + resumo.imposto)}</strong><small>Contabilidade + imposto</small></div>
          <div class="stat"><span>Total líquido</span><strong>${money(resumo.totalReceber)}</strong><small>Valor previsto para pagamento</small></div>
        </div>
      </div>
      ${state.report.participants.map(participant => participantCard(participant)).join('')}
    </div>
  `;
}

function participantCard(participant) {
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(participant.agente)}</h2>
          <p class="muted">${escapeHtml(participant.fantasia || 'Sem unidade')} | Faixa ${escapeHtml(participant.faixa || '-')}</p>
        </div>
        <div class="inline-list">
          <span class="chip">${participant.vendas.quantidade} venda(s)</span>
          <span class="chip">${participant.validacoes.quantidade} validação(ões)</span>
          <span class="chip">${money(participant.resumo.totalReceber)}</span>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="stat"><span>Vendas</span><strong>${money(participant.vendas.comissao)}</strong><small>Faturamento ${money(participant.vendas.faturamento)}</small></div>
        <div class="stat"><span>Validações</span><strong>${money(participant.validacoes.total)}</strong><small>Soft ${money(participant.validacoes.comissaoSoftware)} | Hard ${money(participant.validacoes.comissaoHardware)}</small></div>
        <div class="stat"><span>Imposto</span><strong>${money(participant.resumo.imposto)}</strong><small>Base bruta ${money(participant.resumo.bruto)}</small></div>
        <div class="stat"><span>Líquido</span><strong>${money(participant.resumo.totalReceber)}</strong><small>Contabilidade ${money(participant.resumo.contabilidade)}</small></div>
      </div>
      <details style="margin-top:18px">
        <summary>Detalhamento de vendas</summary>
        <div class="detail-body">${participant.vendas.itens.length ? tableSales(participant.vendas.itens) : '<div class="empty">Sem vendas neste período.</div>'}</div>
      </details>
      <details style="margin-top:16px">
        <summary>Detalhamento de validações</summary>
        <div class="detail-body">${participant.validacoes.itens.length ? tableValidations(participant.validacoes.itens) : '<div class="empty">Sem validações neste período.</div>'}</div>
      </details>
    </div>
  `;
}

function tableSales(items) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Dt. Pedido</th>
            <th>Dt. Verificação</th>
            <th>Produto</th>
            <th class="money">Faturamento</th>
            <th class="money">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${escapeHtml(item.pedido)}</td>
              <td>${escapeHtml(item.cliente)}</td>
              <td>${escapeHtml(item.dataPedido)}</td>
              <td>${escapeHtml(item.dataVerificacao)}</td>
              <td>${escapeHtml(item.produto)}</td>
              <td class="money">${money(item.faturamento)}</td>
              <td class="money">${money(item.comissao)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function tableValidations(items) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Dt. Pedido</th>
            <th>Dt. Validação</th>
            <th>Produto</th>
            <th class="money">Bruto Soft</th>
            <th class="money">Bruto Hard</th>
            <th class="money">Com. Soft</th>
            <th class="money">Com. Hard</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${escapeHtml(item.pedido)}</td>
              <td>${escapeHtml(item.cliente)}</td>
              <td>${escapeHtml(item.dataPedido)}</td>
              <td>${escapeHtml(item.dataValidacao)}</td>
              <td>${escapeHtml(item.produto)}</td>
              <td class="money">${money(item.brutoSoftware)}</td>
              <td class="money">${money(item.brutoHardware)}</td>
              <td class="money">${money(item.comissaoSoftware)}</td>
              <td class="money">${money(item.comissaoHardware)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filesView() {
  return `
    <div class="stack">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Arquivos mensais</h2>
            <p class="muted">Base central de arquivos do CRM Certifast.</p>
          </div>
        </div>
        ${state.me.role === 'admin' ? `
          <div class="empty" style="margin-top:16px">
            O sistema também lê automaticamente o histórico da pasta <strong>RELATORIO DE RENOVAÇÃO</strong>. Esses arquivos históricos entram no cruzamento de clientes, mas não ficam disponíveis para exclusão pela interface.
          </div>
        ` : `
          <div class="empty" style="margin-top:16px">
            Esta área é apenas de consulta. O envio e a gestão de arquivos ficam restritos ao Administrador.
          </div>
        `}
        ${state.me.role === 'admin' ? `
          <form class="form-grid" onsubmit="submitUpload(event)">
            <div class="field">
              <label>Selecionar planilhas</label>
              <input id="file-input" type="file" accept=".xlsx" multiple>
            </div>
            <div class="actions">
              <button class="btn btn-primary" type="submit">Enviar arquivos</button>
            </div>
          </form>
        ` : '<div class="empty">Apenas o administrador pode enviar ou excluir planilhas.</div>'}
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>Período</th>
                <th>Tamanho</th>
                <th>Atualizado em</th>
                ${state.me.role === 'admin' ? '<th>Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${state.files.map(file => `
                <tr>
                  <td>${escapeHtml(file.name)}</td>
                  <td>${escapeHtml(file.relativePath && file.relativePath.includes('RELATORIO DE RENOVAÇÃO') ? 'Histórico de renovação' : 'Base principal')}</td>
                  <td>${escapeHtml(file.type)}</td>
                  <td>${escapeHtml(file.period ? `${file.period.slice(0, 2)}/${file.period.slice(2)}` : '-')}</td>
                  <td>${(file.size / 1024).toFixed(1)} KB</td>
                  <td>${formatDateTime(file.updatedAt)}</td>
                  ${state.me.role === 'admin' ? `<td>${file.deletable ? `<button class="btn btn-danger" onclick="deleteFile('${file.name.replace(/'/g, "\\'")}')">Excluir</button>` : '<span class="mini">Histórico protegido</span>'}</td>` : ''}
                </tr>
              `).join('') || '<tr><td colspan="7">Nenhum arquivo encontrado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function userForm() {
  return `
    <form class="form-grid" onsubmit="createUser(event)">
      <div class="grid grid-3">
        <div class="field">
          <label>Nome</label>
          <input name="nome" required>
        </div>
        <div class="field">
          <label>Email</label>
          <input name="email" type="email" required>
        </div>
        <div class="field">
          <label>Senha inicial</label>
          <input name="password" type="password" minlength="6" required>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label>Perfil</label>
          <select name="role" onchange="toggleCreateParticipantBox(this.value)">
            <option value="participant">Participante</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div class="field">
          <label>Participantes vinculados</label>
          <div id="create-participant-box" class="check-list">
            ${participantCheckboxes('create-participant', state.participants)}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="submit">Criar usuário</button>
      </div>
    </form>
  `;
}

function participantCheckboxes(prefix, participants, selected = [], userId = '') {
  return participants.map(item => `
    <label class="check-item">
      <input
        type="checkbox"
        name="participantIds"
        value="${item.id}"
        ${selected.includes(item.id) ? 'checked' : ''}
        ${userId ? `data-user="${userId}"` : ''}
      >
      <span>
        <strong>${escapeHtml(item.nome)}</strong><br>
        <span class="mini">${escapeHtml(item.fantasia || 'Sem unidade')} | ${escapeHtml(item.faixa || '-')}</span>
      </span>
    </label>
  `).join('') || '<div class="mini">Nenhum participante disponível no momento.</div>';
}

function usersView() {
  return `
    <div class="stack">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Criar usuário</h2>
            <p class="muted">Você cadastra quem acessa e define se a pessoa verá um ou mais participantes.</p>
          </div>
        </div>
        ${userForm()}
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Usuários cadastrados</h2>
            <p class="muted">Edite nome, email, senha e participantes vinculados.</p>
          </div>
        </div>
        <div class="stack">
          ${state.users.map(user => `
            <div class="card" style="box-shadow:none">
              <div class="grid grid-3">
                <div class="field">
                  <label>Nome</label>
                  <input id="user-name-${user.id}" value="${escapeHtml(user.nome)}">
                </div>
                <div class="field">
                  <label>Email</label>
                  <input id="user-email-${user.id}" value="${escapeHtml(user.email)}">
                </div>
                <div class="field">
                  <label>Perfil</label>
                  <select id="user-role-${user.id}" onchange="toggleUserParticipantBox('${user.id}', this.value)">
                    <option value="participant" ${user.role === 'participant' ? 'selected' : ''}>Participante</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-2" style="margin-top:12px">
                <div class="field">
                  <label>Nova senha</label>
                  <input id="user-password-${user.id}" type="password" placeholder="Preencha só se quiser alterar">
                </div>
                <div class="field">
                  <label>Participantes vinculados</label>
                  <div id="user-box-${user.id}" class="check-list" style="${user.role === 'admin' ? 'opacity:.45;pointer-events:none' : ''}">
                    ${participantCheckboxes(`user-${user.id}`, state.participants, user.participantIds || [], user.id)}
                  </div>
                </div>
              </div>
              <div class="actions" style="margin-top:14px">
                <button class="btn btn-primary" onclick="updateUser('${user.id}')">Salvar</button>
                ${user.email !== 'admin@certifast.local' ? `<button class="btn btn-danger" onclick="deleteUser('${user.id}','${escapeHtml(user.nome).replace(/'/g, "\\'")}')">Excluir</button>` : ''}
              </div>
            </div>
          `).join('') || '<div class="empty">Nenhum usuário cadastrado.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renewalView() {
  if (state.me.role !== 'admin') {
    return `
      <div class="card">
        <div class="empty">A análise de clientes e renovações é exclusiva do Administrador.</div>
      </div>
    `;
  }

  const analysis = state.renewalAnalysis;

  return `
    <div class="stack">
      <div class="card">
        <div class="toolbar">
          <div class="page-title">
            <h1>Clientes e renovações</h1>
            <p>Inteligência comercial para encontrar quem renovou, quem não renovou e onde estão as melhores oportunidades.</p>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="loadRenewals()">Analisar renovação</button>
          </div>
        </div>
        <div class="grid grid-2" style="margin-top:18px">
          <div class="field">
            <label>Período da renovação</label>
            <select onchange="state.selectedPeriod=this.value">
              ${state.periods.map(period => `
                <option value="${period.value}" ${state.selectedPeriod === period.value ? 'selected' : ''}>${period.label}</option>
              `).join('')}
            </select>
          </div>
          <div class="field">
            <label>Objetivo</label>
            <input value="Cruzar base atual com meses anteriores, anos anteriores e produção do mês" disabled>
          </div>
        </div>
      </div>
      ${state.loading ? '<div class="card"><div class="empty">Processando análise de renovação...</div></div>' : ''}
      ${!state.loading && !analysis ? '<div class="card"><div class="empty">Nenhuma análise de renovação gerada ainda.</div></div>' : ''}
      ${analysis ? renewalAnalysisView(analysis) : ''}
    </div>
  `;
}

function renewalAnalysisView(analysis) {
  return `
    <div class="stack">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Resumo da base ${analysis.periodLabel}</h2>
            <p class="muted">Leitura da planilha de renovação com cruzamento histórico e operacional.</p>
          </div>
        </div>
        <div class="grid grid-4">
          <div class="stat"><span>Total da base</span><strong>${analysis.totalBase}</strong><small>Clientes com vencimento no período</small></div>
          <div class="stat"><span>Renovaram</span><strong>${analysis.convertidos}</strong><small>Encontrados na produção do mês</small></div>
          <div class="stat"><span>Não renovaram</span><strong>${analysis.pendentes}</strong><small>Oportunidade comercial ativa</small></div>
          <div class="stat"><span>Recorrentes</span><strong>${analysis.recorrentes}</strong><small>Já estavam em bases anteriores</small></div>
        </div>
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Indicadores gerenciais</h2>
            <p class="muted">Leitura executiva para acompanhar carteira, perda e recuperação.</p>
          </div>
        </div>
        <div class="grid grid-4">
          <div class="stat"><span>Taxa de renovação</span><strong>${percent(analysis.indicadores.taxaRenovacao)}</strong><small>${analysis.convertidos} de ${analysis.totalBase} clientes</small></div>
          <div class="stat"><span>Carteira recorrente</span><strong>${percent(analysis.indicadores.taxaRecorrente)}</strong><small>${analysis.recorrentes} clientes já vistos antes</small></div>
          <div class="stat"><span>Perda recorrente</span><strong>${percent(analysis.indicadores.taxaPerdaRecorrente)}</strong><small>${analysis.perdidosRecorrentes} recorrentes ainda não renovaram</small></div>
          <div class="stat"><span>Conversão vs ano anterior</span><strong>${percent(analysis.indicadores.taxaConversaoAnoAnterior)}</strong><small>${analysis.convertidosAnoAnterior} de ${analysis.recorrentesAnoAnterior}</small></div>
        </div>
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Leitura de carteira</h2>
            <p class="muted">Separação entre clientes novos, recorrentes, recuperados e perdidos.</p>
          </div>
        </div>
        <div class="grid grid-4">
          <div class="stat"><span>Novos na base</span><strong>${analysis.novosNaBase}</strong><small>Não encontrados no histórico anterior</small></div>
          <div class="stat"><span>Recuperados</span><strong>${analysis.recuperados}</strong><small>Recorrentes que renovaram agora</small></div>
          <div class="stat"><span>Perdidos recorrentes</span><strong>${analysis.perdidosRecorrentes}</strong><small>Recorrentes sem renovação no período</small></div>
          <div class="stat"><span>Perdidos do mesmo mês anterior</span><strong>${analysis.perdidosAnoAnterior}</strong><small>Vieram do mesmo mês do ano anterior e não renovaram</small></div>
        </div>
      </div>
      <div class="grid grid-2">
        ${rankingCard('Oportunidades por produto', analysis.oportunidadesPorProduto)}
        ${rankingCard('Oportunidades por ponto', analysis.oportunidadesPorPonto)}
        ${rankingCard('Oportunidades por agente', analysis.oportunidadesPorAgente)}
        ${rankingCard('Oportunidades por status', analysis.oportunidadesPorStatus)}
        ${rankingCard('Oportunidades por AR', analysis.oportunidadesPorAr)}
        ${rankingCard('Convertidos por produto', analysis.convertidosPorProduto)}
        ${rankingCard('Convertidos por ponto', analysis.convertidosPorPonto)}
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Base detalhada</h2>
            <p class="muted">Cada cliente mostra se voltou da base antiga e se já converteu no mês atual.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Vencimento</th>
                <th>Produto</th>
                <th>Ponto</th>
                <th>Agente</th>
                <th>Status</th>
                <th>Histórico</th>
                <th>Conversão</th>
              </tr>
            </thead>
            <tbody>
              ${analysis.lista.map(item => `
                <tr>
                  <td>
                    <strong>${escapeHtml(item.cliente)}</strong><br>
                    <span class="mini">${escapeHtml(item.email || item.telefone || item.cnpj || item.cpf || '-')}</span>
                  </td>
                  <td>${escapeHtml(item.dataVencimento)}</td>
                  <td>${escapeHtml(item.produto)}</td>
                  <td>${escapeHtml(item.pontoAtendimento)}</td>
                  <td>${escapeHtml(item.agente || '-')}</td>
                  <td>${escapeHtml(item.statusPedido)}</td>
                  <td>${item.esteveNoMesmoMesAnoAnterior ? 'Mesmo mês ano anterior' : item.jaEsteveNaBase ? 'Já esteve em base anterior' : 'Novo na base'}</td>
                  <td>${item.renovouAgora ? 'Renovou no período' : 'Ainda não renovou'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function percent(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function rankingCard(title, items) {
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <h2>${title}</h2>
        </div>
      </div>
      ${items.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Variável</th><th class="money">Qtde</th></tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${escapeHtml(item.label)}</td>
                  <td class="money">${item.total}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty">Sem dados para este recorte.</div>'}
    </div>
  `;
}

function toggleCreateParticipantBox(role) {
  const box = document.getElementById('create-participant-box');
  box.style.opacity = role === 'admin' ? '0.45' : '1';
  box.style.pointerEvents = role === 'admin' ? 'none' : 'auto';
}

function toggleUserParticipantBox(userId, role) {
  const box = document.getElementById(`user-box-${userId}`);
  box.style.opacity = role === 'admin' ? '0.45' : '1';
  box.style.pointerEvents = role === 'admin' ? 'none' : 'auto';
}

function contentView() {
  if (state.activePage === 'dashboard') return dashboardView();
  if (state.activePage === 'renovacoes') return renewalView();
  if (state.activePage === 'arquivos') return filesView();
  if (state.activePage === 'usuarios') return usersView();
  return `
    <div class="stack">
      ${filtersView()}
      ${reportView()}
    </div>
  `;
}

function appView() {
  return `
    <div class="app-shell">
      ${sidebarView()}
      <main class="main">
        ${state.message ? `<div class="alert ${state.message.type === 'error' ? 'alert-error' : 'alert-ok'}" style="margin-bottom:16px">${escapeHtml(state.message.text)}</div>` : ''}
        ${contentView()}
      </main>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = state.me ? appView() : loginView();
}

window.submitLogin = submitLogin;
window.logout = logout;
window.navigate = navigate;
window.loadReport = loadReport;
window.loadRenewals = loadRenewals;
window.submitUpload = submitUpload;
window.deleteFile = deleteFile;
window.createUser = createUser;
window.updateUser = updateUser;
window.deleteUser = deleteUser;
window.toggleCreateParticipantBox = toggleCreateParticipantBox;
window.toggleUserParticipantBox = toggleUserParticipantBox;
window.state = state;

render();
bootstrap();
