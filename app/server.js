const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

function loadXlsx() {
  const candidates = [
    'xlsx',
    path.join(__dirname, 'node_modules', 'xlsx'),
    path.join(__dirname, '..', 'node_modules', 'xlsx'),
    'C:\\projetos\\CRM_CertiID\\node_modules\\xlsx',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      // tenta o próximo caminho
    }
  }

  throw new Error('Biblioteca xlsx não encontrada. Verifique o ambiente local.');
}

const XLSX = loadXlsx();
const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(APP_DIR, '..');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DATA_DIR = path.join(APP_DIR, 'data');
const RENEWAL_HISTORY_DIR = path.join(ROOT_DIR, 'RELATORIO DE RENOVAÇÃO');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PORT = Number(process.env.PORT || 3107);
const SESSION_SECRET = process.env.CERTIFAST_SESSION_SECRET || 'certifast-comissoes-secret';
const sessions = new Map();

const FILE_PATTERNS = {
  revenda: /^R-(\d{6})\.xlsx$/i,
  validacoes: /^V-(\d{6})\.xlsx$/i,
  parceiros: /^P-(\d{6})\.xlsx$/i,
};

const MONTH_MAP = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  marco: '03',
  março: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
};

ensureDataFiles();

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(USERS_FILE)) {
    const bootstrapUser = {
      id: crypto.randomUUID(),
      nome: 'Administrador',
      email: 'admin@certifast.local',
      role: 'admin',
      participantIds: [],
      passwordHash: hashPassword('admin123'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [bootstrapUser] }, null, 2), 'utf8');
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function readUsers() {
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.users) ? parsed.users : [];
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*\d+#/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCurrency(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toSheetObjects(filePath, sheetName) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (error) {
    throw new Error('JSON inválido.');
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Acesso negado.');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, 'Arquivo não encontrado.');
    return;
  }

  res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, item) => {
    const [rawKey, ...rest] = item.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function signToken(token) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
}

function createSession(res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  const signature = signToken(token);
  sessions.set(token, { userId: user.id, createdAt: Date.now() });
  res.setHeader('Set-Cookie', `certifast_session=${token}.${signature}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSession(req, res) {
  const cookies = parseCookies(req);
  const raw = cookies.certifast_session || '';
  const [token] = raw.split('.');
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'certifast_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const raw = cookies.certifast_session || '';
  const [token, signature] = raw.split('.');
  if (!token || !signature) return null;
  if (signToken(token) !== signature) return null;
  const session = sessions.get(token);
  if (!session) return null;
  const user = readUsers().find(item => item.id === session.userId);
  return user || null;
}

function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Sessão expirada. Faça login novamente.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Acesso restrito ao administrador.' });
    return null;
  }
  return user;
}

function classifyFile(name) {
  if (FILE_PATTERNS.revenda.test(name)) return 'revenda';
  if (FILE_PATTERNS.validacoes.test(name)) return 'validacoes';
  if (FILE_PATTERNS.parceiros.test(name)) return 'parceiros';
  if (extractRenewalPeriod(name)) return 'renovacoes';
  return null;
}

function periodFromName(name) {
  const match = name.match(/-(\d{6})\.xlsx$/i);
  if (match) return match[1];
  return extractRenewalPeriod(name);
}

function extractRenewalPeriod(name) {
  const text = normalizeText(path.basename(name));
  const patterns = [
    /^RENOVACAO\s+(\d{2,4})\s+([A-Z]+)\.XLSX$/,
    /^RENOVACAO\s+([A-Z]+)\s+(\d{4})\.XLSX$/,
    /^RELATORIORENOVACAOANALITICO\s+(\d{2})_(\d{2})\.XLSX$/,
    /^RELATORIORENOVACAO\s+([A-Z]+)(\d{2})\.XLSX$/,
    /^RELATORIORENOVACAO([A-Z]+)(\d{4})\.XLSX$/,
    /^(\d{2})\s+([A-Z]+)\.(XLSX|XLS|CSV)$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === patterns[0]) {
      const year = match[1].length === 2 ? `20${match[1]}` : match[1];
      const month = MONTH_MAP[match[2].toLowerCase()];
      if (month) return `${month}${year}`;
    }

    if (pattern === patterns[1]) {
      const month = MONTH_MAP[match[1].toLowerCase()];
      if (month) return `${month}${match[2]}`;
    }

    if (pattern === patterns[2]) {
      return `${match[1]}20${match[2]}`;
    }

    if (pattern === patterns[3]) {
      const month = MONTH_MAP[match[1].toLowerCase()];
      if (month) return `${month}20${match[2]}`;
    }

    if (pattern === patterns[4]) {
      const month = MONTH_MAP[match[1].toLowerCase()];
      if (month) return `${month}${match[2]}`;
    }

    if (pattern === patterns[5]) {
      const month = MONTH_MAP[match[2].toLowerCase()];
      if (month) return `${month}20${match[1]}`;
    }
  }

  return null;
}

function isManagedSpreadsheet(name) {
  return Boolean(classifyFile(name));
}

function collectManagedSpreadsheetPaths() {
  const paths = [];

  for (const entry of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(ROOT_DIR, entry.name);
    if (isManagedSpreadsheet(entry.name)) paths.push(fullPath);
  }

  if (fs.existsSync(RENEWAL_HISTORY_DIR)) {
    for (const entry of fs.readdirSync(RENEWAL_HISTORY_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(RENEWAL_HISTORY_DIR, entry.name);
      if (isManagedSpreadsheet(entry.name)) paths.push(fullPath);
    }
  }

  return paths;
}

function listManagedFiles() {
  return collectManagedSpreadsheetPaths()
    .map(fullPath => {
      const name = path.basename(fullPath);
      const stat = fs.statSync(fullPath);
      return {
        name,
        relativePath: path.relative(ROOT_DIR, fullPath),
        type: classifyFile(name),
        period: periodFromName(name),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        deletable: path.dirname(fullPath) === ROOT_DIR,
      };
    })
    .sort((a, b) => (b.period || '').localeCompare(a.period || '') || a.name.localeCompare(b.name));
}

function getPeriodFiles(period) {
  const revenda = path.join(ROOT_DIR, `R-${period}.xlsx`);
  const validacoes = path.join(ROOT_DIR, `V-${period}.xlsx`);
  const parceiros = path.join(ROOT_DIR, `P-${period}.xlsx`);
  const renovacoes = listManagedFiles().find(file => file.type === 'renovacoes' && file.period === period);
  return { revenda, validacoes, parceiros, renovacoes: renovacoes ? path.join(ROOT_DIR, renovacoes.relativePath) : null };
}

function getAvailablePeriods() {
  const periods = new Set();
  for (const file of listManagedFiles()) {
    if (file.period) periods.add(file.period);
  }
  return Array.from(periods).sort((a, b) => b.localeCompare(a));
}

function formatPeriod(period) {
  if (!period || period.length !== 6) return period;
  return `${period.slice(0, 2)}/${period.slice(2)}`;
}

function buildParticipantMap(period) {
  const { parceiros } = getPeriodFiles(period);
  if (!fs.existsSync(parceiros)) {
    return { participants: [], byId: new Map() };
  }

  const partnerRows = toSheetObjects(parceiros, 'Parceiros');
  const byId = new Map();

  for (const row of partnerRows) {
    const vendedor = String(row['Nome Vendedor'] || '').trim();
    const validador = String(row['Nome Validador'] || '').trim();
    const displayName = validador || vendedor;
    if (!displayName) continue;

    const participantId = slugify(displayName || vendedor);
    const vendorNormalized = normalizeText(vendedor || displayName);
    const validatorNormalized = normalizeText(validador || displayName);

    const participant = {
      id: participantId,
      nome: displayName,
      nomeVendedor: vendedor,
      nomeValidador: validador,
      vendorKeys: Array.from(new Set([vendorNormalized, validatorNormalized].filter(Boolean))),
      validatorKeys: Array.from(new Set([validatorNormalized, vendorNormalized].filter(Boolean))),
      fantasia: String(row['FANTASIA'] || '').trim(),
      faixa: String(row['COMISSAO'] || '').trim(),
      imposto: parseCurrency(row['Imposto']),
      contabilidade: parseCurrency(row['Contabilidade']),
      verificacao: parseCurrency(row['Verificação']),
      percentualVenda: parseCurrency(row['% Venda']),
      percentualSoftware: parseCurrency(row['% Software']),
      percentualHardware: parseCurrency(row['% Hardware']),
      email: String(row['E-MAIL'] || '').trim(),
      codigoRevenda: String(row['CODREV'] || '').trim(),
    };

    byId.set(participantId, participant);
  }

  return { participants: Array.from(byId.values()).sort((a, b) => a.nome.localeCompare(b.nome)), byId };
}

function matchParticipant(rowValue, keys) {
  const current = normalizeText(rowValue);
  return keys.includes(current);
}

function buildReport(period, participantFilterIds = []) {
  const { revenda, validacoes, parceiros } = getPeriodFiles(period);
  if (!fs.existsSync(parceiros) || !fs.existsSync(revenda) || !fs.existsSync(validacoes)) {
    throw new Error(`Arquivos do período ${formatPeriod(period)} estão incompletos. É necessário ter P, R e V.`);
  }

  const { participants, byId } = buildParticipantMap(period);
  const salesRows = toSheetObjects(revenda);
  const validationRows = toSheetObjects(validacoes);

  const filterSet = new Set(participantFilterIds.filter(Boolean));
  const activeParticipants = filterSet.size
    ? participants.filter(item => filterSet.has(item.id))
    : participants;

  const consolidated = activeParticipants.map(participant => {
    const participantSales = salesRows.filter(row => matchParticipant(row['Nome Vendedor'], participant.vendorKeys));
    const participantValidations = validationRows.filter(row => matchParticipant(row['Desc. Agente Val.'], participant.validatorKeys));

    const vendas = {
      quantidade: participantSales.length,
      faturamento: participantSales.reduce((sum, row) => sum + parseCurrency(row['Val. Faturamento']), 0),
      comissao: participantSales.reduce((sum, row) => sum + parseCurrency(row['Valor Tot. Comiss.']), 0),
      itens: participantSales.map(row => ({
        pedido: String(row['Pedido'] || ''),
        cliente: String(row['Nome Cliente'] || ''),
        dataPedido: String(row['Dt.Pedido'] || ''),
        dataVerificacao: String(row['Dt.Verificação'] || ''),
        produto: String(row['Desc.Produto'] || ''),
        faturamento: parseCurrency(row['Val. Faturamento']),
        comissao: parseCurrency(row['Valor Tot. Comiss.']),
        status: String(row['Status Pedido'] || ''),
      })),
    };

    const validacoes = {
      quantidade: participantValidations.length,
      brutoSoftware: participantValidations.reduce((sum, row) => sum + parseCurrency(row['Val. Bruto Soft']), 0),
      brutoHardware: participantValidations.reduce((sum, row) => sum + parseCurrency(row['Val. Bruto Hard']), 0),
      comissaoSoftware: participantValidations.reduce((sum, row) => sum + parseCurrency(row['Val. Comiss. Soft']), 0),
      comissaoHardware: participantValidations.reduce((sum, row) => sum + parseCurrency(row['Val. Comiss. Hard']), 0),
      itens: participantValidations.map(row => ({
        pedido: String(row['Pedido'] || ''),
        cliente: String(row['Nome Cliente'] || ''),
        dataPedido: String(row['Dt.Pedido'] || ''),
        dataValidacao: String(row['Dt.Validação'] || ''),
        produto: String(row['Produto'] || ''),
        brutoSoftware: parseCurrency(row['Val. Bruto Soft']),
        brutoHardware: parseCurrency(row['Val. Bruto Hard']),
        comissaoSoftware: parseCurrency(row['Val. Comiss. Soft']),
        comissaoHardware: parseCurrency(row['Val. Comiss. Hard']),
        status: String(row['Status Pedido'] || ''),
      })),
    };

    validacoes.total = validacoes.comissaoSoftware + validacoes.comissaoHardware;

    const bruto = vendas.comissao + validacoes.total;
    const imposto = participant.imposto > 0 && participant.imposto < 1
      ? bruto * participant.imposto
      : participant.imposto;
    const contabilidade = participant.contabilidade;
    const totalReceber = bruto - imposto - contabilidade;

    return {
      participantId: participant.id,
      agente: participant.nome,
      fantasia: participant.fantasia,
      faixa: participant.faixa,
      email: participant.email,
      vendas,
      validacoes,
      resumo: {
        bruto,
        imposto,
        contabilidade,
        totalReceber,
      },
      configuracao: {
        percentualVenda: participant.percentualVenda,
        percentualSoftware: participant.percentualSoftware,
        percentualHardware: participant.percentualHardware,
        verificacao: participant.verificacao,
      },
    };
  });

  const resumoGeral = consolidated.reduce((acc, item) => {
    acc.qtdeParticipantes += 1;
    acc.qtdeVendas += item.vendas.quantidade;
    acc.qtdeValidacoes += item.validacoes.quantidade;
    acc.comissaoVendas += item.vendas.comissao;
    acc.comissaoValidacoes += item.validacoes.total;
    acc.contabilidade += item.resumo.contabilidade;
    acc.imposto += item.resumo.imposto;
    acc.totalReceber += item.resumo.totalReceber;
    return acc;
  }, {
    qtdeParticipantes: 0,
    qtdeVendas: 0,
    qtdeValidacoes: 0,
    comissaoVendas: 0,
    comissaoValidacoes: 0,
    contabilidade: 0,
    imposto: 0,
    totalReceber: 0,
  });

  return {
    period,
    periodLabel: formatPeriod(period),
    generatedAt: new Date().toISOString(),
    participants: consolidated,
    resumoGeral,
    participantCatalog: participants.map(item => ({
      id: item.id,
      nome: item.nome,
      fantasia: item.fantasia,
      faixa: item.faixa,
    })),
  };
}

function documentKey(row) {
  const cnpj = normalizeText(String(row['CNPJ'] || '').replace(/[^\d]/g, ''));
  const cpf = normalizeText(String(row['CPF'] || '').replace(/[^\d]/g, ''));
  const email = normalizeText(row['Email']);
  const telefone = normalizeText(String(row['Telefone'] || '').replace(/[^\d]/g, ''));
  const cliente = normalizeText(row['Cliente'] || row['Nome Cliente'] || '');

  return cnpj || cpf || email || telefone || cliente;
}

function parseRenewalRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    rows.push(...sheetRows);
  }

  return rows.map(row => {
    const key = documentKey(row);
    const dueDate = String(row['Data de Vencimento'] || '').trim();
    return {
      key,
      pedido: String(row['Pedido'] || '').trim(),
      dataVencimento: dueDate,
      cliente: String(row['Cliente'] || '').trim(),
      email: String(row['Email'] || '').trim(),
      telefone: String(row['Telefone'] || row['Tele'] || '').trim(),
      produto: String(row['Produto'] || '').trim(),
      ar: String(row['AR'] || '').trim(),
      pontoAtendimento: String(row['Ponto de Atendimento'] || row['Agente'] || '').trim(),
      agente: String(row['Agente'] || row['Desc. Agente Val.'] || '').trim(),
      statusPedido: String(row['Status do Pedido'] || '').trim(),
      cpf: String(row['CPF'] || '').trim(),
      cnpj: String(row['CNPJ'] || '').trim(),
      razaoSocial: String(row['Razão Social'] || '').trim(),
    };
  }).filter(row => row.key);
}

function parseBusinessKeysFromPeriod(period) {
  const { revenda, validacoes } = getPeriodFiles(period);
  const keys = new Set();

  if (fs.existsSync(revenda)) {
    for (const row of toSheetObjects(revenda)) {
      const key = documentKey({
        Cliente: row['Nome Cliente'],
        Email: '',
        Telefone: '',
        CPF: '',
        CNPJ: '',
      });
      if (key) keys.add(key);
    }
  }

  if (fs.existsSync(validacoes)) {
    for (const row of toSheetObjects(validacoes)) {
      const key = documentKey({
        Cliente: row['Nome Cliente'],
        Email: '',
        Telefone: '',
        CPF: '',
        CNPJ: '',
      });
      if (key) keys.add(key);
    }
  }

  return keys;
}

function groupCount(items, selector) {
  const map = new Map();
  for (const item of items) {
    const key = selector(item) || 'Não informado';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function buildRenewalAnalysis(period) {
  const renewalFiles = listManagedFiles().filter(file => file.type === 'renovacoes');
  const currentFile = renewalFiles.find(file => file.period === period);

  if (!currentFile) {
    throw new Error(`Não encontrei planilha de renovação para ${formatPeriod(period)}.`);
  }

  const currentRows = parseRenewalRows(path.join(ROOT_DIR, currentFile.relativePath));
  const previousFiles = renewalFiles.filter(file => file.period < period);
  const historyKeys = new Set();
  const sameMonthLastYearPeriod = `${period.slice(0, 2)}${String(Number(period.slice(2)) - 1)}`;
  const sameMonthLastYearFile = renewalFiles.find(file => file.period === sameMonthLastYearPeriod);
  const sameMonthLastYearKeys = new Set(
    sameMonthLastYearFile
      ? parseRenewalRows(path.join(ROOT_DIR, sameMonthLastYearFile.relativePath)).map(item => item.key)
      : []
  );

  for (const file of previousFiles) {
    for (const row of parseRenewalRows(path.join(ROOT_DIR, file.relativePath))) {
      historyKeys.add(row.key);
    }
  }

  const convertedKeys = parseBusinessKeysFromPeriod(period);
  const enriched = currentRows.map(row => ({
    ...row,
    jaEsteveNaBase: historyKeys.has(row.key),
    esteveNoMesmoMesAnoAnterior: sameMonthLastYearKeys.has(row.key),
    renovouAgora: convertedKeys.has(row.key),
  }));

  const convertidos = enriched.filter(item => item.renovouAgora);
  const pendentes = enriched.filter(item => !item.renovouAgora);
  const recorrentes = enriched.filter(item => item.jaEsteveNaBase);
  const recorrentesAnoAnterior = enriched.filter(item => item.esteveNoMesmoMesAnoAnterior);
  const convertidosRecorrentes = convertidos.filter(item => item.jaEsteveNaBase);
  const convertidosAnoAnterior = convertidos.filter(item => item.esteveNoMesmoMesAnoAnterior);
  const perdidosRecorrentes = pendentes.filter(item => item.jaEsteveNaBase);
  const perdidosAnoAnterior = pendentes.filter(item => item.esteveNoMesmoMesAnoAnterior);
  const novosNaBase = enriched.filter(item => !item.jaEsteveNaBase);

  const taxaRenovacao = enriched.length ? convertidos.length / enriched.length : 0;
  const taxaRecorrente = enriched.length ? recorrentes.length / enriched.length : 0;
  const taxaPerdaRecorrente = recorrentes.length ? perdidosRecorrentes.length / recorrentes.length : 0;
  const taxaConversaoAnoAnterior = recorrentesAnoAnterior.length ? convertidosAnoAnterior.length / recorrentesAnoAnterior.length : 0;

  return {
    period,
    periodLabel: formatPeriod(period),
    totalBase: enriched.length,
    convertidos: convertidos.length,
    pendentes: pendentes.length,
    recorrentes: recorrentes.length,
    recorrentesAnoAnterior: recorrentesAnoAnterior.length,
    novosNaBase: novosNaBase.length,
    recuperados: convertidosRecorrentes.length,
    perdidosRecorrentes: perdidosRecorrentes.length,
    convertidosAnoAnterior: convertidosAnoAnterior.length,
    perdidosAnoAnterior: perdidosAnoAnterior.length,
    indicadores: {
      taxaRenovacao,
      taxaRecorrente,
      taxaPerdaRecorrente,
      taxaConversaoAnoAnterior,
    },
    oportunidadesPorProduto: groupCount(pendentes, item => item.produto),
    oportunidadesPorPonto: groupCount(pendentes, item => item.pontoAtendimento),
    oportunidadesPorAgente: groupCount(pendentes, item => item.agente),
    oportunidadesPorStatus: groupCount(pendentes, item => item.statusPedido),
    oportunidadesPorAr: groupCount(pendentes, item => item.ar),
    convertidosPorProduto: groupCount(convertidos, item => item.produto),
    convertidosPorPonto: groupCount(convertidos, item => item.pontoAtendimento),
    lista: enriched,
  };
}

function collectParticipantCatalog() {
  const latestPeriod = getAvailablePeriods()[0];
  if (!latestPeriod) return [];
  return buildParticipantMap(latestPeriod).participants.map(item => ({
    id: item.id,
    nome: item.nome,
    fantasia: item.fantasia,
    faixa: item.faixa,
  }));
}

function getAccessibleParticipantIds(user) {
  return user.role === 'admin' ? [] : Array.from(new Set(user.participantIds || []));
}

function buildBootstrapPayload(user) {
  return {
    me: sanitizeUser(user),
    files: listManagedFiles(),
    periods: getAvailablePeriods().map(period => ({ value: period, label: formatPeriod(period) })),
    participants: collectParticipantCatalog(),
    defaultAdminCredentialsHint: user.role === 'admin' && user.email === 'admin@certifast.local'
      ? 'Usuário inicial: admin@certifast.local | Senha inicial: admin123'
      : null,
  };
}

async function handleApi(req, res, pathname, searchParams) {
  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = readUsers().find(item => item.email.toLowerCase() === email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      sendJson(res, 401, { error: 'Email ou senha inválidos.' });
      return;
    }

    createSession(res, user);
    sendJson(res, 200, { ok: true, data: buildBootstrapPayload(user) });
    return;
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    clearSession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { ok: true, data: buildBootstrapPayload(user) });
    return;
  }

  if (pathname === '/api/report' && req.method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;

    const period = String(searchParams.get('period') || '').trim();
    if (!/^\d{6}$/.test(period)) {
      sendJson(res, 400, { error: 'Período inválido. Use MMAAAA.' });
      return;
    }

    const requested = String(searchParams.get('participantId') || '').trim();
    const allowedIds = getAccessibleParticipantIds(user);
    const participantIds = user.role === 'admin'
      ? (requested ? [requested] : [])
      : allowedIds;

    if (user.role !== 'admin' && requested && !allowedIds.includes(requested)) {
      sendJson(res, 403, { error: 'Você não pode acessar esse participante.' });
      return;
    }

    try {
      const report = buildReport(period, requested ? [requested] : participantIds);
      sendJson(res, 200, { ok: true, data: report });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/files' && req.method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { ok: true, data: listManagedFiles() });
    return;
  }

  if (pathname === '/api/files' && req.method === 'POST') {
    const user = requireAdmin(req, res);
    if (!user) return;

    const body = await readJson(req);
    const originalName = String(body.name || '').trim();
    const contentBase64 = String(body.contentBase64 || '').trim();

    if (!isManagedSpreadsheet(originalName)) {
      sendJson(res, 400, { error: 'Nome inválido. Use R-MMAAAA.xlsx, V-MMAAAA.xlsx, P-MMAAAA.xlsx ou Renovação AA mmm.xlsx.' });
      return;
    }

    if (!contentBase64) {
      sendJson(res, 400, { error: 'Arquivo não enviado.' });
      return;
    }

    const targetPath = path.join(ROOT_DIR, originalName);
    const buffer = Buffer.from(contentBase64, 'base64');
    fs.writeFileSync(targetPath, buffer);

    sendJson(res, 200, {
      ok: true,
      message: `Arquivo ${originalName} salvo com sucesso.`,
      data: listManagedFiles(),
    });
    return;
  }

  if (pathname.startsWith('/api/files/') && req.method === 'DELETE') {
    const user = requireAdmin(req, res);
    if (!user) return;

    const fileName = decodeURIComponent(pathname.replace('/api/files/', ''));
    if (!isManagedSpreadsheet(fileName)) {
      sendJson(res, 400, { error: 'Arquivo inválido.' });
      return;
    }

    const targetPath = path.join(ROOT_DIR, fileName);
    if (!fs.existsSync(targetPath)) {
      sendJson(res, 404, { error: 'Arquivo não encontrado.' });
      return;
    }

    fs.unlinkSync(targetPath);
    sendJson(res, 200, { ok: true, data: listManagedFiles() });
    return;
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    const user = requireAdmin(req, res);
    if (!user) return;
    sendJson(res, 200, {
      ok: true,
      data: {
        users: readUsers().map(sanitizeUser),
        participants: collectParticipantCatalog(),
      },
    });
    return;
  }

  if (pathname === '/api/renewals' && req.method === 'GET') {
    const user = requireAdmin(req, res);
    if (!user) return;

    const period = String(searchParams.get('period') || '').trim();
    if (!/^\d{6}$/.test(period)) {
      sendJson(res, 400, { error: 'Período inválido para renovação.' });
      return;
    }

    try {
      const analysis = buildRenewalAnalysis(period);
      sendJson(res, 200, { ok: true, data: analysis });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    const user = requireAdmin(req, res);
    if (!user) return;
    const body = await readJson(req);

    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'participant';
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map(item => String(item)).filter(Boolean)
      : [];

    if (!nome || !email || password.length < 6) {
      sendJson(res, 400, { error: 'Informe nome, email e uma senha com ao menos 6 caracteres.' });
      return;
    }

    const users = readUsers();
    if (users.some(item => item.email.toLowerCase() === email)) {
      sendJson(res, 400, { error: 'Já existe um usuário com esse email.' });
      return;
    }

    const newUser = {
      id: crypto.randomUUID(),
      nome,
      email,
      role,
      participantIds: role === 'admin' ? [] : participantIds,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.push(newUser);
    writeUsers(users);
    sendJson(res, 201, { ok: true, data: sanitizeUser(newUser) });
    return;
  }

  if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
    const body = await readJson(req);
    const users = readUsers();
    const index = users.findIndex(item => item.id === userId);

    if (index === -1) {
      sendJson(res, 404, { error: 'Usuário não encontrado.' });
      return;
    }

    const current = users[index];
    const nextEmail = String(body.email || current.email).trim().toLowerCase();
    if (users.some(item => item.id !== userId && item.email.toLowerCase() === nextEmail)) {
      sendJson(res, 400, { error: 'Já existe outro usuário com esse email.' });
      return;
    }

    const role = body.role === 'admin' ? 'admin' : 'participant';
    users[index] = {
      ...current,
      nome: String(body.nome || current.nome).trim(),
      email: nextEmail,
      role,
      participantIds: role === 'admin'
        ? []
        : (Array.isArray(body.participantIds) ? body.participantIds.map(item => String(item)).filter(Boolean) : current.participantIds),
      passwordHash: body.password ? hashPassword(String(body.password)) : current.passwordHash,
      updatedAt: new Date().toISOString(),
    };

    writeUsers(users);
    sendJson(res, 200, { ok: true, data: sanitizeUser(users[index]) });
    return;
  }

  if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
    const users = readUsers();
    const target = users.find(item => item.id === userId);
    if (!target) {
      sendJson(res, 404, { error: 'Usuário não encontrado.' });
      return;
    }

    if (target.email === 'admin@certifast.local' && target.role === 'admin') {
      sendJson(res, 400, { error: 'O usuário administrador inicial não pode ser excluído.' });
      return;
    }

    writeUsers(users.filter(item => item.id !== userId));
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Rota não encontrada.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname, url.searchParams);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Erro interno no servidor.' });
  }
});

server.listen(PORT, () => {
  console.log(`Certifast Comissões rodando em http://localhost:${PORT}`);
});
