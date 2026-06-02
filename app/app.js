const CONFIG = {
  supabaseUrl: "https://qztvkruyjntiwxvkzbkp.supabase.co",
  supabaseAnonKey: "sb_publishable_OKy6GVbsZG6bAcNFL1P-dw_2igaVRfd",
  bucket: "crm-certifast-imports",
};

const AUTH_STORAGE_KEY = "crm-certifast-auth-v2";
const AUTH_MIGRATION_KEY = "crm-certifast-auth-migrated-v2";

const bootErrors = [];

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  bootErrors.push("A biblioteca do Supabase não carregou.");
}

if (!window.XLSX) {
  bootErrors.push("A biblioteca de planilhas XLSX não carregou.");
}

const createClient = window.supabase?.createClient;
clearLegacyAuthStorage();
const db = createClient
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const state = {
  session: null,
  profile: null,
  appMode: "remote",
  myParticipantIds: [],
  participants: [],
  participantLinks: [],
  profiles: [],
  files: [],
  periods: [],
  selectedPeriod: "",
  selectedParticipantId: "",
  activePage: "dashboard",
  loading: false,
  message: null,
  report: null,
  renewal: null,
  authMode: "login",
  hasAdmin: true,
  customLogoDataUrl: "",
  partnerSearch: "",
  partnerUnitFilter: "__all__",
  partnerSort: "pendencias",
  partnerPage: 1,
  userSearch: "",
  userRoleFilter: "__all__",
};

const PARTNER_PAGE_SIZE = 12;

const MONTH_MAP = {
  jan: "01",
  janeiro: "01",
  fev: "02",
  fevereiro: "02",
  mar: "03",
  marco: "03",
  março: "03",
  abr: "04",
  abril: "04",
  mai: "05",
  maio: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  set: "09",
  setembro: "09",
  out: "10",
  outubro: "10",
  nov: "11",
  novembro: "11",
  dez: "12",
  dezembro: "12",
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMessage(type, text) {
  state.message = { type, text };
  render();
}

function alertClass(type) {
  if (type === "error") return "alert-error";
  if (type === "warning") return "alert-warning";
  if (type === "info") return "alert-info";
  return "alert-ok";
}

function clearMessage() {
  state.message = null;
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";
  clearMessage();
  render();
}

function setPartnerSearch(value) {
  state.partnerSearch = String(value || "");
  state.partnerPage = 1;
  render();
}

function setPartnerUnitFilter(value) {
  state.partnerUnitFilter = String(value || "__all__");
  state.partnerPage = 1;
  render();
}

function setPartnerSort(value) {
  state.partnerSort = String(value || "pendencias");
  state.partnerPage = 1;
  render();
}

function setPartnerPage(page) {
  const nextPage = Math.max(1, Number(page || 1));
  state.partnerPage = nextPage;
  render();
}

function setUserSearch(value) {
  state.userSearch = String(value || "");
  render();
}

function setUserRoleFilter(value) {
  state.userRoleFilter = String(value || "__all__");
  render();
}

function resetAppSessionState() {
  state.session = null;
  state.profile = null;
  state.myParticipantIds = [];
  state.participants = [];
  state.files = [];
  state.profiles = [];
  state.participantLinks = [];
  state.report = null;
  state.renewal = null;
}

async function authenticateWithPassword(email, password) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = String(payload?.msg || payload?.message || "").trim();
      if (/Invalid login credentials/i.test(message)) {
        throw new Error("Email ou senha inválidos.");
      }
      if (/Email not confirmed/i.test(message)) {
        throw new Error("Seu email ainda não foi confirmado no Supabase. Confirme o email ou desative a confirmação obrigatória no painel.");
      }
      throw new Error(message || "Não foi possível autenticar agora.");
    }

    const { data, error } = await db.auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });

    if (error) throw error;
    return data.session;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("O login demorou demais para responder. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function loadCustomLogo() {
  try {
    state.customLogoDataUrl = window.localStorage.getItem("crm-certifast-custom-logo") || "";
  } catch {
    state.customLogoDataUrl = "";
  }
}

function clearLegacyAuthStorage() {
  try {
    if (window.localStorage.getItem(AUTH_MIGRATION_KEY) === "done") return;

    const legacyKeys = [
      `sb-${new URL(CONFIG.supabaseUrl).hostname.split(".")[0]}-auth-token`,
      "crm-certifast-auth",
      "crm-certifast-auth-v1",
    ];

    for (const key of legacyKeys) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }

    window.localStorage.setItem(AUTH_MIGRATION_KEY, "done");
  } catch {}
}

function saveCustomLogo(dataUrl) {
  try {
    if (dataUrl) {
      window.localStorage.setItem("crm-certifast-custom-logo", dataUrl);
    } else {
      window.localStorage.removeItem("crm-certifast-custom-logo");
    }
  } catch {}
  state.customLogoDataUrl = dataUrl || "";
  render();
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*\d+#/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCurrency(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function chunk(array, size = 500) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function isAdmin() {
  return state.profile?.role === "admin" && state.profile?.status === "active";
}

function currentParticipantLabel() {
  if (isAdmin()) return "Todos os participantes";
  const participant = state.participants.find((item) => item.id === state.myParticipantIds[0]);
  return participant?.nome || state.profile?.nome || "-";
}

function documentKeyFromRaw({ cpf = "", cnpj = "", email = "", telefone = "", cliente = "" }) {
  const cnpjKey = String(cnpj).replace(/[^\d]/g, "");
  const cpfKey = String(cpf).replace(/[^\d]/g, "");
  const emailKey = normalizeText(email).toLowerCase();
  const phoneKey = String(telefone).replace(/[^\d]/g, "");
  const clientKey = normalizeText(cliente);
  return cnpjKey || cpfKey || emailKey || phoneKey || clientKey;
}

function buildPeriodSort(period) {
  if (!period || period.length !== 6) return "";
  return `${period.slice(2)}${period.slice(0, 2)}`;
}

function formatPeriod(period) {
  if (!period || period.length !== 6) return period || "-";
  return `${period.slice(0, 2)}/${period.slice(2)}`;
}

function classifySpreadsheetName(name) {
  const upper = normalizeText(name);
  if (/^P-\d{6}\.XLSX$/.test(upper)) return { type: "parceiros", period: upper.match(/\d{6}/)[0], sourceArea: "principal" };
  if (/^R-\d{6}\.XLSX$/.test(upper)) return { type: "revenda", period: upper.match(/\d{6}/)[0], sourceArea: "principal" };
  if (/^V-\d{6}\.XLSX$/.test(upper)) return { type: "validacoes", period: upper.match(/\d{6}/)[0], sourceArea: "principal" };

  const renewalPeriods = extractRenewalPeriods(name);
  if (renewalPeriods.length) {
    return {
      type: "renovacoes",
      period: renewalPeriods[0],
      periods: renewalPeriods,
      sourceArea: /RELATORIORENOVACAO|^\d{2}\s+[A-Z]/.test(upper) ? "historico_renovacao" : "principal",
    };
  }

  return null;
}

function extractRenewalPeriods(name) {
  const upper = normalizeText(name);
  const periods = new Set();
  const addPeriod = (month, year) => {
    const mm = String(month || "").padStart(2, "0");
    const yyyy = String(year || "");
    if (/^\d{2}$/.test(mm) && /^\d{4}$/.test(yyyy)) periods.add(`${mm}${yyyy}`);
  };

  let match = upper.match(/^RENOVACAO\s+(\d{2,4})\s+([A-Z]+)\.XLSX$/);
  if (match) {
    addPeriod(MONTH_MAP[match[2].toLowerCase()], match[1].length === 2 ? `20${match[1]}` : match[1]);
  }

  match = upper.match(/^RENOVACAO\s+([A-Z]+)\s+(\d{4})\.XLSX$/);
  if (match) {
    addPeriod(MONTH_MAP[match[1].toLowerCase()], match[2]);
  }

  match = upper.match(/^RELATORIORENOVACAOANALITICO\s+(\d{2})_(\d{2})\.XLSX$/);
  if (match) {
    addPeriod(match[1], `20${match[2]}`);
  }

  match = upper.match(/^RELATORIORENOVACAOANALITICO\s+(\d{2})\s+E\s+(\d{2})_(\d{2})\.XLSX$/);
  if (match) {
    addPeriod(match[1], `20${match[3]}`);
    addPeriod(match[2], `20${match[3]}`);
  }

  match = upper.match(/^RELATORIORENOVACAO([A-Z]+)(\d{4})\.XLSX$/);
  if (match) {
    addPeriod(MONTH_MAP[match[1].toLowerCase()], match[2]);
  }

  match = upper.match(/^RELATORIORENOVACAO\s+([A-Z]+)(\d{2})\.XLSX$/);
  if (match) {
    addPeriod(MONTH_MAP[match[1].toLowerCase()], `20${match[2]}`);
  }

  match = upper.match(/^(\d{2})\s+([A-Z]+)\.(CSV|XLSX|XLS)$/);
  if (match) {
    addPeriod(MONTH_MAP[match[2].toLowerCase()], `20${match[1]}`);
  }

  match = upper.match(/^RENOVACAO\s+\d{2}([A-Z]+)\s+\d{2}([A-Z]+)\s+(\d{4})\.(XLSX|XLS)$/);
  if (match) {
    addPeriod(MONTH_MAP[match[1].toLowerCase()], match[3]);
    addPeriod(MONTH_MAP[match[2].toLowerCase()], match[3]);
  }

  return [...periods].sort((a, b) => buildPeriodSort(a).localeCompare(buildPeriodSort(b)));
}

function extractRenewalPeriod(name) {
  return extractRenewalPeriods(name)[0] || null;
}

const HEADER_SIGNALS = new Set([
  "PEDIDO",
  "DATA DE VENCIMENTO",
  "CLIENTE",
  "NOME CLIENTE",
  "EMAIL",
  "E-MAIL",
  "TELEFONE",
  "TELE",
  "PRODUTO",
  "AR",
  "PONTO DE ATENDIMENTO",
  "STATUS DO PEDIDO",
  "STATUS PEDIDO",
  "CPF",
  "CNPJ",
  "RAZAO SOCIAL",
  "NOME VENDEDOR",
  "NOME VALIDADOR",
  "DESC. AGENTE VAL.",
  "AGENTE",
]);

const ROW_ALIAS_GROUPS = [
  ["Cliente", ["Cliente", "Nome Cliente"]],
  ["Nome Cliente", ["Nome Cliente", "Cliente"]],
  ["Email", ["Email", "E-MAIL", "E-mail"]],
  ["Telefone", ["Telefone", "Tele", "Fone", "Celular"]],
  ["Tele", ["Tele", "Telefone"]],
  ["Data de Vencimento", ["Data de Vencimento", "Vencimento", "Data Vencimento"]],
  ["Status do Pedido", ["Status do Pedido", "Status Pedido", "Status"]],
  ["Status Pedido", ["Status Pedido", "Status do Pedido", "Status"]],
  ["Ponto de Atendimento", ["Ponto de Atendimento", "Ponto Atendimento"]],
  ["Razão Social", ["Razão Social", "Razao Social"]],
  ["Agente", ["Agente", "Desc. Agente Val."]],
  ["Desc. Agente Val.", ["Desc. Agente Val.", "Agente"]],
];

function cleanHeaderLabel(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeaderSignal(value) {
  return normalizeText(cleanHeaderLabel(value));
}

function scoreHeaderRow(cells) {
  return cells.reduce((score, cell) => score + (HEADER_SIGNALS.has(normalizeHeaderSignal(cell)) ? 1 : 0), 0);
}

function findBestHeaderRow(matrix) {
  let bestIndex = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 20);

  for (let index = 0; index < limit; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return { index: bestIndex, score: bestScore };
}

function enrichRowAliases(row) {
  const enriched = { ...row };

  for (const [targetKey, aliases] of ROW_ALIAS_GROUPS) {
    if (!String(enriched[targetKey] ?? "").trim()) {
      const sourceKey = aliases.find((alias) => String(enriched[alias] ?? "").trim());
      if (sourceKey) enriched[targetKey] = enriched[sourceKey];
    }
  }

  return enriched;
}

function parseSheetRows(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!matrix.length) return { rows: [], headerScore: 0 };

  const { index: headerIndex, score: headerScore } = findBestHeaderRow(matrix);
  const headers = (matrix[headerIndex] || []).map(cleanHeaderLabel);
  const rows = [];

  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] || [];
    if (!values.some((value) => String(value ?? "").trim())) continue;

    const row = {};
    headers.forEach((header, columnIndex) => {
      if (!header || /^__EMPTY/i.test(header)) return;
      row[header] = values[columnIndex] ?? "";
    });

    if (Object.keys(row).length) {
      rows.push(enrichRowAliases(row));
    }
  }

  return { rows, headerScore };
}

function parsePeriodFromDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getMonth() + 1).padStart(2, "0")}${value.getFullYear()}`;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 70000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(date.getTime())) {
      return `${String(date.getUTCMonth() + 1).padStart(2, "0")}${date.getUTCFullYear()}`;
    }
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${String(match[2]).padStart(2, "0")}${year}`;
  }

  match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${String(match[2]).padStart(2, "0")}${match[1]}`;
  }

  match = raw.match(/^(\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    return `${String(match[1]).padStart(2, "0")}${match[2]}`;
  }

  return null;
}

function extractRenewalRowPeriod(row) {
  return parsePeriodFromDateValue(
    row["Data de Vencimento"]
    || row["Vencimento"]
    || row["Data Vencimento"]
    || row["Data de vencimento"]
  );
}

function extractRenewalPeriodsFromRows(rows) {
  const periods = new Set();
  for (const row of rows) {
    const period = extractRenewalRowPeriod(row);
    if (period) periods.add(period);
  }
  return [...periods].sort((a, b) => buildPeriodSort(a).localeCompare(buildPeriodSort(b)));
}

function looksLikeRenewalRows(rows) {
  const keys = new Set();
  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row || {})) {
      keys.add(normalizeText(key));
    }
  }

  const signals = [
    "CLIENTE",
    "PEDIDO",
    "DATA DE VENCIMENTO",
    "PRODUTO",
    "STATUS DO PEDIDO",
    "PONTO DE ATENDIMENTO",
    "AGENTE",
    "AR",
  ];

  return signals.filter((signal) => keys.has(signal)).length >= 3;
}

function resolveImportInfo(fileName, rows, expectedType = null, expectedSourceArea = null) {
  let info = classifySpreadsheetName(fileName);

  if (expectedType === "renovacoes" && looksLikeRenewalRows(rows)) {
    const periods = info?.periods?.length ? info.periods : extractRenewalPeriodsFromRows(rows);
    if (!periods.length) {
      throw new Error(`Não consegui identificar o período do arquivo ${fileName}. Verifique se a planilha possui a coluna "Data de Vencimento".`);
    }

    info = {
      type: "renovacoes",
      period: periods[0],
      periods,
      sourceArea: expectedSourceArea || info?.sourceArea || "principal",
    };
  }

  if (!info) return null;

  if (expectedType === "renovacoes" && expectedSourceArea) {
    return { ...info, sourceArea: expectedSourceArea };
  }

  return info;
}

function groupRenewalRowsByPeriod(rows, fallbackPeriod = null) {
  const groups = new Map();

  for (const row of rows) {
    const period = extractRenewalRowPeriod(row) || fallbackPeriod;
    if (!period) continue;
    if (!groups.has(period)) groups.set(period, []);
    groups.get(period).push(row);
  }

  return groups;
}

async function readSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const parsed = parseSheetRows(sheet);
    if (parsed.rows.length) rows.push(...parsed.rows);
  }

  return rows;
}

async function requireAuth() {
  if (!db) throw new Error("Supabase indisponível no carregamento inicial.");
  const { data } = await db.auth.getSession();
  state.session = data.session;
  return data.session;
}

async function createOwnProfileFallback() {
  const user = state.session?.user;
  if (!user) throw new Error("Usuário não autenticado.");

  const payload = {
    id: user.id,
    nome: String(user.user_metadata?.nome || user.email?.split("@")[0] || "Usuário").trim(),
    email: String(user.email || "").trim(),
    role: "participant",
    status: "active",
  };

  const { error } = await db.from("crm_profiles").insert(payload);
  if (error) {
    throw new Error(
      "Seu usuário foi criado no Auth, mas o perfil do CRM não foi inicializado. Verifique se o SQL do Supabase foi executado corretamente."
    );
  }
}

async function loadProfile() {
  if (!state.session?.user) {
    state.profile = null;
    state.myParticipantIds = [];
    return;
  }

  const { data: existingProfile, error } = await db
    .from("crm_profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar seu perfil do CRM no Supabase.");
  }

  if (!existingProfile) {
    await createOwnProfileFallback();
  }

  const { data: profile, error: reloadError } = await db
    .from("crm_profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();

  if (reloadError) {
    throw new Error("Seu perfil do CRM não pôde ser recarregado após a autenticação.");
  }

  state.profile = profile;

  const { data: links } = await db
    .from("crm_profile_participants")
    .select("participant_id")
    .eq("profile_id", state.session.user.id);

  state.myParticipantIds = (links || []).map((item) => item.participant_id);
}

async function loadAdminBootstrapStatus() {
  const { data, error } = await db.rpc("crm_has_admin");
  if (error) {
    throw new Error("Não foi possível validar a configuração administrativa do CRM.");
  }
  state.hasAdmin = Boolean(data);
}

async function loadReferenceData() {
  if (!state.profile) return;

  if (isAdmin()) {
    const [{ data: participants }, { data: files }, { data: profiles }, { data: links }] = await Promise.all([
      db.from("crm_participants").select("*").order("nome"),
      db.from("crm_import_files").select("*").order("created_at", { ascending: false }),
      db.from("crm_profiles").select("*").order("nome"),
      db.from("crm_profile_participants").select("*"),
    ]);
    state.participants = participants || [];
    state.files = files || [];
    state.profiles = profiles || [];
    state.participantLinks = links || [];
  } else {
    const { data: participants } = await db
      .from("crm_participants")
      .select("*")
      .in("id", state.myParticipantIds.length ? state.myParticipantIds : ["00000000-0000-0000-0000-000000000000"]);
    state.participants = participants || [];
    state.files = [];
    state.profiles = [];
    state.participantLinks = [];
  }

  const periods = [...new Set((state.files || []).map((item) => item.period).filter(Boolean))]
    .sort((a, b) => buildPeriodSort(b).localeCompare(buildPeriodSort(a)))
    .map((value) => ({ value, label: formatPeriod(value) }));

  state.periods = periods;

  state.selectedPeriod = state.selectedPeriod || state.periods[0]?.value || "";
  if (!isAdmin()) state.selectedParticipantId = state.myParticipantIds[0] || "";
}

async function hydrateAuthenticatedState() {
  await loadAdminBootstrapStatus();
  if (state.session) {
    await loadProfile();
    await loadReferenceData();
  }
}

async function bootstrap() {
  try {
    await requireAuth();
    await hydrateAuthenticatedState();
    render();
  } catch (error) {
    if (db && state.session) {
      try {
        await db.auth.signOut({ scope: "local" });
      } catch {}
      resetAppSessionState();
      render();
      setMessage("warning", "A sessão anterior estava inconsistente e foi reiniciada. Faça login novamente.");
      return;
    }
    setMessage("error", error.message || "Erro ao carregar o CRM.");
  }
}

async function signIn(event) {
  event.preventDefault();
  clearMessage();
  const form = new FormData(event.target);
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "").trim();

  if (!db) {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }

  setLoading(true);
  try {
    try {
      await db.auth.signOut({ scope: "local" });
    } catch {}

    const session = await authenticateWithPassword(email, password);
    state.session = session;
    await hydrateAuthenticatedState();
    render();
    setMessage("ok", "Login realizado com sucesso.");
  } catch (error) {
    resetAppSessionState();
    render();
    setMessage("error", error.message || "Não foi possível autenticar agora.");
  } finally {
    setLoading(false);
  }
}

async function signUp(event) {
  event.preventDefault();
  if (!db) {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }
  clearMessage();
  const form = new FormData(event.target);
  const nome = String(form.get("nome") || "").trim();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  setLoading(true);
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });
  setLoading(false);

  if (error) {
    setMessage("error", error.message);
    return;
  }

  state.authMode = "login";
  render();

  if (!data.session) {
    setMessage("ok", "Cadastro criado. Se a confirmação de email estiver ativa no Supabase, confirme seu email antes de entrar.");
    return;
  }

  setMessage("ok", "Cadastro criado. Agora entre com email e senha.");
}

async function requestMagicLink(event) {
  event.preventDefault();
  clearMessage();

  if (!db) {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }

  const formElement = event.target.closest("form");
  const emailInput = formElement?.querySelector('input[name="email"]');
  const email = String(emailInput?.value || "").trim().toLowerCase();

  if (!email) {
    setMessage("error", "Informe seu email para receber o link de acesso.");
    emailInput?.focus();
    return;
  }

  setLoading(true);
  try {
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    });

    if (error) {
      if (/rate limit/i.test(error.message || "")) {
        throw new Error("O Supabase limitou o envio agora. Aguarde alguns minutos e tente novamente.");
      }
      throw error;
    }

    setMessage("ok", "Enviamos um link de acesso para seu e-mail. Abra a mensagem e clique no link para entrar.");
  } catch (error) {
    setMessage("error", error.message || "Não foi possível enviar o link de acesso.");
  } finally {
    setLoading(false);
  }
}

async function sendAccessLinkToProfile(profileId) {
  if (!db) throw new Error("Supabase não disponível no navegador.");
  await ensureAdmin();

  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile?.email) throw new Error("Este perfil não possui e-mail cadastrado.");

  setLoading(true);
  clearMessage();
  try {
    const { error } = await db.auth.signInWithOtp({
      email: String(profile.email).trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
    setMessage("ok", `Link de acesso enviado para ${profile.email}.`);
  } catch (error) {
    if (/rate limit/i.test(error.message || "")) {
      setMessage("error", "O Supabase limitou temporariamente o envio de e-mails. Aguarde alguns minutos e tente novamente.");
    } else {
      setMessage("error", error.message || "Não foi possível enviar o link de acesso.");
    }
  } finally {
    setLoading(false);
  }
}

async function sendPasswordResetToProfile(profileId) {
  if (!db) throw new Error("Supabase não disponível no navegador.");
  await ensureAdmin();

  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile?.email) throw new Error("Este perfil não possui e-mail cadastrado.");

  setLoading(true);
  clearMessage();
  try {
    const { error } = await db.auth.resetPasswordForEmail(String(profile.email).trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });

    if (error) throw error;
    setMessage("ok", `E-mail de redefinição de senha enviado para ${profile.email}.`);
  } catch (error) {
    if (/rate limit/i.test(error.message || "")) {
      setMessage("error", "O Supabase limitou temporariamente o envio de e-mails. Aguarde alguns minutos e tente novamente.");
    } else {
      setMessage("error", error.message || "Não foi possível enviar o e-mail de redefinição.");
    }
  } finally {
    setLoading(false);
  }
}

async function signOut() {
  if (!db) return;
  await db.auth.signOut();
  state.session = null;
  state.profile = null;
  state.report = null;
  state.renewal = null;
  state.hasAdmin = true;
  state.participants = [];
  state.profiles = [];
  state.files = [];
  state.participantLinks = [];
  render();
}

function setLoading(value) {
  state.loading = value;
  render();
}

async function ensureAdmin() {
  if (!isAdmin()) throw new Error("Acesso restrito ao administrador.");
}

async function claimFirstAdmin(event) {
  if (state.appMode === "local") {
    setMessage("ok", "Seu acesso já está em modo administrador local.");
    return;
  }
  event.preventDefault();
  if (!db) {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }
  clearMessage();
  if (!state.session?.user) {
    setMessage("error", "Faça login antes de ativar o administrador.");
    return;
  }

  const form = new FormData(event.target);
  const token = String(form.get("setup_token") || "").trim();
  if (!token) {
    setMessage("error", "Informe o token de ativação.");
    return;
  }

  setLoading(true);
  const { error } = await db.rpc("crm_claim_first_admin", { setup_token: token });
  setLoading(false);

  if (error) {
    setMessage("error", error.message);
    return;
  }

  await bootstrap();
  setMessage("ok", "Administrador inicial ativado com sucesso.");
}

async function upsertParticipants(rows) {
  await ensureAdmin();
  const records = [];

  for (const row of rows) {
    const nome = String(row["Nome Validador"] || row["Nome Vendedor"] || "").trim();
    if (!nome) continue;
    records.push({
      nome,
      slug: slugify(nome),
      nome_vendedor: String(row["Nome Vendedor"] || "").trim() || null,
      nome_validador: String(row["Nome Validador"] || "").trim() || null,
      fantasia: String(row["FANTASIA"] || "").trim() || null,
      faixa: String(row["COMISSAO"] || "").trim() || null,
      email: String(row["E-MAIL"] || "").trim() || null,
      codigo_revenda: String(row["CODREV"] || "").trim() || null,
      imposto: parseCurrency(row["Imposto"]),
      contabilidade: parseCurrency(row["Contabilidade"]),
      verificacao: parseCurrency(row["Verificação"]),
      percentual_venda: parseCurrency(row["% Venda"]),
      percentual_software: parseCurrency(row["% Software"]),
      percentual_hardware: parseCurrency(row["% Hardware"]),
      ativo: true,
    });
  }

  if (state.appMode === "local") {
    const current = storageGet(LOCAL_KEYS.participants, []);
    const bySlug = new Map(current.map((item) => [item.slug, item]));
    for (const record of records) {
      const existing = bySlug.get(record.slug);
      bySlug.set(record.slug, { ...existing, ...record, id: existing?.id || `local-${record.slug}` });
    }
    storageSet(LOCAL_KEYS.participants, [...bySlug.values()]);
    return;
  }

  for (const batch of chunk(records, 200)) {
    const { error } = await db.from("crm_participants").upsert(batch, { onConflict: "slug" });
    if (error) throw error;
  }
}

async function uploadRawFile(file, info, customPath = null) {
  if (state.appMode === "local") return null;
  const storagePath = customPath || `${info.sourceArea}/${info.type}/${info.period}/${Date.now()}-${file.name}`;
  const { error } = await db.storage.from(CONFIG.bucket).upload(storagePath, file, { upsert: true });
  if (error) throw error;
  return storagePath;
}

async function purgeExistingImport(info) {
  if (state.appMode === "local") {
    const files = storageGet(LOCAL_KEYS.files, []).filter((item) => !(item.file_type === info.type && item.period === info.period && item.source_area === info.sourceArea));
    storageSet(LOCAL_KEYS.files, files);
    if (info.type === "revenda") storageSet(LOCAL_KEYS.sales, storageGet(LOCAL_KEYS.sales, []).filter((item) => item.period !== info.period));
    if (info.type === "validacoes") storageSet(LOCAL_KEYS.validations, storageGet(LOCAL_KEYS.validations, []).filter((item) => item.period !== info.period));
    if (info.type === "renovacoes") storageSet(LOCAL_KEYS.renewals, storageGet(LOCAL_KEYS.renewals, []).filter((item) => !(item.period === info.period)));
    return;
  }
  const { data: existing, error } = await db
    .from("crm_import_files")
    .select("*")
    .eq("file_type", info.type)
    .eq("period", info.period)
    .eq("source_area", info.sourceArea);

  if (error) throw error;
  if (!existing?.length) return;

  const storagePaths = existing.map((item) => item.storage_path).filter(Boolean);
  if (storagePaths.length) {
    await db.storage.from(CONFIG.bucket).remove(storagePaths);
  }

  const { error: deleteError } = await db
    .from("crm_import_files")
    .delete()
    .in("id", existing.map((item) => item.id));

  if (deleteError) throw deleteError;
}

async function createImportFile(file, info, storagePath) {
  if (state.appMode === "local") {
    const localFile = {
      id: `local-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file_name: file.name,
      file_type: info.type,
      period: info.period,
      source_area: info.sourceArea,
      storage_path: null,
      file_size_bytes: file.size,
      imported_by: state.profile.id,
      created_at: new Date().toISOString(),
    };
    const files = storageGet(LOCAL_KEYS.files, []);
    files.unshift(localFile);
    storageSet(LOCAL_KEYS.files, files);
    return localFile;
  }

  const payload = {
    file_name: file.name,
    file_type: info.type,
    period: info.period,
    source_area: info.sourceArea,
    storage_path: storagePath,
    file_size_bytes: file.size,
    imported_by: state.profile.id,
  };

  const { data, error } = await db
    .from("crm_import_files")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  await writeAudit("import_file", "crm_import_files", data.id, {
    file_name: file.name,
    file_type: info.type,
    period: info.period,
    source_area: info.sourceArea,
  });
  return data;
}

async function writeAudit(action, entityType, entityId, metadata = {}) {
  if (state.appMode === "local") return;
  if (!isAdmin()) return;
  await db.from("crm_audit_logs").insert({
    actor_id: state.profile.id,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    metadata,
  });
}

function createParticipantIndex() {
  const bySlug = new Map();
  const byVendor = new Map();
  const byValidator = new Map();
  const byAlias = new Map();
  const all = [];

  for (const item of state.participants) {
    all.push(item);
    bySlug.set(item.slug, item);
    if (item.nome_vendedor) byVendor.set(normalizeText(item.nome_vendedor), item);
    if (item.nome_validador) byValidator.set(normalizeText(item.nome_validador), item);
    byVendor.set(normalizeText(item.nome), item);
    byValidator.set(normalizeText(item.nome), item);

    const aliases = [
      item.nome,
      item.nome_vendedor,
      item.nome_validador,
      item.fantasia,
    ].filter(Boolean);

    for (const alias of aliases) {
      const normalized = normalizeText(alias);
      byAlias.set(normalized, item);

      const firstWord = normalized.split(" ")[0];
      if (firstWord) byAlias.set(firstWord, item);
    }
  }

  return { bySlug, byVendor, byValidator, byAlias, all };
}

function findParticipantForRenewal(row, participantIndex) {
  const agente = normalizeText(row["Agente"] || row["Desc. Agente Val."] || "");
  const ponto = normalizeText(row["Ponto de Atendimento"] || "");
  const ar = normalizeText(row["AR"] || "");

  if (agente && participantIndex.byAlias.has(agente)) {
    return participantIndex.byAlias.get(agente);
  }

  for (const participant of participantIndex.all) {
    const fields = [
      participant.nome,
      participant.nome_vendedor,
      participant.nome_validador,
      participant.fantasia,
    ]
      .filter(Boolean)
      .map((item) => normalizeText(item));

    if (agente && fields.some((field) => field.includes(agente) || agente.includes(field))) return participant;
    if (ponto && fields.some((field) => ponto.includes(field) || field.includes(ponto))) return participant;
    if (ar && fields.some((field) => ar.includes(field) || field.includes(ar))) return participant;
  }

  return null;
}

async function insertSales(rows, importFileId, period) {
  const participantIndex = createParticipantIndex();
  const records = rows
    .map((row) => {
      const participant = participantIndex.byVendor.get(normalizeText(row["Nome Vendedor"]));
      return {
        import_file_id: importFileId,
        period,
        participant_id: participant?.id || null,
        participant_nome: participant?.nome || String(row["Nome Vendedor"] || "").trim(),
        document_key: documentKeyFromRaw({ cliente: row["Nome Cliente"] }),
        pedido: String(row["Pedido"] || "").trim(),
        cliente: String(row["Nome Cliente"] || "").trim() || null,
        data_pedido: String(row["Dt.Pedido"] || "").trim() || null,
        data_verificacao: String(row["Dt.Verificação"] || "").trim() || null,
        produto: String(row["Desc.Produto"] || "").trim() || null,
        faturamento: parseCurrency(row["Val. Faturamento"]),
        comissao: parseCurrency(row["Valor Tot. Comiss."]),
        status: String(row["Status Pedido"] || "").trim() || null,
      };
    })
    .filter((item) => item.pedido);

  if (state.appMode === "local") {
    const current = storageGet(LOCAL_KEYS.sales, []);
    current.push(...records.map((item, index) => ({ ...item, id: `local-sale-${period}-${index}-${Date.now()}` })));
    storageSet(LOCAL_KEYS.sales, current);
    return;
  }

  for (const batch of chunk(records, 300)) {
    const { error } = await db.from("crm_sales").insert(batch);
    if (error) throw error;
  }
}

async function insertValidations(rows, importFileId, period) {
  const participantIndex = createParticipantIndex();
  const records = rows
    .map((row) => {
      const participant = participantIndex.byValidator.get(normalizeText(row["Desc. Agente Val."] || row["Agente"]));
      return {
        import_file_id: importFileId,
        period,
        participant_id: participant?.id || null,
        participant_nome: participant?.nome || String(row["Desc. Agente Val."] || row["Agente"] || "").trim(),
        document_key: documentKeyFromRaw({ cliente: row["Nome Cliente"] }),
        pedido: String(row["Pedido"] || "").trim(),
        cliente: String(row["Nome Cliente"] || "").trim() || null,
        data_pedido: String(row["Dt.Pedido"] || "").trim() || null,
        data_validacao: String(row["Dt.Validação"] || "").trim() || null,
        produto: String(row["Produto"] || "").trim() || null,
        bruto_software: parseCurrency(row["Val. Bruto Soft"]),
        bruto_hardware: parseCurrency(row["Val. Bruto Hard"]),
        comissao_software: parseCurrency(row["Val. Comiss. Soft"]),
        comissao_hardware: parseCurrency(row["Val. Comiss. Hard"]),
        status: String(row["Status Pedido"] || "").trim() || null,
      };
    })
    .filter((item) => item.pedido);

  if (state.appMode === "local") {
    const current = storageGet(LOCAL_KEYS.validations, []);
    current.push(...records.map((item, index) => ({ ...item, id: `local-validation-${period}-${index}-${Date.now()}` })));
    storageSet(LOCAL_KEYS.validations, current);
    return;
  }

  for (const batch of chunk(records, 300)) {
    const { error } = await db.from("crm_validations").insert(batch);
    if (error) throw error;
  }
}

async function insertRenewals(rows, importFileId, period) {
  const participantIndex = createParticipantIndex();
  const records = rows
    .map((row) => {
      const participant = findParticipantForRenewal(row, participantIndex);
      const cliente = String(row["Cliente"] || "").trim();
      const email = String(row["Email"] || "").trim();
      const telefone = String(row["Telefone"] || row["Tele"] || "").trim();
      const cpf = String(row["CPF"] || "").trim();
      const cnpj = String(row["CNPJ"] || "").trim();
      return {
        import_file_id: importFileId,
        period,
        participant_id: participant?.id || null,
        participant_nome: participant?.nome || String(row["Agente"] || row["Desc. Agente Val."] || row["Ponto de Atendimento"] || "").trim() || null,
        document_key: documentKeyFromRaw({ cpf, cnpj, email, telefone, cliente }),
        pedido: String(row["Pedido"] || "").trim() || null,
        data_vencimento: String(row["Data de Vencimento"] || "").trim() || null,
        cliente: cliente || null,
        email: email || null,
        telefone: telefone || null,
        produto: String(row["Produto"] || "").trim() || null,
        ar: String(row["AR"] || "").trim() || null,
        ponto_atendimento: String(row["Ponto de Atendimento"] || "").trim() || null,
        agente: String(row["Agente"] || row["Desc. Agente Val."] || "").trim() || null,
        status_pedido: String(row["Status do Pedido"] || "").trim() || null,
        cpf: cpf || null,
        cnpj: cnpj || null,
        razao_social: String(row["Razão Social"] || "").trim() || null,
      };
    })
    .filter((item) => item.document_key);

  if (state.appMode === "local") {
    const current = storageGet(LOCAL_KEYS.renewals, []);
    current.push(...records.map((item, index) => ({ ...item, id: `local-renewal-${period}-${index}-${Date.now()}` })));
    storageSet(LOCAL_KEYS.renewals, current);
    return;
  }

  for (const batch of chunk(records, 300)) {
    const { error } = await db.from("crm_renewal_records").insert(batch);
    if (error) throw error;
  }
}

async function importResolvedRows(file, info, rows, storagePathOverride = null) {
  if (info.type === "parceiros") {
    await upsertParticipants(rows);
    await loadReferenceData();
  }

  await purgeExistingImport(info);
  const storagePath = storagePathOverride || await uploadRawFile(file, info);
  const importFile = await createImportFile(file, info, storagePath);

  if (info.type === "revenda") await insertSales(rows, importFile.id, info.period);
  if (info.type === "validacoes") await insertValidations(rows, importFile.id, info.period);
  if (info.type === "renovacoes") await insertRenewals(rows, importFile.id, info.period);
}

async function importRenewalFile(file, info, rows) {
  const groups = groupRenewalRowsByPeriod(rows, info.period);
  if (!groups.size) {
    throw new Error(`Não encontrei datas de vencimento válidas no arquivo ${file.name}.`);
  }

  const sharedStoragePath = state.appMode === "local"
    ? null
    : await uploadRawFile(
      file,
      info,
      `${info.sourceArea}/${info.type}/multi-period/${Date.now()}-${file.name}`,
    );

  const orderedPeriods = [...groups.keys()].sort((a, b) => buildPeriodSort(a).localeCompare(buildPeriodSort(b)));
  for (let index = 0; index < orderedPeriods.length; index += 1) {
    const period = orderedPeriods[index];
    setMessage(
      "info",
      `Importando ${file.name}: período ${formatPeriod(period)} (${index + 1} de ${orderedPeriods.length}).`,
    );
    const periodInfo = { ...info, period, periods: [period] };
    await importResolvedRows(file, periodInfo, groups.get(period), sharedStoragePath);
  }
}

async function handleImport(event) {
  event.preventDefault();
  const files = Array.from($("import-files").files || []);
  await processImportFiles(files);
}

async function processImportFiles(files, expectedType = null, expectedSourceArea = null) {
  if (!db || !window.XLSX) {
    setMessage("error", "As bibliotecas principais do sistema não carregaram corretamente.");
    return;
  }

  clearMessage();
  await ensureAdmin();

  if (!files.length) {
    setMessage("error", "Selecione ao menos um arquivo.");
    return;
  }

  setLoading(true);
  try {
    setMessage("info", `Preparando importação de ${files.length} arquivo(s).`);

    let importedUnits = 0;
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      setMessage("info", `Lendo arquivo ${fileIndex + 1} de ${files.length}: ${file.name}.`);
      const rows = await readSpreadsheet(file);
      const info = resolveImportInfo(file.name, rows, expectedType, expectedSourceArea);
      if (!info) {
        throw new Error(`Arquivo fora do padrão aceito: ${file.name}`);
      }
      if (expectedType && info.type !== expectedType) {
        throw new Error(`O arquivo ${file.name} não pertence a esta área de importação.`);
      }
      if (expectedSourceArea && info.type !== "renovacoes" && info.sourceArea !== expectedSourceArea) {
        throw new Error(`O arquivo ${file.name} pertence a outra origem de renovação.`);
      }

      if (info.type === "renovacoes") {
        await importRenewalFile(file, info, rows);
        importedUnits += info.periods?.length || 1;
        continue;
      }

      setMessage("info", `Importando arquivo ${fileIndex + 1} de ${files.length}: ${file.name}.`);
      await importResolvedRows(file, info, rows);
      importedUnits += 1;
    }

    await loadReferenceData();
    state.selectedPeriod = state.periods[0]?.value || state.selectedPeriod;
    setMessage("ok", `Importação concluída com sucesso. ${importedUnits} item(ns) processado(s).`);
  } catch (error) {
    setMessage("error", error.message || "Falha na importação.");
  } finally {
    setLoading(false);
  }
}

async function handleImportSlot(event, expectedType, expectedSourceArea = null) {
  event.preventDefault();
  const inputId = `import-${expectedType}${expectedSourceArea ? `-${expectedSourceArea}` : ""}`;
  const files = Array.from($(inputId)?.files || []);
  await processImportFiles(files, expectedType, expectedSourceArea);
}

function commissionSummaryByParticipant(participants, sales, validations) {
  const salesBy = new Map();
  const validationsBy = new Map();

  for (const sale of sales) {
    const key = sale.participant_id || slugify(sale.participant_nome);
    if (!salesBy.has(key)) salesBy.set(key, []);
    salesBy.get(key).push(sale);
  }

  for (const item of validations) {
    const key = item.participant_id || slugify(item.participant_nome);
    if (!validationsBy.has(key)) validationsBy.set(key, []);
    validationsBy.get(key).push(item);
  }

  return participants.map((participant) => {
    const key = participant.id || slugify(participant.nome);
    const salesRows = salesBy.get(key) || [];
    const validationRows = validationsBy.get(key) || [];
    const comissaoVendas = salesRows.reduce((sum, row) => sum + Number(row.comissao || 0), 0);
    const faturamento = salesRows.reduce((sum, row) => sum + Number(row.faturamento || 0), 0);
    const comissaoSoftware = validationRows.reduce((sum, row) => sum + Number(row.comissao_software || 0), 0);
    const comissaoHardware = validationRows.reduce((sum, row) => sum + Number(row.comissao_hardware || 0), 0);
    const validacaoTotal = comissaoSoftware + comissaoHardware;
    const bruto = comissaoVendas + validacaoTotal;
    const imposto = Number(participant.imposto || 0) > 0 && Number(participant.imposto || 0) < 1
      ? bruto * Number(participant.imposto || 0)
      : Number(participant.imposto || 0);
    const contabilidade = Number(participant.contabilidade || 0);
    const liquido = bruto - imposto - contabilidade;

    return {
      participant,
      salesRows,
      validationRows,
      resumo: {
        quantidadeVendas: salesRows.length,
        quantidadeValidacoes: validationRows.length,
        faturamento,
        comissaoVendas,
        comissaoSoftware,
        comissaoHardware,
        validacaoTotal,
        bruto,
        imposto,
        contabilidade,
        liquido,
      },
    };
  });
}

async function loadCommissionReport() {
  if (!db && state.appMode !== "local") {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }
  if (!state.selectedPeriod) {
    setMessage("error", "Selecione um período.");
    return;
  }

  setLoading(true);
  clearMessage();

  try {
    const participantIds = isAdmin()
      ? (state.selectedParticipantId ? [state.selectedParticipantId] : state.participants.map((item) => item.id))
      : state.myParticipantIds;

    if (state.appMode === "local") {
      const sales = storageGet(LOCAL_KEYS.sales, []).filter((item) => item.period === state.selectedPeriod);
      const validations = storageGet(LOCAL_KEYS.validations, []).filter((item) => item.period === state.selectedPeriod);
      const filteredSales = participantIds.length ? sales.filter((item) => participantIds.includes(item.participant_id)) : sales;
      const filteredValidations = participantIds.length ? validations.filter((item) => participantIds.includes(item.participant_id)) : validations;
      const participants = (isAdmin() && state.selectedParticipantId
        ? state.participants.filter((item) => item.id === state.selectedParticipantId)
        : state.participants.filter((item) => participantIds.includes(item.id) || !participantIds.length));
      const items = commissionSummaryByParticipant(participants, filteredSales, filteredValidations);
      const totals = items.reduce((acc, item) => {
        acc.vendas += item.resumo.comissaoVendas;
        acc.validacoes += item.resumo.validacaoTotal;
        acc.imposto += item.resumo.imposto;
        acc.contabilidade += item.resumo.contabilidade;
        acc.liquido += item.resumo.liquido;
        acc.qtdeVendas += item.resumo.quantidadeVendas;
        acc.qtdeValidacoes += item.resumo.quantidadeValidacoes;
        return acc;
      }, {
        vendas: 0, validacoes: 0, imposto: 0, contabilidade: 0, liquido: 0, qtdeVendas: 0, qtdeValidacoes: 0,
      });
      state.report = { period: state.selectedPeriod, items, totals };
      return;
    }

    const salesQuery = db
      .from("crm_sales")
      .select("*")
      .eq("period", state.selectedPeriod)
      .order("cliente", { ascending: true });

    const validationsQuery = db
      .from("crm_validations")
      .select("*")
      .eq("period", state.selectedPeriod)
      .order("cliente", { ascending: true });

    if (participantIds.length) {
      salesQuery.in("participant_id", participantIds);
      validationsQuery.in("participant_id", participantIds);
    }

    const [{ data: sales, error: salesError }, { data: validations, error: validationsError }] = await Promise.all([
      salesQuery,
      validationsQuery,
    ]);

    if (salesError) throw salesError;
    if (validationsError) throw validationsError;

    const participants = (isAdmin() && state.selectedParticipantId
      ? state.participants.filter((item) => item.id === state.selectedParticipantId)
      : state.participants.filter((item) => participantIds.includes(item.id)));

    const items = commissionSummaryByParticipant(participants, sales || [], validations || []);
    const totals = items.reduce((acc, item) => {
      acc.vendas += item.resumo.comissaoVendas;
      acc.validacoes += item.resumo.validacaoTotal;
      acc.imposto += item.resumo.imposto;
      acc.contabilidade += item.resumo.contabilidade;
      acc.liquido += item.resumo.liquido;
      acc.qtdeVendas += item.resumo.quantidadeVendas;
      acc.qtdeValidacoes += item.resumo.quantidadeValidacoes;
      return acc;
    }, {
      vendas: 0, validacoes: 0, imposto: 0, contabilidade: 0, liquido: 0, qtdeVendas: 0, qtdeValidacoes: 0,
    });

    state.report = {
      period: state.selectedPeriod,
      items,
      totals,
    };
  } catch (error) {
    setMessage("error", error.message || "Erro ao carregar relatório.");
  } finally {
    setLoading(false);
  }
}

async function loadRenewalAnalysis() {
  if (!db && state.appMode !== "local") {
    setMessage("error", "Supabase não disponível no navegador.");
    return;
  }
  if (!state.selectedPeriod) {
    setMessage("error", "Selecione um período.");
    return;
  }

  setLoading(true);
  clearMessage();

  try {
    if (state.appMode === "local") {
      const renewals = storageGet(LOCAL_KEYS.renewals, []);
      const importFiles = storageGet(LOCAL_KEYS.files, []);
      const sales = storageGet(LOCAL_KEYS.sales, []).filter((item) => item.period === state.selectedPeriod);
      const validations = storageGet(LOCAL_KEYS.validations, []).filter((item) => item.period === state.selectedPeriod);
      const scopedRenewals = !isAdmin() && state.myParticipantIds.length
        ? renewals.filter((item) => state.myParticipantIds.includes(item.participant_id))
        : renewals;
      const availablePeriods = [...new Set((importFiles || []).filter((item) => item.file_type === "renovacoes").map((item) => item.period))];
      const current = scopedRenewals.filter((item) => item.period === state.selectedPeriod);
      const currentSort = buildPeriodSort(state.selectedPeriod);
      const sameMonthLastYear = `${state.selectedPeriod.slice(0, 2)}${String(Number(state.selectedPeriod.slice(2)) - 1)}`;
      const previous = scopedRenewals.filter((item) => buildPeriodSort(item.period) < currentSort);
      const sameMonthPrevious = scopedRenewals.filter((item) => item.period === sameMonthLastYear);
      const operationKeys = new Set([...(sales || []).map((item) => item.document_key).filter(Boolean), ...(validations || []).map((item) => item.document_key).filter(Boolean)]);
      const historyKeys = new Set(previous.map((item) => item.document_key));
      const sameMonthKeys = new Set(sameMonthPrevious.map((item) => item.document_key));
      const rows = current.map((item) => ({
        ...item,
        jaEsteveNaBase: historyKeys.has(item.document_key),
        esteveNoMesmoMesAnoAnterior: sameMonthKeys.has(item.document_key),
        renovouAgora: operationKeys.has(item.document_key),
      }));
      const convertidos = rows.filter((item) => item.renovouAgora);
      const pendentes = rows.filter((item) => !item.renovouAgora);
      const recorrentes = rows.filter((item) => item.jaEsteveNaBase);
      const recorrentesAnoAnterior = rows.filter((item) => item.esteveNoMesmoMesAnoAnterior);
      const recuperados = convertidos.filter((item) => item.jaEsteveNaBase);
      const perdidosRecorrentes = pendentes.filter((item) => item.jaEsteveNaBase);
      const convertidosAnoAnterior = convertidos.filter((item) => item.esteveNoMesmoMesAnoAnterior);
      const perdidosAnoAnterior = pendentes.filter((item) => item.esteveNoMesmoMesAnoAnterior);
      const novosNaBase = rows.filter((item) => !item.jaEsteveNaBase);
      state.renewal = {
        availablePeriods,
        period: state.selectedPeriod,
        totalBase: rows.length,
        convertidos: convertidos.length,
        pendentes: pendentes.length,
        recorrentes: recorrentes.length,
        recorrentesAnoAnterior: recorrentesAnoAnterior.length,
        recuperados: recuperados.length,
        perdidosRecorrentes: perdidosRecorrentes.length,
        convertidosAnoAnterior: convertidosAnoAnterior.length,
        perdidosAnoAnterior: perdidosAnoAnterior.length,
        novosNaBase: novosNaBase.length,
        indicadores: {
          taxaRenovacao: rows.length ? convertidos.length / rows.length : 0,
          taxaRecorrente: rows.length ? recorrentes.length / rows.length : 0,
          taxaPerdaRecorrente: recorrentes.length ? perdidosRecorrentes.length / recorrentes.length : 0,
          taxaConversaoAnoAnterior: recorrentesAnoAnterior.length ? convertidosAnoAnterior.length / recorrentesAnoAnterior.length : 0,
        },
        oportunidadesPorProduto: ranking(pendentes, "produto"),
        oportunidadesPorPonto: ranking(pendentes, "ponto_atendimento"),
        oportunidadesPorAgente: ranking(pendentes, "agente"),
        oportunidadesPorStatus: ranking(pendentes, "status_pedido"),
        oportunidadesPorAr: ranking(pendentes, "ar"),
        convertidosPorProduto: ranking(convertidos, "produto"),
        convertidosPorPonto: ranking(convertidos, "ponto_atendimento"),
        rows,
      };
      return;
    }

    const renewalQuery = db.from("crm_renewal_records").select("*");
    if (!isAdmin() && state.myParticipantIds.length) {
      renewalQuery.in("participant_id", state.myParticipantIds);
    }

    const [{ data: renewals, error: renewalsError }, { data: importFiles, error: filesError }, { data: sales }, { data: validations }] = await Promise.all([
      renewalQuery,
      db.from("crm_import_files").select("period,file_type"),
      db.from("crm_sales").select("document_key").eq("period", state.selectedPeriod),
      db.from("crm_validations").select("document_key").eq("period", state.selectedPeriod),
    ]);

    if (renewalsError) throw renewalsError;
    if (filesError) throw filesError;

    const availablePeriods = [...new Set((importFiles || []).filter((item) => item.file_type === "renovacoes").map((item) => item.period))];
    const current = (renewals || []).filter((item) => item.period === state.selectedPeriod);
    const currentSort = buildPeriodSort(state.selectedPeriod);
    const sameMonthLastYear = `${state.selectedPeriod.slice(0, 2)}${String(Number(state.selectedPeriod.slice(2)) - 1)}`;
    const previous = (renewals || []).filter((item) => buildPeriodSort(item.period) < currentSort);
    const sameMonthPrevious = (renewals || []).filter((item) => item.period === sameMonthLastYear);
    const operationKeys = new Set([
      ...(sales || []).map((item) => item.document_key).filter(Boolean),
      ...(validations || []).map((item) => item.document_key).filter(Boolean),
    ]);
    const historyKeys = new Set(previous.map((item) => item.document_key));
    const sameMonthKeys = new Set(sameMonthPrevious.map((item) => item.document_key));

    const rows = current.map((item) => ({
      ...item,
      jaEsteveNaBase: historyKeys.has(item.document_key),
      esteveNoMesmoMesAnoAnterior: sameMonthKeys.has(item.document_key),
      renovouAgora: operationKeys.has(item.document_key),
    }));

    const convertidos = rows.filter((item) => item.renovouAgora);
    const pendentes = rows.filter((item) => !item.renovouAgora);
    const recorrentes = rows.filter((item) => item.jaEsteveNaBase);
    const recorrentesAnoAnterior = rows.filter((item) => item.esteveNoMesmoMesAnoAnterior);
    const recuperados = convertidos.filter((item) => item.jaEsteveNaBase);
    const perdidosRecorrentes = pendentes.filter((item) => item.jaEsteveNaBase);
    const convertidosAnoAnterior = convertidos.filter((item) => item.esteveNoMesmoMesAnoAnterior);
    const perdidosAnoAnterior = pendentes.filter((item) => item.esteveNoMesmoMesAnoAnterior);
    const novosNaBase = rows.filter((item) => !item.jaEsteveNaBase);

    state.renewal = {
      availablePeriods,
      period: state.selectedPeriod,
      totalBase: rows.length,
      convertidos: convertidos.length,
      pendentes: pendentes.length,
      recorrentes: recorrentes.length,
      recorrentesAnoAnterior: recorrentesAnoAnterior.length,
      recuperados: recuperados.length,
      perdidosRecorrentes: perdidosRecorrentes.length,
      convertidosAnoAnterior: convertidosAnoAnterior.length,
      perdidosAnoAnterior: perdidosAnoAnterior.length,
      novosNaBase: novosNaBase.length,
      indicadores: {
        taxaRenovacao: rows.length ? convertidos.length / rows.length : 0,
        taxaRecorrente: rows.length ? recorrentes.length / rows.length : 0,
        taxaPerdaRecorrente: recorrentes.length ? perdidosRecorrentes.length / recorrentes.length : 0,
        taxaConversaoAnoAnterior: recorrentesAnoAnterior.length ? convertidosAnoAnterior.length / recorrentesAnoAnterior.length : 0,
      },
      oportunidadesPorProduto: ranking(pendentes, "produto"),
      oportunidadesPorPonto: ranking(pendentes, "ponto_atendimento"),
      oportunidadesPorAgente: ranking(pendentes, "agente"),
      oportunidadesPorStatus: ranking(pendentes, "status_pedido"),
      oportunidadesPorAr: ranking(pendentes, "ar"),
      convertidosPorProduto: ranking(convertidos, "produto"),
      convertidosPorPonto: ranking(convertidos, "ponto_atendimento"),
      rows,
    };
  } catch (error) {
    setMessage("error", error.message || "Erro ao carregar análise de renovação.");
  } finally {
    setLoading(false);
  }
}

function ranking(items, key) {
  const map = new Map();
  for (const item of items) {
    const label = item[key] || "Não informado";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}

async function saveUserBindings(profileId) {
  if (!db) throw new Error("Supabase não disponível no navegador.");
  await ensureAdmin();
  const role = $(`profile-role-${profileId}`).value;
  const status = $(`profile-status-${profileId}`).value;
  const nome = $(`profile-name-${profileId}`).value.trim();

  const selectedIds = [...document.querySelectorAll(`input[data-profile="${profileId}"]:checked`)].map((input) => input.value);

  const { error: profileError } = await db
    .from("crm_profiles")
    .update({ role, status, nome })
    .eq("id", profileId);

  if (profileError) throw profileError;

  const existing = state.participantLinks.filter((item) => item.profile_id === profileId);
  if (existing.length) {
    const { error } = await db.from("crm_profile_participants").delete().eq("profile_id", profileId);
    if (error) throw error;
  }

  if (selectedIds.length) {
    const { error } = await db.from("crm_profile_participants").insert(
      selectedIds.map((participantId) => ({ profile_id: profileId, participant_id: participantId }))
    );
    if (error) throw error;
  }

  await writeAudit("update_profile_access", "crm_profiles", profileId, { role, status, participant_ids: selectedIds });
  await loadReferenceData();
  render();
  setMessage("ok", "Perfil atualizado.");
}

async function saveParticipantConfig(participantId) {
  if (!db) throw new Error("Supabase não disponível no navegador.");
  await ensureAdmin();

  const payload = {
    fantasia: $(`participant-fantasia-${participantId}`).value.trim() || null,
    faixa: $(`participant-faixa-${participantId}`).value.trim() || null,
    email: $(`participant-email-${participantId}`).value.trim() || null,
    codigo_revenda: $(`participant-codigo-${participantId}`).value.trim() || null,
    imposto: parseCurrency($(`participant-imposto-${participantId}`).value),
    contabilidade: parseCurrency($(`participant-contabilidade-${participantId}`).value),
    verificacao: parseCurrency($(`participant-verificacao-${participantId}`).value),
    percentual_venda: parseCurrency($(`participant-percentual-venda-${participantId}`).value),
    percentual_software: parseCurrency($(`participant-percentual-software-${participantId}`).value),
    percentual_hardware: parseCurrency($(`participant-percentual-hardware-${participantId}`).value),
  };

  const { error } = await db
    .from("crm_participants")
    .update(payload)
    .eq("id", participantId);

  if (error) throw error;

  await writeAudit("update_participant_rules", "crm_participants", participantId, payload);
  await loadReferenceData();
  render();
  setMessage("ok", "Configuração do parceiro atualizada com sucesso.");
}

function linkedParticipantIds(profileId) {
  return state.participantLinks
    .filter((item) => item.profile_id === profileId)
    .map((item) => item.participant_id);
}

function linkedParticipants(profileId) {
  const ids = new Set(linkedParticipantIds(profileId));
  return state.participants.filter((item) => ids.has(item.id));
}

function participantUnitLabel(participant) {
  return participant.fantasia || "Sem unidade";
}

function participantMissingRuleFields(participant) {
  const missing = [];
  if (!Number(participant.imposto || 0)) missing.push("Imposto");
  if (!Number(participant.contabilidade || 0)) missing.push("Contabilidade");
  if (!Number(participant.verificacao || 0)) missing.push("Verificação");
  if (!Number(participant.percentual_venda || 0)) missing.push("% venda");
  if (!Number(participant.percentual_software || 0)) missing.push("% software");
  if (!Number(participant.percentual_hardware || 0)) missing.push("% hardware");
  return missing;
}

function filteredProfiles() {
  const term = state.userSearch.trim().toLowerCase();

  return state.profiles.filter((profile) => {
    if (state.userRoleFilter !== "__all__" && profile.role !== state.userRoleFilter) return false;

    if (!term) return true;

    const partners = linkedParticipants(profile.id);
    const partnerText = partners.map((item) => `${item.nome} ${item.fantasia || ""}`).join(" ").toLowerCase();
    const haystack = `${profile.nome || ""} ${profile.email || ""} ${profile.role || ""} ${profile.status || ""} ${partnerText}`.toLowerCase();
    return haystack.includes(term);
  });
}

function participantHasMissingRules(participant) {
  return participantMissingRuleFields(participant).length > 0;
}

function filteredParticipants() {
  const search = normalizeText(state.partnerSearch || "");
  const unitFilter = state.partnerUnitFilter || "__all__";

  const items = state.participants.filter((participant) => {
    const unit = participantUnitLabel(participant);
    if (unitFilter !== "__all__" && unit !== unitFilter) return false;

    if (!search) return true;

    const haystack = [
      participant.nome,
      participant.fantasia,
      participant.faixa,
      participant.email,
      participant.codigo_revenda,
      participant.nome_vendedor,
      participant.nome_validador,
    ]
      .filter(Boolean)
      .map((value) => normalizeText(value))
      .join(" ");

    return haystack.includes(search);
  });

  const sortMode = state.partnerSort || "pendencias";
  return items.sort((a, b) => {
    if (sortMode === "pendencias") {
      const pendingDiff = Number(participantHasMissingRules(b)) - Number(participantHasMissingRules(a));
      if (pendingDiff !== 0) return pendingDiff;
    }

    if (sortMode === "unidade") {
      return participantUnitLabel(a).localeCompare(participantUnitLabel(b), "pt-BR")
        || a.nome.localeCompare(b.nome, "pt-BR");
    }

    if (sortMode === "faixa") {
      return String(a.faixa || "").localeCompare(String(b.faixa || ""), "pt-BR")
        || a.nome.localeCompare(b.nome, "pt-BR");
    }

    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

function participantUnitOptions() {
  return [...new Set(state.participants.map(participantUnitLabel))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function paginatedParticipants() {
  const items = filteredParticipants();
  const totalPages = Math.max(1, Math.ceil(items.length / PARTNER_PAGE_SIZE));
  const currentPage = Math.min(state.partnerPage, totalPages);
  const start = (currentPage - 1) * PARTNER_PAGE_SIZE;
  const end = start + PARTNER_PAGE_SIZE;

  if (currentPage !== state.partnerPage) {
    state.partnerPage = currentPage;
  }

  return {
    items: items.slice(start, end),
    total: items.length,
    currentPage,
    totalPages,
    start: items.length ? start + 1 : 0,
    end: Math.min(end, items.length),
    pending: items.filter(participantHasMissingRules).length,
  };
}

function parseBatchValue(id) {
  const input = $(id);
  if (!input) return null;
  const raw = String(input.value || "").trim();
  return raw ? parseCurrency(raw) : null;
}

async function saveBatchParticipantConfig() {
  if (!db) throw new Error("Supabase não disponível no navegador.");
  await ensureAdmin();

  const targets = filteredParticipants();
  if (!targets.length) {
    throw new Error("Não há parceiros no filtro atual para aplicar a edição em lote.");
  }

  const payload = {};
  const mappings = [
    ["imposto", "batch-imposto"],
    ["contabilidade", "batch-contabilidade"],
    ["verificacao", "batch-verificacao"],
    ["percentual_venda", "batch-percentual-venda"],
    ["percentual_software", "batch-percentual-software"],
    ["percentual_hardware", "batch-percentual-hardware"],
  ];

  for (const [field, inputId] of mappings) {
    const parsed = parseBatchValue(inputId);
    if (parsed !== null) payload[field] = parsed;
  }

  if (!Object.keys(payload).length) {
    throw new Error("Preencha ao menos um campo na edição em lote.");
  }

  const { error } = await db
    .from("crm_participants")
    .update(payload)
    .in("id", targets.map((participant) => participant.id));

  if (error) throw error;

  await writeAudit("batch_update_participant_rules", "crm_participants", null, {
    participant_ids: targets.map((participant) => participant.id),
    total: targets.length,
    payload,
  });
  await loadReferenceData();
  render();
  setMessage("ok", `Configuração em lote aplicada a ${targets.length} parceiro(s).`);
}

function navigate(page) {
  state.activePage = page;
  render();
}

function brandLogoMarkup(className = "") {
  if (state.customLogoDataUrl) {
    return `
      <div class="brand-upload-panel ${className}">
        <img src="${state.customLogoDataUrl}" alt="Logotipo da empresa" class="certifast-logo-image">
      </div>
    `;
  }

  return `
    <div class="brand-upload-panel ${className}">
      <div class="brand-upload-placeholder">
        <strong>Seu logotipo</strong>
        <span>Suba um PNG, SVG ou WEBP com fundo transparente.</span>
      </div>
    </div>
  `;
}

function authView() {
  if (bootErrors.length) {
    return `
      <div class="auth-shell">
        <div class="auth-card auth-panel">
          <div class="kicker">crm_certifast</div>
          <h1>O app abriu, mas os scripts principais falharam</h1>
          <p class="subtext">Isso normalmente acontece quando algum script externo foi bloqueado pelo navegador ou pela política de segurança do deploy.</p>
          <div class="stack" style="margin-top:24px;">
            ${bootErrors.map((item) => `<div class="alert alert-error">${escapeHtml(item)}</div>`).join("")}
            <div class="card">
              <div class="section-title"><h3>Próximo passo</h3></div>
              <p class="mini">Abra o console do navegador com F12 e veja o erro em vermelho. Se quiser, me envie esse erro para eu ajustar exatamente o que estiver bloqueando.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="auth-shell">
      <div class="auth-layout">
        <section class="auth-showcase">
          ${brandLogoMarkup("auth-logo-panel")}
          <h1><span>Bem-vindo</span><span>ao centro de operação</span><span>da Certifast</span></h1>
          <p class="subtext">Uma entrada única para comissão de vendas, validações e inteligência de renovação com acesso segmentado por perfil.</p>
          <div class="auth-feature-list">
            <div class="auth-feature">
              <strong>Participantes</strong>
              <span>Visualizam apenas sua própria comissão, com total bruto, descontos e líquido.</span>
            </div>
            <div class="auth-feature">
              <strong>Administrador</strong>
              <span>Importa arquivos, gerencia acessos e acompanha oportunidades de renovação.</span>
            </div>
            <div class="auth-feature">
              <strong>Segurança</strong>
              <span>Supabase Auth, RLS, bucket privado e políticas universais aplicadas no projeto.</span>
            </div>
          </div>
        </section>
        <section class="auth-card auth-panel">
          <div class="auth-panel-head">
            <div>
              <p class="auth-overline">Acesso ao sistema</p>
              <h2>${state.authMode === "login" ? "Entrar no CRM" : "Criar novo acesso"}</h2>
              <p class="muted">${state.authMode === "login"
                ? "Use seu email e senha para acessar seus relatórios."
                : "Crie o acesso inicial e depois o administrador vincula seu perfil corretamente."}</p>
            </div>
            <div class="auth-tabs">
              <button class="auth-tab ${state.authMode === "login" ? "active" : ""}" onclick="window.setAuthMode('login')">Entrar</button>
              <button class="auth-tab ${state.authMode === "signup" ? "active" : ""}" onclick="window.setAuthMode('signup')">Criar acesso</button>
            </div>
          </div>
          ${state.message ? `<div class="alert ${alertClass(state.message.type)}">${escapeHtml(state.message.text)}</div>` : ""}
          ${state.session?.user && !state.hasAdmin ? `
            <form class="card auth-bootstrap-card" onsubmit="window.claimFirstAdmin(event)">
              <div class="section-title"><h3>Ativar primeiro administrador</h3></div>
              <p class="mini">Nenhum administrador foi configurado ainda. Use o token inicial de instalação para assumir o controle do CRM.</p>
              <div class="form-grid">
                <div class="field">
                  <label>Token de ativação</label>
                  <input name="setup_token" placeholder="Token de instalação" required>
                </div>
                <button class="btn btn-primary auth-submit" type="submit">${state.loading ? "Ativando..." : "Ativar administrador"}</button>
              </div>
            </form>
          ` : ""}
            ${state.authMode === "login" ? `
              <form class="form-grid" onsubmit="window.signIn(event)">
                <div class="field">
                  <label>Email</label>
                  <input name="email" type="email" placeholder="voce@certifast.com.br" required>
              </div>
                <div class="field">
                  <label>Senha</label>
                  <input name="password" type="password" placeholder="Digite sua senha" required>
                </div>
                <button class="btn btn-primary auth-submit" type="submit">${state.loading ? "Entrando..." : "Entrar no sistema"}</button>
                <button class="btn btn-outline auth-submit" type="button" onclick="window.requestMagicLink(event)" ${state.loading ? "disabled" : ""}>Receber link de acesso</button>
              </form>
            ` : `
            <form class="form-grid" onsubmit="window.signUp(event)">
              <div class="field">
                <label>Nome</label>
                <input name="nome" placeholder="Seu nome completo" required>
              </div>
              <div class="field">
                <label>Email</label>
                <input name="email" type="email" placeholder="voce@empresa.com.br" required>
              </div>
              <div class="field">
                <label>Senha</label>
                <input name="password" type="password" minlength="6" placeholder="Mínimo de 6 caracteres" required>
              </div>
              <button class="btn btn-outline auth-submit" type="submit">${state.loading ? "Criando..." : "Criar acesso"}</button>
            </form>
          `}
          <div class="auth-foot">
            <span class="chip">Sistema seguro</span>
            <span class="mini">Perfis e permissões controlados por regra de acesso.</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function brandingCard() {
  if (!isAdmin()) return "";

  return `
    <div class="card stack">
      <div class="section-title">
        <div>
          <h3>Identidade visual</h3>
          <p class="muted">Suba aqui o logotipo oficial. Ele será usado na tela de login deste navegador.</p>
        </div>
      </div>
      <div class="brand-admin-row">
        ${brandLogoMarkup("brand-admin-preview")}
        <div class="stack brand-admin-actions">
          <div class="mini">Formatos aceitos: PNG, SVG, WEBP ou JPG com até 4 MB. O ideal é usar fundo transparente.</div>
          <div class="actions">
            <label class="btn btn-secondary" for="brand-admin-upload">${state.customLogoDataUrl ? "Trocar logotipo" : "Subir logotipo"}</label>
            ${state.customLogoDataUrl ? `<button class="btn btn-outline" type="button" onclick="window.clearCustomLogo()">Remover</button>` : ""}
          </div>
          <input id="brand-admin-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="window.handleLogoUpload(event)" hidden>
        </div>
      </div>
    </div>
  `;
}

function sidebarView() {
  const links = [
    ["dashboard", "Painel"],
    ["comissoes", "Comissões"],
    ...(isAdmin() ? [["importacoes", "Importações"], ["parceiros", "Parceiros"], ["usuarios", "Usuários"], ["renovacoes", "Renovações"]] : []),
    ["clientes-renovar", "Clientes a Renovar"],
  ];

  return `
    <aside class="sidebar">
      <div class="kicker">crm_certifast</div>
      <div class="brand-title">
        <h1>${escapeHtml(state.profile?.nome || "CRM")}</h1>
        <p>${isAdmin() ? "Administrador" : "Participante"} | ${escapeHtml(state.profile?.email || "")}</p>
      </div>
      <div class="card stack">
        <div class="chip-row">
          <span class="chip">${isAdmin() ? "Acesso total" : "Acesso individual"}</span>
          <span class="chip">${state.periods.length} período(s)</span>
        </div>
        <p class="mini">Usuários comuns veem apenas comissão. Inteligência de renovação fica restrita ao administrador.</p>
      </div>
      <div class="nav">
        ${links.map(([id, label]) => `<button class="${state.activePage === id ? "active" : ""}" onclick="window.navigate('${id}')">${label}</button>`).join("")}
      </div>
      <div class="actions" style="margin-top:24px;">
        <button class="btn btn-secondary" onclick="window.signOut()">Sair</button>
      </div>
    </aside>
  `;
}

function topMessage() {
  const items = [];
  if (state.message) {
    items.push(`<div class="alert ${alertClass(state.message.type)}">${escapeHtml(state.message.text)}</div>`);
  }
  return items.join("");
}

function dashboardView() {
  const periods = state.periods.length;
  const files = state.files.length;
  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Painel do CRM</h2>
            <p class="muted">Base segura com Supabase, importação controlada e acesso segmentado por perfil.</p>
          </div>
        </div>
        <div class="grid grid-4" style="margin-top: 18px;">
          <div class="stat"><div class="label">Períodos carregados</div><div class="value">${periods}</div><div class="meta">A partir das importações realizadas</div></div>
          <div class="stat"><div class="label">Participantes</div><div class="value">${state.participants.length}</div><div class="meta">Base de comissionamento</div></div>
          <div class="stat"><div class="label">Arquivos importados</div><div class="value">${files}</div><div class="meta">Somente visível ao admin</div></div>
          <div class="stat"><div class="label">Escopo do acesso</div><div class="value">${isAdmin() ? "Total" : "Individual"}</div><div class="meta">${isAdmin() ? "Comissão + renovação" : "Somente sua comissão"}</div></div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card stack">
          <div class="section-title"><h3>Critérios universais de segurança</h3></div>
          <div class="mini">RLS em todas as tabelas, bucket privado, menor privilégio, CSP na Vercel e nenhum segredo administrativo no frontend.</div>
          <div class="chip-row">
            <span class="chip">RLS</span>
            <span class="chip">Bucket privado</span>
            <span class="chip">CSP</span>
            <span class="chip">Sem service_role no cliente</span>
          </div>
        </div>
        <div class="card stack">
          <div class="section-title"><h3>Modelo operacional</h3></div>
          <div class="mini">Administrador importa P, R, V e Renovação. Participantes acompanham apenas seu resultado mensal.</div>
          <div class="chip-row">
            <span class="chip">P: regras e participantes</span>
            <span class="chip">R: vendas</span>
            <span class="chip">V: validações</span>
            <span class="chip">Renovação: carteira e oportunidades</span>
          </div>
        </div>
      </div>
      ${brandingCard()}
    </div>
  `;
}

function periodSelector() {
  return `
    <div class="field">
      <label>Período</label>
      <select onchange="window.onPeriodChange(this.value)">
        ${state.periods.map((item) => `<option value="${item.value}" ${state.selectedPeriod === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
      </select>
    </div>
  `;
}

function participantSelector() {
  if (!isAdmin()) {
    return `
      <div class="field">
        <label>Participante</label>
        <input value="${escapeHtml(currentParticipantLabel())}" disabled>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Participante</label>
      <select onchange="window.onParticipantChange(this.value)">
        <option value="">Todos</option>
        ${state.participants.map((item) => `<option value="${item.id}" ${state.selectedParticipantId === item.id ? "selected" : ""}>${escapeHtml(item.nome)}</option>`).join("")}
      </select>
    </div>
  `;
}

function commissionView() {
  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Comissões</h2>
            <p class="muted">Relatório de vendas e validações com cálculo líquido por participante.</p>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="window.loadCommissionReport()">${state.loading ? "Carregando..." : "Gerar relatório"}</button>
          </div>
        </div>
        <div class="grid grid-3" style="margin-top: 18px;">
          ${periodSelector()}
          ${participantSelector()}
          <div class="field">
            <label>Acesso</label>
            <input disabled value="${isAdmin() ? "Consolidado e individual" : "Somente minha comissão"}">
          </div>
        </div>
      </div>
      ${state.report ? commissionReportView() : `<div class="card"><div class="empty">Gere um relatório para visualizar os resultados do período.</div></div>`}
    </div>
  `;
}

function commissionReportView() {
  const totals = state.report.totals;
  return `
    <div class="stack">
      <div class="card">
        <div class="section-title">
          <h3>Resumo do período ${formatPeriod(state.report.period)}</h3>
        </div>
        <div class="grid grid-4">
          <div class="stat"><div class="label">Comissão de vendas</div><div class="value">${money(totals.vendas)}</div><div class="meta">${totals.qtdeVendas} venda(s)</div></div>
          <div class="stat"><div class="label">Comissão de validações</div><div class="value">${money(totals.validacoes)}</div><div class="meta">${totals.qtdeValidacoes} validação(ões)</div></div>
          <div class="stat"><div class="label">Descontos</div><div class="value">${money(totals.imposto + totals.contabilidade)}</div><div class="meta">Imposto + contabilidade</div></div>
          <div class="stat"><div class="label">Total líquido</div><div class="value">${money(totals.liquido)}</div><div class="meta">Valor previsto para receber</div></div>
        </div>
      </div>
      ${state.report.items.map(commissionCard).join("")}
    </div>
  `;
}

function commissionCard(item) {
  return `
    <div class="card stack">
      <div class="section-title">
        <div>
          <h3>${escapeHtml(item.participant.nome)}</h3>
          <p class="muted">${escapeHtml(item.participant.fantasia || "Sem unidade")} | Faixa ${escapeHtml(item.participant.faixa || "-")}</p>
        </div>
        <div class="chip-row">
          <span class="chip">${item.resumo.quantidadeVendas} venda(s)</span>
          <span class="chip">${item.resumo.quantidadeValidacoes} validação(ões)</span>
          <span class="chip">${money(item.resumo.liquido)}</span>
        </div>
      </div>
      <div class="grid grid-4">
        <div class="stat"><div class="label">Vendas</div><div class="value">${money(item.resumo.comissaoVendas)}</div><div class="meta">Faturamento ${money(item.resumo.faturamento)}</div></div>
        <div class="stat"><div class="label">Validações</div><div class="value">${money(item.resumo.validacaoTotal)}</div><div class="meta">Soft ${money(item.resumo.comissaoSoftware)} | Hard ${money(item.resumo.comissaoHardware)}</div></div>
        <div class="stat"><div class="label">Imposto</div><div class="value">${money(item.resumo.imposto)}</div><div class="meta">Contabilidade ${money(item.resumo.contabilidade)}</div></div>
        <div class="stat"><div class="label">Líquido</div><div class="value">${money(item.resumo.liquido)}</div><div class="meta">Bruto ${money(item.resumo.bruto)}</div></div>
      </div>
      <details>
        <summary>Detalhamento de vendas</summary>
        <div class="details-body">${item.salesRows.length ? tableSales(item.salesRows) : `<div class="empty">Sem vendas nesse período.</div>`}</div>
      </details>
      <details>
        <summary>Detalhamento de validações</summary>
        <div class="details-body">${item.validationRows.length ? tableValidations(item.validationRows) : `<div class="empty">Sem validações nesse período.</div>`}</div>
      </details>
    </div>
  `;
}

function tableSales(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Dt. Pedido</th><th>Dt. Verificação</th><th>Produto</th><th class="text-right">Faturamento</th><th class="text-right">Comissão</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.pedido)}</td><td>${escapeHtml(row.cliente || "-")}</td><td>${escapeHtml(row.data_pedido || "-")}</td><td>${escapeHtml(row.data_verificacao || "-")}</td><td>${escapeHtml(row.produto || "-")}</td><td class="text-right">${money(row.faturamento)}</td><td class="text-right">${money(row.comissao)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function tableValidations(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Dt. Pedido</th><th>Dt. Validação</th><th>Produto</th><th class="text-right">Bruto Soft</th><th class="text-right">Bruto Hard</th><th class="text-right">Com. Soft</th><th class="text-right">Com. Hard</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.pedido)}</td><td>${escapeHtml(row.cliente || "-")}</td><td>${escapeHtml(row.data_pedido || "-")}</td><td>${escapeHtml(row.data_validacao || "-")}</td><td>${escapeHtml(row.produto || "-")}</td><td class="text-right">${money(row.bruto_software)}</td><td class="text-right">${money(row.bruto_hardware)}</td><td class="text-right">${money(row.comissao_software)}</td><td class="text-right">${money(row.comissao_hardware)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function importsView() {
  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Importações</h2>
            <p class="muted">Cada área abaixo aceita apenas o tipo correto de planilha. Isso evita subir arquivo no lugar errado.</p>
          </div>
        </div>
        <div class="grid grid-2" style="margin-top:18px;">
          ${importSlotCard({
            title: "Base de participantes",
            type: "parceiros",
            inputId: "import-parceiros",
            button: "Importar parceiros",
            helper: "Use apenas a planilha P no formato P-MMAAAA.xlsx. Exemplo: P-042026.xlsx.",
          })}
          ${importSlotCard({
            title: "Relatório de vendas",
            type: "revenda",
            inputId: "import-revenda",
            button: "Importar vendas",
            helper: "Use apenas a planilha R no formato R-MMAAAA.xlsx. Exemplo: R-042026.xlsx.",
          })}
          ${importSlotCard({
            title: "Relatório de validações",
            type: "validacoes",
            inputId: "import-validacoes",
            button: "Importar validações",
            helper: "Use apenas a planilha V no formato V-MMAAAA.xlsx. Exemplo: V-042026.xlsx.",
          })}
          ${importSlotCard({
            title: "Renovação do mês",
            type: "renovacoes",
            inputId: "import-renovacoes-principal",
            button: "Importar renovação atual",
            helper: "Use a planilha principal do mês. O sistema valida pela estrutura e pela data de vencimento, não só pelo nome do arquivo.",
            sourceArea: "principal",
          })}
        </div>
      </div>
      <div class="card">
        <div class="section-title">
          <div>
            <h3>Histórico de renovação</h3>
            <p class="muted">Aqui entram os arquivos antigos da pasta RELATORIO DE RENOVAÇÃO para análise comparativa mês a mês e ano a ano.</p>
          </div>
        </div>
        <form class="form-grid" onsubmit="window.handleImportSlot(event, 'renovacoes', 'historico_renovacao')">
          <div class="field">
            <label>Arquivos históricos</label>
            <input id="import-renovacoes-historico_renovacao" type="file" multiple accept=".xlsx,.xls,.csv">
            <span class="mini">Aceita relatórios analíticos e históricos mesmo quando o nome variar. O sistema prioriza a coluna Data de Vencimento para identificar o período.</span>
          </div>
          <div class="actions">
            <button class="btn btn-primary" type="submit">${state.loading ? "Importando..." : "Importar histórico de renovação"}</button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="section-title"><h3>Histórico de importações</h3></div>
        ${state.files.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Período</th><th>Origem</th><th>Tamanho</th><th>Importado em</th></tr></thead>
              <tbody>
                ${state.files.map((file) => `<tr><td>${escapeHtml(file.file_name)}</td><td>${escapeHtml(file.file_type)}</td><td>${escapeHtml(formatPeriod(file.period))}</td><td>${escapeHtml(file.source_area)}</td><td>${(Number(file.file_size_bytes || 0) / 1024).toFixed(1)} KB</td><td>${formatDateTime(file.created_at)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty">Nenhum arquivo importado ainda.</div>`}
      </div>
    </div>
  `;
}

function importSlotCard({ title, type, inputId, button, helper, sourceArea = null }) {
  const sourceArg = sourceArea ? `, '${sourceArea}'` : "";
  return `
    <form class="card stack import-slot" onsubmit="window.handleImportSlot(event, '${type}'${sourceArg})">
      <div class="section-title"><h3>${escapeHtml(title)}</h3></div>
      <div class="field">
        <label>Arquivo</label>
        <input id="${inputId}" type="file" accept=".xlsx,.xls,.csv">
        <span class="mini">${escapeHtml(helper)}</span>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="submit">${state.loading ? "Importando..." : escapeHtml(button)}</button>
      </div>
    </form>
  `;
}

function usersView() {
  const profiles = filteredProfiles();
  const totalPartnerUsers = state.profiles.filter((item) => item.role === "participant").length;
  const activeUsers = state.profiles.filter((item) => item.status === "active").length;

  return `
      <div class="stack">
        <div class="card">
          <div class="page-head">
            <div>
              <h2>Acessos e senhas dos parceiros</h2>
              <p class="muted">Gerencie quem entra no CRM, quais parceiros cada usuário pode ver e dispare ações seguras de acesso e redefinição de senha.</p>
            </div>
          </div>
          <div class="grid grid-3" style="margin-top: 18px;">
            <div class="field">
              <label>Buscar usuário ou parceiro</label>
              <input value="${escapeHtml(state.userSearch)}" placeholder="Nome, e-mail, parceiro ou unidade..." oninput="window.setUserSearch(this.value)">
            </div>
            <div class="field">
              <label>Filtrar papel</label>
              <select onchange="window.setUserRoleFilter(this.value)">
                <option value="__all__" ${state.userRoleFilter === "__all__" ? "selected" : ""}>Todos</option>
                <option value="participant" ${state.userRoleFilter === "participant" ? "selected" : ""}>Parceiros/Participantes</option>
                <option value="admin" ${state.userRoleFilter === "admin" ? "selected" : ""}>Administradores</option>
              </select>
            </div>
            <div class="stats-grid compact-stats">
              <div class="stat-card">
                <div class="label">Usuários visíveis</div>
                <div class="value">${profiles.length}</div>
              </div>
              <div class="stat-card">
                <div class="label">Parceiros com login</div>
                <div class="value">${totalPartnerUsers}</div>
              </div>
              <div class="stat-card">
                <div class="label">Usuários ativos</div>
                <div class="value">${activeUsers}</div>
              </div>
            </div>
          </div>
          <div class="card tone-soft" style="margin-top: 18px;">
            <div class="mini">Senha não fica visível no sistema. Para segurança, a gestão é feita por envio de link de acesso e redefinição de senha por e-mail.</div>
          </div>
        </div>
      ${profiles.map(profileCard).join("") || `<div class="card"><div class="empty">Nenhum perfil encontrado para os filtros atuais.</div></div>`}
      </div>
    `;
}

function profileCard(profile) {
  const selectedIds = linkedParticipantIds(profile.id);
  const partners = linkedParticipants(profile.id);
    return `
      <div class="card stack">
        <div class="section-title">
          <div>
            <h3>${escapeHtml(profile.nome)}</h3>
            <p class="muted">${escapeHtml(profile.email)}</p>
            <div class="profile-meta-row">
              <span class="participant-chip">${profile.role === "admin" ? "Administrador" : "Parceiro / participante"}</span>
              <span class="participant-chip participant-chip-muted">${profile.status === "active" ? "Ativo" : "Inativo"}</span>
              <span class="participant-chip participant-chip-muted">${partners.length} parceiro(s) vinculado(s)</span>
            </div>
          </div>
          <div class="actions wrap-actions">
            <button class="btn btn-primary" onclick="window.saveUserBindings('${profile.id}')">Salvar acesso</button>
            <button class="btn btn-outline" onclick="window.sendAccessLinkToProfile('${profile.id}')">Enviar link de acesso</button>
            <button class="btn btn-outline" onclick="window.sendPasswordResetToProfile('${profile.id}')">Redefinir senha</button>
          </div>
        </div>
        <div class="grid grid-3">
        <div class="field">
          <label>Nome</label>
          <input id="profile-name-${profile.id}" value="${escapeHtml(profile.nome)}">
        </div>
        <div class="field">
          <label>Papel</label>
          <select id="profile-role-${profile.id}">
            <option value="participant" ${profile.role === "participant" ? "selected" : ""}>Participante</option>
            <option value="admin" ${profile.role === "admin" ? "selected" : ""}>Administrador</option>
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select id="profile-status-${profile.id}">
            <option value="active" ${profile.status === "active" ? "selected" : ""}>Ativo</option>
            <option value="inactive" ${profile.status === "inactive" ? "selected" : ""}>Inativo</option>
          </select>
        </div>
      </div>
        <div class="field">
          <label>Parceiros hoje vinculados</label>
          <div class="selected-partner-chips">
            ${partners.length
              ? partners.map((participant) => `
                  <span class="participant-chip">
                    ${escapeHtml(participant.nome)}
                    <span class="participant-chip-muted">${escapeHtml(participant.fantasia || "Sem unidade")}</span>
                  </span>
                `).join("") 
              : `<span class="mini">Nenhum parceiro vinculado ainda.</span>`}
          </div>
        </div>
        <div class="field">
          <label>Participantes vinculados</label>
          <div class="participant-picker">
            <div class="participant-picker-head">
              <span>Selecione os parceiros que este usuário pode acessar</span>
              <span>${state.participants.length} participantes na base</span>
            </div>
          <div class="check-list">
          ${state.participants.map((participant) => `
            <label class="participant-option ${selectedIds.includes(participant.id) ? "is-selected" : ""}">
              <input class="participant-option-input" type="checkbox" data-profile="${profile.id}" value="${participant.id}" ${selectedIds.includes(participant.id) ? "checked" : ""}>
              <span class="participant-option-body">
                <span class="participant-option-top">
                  <strong>${escapeHtml(participant.nome)}</strong>
                  <span class="participant-option-check">Acesso</span>
                </span>
                <span class="participant-option-meta">
                  <span class="participant-chip">${escapeHtml(participant.fantasia || "Sem unidade")}</span>
                  <span class="participant-chip participant-chip-muted">${escapeHtml(participant.faixa || "Sem faixa")}</span>
                </span>
              </span>
            </label>
          `).join("") || `<span class="mini">Importe primeiro o arquivo de parceiros para gerar os participantes.</span>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function participantsAdminView() {
  const pageData = paginatedParticipants();
  const partners = pageData.items;
  const units = participantUnitOptions();
  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Parceiros e regras</h2>
            <p class="muted">Edite imposto, contabilidade, verificação e percentuais de comissionamento de cada parceiro importado pela planilha P.</p>
          </div>
        </div>
        <div class="grid grid-3" style="margin-top: 18px;">
          <div class="field">
            <label>Buscar parceiro</label>
            <input value="${escapeHtml(state.partnerSearch)}" placeholder="Nome, unidade, email ou código..." oninput="window.setPartnerSearch(this.value)">
          </div>
          <div class="field">
            <label>Filtrar por unidade</label>
            <select onchange="window.setPartnerUnitFilter(this.value)">
              <option value="__all__" ${state.partnerUnitFilter === "__all__" ? "selected" : ""}>Todas as unidades</option>
              ${units.map((unit) => `<option value="${escapeHtml(unit)}" ${state.partnerUnitFilter === unit ? "selected" : ""}>${escapeHtml(unit)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Ordenar por</label>
            <select onchange="window.setPartnerSort(this.value)">
              <option value="pendencias" ${state.partnerSort === "pendencias" ? "selected" : ""}>Pendências primeiro</option>
              <option value="nome" ${state.partnerSort === "nome" ? "selected" : ""}>Nome do parceiro</option>
              <option value="unidade" ${state.partnerSort === "unidade" ? "selected" : ""}>Unidade</option>
              <option value="faixa" ${state.partnerSort === "faixa" ? "selected" : ""}>Faixa</option>
            </select>
          </div>
        </div>
        <div class="grid grid-3" style="margin-top: 16px;">
          <div class="stat">
            <div class="label">Parceiros visíveis</div>
            <div class="value">${pageData.total}</div>
            <div class="meta">${state.participants.length} parceiro(s) cadastrados</div>
          </div>
          <div class="stat">
            <div class="label">Pendências de regra</div>
            <div class="value">${pageData.pending}</div>
            <div class="meta">Sem regra financeira completa</div>
          </div>
          <div class="stat">
            <div class="label">Página atual</div>
            <div class="value">${pageData.currentPage}</div>
            <div class="meta">${pageData.start}-${pageData.end} de ${pageData.total}</div>
          </div>
        </div>
      </div>
      ${state.participants.length ? `
        <div class="card stack">
          <div class="section-title">
            <div>
              <h3>Edição em lote</h3>
              <p class="muted">Aplica os campos preenchidos aos parceiros filtrados acima.</p>
            </div>
            <div class="actions">
              <button class="btn btn-outline" onclick="window.saveBatchParticipantConfig()">Aplicar ao filtro</button>
            </div>
          </div>
          <div class="grid grid-3">
            <div class="field">
              <label>Imposto</label>
              <input id="batch-imposto" placeholder="Ex.: 0.1 ou 150">
            </div>
            <div class="field">
              <label>Contabilidade</label>
              <input id="batch-contabilidade" placeholder="Ex.: 50">
            </div>
            <div class="field">
              <label>Verificação</label>
              <input id="batch-verificacao" placeholder="Ex.: 25">
            </div>
            <div class="field">
              <label>% venda</label>
              <input id="batch-percentual-venda" placeholder="Ex.: 0.15">
            </div>
            <div class="field">
              <label>% software</label>
              <input id="batch-percentual-software" placeholder="Ex.: 0.12">
            </div>
            <div class="field">
              <label>% hardware</label>
              <input id="batch-percentual-hardware" placeholder="Ex.: 0.08">
            </div>
          </div>
          <span class="mini">Campos em branco não alteram nada. Percentuais usam decimal: 0.1 = 10%.</span>
        </div>
        ${partners.length ? `
          <div class="grid grid-2">
            ${partners.map(participantConfigCard).join("")}
          </div>
          <div class="card stack">
            <div class="pagination-bar">
              <div class="mini">Mostrando ${pageData.start} a ${pageData.end} de ${pageData.total} parceiro(s).</div>
              <div class="actions">
                <button class="btn btn-outline" ${pageData.currentPage <= 1 ? "disabled" : ""} onclick="window.setPartnerPage(${pageData.currentPage - 1})">Página anterior</button>
                <button class="btn btn-outline" ${pageData.currentPage >= pageData.totalPages ? "disabled" : ""} onclick="window.setPartnerPage(${pageData.currentPage + 1})">Próxima página</button>
              </div>
            </div>
          </div>
        ` : `<div class="card"><div class="empty">Nenhum parceiro encontrado com o filtro atual.</div></div>`}
      ` : `<div class="card"><div class="empty">Importe primeiro a planilha de parceiros para abrir a configuração individual.</div></div>`}
    </div>
  `;
}

function participantConfigCard(participant) {
  const missingRules = participantMissingRuleFields(participant);
  return `
    <div class="card stack participant-config-card ${missingRules.length ? "participant-config-card-warning" : ""}">
      <div class="section-title">
        <div>
          <h3>${escapeHtml(participant.nome)}</h3>
          <p class="muted">${escapeHtml(participant.fantasia || "Sem unidade")} | Faixa ${escapeHtml(participant.faixa || "-")}</p>
          <div class="chip-row" style="margin-top: 10px;">
            <span class="chip">${escapeHtml(participantUnitLabel(participant))}</span>
            ${missingRules.length ? `<span class="chip chip-warning">Pendente: ${escapeHtml(missingRules.join(", "))}</span>` : `<span class="chip chip-success">Regras completas</span>`}
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" onclick="window.saveParticipantConfig('${participant.id}')">Salvar parceiro</button>
        </div>
      </div>
      <div class="grid grid-3">
        <div class="field">
          <label>Fantasia</label>
          <input id="participant-fantasia-${participant.id}" value="${escapeHtml(participant.fantasia || "")}">
        </div>
        <div class="field">
          <label>Faixa</label>
          <input id="participant-faixa-${participant.id}" value="${escapeHtml(participant.faixa || "")}">
        </div>
        <div class="field">
          <label>Código revenda</label>
          <input id="participant-codigo-${participant.id}" value="${escapeHtml(participant.codigo_revenda || "")}">
        </div>
        <div class="field">
          <label>Email</label>
          <input id="participant-email-${participant.id}" value="${escapeHtml(participant.email || "")}">
        </div>
        <div class="field">
          <label>Imposto</label>
          <input id="participant-imposto-${participant.id}" value="${escapeHtml(participant.imposto ?? "")}" placeholder="Ex.: 0.1 ou 150">
          <span class="mini">Use decimal para percentual. Ex.: 0.1 = 10%.</span>
        </div>
        <div class="field">
          <label>Contabilidade</label>
          <input id="participant-contabilidade-${participant.id}" value="${escapeHtml(participant.contabilidade ?? "")}" placeholder="Ex.: 50">
        </div>
        <div class="field">
          <label>Verificação</label>
          <input id="participant-verificacao-${participant.id}" value="${escapeHtml(participant.verificacao ?? "")}" placeholder="Ex.: 25">
        </div>
        <div class="field">
          <label>% venda</label>
          <input id="participant-percentual-venda-${participant.id}" value="${escapeHtml(participant.percentual_venda ?? "")}" placeholder="Ex.: 0.15">
        </div>
        <div class="field">
          <label>% software</label>
          <input id="participant-percentual-software-${participant.id}" value="${escapeHtml(participant.percentual_software ?? "")}" placeholder="Ex.: 0.12">
        </div>
        <div class="field">
          <label>% hardware</label>
          <input id="participant-percentual-hardware-${participant.id}" value="${escapeHtml(participant.percentual_hardware ?? "")}" placeholder="Ex.: 0.08">
        </div>
      </div>
    </div>
  `;
}

function renewalsView() {
  if (!isAdmin()) {
    return `
      <div class="card">
        <div class="empty">A análise executiva de renovações é exclusiva do administrador. Use o menu "Clientes a Renovar" para ver a sua própria carteira.</div>
      </div>
    `;
  }

  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Renovações e oportunidades</h2>
            <p class="muted">Visão exclusiva do administrador para analisar carteira, conversão, perda e recuperação.</p>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="window.loadRenewalAnalysis()">${state.loading ? "Analisando..." : "Analisar período"}</button>
          </div>
        </div>
        <div class="grid grid-2" style="margin-top: 18px;">
          ${periodSelector()}
          <div class="field">
            <label>Escopo</label>
            <input disabled value="Histórico completo de renovação + produção do período">
          </div>
        </div>
      </div>
      ${state.renewal ? renewalsReportView() : `<div class="card"><div class="empty">Gere a análise para visualizar a carteira de renovação.</div></div>`}
    </div>
  `;
}

function renewalClientsView() {
  const pending = (state.renewal?.rows || []).filter((item) => !item.renovouAgora);
  const hot = pending.filter((item) => item.esteveNoMesmoMesAnoAnterior);
  const recurrent = pending.filter((item) => item.jaEsteveNaBase);
  const fresh = pending.filter((item) => !item.jaEsteveNaBase);

  return `
    <div class="stack">
      <div class="card">
        <div class="page-head">
          <div>
            <h2>Gestão de clientes a renovar</h2>
            <p class="muted">${isAdmin() ? "Fila operacional completa dos clientes que ainda não renovaram." : "Sua fila operacional de clientes que ainda não renovaram."}</p>
          </div>
          <div class="actions">
            <button class="btn btn-primary" onclick="window.loadRenewalAnalysis()">${state.loading ? "Atualizando..." : "Atualizar fila"}</button>
          </div>
        </div>
        <div class="grid grid-2" style="margin-top: 18px;">
          ${periodSelector()}
          <div class="field">
            <label>Objetivo</label>
            <input disabled value="${isAdmin() ? "Transformar vencimento em carteira ativa de contato e conversão" : "Visualização da sua carteira de renovação"}">
          </div>
        </div>
      </div>
      ${!state.renewal ? `<div class="card"><div class="empty">Gere a análise de renovação para abrir a gestão operacional dos clientes a renovar.</div></div>` : `
        <div class="card">
          <div class="section-title"><h3>Fila de prioridade</h3></div>
          <div class="grid grid-4">
            <div class="stat"><div class="label">Pendentes totais</div><div class="value">${pending.length}</div><div class="meta">Todos os clientes sem renovação no período</div></div>
            <div class="stat"><div class="label">Carteira quente</div><div class="value">${hot.length}</div><div class="meta">Mesmo mês do ano anterior</div></div>
            <div class="stat"><div class="label">Recorrentes pendentes</div><div class="value">${recurrent.length}</div><div class="meta">Já passaram em base anterior</div></div>
            <div class="stat"><div class="label">Novos na base</div><div class="value">${fresh.length}</div><div class="meta">Sem histórico anterior</div></div>
          </div>
        </div>
        <div class="grid grid-3">
          ${renewalQueueCard("Prioridade máxima", hot, "Clientes do mesmo mês do ano anterior que ainda não renovaram.")}
          ${renewalQueueCard("Recorrentes a atacar", recurrent, "Clientes já conhecidos que seguem sem conversão.")}
          ${renewalQueueCard("Novos para abordagem", fresh, "Clientes novos na base de renovação do período.")}
        </div>
        <div class="card">
          <div class="section-title">
            <h3>Lista operacional completa</h3>
            <div class="split">
              <span class="pill">Período ${formatPeriod(state.renewal.period)}</span>
              <span class="pill">${pending.length} pendente(s)</span>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Ponto</th>
                  <th>Agente</th>
                  <th>Vencimento</th>
                  <th>Status atual</th>
                  <th>Prioridade</th>
                  <th>Contexto</th>
                </tr>
              </thead>
              <tbody>
                ${pending.map((item) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(item.cliente || "-")}</strong><br>
                      <span class="mini">${escapeHtml(item.email || item.telefone || item.cnpj || item.cpf || "-")}</span>
                    </td>
                    <td>${escapeHtml(item.produto || "-")}</td>
                    <td>${escapeHtml(item.ponto_atendimento || "-")}</td>
                    <td>${escapeHtml(item.agente || "-")}</td>
                    <td>${escapeHtml(item.data_vencimento || "-")}</td>
                    <td>${escapeHtml(item.status_pedido || "-")}</td>
                    <td>${renewalPriorityBadge(item)}</td>
                    <td>${item.esteveNoMesmoMesAnoAnterior ? "Mesmo mês do ano anterior" : item.jaEsteveNaBase ? "Cliente recorrente da base" : "Cliente novo na base"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}

function renewalQueueCard(title, items, description) {
  return `
    <div class="card">
      <div class="section-title"><h3>${escapeHtml(title)}</h3></div>
      <p class="mini">${escapeHtml(description)}</p>
      ${items.length ? `
        <div class="table-wrap" style="margin-top: 14px;">
          <table>
            <thead><tr><th>Cliente</th><th>Produto</th><th>Agente</th></tr></thead>
            <tbody>
              ${items.slice(0, 12).map((item) => `
                <tr>
                  <td>${escapeHtml(item.cliente || "-")}</td>
                  <td>${escapeHtml(item.produto || "-")}</td>
                  <td>${escapeHtml(item.agente || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty" style="margin-top: 14px;">Sem clientes neste recorte.</div>`}
    </div>
  `;
}

function renewalPriorityBadge(item) {
  if (item.esteveNoMesmoMesAnoAnterior) return '<span class="chip">Prioridade máxima</span>';
  if (item.jaEsteveNaBase) return '<span class="chip">Recorrente</span>';
  return '<span class="chip">Nova oportunidade</span>';
}

function renewalsReportView() {
  const r = state.renewal;
  return `
    <div class="stack">
      <div class="card">
        <div class="section-title"><h3>Resumo da base ${formatPeriod(r.period)}</h3></div>
        <div class="grid grid-4">
          <div class="stat"><div class="label">Total da base</div><div class="value">${r.totalBase}</div><div class="meta">Clientes com vencimento no período</div></div>
          <div class="stat"><div class="label">Renovaram</div><div class="value">${r.convertidos}</div><div class="meta">${percent(r.indicadores.taxaRenovacao)} de conversão</div></div>
          <div class="stat"><div class="label">Não renovaram</div><div class="value">${r.pendentes}</div><div class="meta">Oportunidade aberta</div></div>
          <div class="stat"><div class="label">Carteira recorrente</div><div class="value">${r.recorrentes}</div><div class="meta">${percent(r.indicadores.taxaRecorrente)} da base</div></div>
        </div>
      </div>
      <div class="card">
        <div class="section-title"><h3>Indicadores gerenciais</h3></div>
        <div class="grid grid-4">
          <div class="stat"><div class="label">Recuperados</div><div class="value">${r.recuperados}</div><div class="meta">Recorrentes que converteram</div></div>
          <div class="stat"><div class="label">Perdidos recorrentes</div><div class="value">${r.perdidosRecorrentes}</div><div class="meta">${percent(r.indicadores.taxaPerdaRecorrente)} sobre recorrentes</div></div>
          <div class="stat"><div class="label">Ano anterior convertidos</div><div class="value">${r.convertidosAnoAnterior}</div><div class="meta">${percent(r.indicadores.taxaConversaoAnoAnterior)} do mesmo mês</div></div>
          <div class="stat"><div class="label">Novos na base</div><div class="value">${r.novosNaBase}</div><div class="meta">Sem histórico anterior</div></div>
        </div>
      </div>
      <div class="grid grid-2">
        ${rankingCard("Oportunidades por produto", r.oportunidadesPorProduto)}
        ${rankingCard("Oportunidades por ponto", r.oportunidadesPorPonto)}
        ${rankingCard("Oportunidades por agente", r.oportunidadesPorAgente)}
        ${rankingCard("Oportunidades por status", r.oportunidadesPorStatus)}
        ${rankingCard("Oportunidades por AR", r.oportunidadesPorAr)}
        ${rankingCard("Convertidos por produto", r.convertidosPorProduto)}
        ${rankingCard("Convertidos por ponto", r.convertidosPorPonto)}
      </div>
      <div class="card">
        <div class="section-title"><h3>Base detalhada</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Vencimento</th><th>Produto</th><th>Ponto</th><th>Agente</th><th>Status</th><th>Histórico</th><th>Conversão</th></tr></thead>
            <tbody>
              ${r.rows.map((item) => `<tr><td><strong>${escapeHtml(item.cliente || "-")}</strong><br><span class="mini">${escapeHtml(item.email || item.telefone || item.cnpj || item.cpf || "-")}</span></td><td>${escapeHtml(item.data_vencimento || "-")}</td><td>${escapeHtml(item.produto || "-")}</td><td>${escapeHtml(item.ponto_atendimento || "-")}</td><td>${escapeHtml(item.agente || "-")}</td><td>${escapeHtml(item.status_pedido || "-")}</td><td>${item.esteveNoMesmoMesAnoAnterior ? "Mesmo mês ano anterior" : item.jaEsteveNaBase ? "Base anterior" : "Novo na base"}</td><td>${item.renovouAgora ? "Renovou no período" : "Ainda não renovou"}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function rankingCard(title, items) {
  return `
    <div class="card">
      <div class="section-title"><h3>${escapeHtml(title)}</h3></div>
      ${items.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Variável</th><th class="text-right">Qtde</th></tr></thead>
            <tbody>${items.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="text-right">${item.total}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      ` : `<div class="empty">Sem dados para este recorte.</div>`}
    </div>
  `;
}

function contentView() {
  if (!state.session || !state.profile) return authView();
  if (state.activePage === "dashboard") return dashboardView();
  if (state.activePage === "comissoes") return commissionView();
  if (state.activePage === "importacoes") return importsView();
  if (state.activePage === "parceiros") return participantsAdminView();
  if (state.activePage === "usuarios") return usersView();
  if (state.activePage === "renovacoes") return renewalsView();
  if (state.activePage === "clientes-renovar") return renewalClientsView();
  return dashboardView();
}

function appView() {
  if (!state.session || !state.profile) return authView();
  return `
    <div class="app-shell">
      ${sidebarView()}
      <main class="main stack">
        ${topMessage()}
        ${contentView()}
      </main>
    </div>
  `;
}

function render() {
  $("app").innerHTML = appView();
}

function onPeriodChange(value) {
  state.selectedPeriod = value;
}

function onParticipantChange(value) {
  state.selectedParticipantId = value;
}

async function handleLogoUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  if (file.size > 4 * 1024 * 1024) {
    setMessage("error", "Use um logo com até 4 MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    saveCustomLogo(String(reader.result || ""));
    setMessage("ok", "Logotipo aplicado nesta tela.");
  };
  reader.onerror = () => setMessage("error", "Não foi possível ler a imagem do logotipo.");
  reader.readAsDataURL(file);
}

function clearCustomLogo() {
  saveCustomLogo("");
  setMessage("ok", "Logotipo removido.");
}

window.signIn = signIn;
window.signUp = signUp;
window.signOut = signOut;
window.setAuthMode = setAuthMode;
window.requestMagicLink = requestMagicLink;
window.claimFirstAdmin = claimFirstAdmin;
window.navigate = navigate;
window.handleImport = handleImport;
window.handleImportSlot = handleImportSlot;
window.loadCommissionReport = loadCommissionReport;
window.loadRenewalAnalysis = loadRenewalAnalysis;
window.saveUserBindings = (profileId) => saveUserBindings(profileId).catch((error) => setMessage("error", error.message));
window.saveParticipantConfig = (participantId) => saveParticipantConfig(participantId).catch((error) => setMessage("error", error.message));
window.saveBatchParticipantConfig = () => saveBatchParticipantConfig().catch((error) => setMessage("error", error.message));
window.setPartnerSearch = setPartnerSearch;
window.setPartnerUnitFilter = setPartnerUnitFilter;
window.setPartnerSort = setPartnerSort;
window.setPartnerPage = setPartnerPage;
window.setUserSearch = setUserSearch;
window.setUserRoleFilter = setUserRoleFilter;
window.sendAccessLinkToProfile = (profileId) => sendAccessLinkToProfile(profileId).catch((error) => setMessage("error", error.message));
window.sendPasswordResetToProfile = (profileId) => sendPasswordResetToProfile(profileId).catch((error) => setMessage("error", error.message));
window.onPeriodChange = onPeriodChange;
window.onParticipantChange = onParticipantChange;
window.handleLogoUpload = handleLogoUpload;
window.clearCustomLogo = clearCustomLogo;

if (db) {
  db.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (!session) {
      resetAppSessionState();
      render();
      return;
    }
    try {
      await hydrateAuthenticatedState();
      render();
    } catch (error) {
      setMessage("error", error.message || "Falha ao atualizar sessão.");
    }
  });
}

loadCustomLogo();
render();
bootstrap();
