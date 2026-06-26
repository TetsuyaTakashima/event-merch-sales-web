import { createClient } from "@supabase/supabase-js";

const env = import.meta.env || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "";
const isSupabaseMode = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = isSupabaseMode ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const STORAGE_KEY = "event-merch-sales-web.v1";
const UI_STATE_KEY = "event-merch-sales-web.ui.v1";
const REMOTE_STATE_ID = "main";

const CASH_METHOD = "現金";
const paymentMethods = ["現金", "クレジットカード", "QR決済", "電子マネー"];

const roles = {
  admin: "管理者",
  manager: "現場責任者",
  staff: "販売スタッフ",
  tester: "テスト販売",
  viewer: "閲覧者",
};

const permissions = {
  admin: {
    sell: true,
    cancelAny: true,
    adjustInventory: true,
    closeEvent: true,
    manageProducts: true,
    manageEvents: true,
    manageUsers: true,
    manageData: true,
    deleteCancelledSales: true,
    exportCsv: true,
    viewReports: true,
  },
  manager: {
    sell: true,
    cancelAny: true,
    adjustInventory: true,
    closeEvent: true,
    manageProducts: true,
    manageEvents: true,
    manageUsers: false,
    manageData: true,
    deleteCancelledSales: true,
    exportCsv: true,
    viewReports: true,
  },
  staff: {
    sell: true,
    cancelAny: false,
    adjustInventory: false,
    closeEvent: false,
    manageProducts: false,
    manageEvents: false,
    manageUsers: false,
    manageData: false,
    deleteCancelledSales: false,
    dryRunSales: false,
    exportCsv: false,
    viewReports: true,
  },
  tester: {
    sell: true,
    cancelAny: false,
    adjustInventory: false,
    closeEvent: false,
    manageProducts: false,
    manageEvents: false,
    manageUsers: false,
    manageData: false,
    deleteCancelledSales: false,
    dryRunSales: true,
    exportCsv: false,
    viewReports: false,
  },
  viewer: {
    sell: false,
    cancelAny: false,
    adjustInventory: false,
    closeEvent: false,
    manageProducts: false,
    manageEvents: false,
    manageUsers: false,
    manageData: false,
    deleteCancelledSales: false,
    dryRunSales: false,
    exportCsv: true,
    viewReports: true,
  },
};

const navItems = [
  { id: "dashboard", label: "ダッシュボード", icon: "gauge" },
  { id: "pos", label: "販売", icon: "cart" },
  { id: "history", label: "販売履歴", icon: "receipt" },
  { id: "inventory", label: "在庫", icon: "boxes" },
  { id: "reports", label: "集計", icon: "chart" },
  { id: "events", label: "イベント", icon: "calendar" },
  { id: "products", label: "商品", icon: "tag" },
  { id: "users", label: "ユーザー", icon: "users" },
  { id: "menu", label: "メニュー", icon: "menu" },
];

const viewTitles = {
  dashboard: "ダッシュボード",
  pos: "販売登録",
  history: "販売履歴",
  inventory: "在庫管理",
  reports: "売上集計",
  events: "イベント管理",
  products: "商品管理",
  users: "ユーザー管理",
  menu: "メニュー",
};

let state = isSupabaseMode ? seedState() : loadState();
let appReady = !isSupabaseMode;
let authSession = null;
let authProfile = null;
let syncStatus = isSupabaseMode ? "未接続" : "ローカル保存";
let saveQueue = Promise.resolve();
let remoteStateVersion = null;
let remoteStateEpoch = 0;
let remoteStateChannel = null;

let ui = loadUiState({
  view: "dashboard",
  cart: [],
  paymentMethod: CASH_METHOD,
  cashReceived: "",
  authMode: "sign-in",
  search: "",
  category: "すべて",
  historyQuery: "",
  reportEventId: state.selectedEventId,
  saleSaving: false,
  pendingSaleId: "",
  toast: "",
});

function seedState() {
  const events = [
    {
      id: "evt-2026-spring",
      name: "春のファンミーティング",
      date: "2026-05-09",
      venue: "東京ホール A",
      status: "open",
      memo: "昼夜2部制。終演後の集中販売に注意。",
    },
    {
      id: "evt-2026-osaka",
      name: "大阪ポップアップ",
      date: "2026-05-23",
      venue: "梅田ギャラリー",
      status: "draft",
      memo: "サンプルイベント。",
    },
  ];

  const products = [
    {
      id: "prd-shirt",
      name: "ツアーTシャツ",
      code: "TSHIRT",
      category: "アパレル",
      status: "active",
      eventIds: events.map((event) => event.id),
      variants: [
        { id: "var-shirt-m", name: "M", sku: "TSHIRT-M", price: 3500, color: "#0f766e" },
        { id: "var-shirt-l", name: "L", sku: "TSHIRT-L", price: 3500, color: "#2563eb" },
      ],
    },
    {
      id: "prd-towel",
      name: "マフラータオル",
      code: "TOWEL",
      category: "雑貨",
      status: "active",
      eventIds: events.map((event) => event.id),
      variants: [{ id: "var-towel", name: "通常", sku: "TOWEL-STD", price: 2200, color: "#dc2626" }],
    },
    {
      id: "prd-acrylic",
      name: "アクリルスタンド",
      code: "ACRYLIC",
      category: "コレクション",
      status: "active",
      eventIds: events.map((event) => event.id),
      variants: [
        { id: "var-acrylic-a", name: "Type A", sku: "ACRYLIC-A", price: 1800, color: "#a21caf" },
        { id: "var-acrylic-b", name: "Type B", sku: "ACRYLIC-B", price: 1800, color: "#ea580c" },
      ],
    },
    {
      id: "prd-sticker",
      name: "ステッカーセット",
      code: "STICKER",
      category: "雑貨",
      status: "active",
      eventIds: events.map((event) => event.id),
      variants: [{ id: "var-sticker", name: "5枚セット", sku: "STICKER-5", price: 900, color: "#f59e0b" }],
    },
  ];

  const inventories = [
    { eventId: "evt-2026-spring", variantId: "var-shirt-m", initial: 40, current: 36, threshold: 8, actual: null },
    { eventId: "evt-2026-spring", variantId: "var-shirt-l", initial: 38, current: 34, threshold: 8, actual: null },
    { eventId: "evt-2026-spring", variantId: "var-towel", initial: 80, current: 75, threshold: 12, actual: null },
    { eventId: "evt-2026-spring", variantId: "var-acrylic-a", initial: 50, current: 46, threshold: 10, actual: null },
    { eventId: "evt-2026-spring", variantId: "var-acrylic-b", initial: 50, current: 47, threshold: 10, actual: null },
    { eventId: "evt-2026-spring", variantId: "var-sticker", initial: 120, current: 112, threshold: 20, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-shirt-m", initial: 0, current: 0, threshold: 8, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-shirt-l", initial: 0, current: 0, threshold: 8, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-towel", initial: 0, current: 0, threshold: 12, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-acrylic-a", initial: 0, current: 0, threshold: 10, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-acrylic-b", initial: 0, current: 0, threshold: 10, actual: null },
    { eventId: "evt-2026-osaka", variantId: "var-sticker", initial: 0, current: 0, threshold: 20, actual: null },
  ];

  const users = [
    { id: "usr-admin", name: "佐藤 管理", role: "admin", active: true },
    { id: "usr-manager", name: "田中 責任者", role: "manager", active: true },
    { id: "usr-staff", name: "鈴木 スタッフ", role: "staff", active: true },
    { id: "usr-tester", name: "テスト販売ユーザー", role: "tester", active: true },
    { id: "usr-viewer", name: "閲覧ユーザー", role: "viewer", active: true },
  ];

  const sales = [
    {
      id: "sale-sample-1",
      eventId: "evt-2026-spring",
      userId: "usr-staff",
      createdAt: "2026-05-05T10:12:00.000+09:00",
      paymentMethod: "QR決済",
      status: "completed",
      total: 7000,
      cancelReason: "",
      cancelledAt: "",
      items: [
        {
          productId: "prd-shirt",
          variantId: "var-shirt-m",
          name: "ツアーTシャツ",
          variantName: "M",
          quantity: 2,
          unitPrice: 3500,
          subtotal: 7000,
        },
      ],
    },
    {
      id: "sale-sample-2",
      eventId: "evt-2026-spring",
      userId: "usr-manager",
      createdAt: "2026-05-05T10:31:00.000+09:00",
      paymentMethod: "現金",
      cashReceived: 6000,
      changeDue: 200,
      status: "completed",
      total: 5800,
      cancelReason: "",
      cancelledAt: "",
      items: [
        {
          productId: "prd-towel",
          variantId: "var-towel",
          name: "マフラータオル",
          variantName: "通常",
          quantity: 1,
          unitPrice: 2200,
          subtotal: 2200,
        },
        {
          productId: "prd-acrylic",
          variantId: "var-acrylic-a",
          name: "アクリルスタンド",
          variantName: "Type A",
          quantity: 2,
          unitPrice: 1800,
          subtotal: 3600,
        },
      ],
    },
    {
      id: "sale-sample-3",
      eventId: "evt-2026-spring",
      userId: "usr-staff",
      createdAt: "2026-05-05T11:08:00.000+09:00",
      paymentMethod: "電子マネー",
      status: "completed",
      total: 3600,
      cancelReason: "",
      cancelledAt: "",
      items: [
        {
          productId: "prd-acrylic",
          variantId: "var-acrylic-b",
          name: "アクリルスタンド",
          variantName: "Type B",
          quantity: 2,
          unitPrice: 1800,
          subtotal: 3600,
        },
      ],
    },
    {
      id: "sale-sample-4",
      eventId: "evt-2026-spring",
      userId: "usr-admin",
      createdAt: "2026-05-05T11:29:00.000+09:00",
      paymentMethod: "クレジットカード",
      status: "completed",
      total: 2700,
      cancelReason: "",
      cancelledAt: "",
      items: [
        {
          productId: "prd-sticker",
          variantId: "var-sticker",
          name: "ステッカーセット",
          variantName: "5枚セット",
          quantity: 3,
          unitPrice: 900,
          subtotal: 2700,
        },
      ],
    },
  ];

  return {
    selectedEventId: "evt-2026-spring",
    currentUserId: "usr-admin",
    events,
    products,
    inventories,
    sales,
    adjustments: [],
    users,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const normalized = normalizeState(JSON.parse(raw));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.warn("Failed to load saved state.", error);
    return seedState();
  }
}

function normalizeState(saved) {
  const seed = seedState();
  const next = {
    ...seed,
    ...saved,
    events: Array.isArray(saved?.events) ? saved.events : seed.events,
    products: Array.isArray(saved?.products) ? saved.products : seed.products,
    inventories: Array.isArray(saved?.inventories) ? saved.inventories : seed.inventories,
    sales: Array.isArray(saved?.sales) ? saved.sales : seed.sales,
    adjustments: Array.isArray(saved?.adjustments) ? saved.adjustments : [],
    users: Array.isArray(saved?.users) ? saved.users : seed.users,
  };

  if (!next.events.some((event) => event.id === next.selectedEventId)) {
    next.selectedEventId = next.events[0]?.id ?? seed.selectedEventId;
  }

  if (!next.users.some((user) => user.id === next.currentUserId && user.active)) {
    next.currentUserId = next.users.find((user) => user.active)?.id ?? seed.currentUserId;
  }

  next.sales = next.sales.map((sale) => {
    const cashReceived = sale.cashReceived ?? null;
    const changeDue =
      sale.changeDue ??
      (sale.paymentMethod === CASH_METHOD && cashReceived !== null ? Number(cashReceived) - Number(sale.total || 0) : null);

    return {
      ...sale,
      cashReceived,
      changeDue,
    };
  });

  next.products = next.products.map((product) => ({
    ...product,
    eventIds: normalizeProductEventIds(product, next.events, next.inventories),
    variants: Array.isArray(product.variants) ? product.variants : [],
  }));

  const eventIds = next.events.map((event) => event.id);
  for (const event of next.events) {
    for (const product of next.products.filter((item) => productEventIds(item, eventIds).includes(event.id))) {
      for (const variant of product.variants) {
        if (!next.inventories.some((inventory) => inventory.eventId === event.id && inventory.variantId === variant.id)) {
          next.inventories.push({
            eventId: event.id,
            variantId: variant.id,
            initial: 0,
            current: 0,
            threshold: 5,
            actual: null,
          });
        }
      }
    }
  }

  return next;
}

function saveState() {
  if (!isSupabaseMode) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return Promise.resolve();
  }

  const payload = serializeStateForRemote(state);
  const epoch = remoteStateEpoch;
  syncStatus = "保存中";
  saveQueue = saveQueue
    .then(async () => {
      if (epoch !== remoteStateEpoch) return;
      if (!Number.isSafeInteger(remoteStateVersion)) {
        throw new Error("共有データの更新番号を確認できません");
      }

      const expectedVersion = remoteStateVersion;
      const { data, error } = await supabase
        .rpc("save_app_state", {
          p_data: payload,
          p_expected_version: expectedVersion,
        })
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const conflict = new Error("共有データが別の端末で更新されました");
        conflict.code = "REMOTE_STATE_CONFLICT";
        throw conflict;
      }
      remoteStateVersion = Number(data.version);
      syncStatus = "保存済み";
    })
    .catch(async (error) => {
      console.error("Failed to save remote state.", error);
      if (isRemoteStateConflict(error)) {
        await reloadAfterRemoteConflict();
        return;
      }
      syncStatus = "保存失敗";
      showToast("Supabaseへの保存に失敗しました");
    });
  return saveQueue;
}

function isRemoteStateConflict(error) {
  return error?.code === "REMOTE_STATE_CONFLICT" || error?.code === "40001" || error?.message?.includes("REMOTE_STATE_CONFLICT");
}

async function applyRemoteStateResult(record) {
  if (!record?.data) throw new Error("共有データの保存結果を確認できませんでした");
  remoteStateVersion = Number(record.version);
  syncStatus = "保存済み";
  return normalizeState({
    ...record.data,
    users: state.users,
    currentUserId: state.currentUserId,
  });
}

async function runRemoteStateRpc(functionName, params) {
  syncStatus = "保存中";
  const { data, error } = await supabase.rpc(functionName, params).maybeSingle();
  if (error) throw error;
  state = await applyRemoteStateResult(data);
  state.currentUserId = authProfile?.id || state.currentUserId;
  restoreUiForCurrentState();
  return state;
}

function subscribeRemoteStateChanges() {
  if (!isSupabaseMode || !authSession || remoteStateChannel) return;

  remoteStateChannel = supabase
    .channel("app-state-main")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_state",
        filter: `id=eq.${REMOTE_STATE_ID}`,
      },
      (payload) => {
        applyRemoteRealtimePayload(payload).catch((error) => {
          console.warn("Failed to apply realtime state update.", error);
        });
      },
    )
    .subscribe();
}

async function unsubscribeRemoteStateChanges() {
  if (!remoteStateChannel) return;
  const channel = remoteStateChannel;
  remoteStateChannel = null;
  await supabase.removeChannel(channel).catch(() => {});
}

async function applyRemoteRealtimePayload(payload) {
  const record = payload?.new;
  if (!record?.data) return;
  const nextVersion = Number(record.version);
  if (!Number.isSafeInteger(nextVersion)) return;
  if (Number.isSafeInteger(remoteStateVersion) && nextVersion <= remoteStateVersion) return;

  remoteStateVersion = nextVersion;
  state = normalizeState({
    ...record.data,
    users: state.users,
    currentUserId: authProfile?.id || state.currentUserId,
  });
  state.currentUserId = authProfile?.id || state.currentUserId;
  restoreUiForCurrentState();
  syncStatus = "共有中";
  showToast("別の端末の更新を反映しました", 5000);
  render();
}

async function reloadAfterRemoteConflict() {
  remoteStateEpoch += 1;
  try {
    const record = await fetchRemoteStateRecord();
    remoteStateVersion = record.version;
    state = normalizeState({
      ...record.data,
      users: state.users,
      currentUserId: authProfile?.id || state.currentUserId,
    });
    state.currentUserId = authProfile?.id || state.currentUserId;
    restoreUiForCurrentState();
    syncStatus = "共有中";
    showToast("別の端末で更新されたため、最新データを再読込しました。操作内容を確認してもう一度実行してください", 7000);
    render();
  } catch (reloadError) {
    console.error("Failed to reload remote state after conflict.", reloadError);
    syncStatus = "保存失敗";
    showToast("同時更新を検出しましたが、最新データを再読込できませんでした。画面を更新してください", 7000);
  }
}

function serializeStateForRemote(source) {
  const { users, currentUserId, selectedEventId, ...rest } = source;
  return rest;
}

function readUiSnapshot() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to read saved UI state.", error);
    return null;
  }
}

function normalizeCartSnapshot(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => ({
      variantId: String(line?.variantId || ""),
      quantity: Math.max(1, Math.floor(Number(line?.quantity || 1))),
    }))
    .filter((line) => line.variantId && Number.isFinite(line.quantity));
}

function sanitizeUiState(saved, defaults) {
  const view = viewTitles[saved?.view] ? saved.view : defaults.view;
  const reportEventId = state.events.some((event) => event.id === saved?.reportEventId) ? saved.reportEventId : state.selectedEventId;
  const paymentMethod = paymentMethods.includes(saved?.paymentMethod) ? saved.paymentMethod : defaults.paymentMethod;

  return {
    ...defaults,
    view,
    cart: normalizeCartSnapshot(saved?.cart),
    paymentMethod,
    cashReceived: saved?.cashReceived === undefined || saved?.cashReceived === null ? defaults.cashReceived : String(saved.cashReceived),
    authMode: defaults.authMode,
    search: typeof saved?.search === "string" ? saved.search : defaults.search,
    category: typeof saved?.category === "string" ? saved.category : defaults.category,
    historyQuery: typeof saved?.historyQuery === "string" ? saved.historyQuery : defaults.historyQuery,
    reportEventId,
    saleSaving: false,
    pendingSaleId: typeof saved?.pendingSaleId === "string" ? saved.pendingSaleId : "",
    toast: defaults.toast,
  };
}

function loadUiState(defaults) {
  const saved = readUiSnapshot();
  if (saved?.selectedEventId && state.events.some((event) => event.id === saved.selectedEventId)) {
    state.selectedEventId = saved.selectedEventId;
  }
  return sanitizeUiState(saved, defaults);
}

function restoreUiForCurrentState() {
  const saved = readUiSnapshot();
  if (saved?.selectedEventId && state.events.some((event) => event.id === saved.selectedEventId)) {
    state.selectedEventId = saved.selectedEventId;
  }

  ui = sanitizeUiState({ ...ui, ...(saved || {}) }, ui);
  pruneCartForActiveEvent();
}

function pruneCartForActiveEvent() {
  const nextCart = [];
  for (const line of normalizeCartSnapshot(ui.cart)) {
    const row = catalogRowByVariant(line.variantId);
    if (!row || row.inventory.current <= 0) continue;
    nextCart.push({
      variantId: line.variantId,
      quantity: Math.min(line.quantity, row.inventory.current),
    });
  }
  ui.cart = nextCart;
}

function saveUiState() {
  try {
    localStorage.setItem(
      UI_STATE_KEY,
      JSON.stringify({
        selectedEventId: state.selectedEventId,
        view: ui.view,
        cart: normalizeCartSnapshot(ui.cart),
        paymentMethod: ui.paymentMethod,
        cashReceived: ui.cashReceived,
        search: ui.search,
        category: ui.category,
        historyQuery: ui.historyQuery,
        reportEventId: ui.reportEventId,
        pendingSaleId: ui.pendingSaleId,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("Failed to save UI state.", error);
  }
}

function render() {
  const app = document.getElementById("app");
  if (!appReady) {
    app.innerHTML = renderLoading();
    return;
  }

  if (isSupabaseMode && !authSession) {
    app.innerHTML = renderAuth();
    bindAppEvents(app);
    return;
  }

  if (isSupabaseMode && authSession && ui.authMode === "update-password") {
    app.innerHTML = renderAuth();
    bindAppEvents(app);
    return;
  }

  if (isSupabaseMode && authSession && authProfile && !authProfile.active) {
    app.innerHTML = renderPendingApproval();
    bindAppEvents(app);
    return;
  }

  const focusedId = document.activeElement?.id;
  let selectionStart = null;
  let selectionEnd = null;

  try {
    selectionStart = document.activeElement?.selectionStart ?? null;
    selectionEnd = document.activeElement?.selectionEnd ?? null;
  } catch (error) {
    selectionStart = null;
    selectionEnd = null;
  }

  app.innerHTML = shell(renderView());
  bindAppEvents(app);

  if (focusedId) {
    const focused = document.getElementById(focusedId);
    if (focused) {
      focused.focus();
      if (canRestoreSelection(focused) && selectionStart !== null && selectionEnd !== null) {
        focused.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }
  saveUiState();
}

function renderLoading() {
  return `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="brand">
          <div class="brand-mark">売</div>
          <div class="brand-title">
            <strong>Merch Desk</strong>
            <span>読み込み中</span>
          </div>
        </div>
        <div class="notice">Supabaseから共有データを読み込んでいます。</div>
      </section>
    </main>
  `;
}

function renderAuth() {
  const isSignUp = ui.authMode === "sign-up";
  const isForgotPassword = ui.authMode === "forgot-password";
  const isUpdatePassword = ui.authMode === "update-password";
  const title = isUpdatePassword ? "新しいパスワード設定" : isForgotPassword ? "パスワード再設定" : isSignUp ? "アカウント作成" : "ログイン";
  const description = isUpdatePassword
    ? "新しいパスワードを入力してください。"
    : isForgotPassword
      ? "登録済みメールアドレスに再設定リンクを送信します。"
      : "複数スタッフで同じ売上・在庫データを共有します。";
  const submitLabel = isUpdatePassword ? "パスワードを保存" : isForgotPassword ? "再設定メールを送信" : isSignUp ? "作成" : "ログイン";
  const passwordAutocomplete = isSignUp || isUpdatePassword ? "new-password" : "current-password";

  return `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="brand">
          <div class="brand-mark">売</div>
          <div class="brand-title">
            <strong>Merch Desk</strong>
            <span>イベント物販管理</span>
          </div>
        </div>
        <form class="stack" data-action="auth-form">
          <div>
            <h1>${title}</h1>
            <p class="muted">${description}</p>
          </div>
          ${isSignUp ? `<div class="field"><label for="auth-name">名前</label><input id="auth-name" class="input" name="name" autocomplete="name" required></div>` : ""}
          ${isUpdatePassword ? "" : `
            <div class="field">
              <label for="auth-email">メールアドレス</label>
              <input id="auth-email" class="input" name="email" type="email" autocomplete="email" required>
            </div>
          `}
          ${isForgotPassword ? "" : `
            <div class="field">
              <label for="auth-password">${isUpdatePassword ? "新しいパスワード" : "パスワード"}</label>
              <input id="auth-password" class="input" name="password" type="password" autocomplete="${passwordAutocomplete}" required minlength="6">
            </div>
          `}
          ${isUpdatePassword ? `
            <div class="field">
              <label for="auth-password-confirm">新しいパスワード 確認</label>
              <input id="auth-password-confirm" class="input" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="6">
            </div>
          ` : ""}
          <button class="button" type="submit">${icon(isForgotPassword ? "mail" : isUpdatePassword ? "save" : "check")}${submitLabel}</button>
          ${isUpdatePassword ? `
            <button class="button secondary" data-action="cancel-password-update" type="button">ログインに戻る</button>
          ` : isSupabaseMode ? "" : `
            <button class="button secondary" data-action="toggle-auth-mode" type="button">
              ${isSignUp ? "ログインに戻る" : "アカウントを作成"}
            </button>
          `}
          ${!isSignUp && !isForgotPassword && !isUpdatePassword ? `
            <button class="text-button" data-action="set-auth-mode" data-auth-mode="forgot-password" type="button">パスワードを忘れた方はこちら</button>
          ` : ""}
          ${isForgotPassword ? `
            <button class="text-button" data-action="set-auth-mode" data-auth-mode="sign-in" type="button">ログインに戻る</button>
          ` : ""}
        </form>
        ${ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : ""}
      </section>
    </main>
  `;
}

function renderPendingApproval() {
  return `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="brand">
          <div class="brand-mark">売</div>
          <div class="brand-title">
            <strong>Merch Desk</strong>
            <span>承認待ち</span>
          </div>
        </div>
        <div class="notice">アカウント作成は完了しています。管理者がユーザー管理画面で有効化すると利用できます。</div>
        <button class="button secondary" data-action="sign-out" type="button">${icon("logout")}ログアウト</button>
      </section>
    </main>
  `;
}

function renderEventOptions(activeEventId = state.selectedEventId) {
  return state.events.map((event) => `<option value="${event.id}" ${event.id === activeEventId ? "selected" : ""}>${escapeHtml(event.name)}</option>`).join("");
}

function renderUserOptions() {
  const currentUser = getCurrentUser();
  if (isSupabaseMode) {
    return `<option value="${currentUser.id}">${escapeHtml(currentUser.name)} / ${roles[currentUser.role] || currentUser.role}</option>`;
  }

  return state.users
    .filter((user) => user.active)
    .map((user) => `<option value="${user.id}" ${user.id === state.currentUserId ? "selected" : ""}>${escapeHtml(user.name)} / ${roles[user.role]}</option>`)
    .join("");
}

function renderDataActions(scope) {
  const restoreId = `restore-file-${scope}`;
  return `
    <button class="button secondary" data-action="backup-data" type="button">${icon("download")}バックアップ</button>
    <label class="button secondary import-button" for="${restoreId}">${icon("upload")}復元</label>
    <input id="${restoreId}" class="visually-hidden" data-action="restore-data" type="file" accept="application/json,.json">
    <button class="button secondary" data-action="reset-demo" type="button">${icon("refresh")}初期データに戻す</button>
  `;
}

function shell(content) {
  const activeEvent = getActiveEvent();
  const currentUser = getCurrentUser();
  const currentUserOptions = renderUserOptions();
  const canManageData = can("manageData");
  const nav = navItems
    .map(
      (item) => `
        <button class="nav-button ${ui.view === item.id ? "is-active" : ""}" data-action="view" data-view="${item.id}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </button>
      `,
    )
    .join("");

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">売</div>
          <div class="brand-title">
            <strong>Merch Desk</strong>
            <span>イベント物販管理</span>
          </div>
        </div>
        <select class="select mobile-nav" data-action="mobile-view" aria-label="画面選択">
          ${navItems.map((item) => `<option value="${item.id}" ${ui.view === item.id ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
        <nav class="nav">${nav}</nav>
        <div class="sidebar-footer">
          <span class="role-badge">${roles[currentUser.role]}</span>
          <span>${escapeHtml(currentUser.name)}として操作中</span>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-title">
            <h1>${viewTitles[ui.view]}</h1>
            <p>${escapeHtml(activeEvent.name)} / ${escapeHtml(activeEvent.venue)} / ${formatDate(activeEvent.date)}</p>
          </div>
          <div class="topbar-actions">
            <select class="select" data-action="select-event" aria-label="対象イベント">
              ${renderEventOptions(activeEvent.id)}
            </select>
            <select class="select" data-action="select-user" aria-label="操作ユーザー" ${isSupabaseMode ? "disabled" : ""}>
              ${currentUserOptions}
            </select>
            ${isSupabaseMode ? `<span class="status info">${escapeHtml(syncStatus)}</span><button class="button secondary" data-action="sign-out" type="button">${icon("logout")}ログアウト</button>` : ""}
            ${canManageData ? renderDataActions("topbar") : ""}
          </div>
        </header>
        <section class="content">${content}</section>
      </main>
      ${ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : ""}
    </div>
  `;
}

function renderView() {
  if (ui.view === "dashboard") return renderDashboard();
  if (ui.view === "pos") return renderPos();
  if (ui.view === "history") return renderHistory();
  if (ui.view === "inventory") return renderInventory();
  if (ui.view === "reports") return renderReports();
  if (ui.view === "events") return renderEvents();
  if (ui.view === "products") return renderProducts();
  if (ui.view === "users") return renderUsers();
  if (ui.view === "menu") return renderMenu();
  return renderDashboard();
}

function renderMenu() {
  const currentUser = getCurrentUser();
  const canManageData = can("manageData");

  return `
    <div class="menu-layout">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>イベント・アカウント</h2>
            <p>作業対象とログイン状態を確認</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="menu-grid">
            <div class="field">
              <label for="menu-event">対象イベント</label>
              <select id="menu-event" class="select" data-action="select-event">
                ${renderEventOptions()}
              </select>
            </div>
            <div class="field">
              <label for="menu-user">操作ユーザー</label>
              <select id="menu-user" class="select" data-action="select-user" ${isSupabaseMode ? "disabled" : ""}>
                ${renderUserOptions()}
              </select>
            </div>
            <div class="account-summary">
              <span class="role-badge">${roles[currentUser.role]}</span>
              <strong>${escapeHtml(currentUser.name)}</strong>
              ${isSupabaseMode ? `<span class="status info">${escapeHtml(syncStatus)}</span>` : `<span class="status info">ローカル保存</span>`}
            </div>
            ${isSupabaseMode ? `<button class="button secondary" data-action="sign-out" type="button">${icon("logout")}ログアウト</button>` : ""}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>データ操作</h2>
            <p>バックアップ、復元、初期化</p>
          </div>
        </div>
        <div class="panel-body">
          ${
            canManageData
              ? `<div class="menu-actions">${renderDataActions("menu")}</div>`
              : `<div class="notice">バックアップ、復元、初期データへの戻しは管理者または現場責任者のみ利用できます。</div>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderDashboard() {
  const event = getActiveEvent();
  const sales = completedSales(event.id);
  const summary = salesSummary(event.id);
  const lowStocks = inventoryRows(event.id).filter((row) => row.current <= row.threshold);
  const recentSales = sales.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  return `
    <div class="metric-grid">
      ${metricCard("総売上", yen(summary.total), `${summary.salesCount}件の販売`)}
      ${metricCard("販売点数", `${summary.units}点`, `${summary.productKinds}種類の商品`)}
      ${metricCard("現在庫", `${summary.stock}点`, `低在庫 ${lowStocks.length}件`)}
      ${metricCard("客単価", yen(summary.average), "完了販売の平均")}
    </div>
    <div class="split">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>決済方法別売上</h2>
            <p>${escapeHtml(event.name)}の完了販売を集計</p>
          </div>
          <span class="status ${event.status === "open" ? "open" : event.status === "closed" ? "closed" : "info"}">${eventStatusLabel(event.status)}</span>
        </div>
        <div class="panel-body">${renderPaymentBars(event.id)}</div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>低在庫</h2>
            <p>しきい値以下の商品</p>
          </div>
        </div>
        <div class="panel-body">
          ${
            lowStocks.length
              ? `<div class="list">${lowStocks
                  .map(
                    (row) => `
                      <div class="list-row">
                        <div>
                          <strong>${escapeHtml(row.product.name)} / ${escapeHtml(row.variant.name)}</strong>
                          <div class="muted">${escapeHtml(row.variant.sku)}</div>
                        </div>
                        <span class="status low">${row.current}点</span>
                      </div>
                    `,
                  )
                  .join("")}</div>`
              : `<div class="empty">低在庫の商品はありません</div>`
          }
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>直近の販売</h2>
          <p>販売登録が新しい順に表示</p>
        </div>
        <button class="button secondary" data-action="view" data-view="history" type="button">${icon("receipt")}履歴を見る</button>
      </div>
      <div class="panel-body">
        ${recentSales.length ? renderSalesTable(recentSales, false) : `<div class="empty">まだ販売がありません</div>`}
      </div>
    </section>
  `;
}

function renderPos() {
  const event = getActiveEvent();
  const availableRows = catalogRows(false, event.id);
  const categories = ["すべて", ...new Set(availableRows.map((row) => row.product.category))];
  const selectedCategory = categories.includes(ui.category) ? ui.category : "すべて";
  const total = cartTotal();
  const canConfirm = canConfirmCurrentSale(event);
  const blockingNotice = saleBlockingNotice(event, total);
  const isDryRun = can("dryRunSales");
  const confirmLabel = ui.saleSaving ? "保存中" : isDryRun ? "テスト販売を確定" : "販売を確定";
  const rows = availableRows
    .filter((row) => selectedCategory === "すべて" || row.product.category === selectedCategory)
    .filter((row) => {
      const text = `${row.product.name} ${row.product.code} ${row.product.category} ${row.variant.name} ${row.variant.sku}`.toLowerCase();
      return text.includes(ui.search.trim().toLowerCase());
    });

  return `
    <div class="split">
      <section class="stack">
        <div class="filters">
          <div class="field">
            <label for="pos-search">検索</label>
            <input id="pos-search" class="input" data-action="pos-search" type="search" value="${escapeAttribute(ui.search)}" placeholder="商品名、SKU、カテゴリ">
          </div>
          <div class="field">
            <label for="category-filter">カテゴリ</label>
            <select id="category-filter" class="select" data-action="category-filter">
              ${categories.map((category) => `<option value="${escapeAttribute(category)}" ${selectedCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="product-grid">
          ${rows.map(renderProductCard).join("") || `<div class="empty">該当する商品がありません</div>`}
        </div>
      </section>
      <aside class="panel cart">
        <div class="panel-header">
          <div>
            <h2>カート</h2>
            <p>${ui.cart.length}種類の商品</p>
          </div>
          <button class="icon-button" data-action="clear-cart" type="button" title="カートを空にする" aria-label="カートを空にする">${icon("trash")}</button>
        </div>
        <div class="panel-body stack">
          ${isDryRun ? `<div class="notice">テスト販売モードです。確定しても販売履歴・集計・在庫には反映されません。</div>` : ""}
          ${renderCart()}
          <div class="field">
            <label>決済方法</label>
            <div class="segmented">
              ${paymentMethods
                .map(
                  (method) => `
                    <button class="segment ${ui.paymentMethod === method ? "is-active" : ""}" data-action="set-payment" data-payment="${escapeAttribute(method)}" type="button">
                      ${escapeHtml(method)}
                    </button>
                  `,
                )
                .join("")}
            </div>
          </div>
          ${ui.paymentMethod === CASH_METHOD ? renderCashPanel(total) : ""}
          <div class="cart-total">
            <span>合計</span>
            <strong>${yen(total)}</strong>
          </div>
          <button class="button" data-action="confirm-sale" type="button" ${!canConfirm ? "disabled" : ""}>
            ${icon("check")}${confirmLabel}
          </button>
          ${blockingNotice ? `<div class="notice">${blockingNotice}</div>` : ""}
        </div>
      </aside>
    </div>
  `;
}

function renderCashPanel(total) {
  const received = cashReceivedAmount();
  const change = cashChangeDue(total);
  const displayChange = received === null ? "-" : yen(Math.max(change, 0));
  const shortage = received !== null && change < 0;

  return `
    <div class="cash-panel">
      <div class="cash-grid">
        <div class="field">
          <label for="cash-received">受取金額</label>
          <input id="cash-received" class="input" data-action="cash-received" type="number" min="0" step="1" inputmode="numeric" value="${escapeAttribute(ui.cashReceived)}">
        </div>
        <button class="button secondary" data-action="cash-exact" type="button" ${total <= 0 ? "disabled" : ""}>${icon("check")}ちょうど</button>
      </div>
      <div class="cash-result ${shortage ? "is-short" : ""}">
        <span>${shortage ? "不足" : "おつり"}</span>
        <strong>${shortage ? yen(Math.abs(change)) : displayChange}</strong>
      </div>
    </div>
  `;
}

function renderProductCard(row) {
  const stock = inventoryFor(getActiveEvent().id, row.variant.id)?.current ?? 0;
  const disabled = stock <= 0 || getActiveEvent().status !== "open" || !can("sell");
  const cartQuantity = ui.cart.find((line) => line.variantId === row.variant.id)?.quantity || 0;
  const productLabel = `${row.product.name} ${row.variant.name}、${yen(row.variant.price)}、${disabled ? "追加できません" : "カートに追加"}`;
  return `
    <button
      class="product-card ${disabled ? "is-disabled" : ""}"
      data-action="add-cart"
      data-variant-id="${row.variant.id}"
      type="button"
      aria-label="${escapeAttribute(productLabel)}"
      ${disabled ? "disabled" : ""}
    >
      <span class="product-top">
        <span class="swatch" style="background:${escapeAttribute(row.variant.color)}"></span>
        <span class="product-heading">
          <span class="product-name">${escapeHtml(row.product.name)} / ${escapeHtml(row.variant.name)}</span>
          <span class="product-meta">
            <span>${escapeHtml(row.product.category)}</span>
            <span>${escapeHtml(row.variant.sku)}</span>
          </span>
        </span>
      </span>
      <span class="product-meta">
        <span class="status ${stock <= row.inventory.threshold ? "low" : "active"}">在庫 ${stock}</span>
        <span>${escapeHtml(row.product.code)}</span>
      </span>
      <span class="product-card-footer">
        <span class="price">${yen(row.variant.price)}</span>
        <span class="product-card-add">${icon("plus")}${cartQuantity > 0 ? `カート内 ${cartQuantity}点` : "カートに追加"}</span>
      </span>
    </button>
  `;
}

function renderCart() {
  if (ui.cart.length === 0) return `<div class="empty">商品を追加するとここに表示されます</div>`;

  return `
    <div class="cart-lines">
      ${ui.cart
        .map((line) => {
          const row = catalogRowByVariant(line.variantId);
          if (!row) return "";
          return `
            <div class="cart-line">
              <div class="cart-line-main">
                <div class="cart-line-title">
                  <strong>${escapeHtml(row.product.name)} / ${escapeHtml(row.variant.name)}</strong>
                  <span class="muted">${yen(row.variant.price)} / 在庫 ${row.inventory.current}</span>
                </div>
                <button class="icon-button" data-action="remove-cart" data-variant-id="${line.variantId}" type="button" title="削除" aria-label="削除">${icon("x")}</button>
              </div>
              <div class="cart-line-controls">
                <div class="qty-control">
                  <button data-action="dec-cart" data-variant-id="${line.variantId}" type="button" aria-label="数量を減らす">${icon("minus")}</button>
                  <span>${line.quantity}</span>
                  <button data-action="inc-cart" data-variant-id="${line.variantId}" type="button" aria-label="数量を増やす">${icon("plus")}</button>
                </div>
                <strong>${yen(row.variant.price * line.quantity)}</strong>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHistory() {
  const event = getActiveEvent();
  const query = ui.historyQuery.trim().toLowerCase();
  const rows = state.sales
    .filter((sale) => sale.eventId === event.id)
    .filter((sale) => {
      const user = userById(sale.userId);
      const text = `${sale.id} ${sale.paymentMethod} ${sale.status} ${user?.name ?? ""} ${sale.items.map((item) => `${item.name} ${item.variantName}`).join(" ")}`.toLowerCase();
      return text.includes(query);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return `
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="field">
          <label for="history-search">履歴検索</label>
          <input id="history-search" class="input" data-action="history-search" type="search" value="${escapeAttribute(ui.historyQuery)}" placeholder="商品、担当、決済方法">
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status info">${rows.length}件</span>
      </div>
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>販売履歴</h2>
          <p>${escapeHtml(event.name)}の販売明細</p>
        </div>
      </div>
      <div class="panel-body">
        ${rows.length ? renderSalesTable(rows, true) : `<div class="empty">販売履歴がありません</div>`}
      </div>
    </section>
  `;
}

function renderSalesTable(sales, withActions) {
  return `
    <div class="table-wrap">
      <table class="mobile-card-table sales-table">
        <thead>
          <tr>
            <th>日時</th>
            <th>商品</th>
            <th>担当</th>
            <th>決済</th>
            <th class="numeric">金額</th>
            <th>状態</th>
            ${withActions ? "<th>操作</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${sales
            .map(
              (sale) => `
                <tr>
                  <td data-label="日時">${formatDateTime(sale.createdAt)}</td>
                  <td data-label="商品">${escapeHtml(sale.items.map((item) => `${item.name}/${item.variantName} x${item.quantity}`).join("、"))}</td>
                  <td data-label="担当">${escapeHtml(userById(sale.userId)?.name ?? "不明")}</td>
                  <td data-label="決済">${renderPaymentCell(sale)}</td>
                  <td class="numeric" data-label="金額">${yen(sale.total)}</td>
                  <td data-label="状態"><span class="status ${sale.status}">${sale.status === "completed" ? "完了" : "取消"}</span></td>
                  ${
                    withActions
                      ? `<td data-label="操作">
                          ${renderSaleActions(sale)}
                        </td>`
                      : ""
                  }
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSaleActions(sale) {
  if (sale.status === "cancelled") {
    return `
      <button class="button danger" data-action="delete-cancelled-sale" data-sale-id="${sale.id}" type="button" ${!canDeleteCancelledSale(sale) ? "disabled" : ""}>
        ${icon("trash")}削除
      </button>
    `;
  }

  return `
    <button class="button secondary" data-action="cancel-sale" data-sale-id="${sale.id}" type="button" ${!canCancelSale(sale) ? "disabled" : ""}>
      ${icon("x")}取消
    </button>
  `;
}

function renderPaymentCell(sale) {
  if (sale.paymentMethod !== CASH_METHOD || sale.cashReceived === null || sale.cashReceived === undefined) {
    return escapeHtml(sale.paymentMethod || "");
  }

  const changeDue = sale.changeDue ?? Number(sale.cashReceived) - Number(sale.total || 0);
  return `
    ${escapeHtml(sale.paymentMethod)}
    <div class="muted">受取 ${yen(Number(sale.cashReceived))} / おつり ${yen(changeDue)}</div>
  `;
}

function renderInventory() {
  const event = getActiveEvent();
  const rows = inventoryRows(event.id);
  const lowRows = rows.filter((row) => row.current <= row.threshold);

  return `
    <div class="metric-grid">
      ${metricCard("初期在庫", `${rows.reduce((sum, row) => sum + row.initial, 0)}点`, "イベント開始時")}
      ${metricCard("現在庫", `${rows.reduce((sum, row) => sum + row.current, 0)}点`, "理論在庫")}
      ${metricCard("販売済み", `${rows.reduce((sum, row) => sum + (row.initial - row.current), 0)}点`, "取消と調整を反映")}
      ${metricCard("低在庫", `${lowRows.length}件`, "しきい値以下")}
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>在庫一覧</h2>
          <p>実在庫を入力すると理論在庫との差異を確認できます</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-wrap">
          <table class="mobile-card-table inventory-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>SKU</th>
                <th class="numeric">初期</th>
                <th class="numeric">現在</th>
                <th class="numeric">しきい値</th>
                <th>実在庫</th>
                <th class="numeric">差異</th>
                <th>調整</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderInventoryRow).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    ${renderProducts()}
  `;
}

function renderInventoryRow(row) {
  const diff = row.actual === null || row.actual === "" ? "" : Number(row.actual) - row.current;
  const canAdjust = can("adjustInventory");

  return `
    <tr>
      <td data-label="商品">
        <strong>${escapeHtml(row.product.name)} / ${escapeHtml(row.variant.name)}</strong>
        <div class="muted">${escapeHtml(row.product.category)}</div>
      </td>
      <td data-label="SKU">${escapeHtml(row.variant.sku)}</td>
      <td class="numeric" data-label="初期">${row.initial}</td>
      <td class="numeric" data-label="現在"><span class="status ${row.current <= row.threshold ? "low" : "active"}">${row.current}</span></td>
      <td class="numeric" data-label="しきい値">${row.threshold}</td>
      <td data-label="実在庫">
        <form class="actual-form" data-action="save-actual">
          <input class="input" type="number" min="0" name="actual" value="${row.actual ?? ""}" ${!canAdjust ? "disabled" : ""}>
          <input type="hidden" name="variantId" value="${row.variant.id}">
          <button class="icon-button" type="submit" title="実在庫を保存" aria-label="実在庫を保存" ${!canAdjust ? "disabled" : ""}>${icon("save")}</button>
        </form>
      </td>
      <td class="numeric" data-label="差異">${diff === "" ? "-" : diff > 0 ? `+${diff}` : diff}</td>
      <td data-label="調整">
        <form class="inline-form" data-action="adjust-stock">
          <input class="input" type="number" name="amount" placeholder="+/-" ${!canAdjust ? "disabled" : ""}>
          <input class="input" type="text" name="reason" placeholder="理由" ${!canAdjust ? "disabled" : ""}>
          <input type="hidden" name="variantId" value="${row.variant.id}">
          <button class="button secondary" type="submit" ${!canAdjust ? "disabled" : ""}>${icon("save")}反映</button>
        </form>
      </td>
    </tr>
  `;
}

function renderReports() {
  const event = state.events.find((item) => item.id === ui.reportEventId) || getActiveEvent();
  const summary = salesSummary(event.id);
  const productRows = productReportRows(event.id);
  const hourlyRows = hourlyReportRows(event.id);

  if (!can("viewReports")) {
    return `<div class="empty">現在の権限では集計を閲覧できません</div>`;
  }

  return `
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="field">
          <label for="report-event">集計イベント</label>
          <select id="report-event" class="select" data-action="report-event">
            ${state.events.map((item) => `<option value="${item.id}" ${item.id === event.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="button secondary" data-action="export-csv" data-export="sales" type="button" ${!can("exportCsv") ? "disabled" : ""}>${icon("download")}売上明細CSV</button>
        <button class="button secondary" data-action="export-csv" data-export="products" type="button" ${!can("exportCsv") ? "disabled" : ""}>${icon("download")}商品別CSV</button>
        <button class="button secondary" data-action="export-csv" data-export="payments" type="button" ${!can("exportCsv") ? "disabled" : ""}>${icon("download")}決済別CSV</button>
        <button class="button secondary" data-action="export-csv" data-export="inventory" type="button" ${!can("exportCsv") ? "disabled" : ""}>${icon("download")}在庫CSV</button>
      </div>
    </div>
    <div class="metric-grid">
      ${metricCard("総売上", yen(summary.total), `${summary.salesCount}件`)}
      ${metricCard("販売点数", `${summary.units}点`, `${summary.productKinds}種類`)}
      ${metricCard("取消", `${cancelledSales(event.id).length}件`, yen(cancelledSales(event.id).reduce((sum, sale) => sum + sale.total, 0)))}
      ${metricCard("客単価", yen(summary.average), "完了販売の平均")}
    </div>
    <div class="split">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>商品別集計</h2>
            <p>販売数と売上金額</p>
          </div>
        </div>
        <div class="panel-body">${renderProductReportTable(productRows)}</div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>決済方法別</h2>
            <p>完了販売のみ集計</p>
          </div>
        </div>
        <div class="panel-body">${renderPaymentBars(event.id)}</div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>時間帯別売上</h2>
          <p>販売時刻の時間単位で集計</p>
        </div>
      </div>
      <div class="panel-body">${renderHourlyTable(hourlyRows)}</div>
    </section>
  `;
}

function renderProductReportTable(rows) {
  if (rows.length === 0) return `<div class="empty">集計対象の販売がありません</div>`;
  return `
    <div class="table-wrap">
      <table class="mobile-card-table report-product-table">
        <thead>
          <tr>
            <th>商品</th>
            <th>SKU</th>
            <th class="numeric">販売数</th>
            <th class="numeric">売上</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="商品">${escapeHtml(row.name)}</td>
                  <td data-label="SKU">${escapeHtml(row.sku)}</td>
                  <td class="numeric" data-label="販売数">${row.quantity}</td>
                  <td class="numeric" data-label="売上">${yen(row.total)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHourlyTable(rows) {
  if (rows.length === 0) return `<div class="empty">集計対象の販売がありません</div>`;
  return `
    <div class="table-wrap">
      <table class="mobile-card-table report-hourly-table">
        <thead>
          <tr>
            <th>時間帯</th>
            <th class="numeric">販売件数</th>
            <th class="numeric">販売点数</th>
            <th class="numeric">売上</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td data-label="時間帯">${row.hour}:00</td>
                  <td class="numeric" data-label="販売件数">${row.salesCount}</td>
                  <td class="numeric" data-label="販売点数">${row.units}</td>
                  <td class="numeric" data-label="売上">${yen(row.total)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEvents() {
  const canManage = can("manageEvents");

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>イベント一覧</h2>
          <p>販売状態と対象イベントを管理</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-wrap">
          <table class="mobile-card-table events-table">
            <thead>
              <tr>
                <th>イベント</th>
                <th>開催日</th>
                <th>会場</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${state.events.map((event) => renderEventRow(event, canManage)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>イベント追加</h2>
          <p>追加時点では各商品の在庫は0で作成</p>
        </div>
      </div>
      <div class="panel-body">
        <form class="form-grid" data-action="add-event">
          <div class="field">
            <label for="event-name">イベント名</label>
            <input id="event-name" class="input" name="name" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="event-date">開催日</label>
            <input id="event-date" class="input" name="date" type="date" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="event-venue">会場</label>
            <input id="event-venue" class="input" name="venue" required ${!canManage ? "disabled" : ""}>
          </div>
          <button class="button" type="submit" ${!canManage ? "disabled" : ""}>${icon("plus")}追加</button>
        </form>
      </div>
    </section>
  `;
}

function renderEventRow(event, canManage) {
  const deleteDisabled = !canManage || state.events.length <= 1;

  return `
    <tr data-event-row="${event.id}">
      <td data-label="イベント">
        <input class="input table-input event-name-input" name="eventName" value="${escapeAttribute(event.name)}" ${!canManage ? "disabled" : ""}>
        <textarea class="textarea table-textarea" name="eventMemo" placeholder="メモ" ${!canManage ? "disabled" : ""}>${escapeHtml(event.memo || "")}</textarea>
        ${event.id === state.selectedEventId ? `<div class="muted">現在の対象イベント</div>` : ""}
      </td>
      <td data-label="開催日">
        <input class="input table-input" name="eventDate" type="date" value="${escapeAttribute(event.date)}" ${!canManage ? "disabled" : ""}>
        <div class="muted">${formatDate(event.date)}</div>
      </td>
      <td data-label="会場">
        <input class="input table-input" name="eventVenue" value="${escapeAttribute(event.venue)}" ${!canManage ? "disabled" : ""}>
      </td>
      <td data-label="状態"><span class="status ${event.status === "closed" ? "closed" : event.status === "open" ? "open" : "info"}">${eventStatusLabel(event.status)}</span></td>
      <td data-label="操作">
        <div class="row-actions">
          <button class="button secondary" data-action="activate-event" data-event-id="${event.id}" type="button">${icon("check")}選択</button>
          <button class="button secondary" data-action="save-event" data-event-id="${event.id}" type="button" ${!canManage ? "disabled" : ""}>${icon("save")}保存</button>
          <button class="button secondary" data-action="set-event-status" data-event-id="${event.id}" data-status="open" type="button" ${!canManage ? "disabled" : ""}>${icon("play")}販売中</button>
          <button class="button warning" data-action="set-event-status" data-event-id="${event.id}" data-status="closed" type="button" ${!can("closeEvent") ? "disabled" : ""}>${icon("lock")}終了</button>
          <button class="button danger" data-action="delete-event" data-event-id="${event.id}" type="button" ${deleteDisabled ? "disabled" : ""}>${icon("trash")}削除</button>
        </div>
        ${state.events.length <= 1 ? `<div class="muted">最後のイベントは削除できません</div>` : ""}
      </td>
    </tr>
  `;
}

function renderProducts() {
  const canManage = can("manageProducts");
  const event = getActiveEvent();
  const rows = catalogRows(true, event.id);
  const categories = [...new Set(productsForEvent(event.id).map((product) => product.category))];
  const linkCandidates = state.products.filter((product) => !productBelongsToEvent(product, event.id));

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>イベント商品一覧</h2>
          <p>${escapeHtml(event.name)}の商品とバリエーションを管理</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-wrap">
          <table class="products-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>カテゴリ</th>
                <th>バリエーション</th>
                <th>SKU</th>
                <th class="numeric">価格</th>
                <th>表示色</th>
                <th class="numeric">現在庫</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map((row) => renderProductRow(row, canManage, event.id)).join("")
                  : `<tr><td colspan="9"><div class="empty">このイベントの商品はまだありません</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>登録済み商品を追加</h2>
          <p>${escapeHtml(event.name)}に既存の商品を紐づけ</p>
        </div>
      </div>
      <div class="panel-body">
        ${
          linkCandidates.length
            ? `<form class="form-grid" data-action="link-product-event">
                <div class="field">
                  <label for="link-product-id">商品</label>
                  <select id="link-product-id" class="select" name="productId" required ${!canManage ? "disabled" : ""}>
                    ${linkCandidates
                      .map((product) => {
                        const linkedEvents =
                          productEventIds(product)
                            .map((eventId) => state.events.find((item) => item.id === eventId)?.name)
                            .filter(Boolean)
                            .join(" / ") || "未紐づけ";
                        return `<option value="${escapeAttribute(product.id)}">${escapeHtml(product.name)}（${product.variants.length}種 / ${escapeHtml(linkedEvents)}）</option>`;
                      })
                      .join("")}
                  </select>
                </div>
                <div class="field">
                  <label for="link-product-stock">初期在庫</label>
                  <input id="link-product-stock" class="input" name="stock" type="number" min="0" step="1" value="0" required ${!canManage ? "disabled" : ""}>
                </div>
                <div class="field">
                  <label for="link-product-threshold">低在庫しきい値</label>
                  <input id="link-product-threshold" class="input" name="threshold" type="number" min="0" step="1" value="5" required ${!canManage ? "disabled" : ""}>
                </div>
                <button class="button" type="submit" ${!canManage ? "disabled" : ""}>${icon("plus")}紐づけ</button>
              </form>`
            : `<div class="empty">紐づけ可能な登録済み商品はありません</div>`
        }
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>イベント商品追加</h2>
          <p>${escapeHtml(event.name)}専用の商品として追加</p>
        </div>
      </div>
      <div class="panel-body">
        <form class="form-grid" data-action="add-product">
          <div class="field">
            <label for="product-name">商品名</label>
            <input id="product-name" class="input" name="name" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-code">商品コード</label>
            <input id="product-code" class="input" name="code" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-category">カテゴリ</label>
            <input id="product-category" class="input" name="category" list="category-list" required ${!canManage ? "disabled" : ""}>
            <datalist id="category-list">${categories.map((category) => `<option value="${escapeAttribute(category)}"></option>`).join("")}</datalist>
          </div>
          <div class="field">
            <label for="variant-name">バリエーション</label>
            <input id="variant-name" class="input" name="variantName" value="通常" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-price">価格</label>
            <input id="product-price" class="input" name="price" type="number" min="0" step="1" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-stock">初期在庫</label>
            <input id="product-stock" class="input" name="stock" type="number" min="0" step="1" value="0" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-threshold">低在庫しきい値</label>
            <input id="product-threshold" class="input" name="threshold" type="number" min="0" step="1" value="5" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="product-color">表示色</label>
            <input id="product-color" class="input color-picker" name="color" type="color" value="#0f766e" ${!canManage ? "disabled" : ""}>
          </div>
          <button class="button" type="submit" ${!canManage ? "disabled" : ""}>${icon("plus")}追加</button>
        </form>
      </div>
    </section>
  `;
}

function renderProductRow(row, canManage, eventId) {
  const saleCount = salesCountForProductEvent(row.product, eventId);
  const deleteDisabled = !canManage || saleCount > 0;
  const status = productStatusForEvent(row.product, eventId);

  return `
    <tr data-product-row="${row.product.id}:${row.variant.id}">
      <td>
        <input class="input table-input product-name-input" name="productName" value="${escapeAttribute(row.product.name)}" ${!canManage ? "disabled" : ""}>
        <input class="input table-input product-code-input" name="productCode" value="${escapeAttribute(row.product.code)}" ${!canManage ? "disabled" : ""} aria-label="商品コード">
      </td>
      <td>
        <input class="input table-input" name="productCategory" value="${escapeAttribute(row.product.category)}" list="category-list" ${!canManage ? "disabled" : ""}>
      </td>
      <td>
        <input class="input table-input" name="variantName" value="${escapeAttribute(row.variant.name)}" ${!canManage ? "disabled" : ""}>
      </td>
      <td>
        <input class="input table-input sku-input" name="variantSku" value="${escapeAttribute(row.variant.sku)}" ${!canManage ? "disabled" : ""}>
      </td>
      <td>
        <input class="input table-input price-input" name="variantPrice" type="number" min="0" step="1" value="${row.variant.price}" ${!canManage ? "disabled" : ""}>
        <div class="muted">${yen(row.variant.price)}</div>
      </td>
      <td>
        <input class="input color-picker" name="variantColor" type="color" value="${escapeAttribute(row.variant.color)}" ${!canManage ? "disabled" : ""}>
      </td>
      <td class="numeric">${row.inventory.current}</td>
      <td><span class="status ${status}">${status === "active" ? "販売中" : "停止"}</span></td>
      <td>
        <div class="row-actions">
          <button class="button secondary" data-action="save-product" data-product-id="${row.product.id}" data-variant-id="${row.variant.id}" type="button" ${!canManage ? "disabled" : ""}>
            ${icon("save")}保存
          </button>
          <button class="button secondary" data-action="toggle-product" data-product-id="${row.product.id}" type="button" ${!canManage ? "disabled" : ""}>
            ${icon("refresh")}${status === "active" ? "停止" : "再開"}
          </button>
          <button class="button danger" data-action="delete-product" data-product-id="${row.product.id}" data-variant-id="${row.variant.id}" type="button" ${deleteDisabled ? "disabled" : ""}>
            ${icon("trash")}削除
          </button>
        </div>
        ${saleCount > 0 ? `<div class="muted">販売履歴があるため削除できません。停止を使用してください。</div>` : ""}
      </td>
    </tr>
  `;
}

function renderUsers() {
  const canManage = can("manageUsers");
  const addUserBody = isSupabaseMode
    ? `
        <form class="form-grid user-create-grid" data-action="add-user">
          <div class="field">
            <label for="user-name">名前</label>
            <input id="user-name" class="input" name="name" autocomplete="name" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="user-email">ログインID</label>
            <input id="user-email" class="input" name="email" type="email" autocomplete="email" placeholder="mail@example.com" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="user-password">仮パスワード</label>
            <input id="user-password" class="input" name="password" type="password" autocomplete="new-password" required minlength="6" ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="user-role">権限</label>
            <select id="user-role" class="select" name="role" ${!canManage ? "disabled" : ""}>
              ${Object.entries(roles).map(([key, label]) => `<option value="${key}" ${key === "staff" ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="user-active">状態</label>
            <select id="user-active" class="select" name="active" ${!canManage ? "disabled" : ""}>
              <option value="true" selected>有効</option>
              <option value="false">無効</option>
            </select>
          </div>
          <button class="button" type="submit" ${!canManage ? "disabled" : ""}>${icon("plus")}追加</button>
        </form>
      `
    : `
        <form class="form-grid three" data-action="add-user">
          <div class="field">
            <label for="user-name">名前</label>
            <input id="user-name" class="input" name="name" required ${!canManage ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="user-role">権限</label>
            <select id="user-role" class="select" name="role" ${!canManage ? "disabled" : ""}>
              ${Object.entries(roles).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}
            </select>
          </div>
          <button class="button" type="submit" ${!canManage ? "disabled" : ""}>${icon("plus")}追加</button>
        </form>
      `;

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>ユーザー一覧</h2>
          <p>操作ユーザーと権限を確認</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-wrap">
          <table class="mobile-card-table users-table ${isSupabaseMode ? "is-supabase" : "is-local"}">
            <thead>
              <tr>
                <th>名前</th>
                ${isSupabaseMode ? "<th>ログインID</th><th>仮パスワード</th>" : ""}
                <th>権限</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${state.users.map((user) => renderUserRow(user, canManage)).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>ユーザー追加</h2>
          <p>${isSupabaseMode ? "管理者がログイン情報と権限を作成" : "操作権限のみ管理"}</p>
        </div>
      </div>
      <div class="panel-body">
        ${addUserBody}
      </div>
    </section>
  `;
}

function renderUserRow(user, canManage) {
  const deleteDisabled = !canManage || user.id === state.currentUserId || isLastActiveAdmin(user.id);
  const saveDisabled = !canManage;

  return `
    <tr data-user-row="${user.id}">
      <td data-label="名前">
        <input class="input table-input" name="userName" value="${escapeAttribute(user.name)}" ${saveDisabled ? "disabled" : ""}>
        ${user.id === state.currentUserId ? `<div class="muted">現在の操作ユーザー</div>` : ""}
      </td>
      ${
        isSupabaseMode
          ? `
            <td data-label="ログインID">
              <input class="input table-input" name="userEmail" type="email" value="${escapeAttribute(user.email || "")}" placeholder="mail@example.com" ${saveDisabled ? "disabled" : ""}>
              <div class="muted">メールアドレスでログイン</div>
            </td>
            <td data-label="仮パスワード">
              <input class="input table-input" name="userPassword" type="password" autocomplete="new-password" placeholder="変更時のみ入力" ${saveDisabled ? "disabled" : ""}>
              <div class="muted">6文字以上</div>
            </td>
          `
          : ""
      }
      <td data-label="権限">
        <select class="select table-input" name="userRole" ${saveDisabled ? "disabled" : ""}>
          ${Object.entries(roles).map(([key, label]) => `<option value="${key}" ${user.role === key ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </td>
      <td data-label="状態">
        <select class="select table-input" name="userActive" ${saveDisabled ? "disabled" : ""}>
          <option value="true" ${user.active ? "selected" : ""}>有効</option>
          <option value="false" ${!user.active ? "selected" : ""}>無効</option>
        </select>
        <div><span class="status ${user.active ? "active" : "inactive"}">${user.active ? "有効" : "無効"}</span></div>
      </td>
      <td data-label="操作">
        <div class="row-actions">
          <button class="button secondary" data-action="save-user" data-user-id="${user.id}" type="button" ${saveDisabled ? "disabled" : ""}>${icon("save")}保存</button>
          <button class="button danger" data-action="delete-user" data-user-id="${user.id}" type="button" ${deleteDisabled ? "disabled" : ""}>${icon("trash")}削除</button>
        </div>
        ${isLastActiveAdmin(user.id) ? `<div class="muted">最後の管理者は削除・無効化できません</div>` : ""}
      </td>
    </tr>
  `;
}

function bindAppEvents(app) {
  app.onclick = handleClick;
  app.oninput = handleInput;
  app.onchange = handleChange;
  app.onsubmit = handleSubmit;
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "view") {
    ui.view = target.dataset.view;
    render();
    return;
  }

  if (action === "toggle-auth-mode") {
    ui.authMode = ui.authMode === "sign-in" ? "sign-up" : "sign-in";
    ui.toast = "";
    render();
    return;
  }

  if (action === "set-auth-mode") {
    ui.authMode = target.dataset.authMode || "sign-in";
    ui.toast = "";
    render();
    return;
  }

  if (action === "cancel-password-update") {
    ui.authMode = "sign-in";
    signOut();
    return;
  }

  if (action === "sign-out") {
    signOut();
    return;
  }

  if (action === "reset-demo") {
    if (!can("manageData")) {
      showToast("現在の権限では初期データに戻せません");
      return;
    }
    if (confirm("サンプルデータに戻します。現在のローカルデータは消えます。")) {
      state = seedState();
      ui = {
        ...ui,
        cart: [],
        paymentMethod: CASH_METHOD,
        cashReceived: "",
        search: "",
        category: "すべて",
        historyQuery: "",
        reportEventId: state.selectedEventId,
      };
      saveState();
      showToast("初期データに戻しました");
    }
    return;
  }

  if (action === "backup-data") {
    if (!can("manageData")) {
      showToast("現在の権限ではバックアップを出力できません");
      return;
    }
    backupData();
    return;
  }

  if (action === "add-cart") {
    addCart(target.dataset.variantId);
    return;
  }

  if (action === "inc-cart") {
    changeCartQuantity(target.dataset.variantId, 1);
    return;
  }

  if (action === "dec-cart") {
    changeCartQuantity(target.dataset.variantId, -1);
    return;
  }

  if (action === "remove-cart") {
    ui.cart = ui.cart.filter((line) => line.variantId !== target.dataset.variantId);
    clearPendingSaleDraft();
    render();
    return;
  }

  if (action === "clear-cart") {
    ui.cart = [];
    ui.cashReceived = "";
    clearPendingSaleDraft();
    render();
    return;
  }

  if (action === "set-payment") {
    ui.paymentMethod = target.dataset.payment;
    if (ui.paymentMethod !== CASH_METHOD) ui.cashReceived = "";
    clearPendingSaleDraft();
    render();
    return;
  }

  if (action === "cash-exact") {
    ui.cashReceived = String(cartTotal());
    clearPendingSaleDraft();
    render();
    return;
  }

  if (action === "confirm-sale") {
    confirmSale();
    return;
  }

  if (action === "cancel-sale") {
    cancelSale(target.dataset.saleId);
    return;
  }

  if (action === "delete-cancelled-sale") {
    deleteCancelledSale(target.dataset.saleId);
    return;
  }

  if (action === "export-csv") {
    exportCsv(target.dataset.export);
    return;
  }

  if (action === "activate-event") {
    state.selectedEventId = target.dataset.eventId;
    ui.reportEventId = target.dataset.eventId;
    ui.category = "すべて";
    ui.cart = [];
    ui.cashReceived = "";
    clearPendingSaleDraft();
    if (!isSupabaseMode) saveState();
    saveUiState();
    showToast("対象イベントを変更しました");
    return;
  }

  if (action === "set-event-status") {
    setEventStatus(target.dataset.eventId, target.dataset.status);
    return;
  }

  if (action === "save-event") {
    saveEvent(target.dataset.eventId, target.closest("[data-event-row]"));
    return;
  }

  if (action === "delete-event") {
    deleteEvent(target.dataset.eventId);
    return;
  }

  if (action === "toggle-product") {
    toggleProduct(target.dataset.productId);
    return;
  }

  if (action === "save-product") {
    saveProduct(target.dataset.productId, target.dataset.variantId, target.closest("[data-product-row]"));
    return;
  }

  if (action === "delete-product") {
    deleteProduct(target.dataset.productId, target.dataset.variantId);
    return;
  }

  if (action === "save-user") {
    saveUser(target.dataset.userId, target.closest("[data-user-row]"));
    return;
  }

  if (action === "delete-user") {
    deleteUser(target.dataset.userId);
  }
}

function handleInput(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "pos-search") {
    ui.search = target.value;
    render();
  }

  if (action === "history-search") {
    ui.historyQuery = target.value;
    render();
  }

  if (action === "cash-received") {
    ui.cashReceived = target.value;
    clearPendingSaleDraft();
    render();
  }
}

function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "mobile-view") {
    ui.view = target.value;
    render();
  }

  if (action === "select-event") {
    state.selectedEventId = target.value;
    ui.reportEventId = target.value;
    ui.category = "すべて";
    ui.cart = [];
    ui.cashReceived = "";
    clearPendingSaleDraft();
    if (!isSupabaseMode) saveState();
    render();
  }

  if (action === "select-user") {
    state.currentUserId = target.value;
    if (!isSupabaseMode) saveState();
    render();
  }

  if (action === "category-filter") {
    ui.category = target.value;
    render();
  }

  if (action === "report-event") {
    ui.reportEventId = target.value;
    render();
  }

  if (action === "restore-data") {
    if (!can("manageData")) {
      target.value = "";
      showToast("現在の権限ではバックアップを復元できません");
      return;
    }
    restoreDataFromFile(target);
  }
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-action]");
  if (!form) return;
  event.preventDefault();

  const action = form.dataset.action;
  if (action === "auth-form") handleAuth(form);
  if (action === "add-event") addEvent(form);
  if (action === "add-product") addProduct(form);
  if (action === "link-product-event") linkProductToEvent(form);
  if (action === "add-user") addUser(form);
  if (action === "adjust-stock") adjustStock(form);
  if (action === "save-actual") saveActualStock(form);
}

async function handleAuth(form) {
  if (!isSupabaseMode) return;

  const data = new FormData(form);
  if (ui.authMode === "forgot-password") {
    await sendPasswordReset(data);
    return;
  }
  if (ui.authMode === "update-password") {
    await updatePassword(data);
    return;
  }

  const email = String(data.get("email")).trim();
  const password = String(data.get("password"));
  const name = String(data.get("name") || "").trim();

  if (!email || !password) {
    showToast("メールアドレスとパスワードを入力してください");
    return;
  }

  appReady = false;
  render();

  try {
    const result =
      ui.authMode === "sign-up"
        ? await supabase.auth.signUp({ email, password, options: { data: { name } } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;
    authSession = result.data.session || (await supabase.auth.getSession()).data.session;

    if (authSession) {
      await loadRemoteData();
      appReady = true;
      showToast(ui.authMode === "sign-up" ? "アカウントを作成しました" : "ログインしました");
      render();
    } else {
      appReady = true;
      showToast("確認メールを開いて登録を完了してください");
      render();
    }
  } catch (error) {
    console.error("Authentication failed.", error);
    appReady = true;
    showToast("ログインまたは登録に失敗しました");
    render();
  }
}

async function sendPasswordReset(data) {
  const email = String(data.get("email") || "").trim();
  if (!email) {
    showToast("メールアドレスを入力してください");
    return;
  }

  appReady = false;
  render();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectUrl(),
    });
    if (error) throw error;

    appReady = true;
    ui.authMode = "sign-in";
    showToast("再設定メールを送信しました");
    render();
  } catch (error) {
    console.error("Password reset email failed.", error);
    appReady = true;
    showToast(authErrorMessage(error, "再設定メールを送信できませんでした"), 7000);
    render();
  }
}

async function updatePassword(data) {
  const password = String(data.get("password") || "");
  const passwordConfirm = String(data.get("passwordConfirm") || "");

  if (password.length < 6) {
    showToast("パスワードは6文字以上で入力してください");
    return;
  }
  if (password !== passwordConfirm) {
    showToast("確認用パスワードが一致しません");
    return;
  }

  appReady = false;
  render();

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    await supabase.auth.signOut();
    authSession = null;
    authProfile = null;
    state = seedState();
    appReady = true;
    ui.authMode = "sign-in";
    showToast("パスワードを更新しました。新しいパスワードでログインしてください");
    render();
  } catch (error) {
    console.error("Password update failed.", error);
    appReady = true;
    showToast("パスワードを更新できませんでした");
    render();
  }
}

function passwordResetRedirectUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isPasswordRecoveryUrl() {
  const currentUrl = `${window.location.search}${window.location.hash}`;
  return currentUrl.includes("type=recovery");
}

async function signOut() {
  if (!isSupabaseMode) return;
  await unsubscribeRemoteStateChanges();
  await supabase.auth.signOut();
  authSession = null;
  authProfile = null;
  remoteStateVersion = null;
  remoteStateEpoch += 1;
  state = seedState();
  appReady = true;
  ui.authMode = "sign-in";
  ui.cart = [];
  ui.cashReceived = "";
  localStorage.removeItem(UI_STATE_KEY);
  render();
}

async function loadRemoteData() {
  if (!isSupabaseMode || !authSession) return;

  syncStatus = "読込中";
  const profiles = await fetchProfiles();
  const profile = profiles.find((item) => item.id === authSession.user.id) || {
    id: authSession.user.id,
    name: authSession.user.email || "ログインユーザー",
    email: authSession.user.email || "",
    role: "staff",
    active: false,
  };

  authProfile = profile;
  if (!profile.active) {
    await unsubscribeRemoteStateChanges();
    remoteStateVersion = null;
    state = normalizeState({
      ...seedState(),
      users: profiles.length ? profiles : [profile],
      currentUserId: profile.id,
    });
    state.currentUserId = profile.id;
    syncStatus = "承認待ち";
    return;
  }

  const remoteRecord = await fetchRemoteState();
  remoteStateVersion = remoteRecord.version;
  state = normalizeState({
    ...remoteRecord.data,
    users: profiles.length ? profiles : [profile],
    currentUserId: profile.id,
  });
  state.currentUserId = profile.id;
  restoreUiForCurrentState();
  ui.reportEventId = state.events.some((event) => event.id === ui.reportEventId) ? ui.reportEventId : state.selectedEventId;
  syncStatus = "共有中";
  subscribeRemoteStateChanges();
}

async function fetchRemoteState() {
  return fetchRemoteStateRecord();
}

async function fetchRemoteStateRecord() {
  const { data, error } = await supabase.from("app_state").select("data,updated_at,version").eq("id", REMOTE_STATE_ID).maybeSingle();
  if (error) throw error;
  if (data?.data) {
    return {
      data: data.data,
      updatedAt: data.updated_at,
      version: Number(data.version || 0),
    };
  }

  const initialState = serializeStateForRemote(seedState());
  const { data: inserted, error: insertError } = await supabase.rpc("initialize_app_state", { p_data: initialState }).maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") return fetchRemoteStateRecord();
    throw insertError;
  }

  return {
    data: inserted?.data || initialState,
    updatedAt: inserted?.updated_at || new Date().toISOString(),
    version: Number(inserted?.version || 0),
  };
}

async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("id,email,name,role,active").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((profile) => ({
    id: profile.id,
    email: profile.email || "",
    name: profile.name || profile.email || "未設定ユーザー",
    role: profile.role || "staff",
    active: profile.active !== false,
  }));
}

function addCart(variantId) {
  const row = catalogRowByVariant(variantId);
  if (!row) return;
  if (row.inventory.current <= 0) {
    showToast("在庫が不足しています");
    return;
  }

  const existing = ui.cart.find((line) => line.variantId === variantId);
  if (existing) {
    if (existing.quantity >= row.inventory.current) {
      showToast("在庫数を超えて追加できません");
      return;
    }
    existing.quantity += 1;
  } else {
    ui.cart.push({ variantId, quantity: 1 });
  }
  clearPendingSaleDraft();
  render();
}

function changeCartQuantity(variantId, delta) {
  const line = ui.cart.find((item) => item.variantId === variantId);
  const row = catalogRowByVariant(variantId);
  if (!line || !row) return;

  const next = line.quantity + delta;
  if (next <= 0) {
    ui.cart = ui.cart.filter((item) => item.variantId !== variantId);
    clearPendingSaleDraft();
    render();
  } else if (next > row.inventory.current) {
    showToast("在庫数を超えて追加できません");
  } else {
    line.quantity = next;
    clearPendingSaleDraft();
    render();
  }
}

function clearPendingSaleDraft() {
  ui.pendingSaleId = "";
}

async function confirmSale() {
  if (ui.saleSaving) return;
  const event = getActiveEvent();
  if (!can("sell")) {
    showToast("現在の権限では販売登録できません");
    return;
  }
  if (event.status !== "open") {
    showToast("販売中のイベントを選択してください");
    return;
  }
  if (ui.cart.length === 0) {
    showToast("カートが空です");
    return;
  }
  if (ui.paymentMethod === CASH_METHOD) {
    const received = cashReceivedAmount();
    const change = cashChangeDue();
    if (received === null) {
      showToast("受取金額を入力してください");
      return;
    }
    if (change < 0) {
      showToast(`受取金額が${yen(Math.abs(change))}不足しています`);
      return;
    }
  }

  for (const line of ui.cart) {
    const row = catalogRowByVariant(line.variantId);
    if (!row || row.inventory.current < line.quantity) {
      showToast("在庫不足の商品があります");
      return;
    }
  }

  const items = ui.cart.map((line) => {
    const row = catalogRowByVariant(line.variantId);
    return {
      productId: row.product.id,
      variantId: row.variant.id,
      name: row.product.name,
      variantName: row.variant.name,
      quantity: line.quantity,
      unitPrice: row.variant.price,
      subtotal: row.variant.price * line.quantity,
    };
  });

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const cashReceived = ui.paymentMethod === CASH_METHOD ? cashReceivedAmount() : null;
  ui.pendingSaleId = ui.pendingSaleId || uid("sale");
  const sale = {
    id: ui.pendingSaleId,
    eventId: event.id,
    userId: state.currentUserId,
    createdAt: new Date().toISOString(),
    paymentMethod: ui.paymentMethod,
    cashReceived,
    changeDue: cashReceived === null ? null : cashReceived - total,
    status: "completed",
    total,
    items,
    cancelledAt: "",
    cancelReason: "",
  };

  if (can("dryRunSales")) {
    ui.cart = [];
    ui.cashReceived = "";
    clearPendingSaleDraft();
    showToast("テスト販売を完了しました。履歴・集計・在庫には反映していません");
    render();
    return;
  }

  ui.saleSaving = true;
  if (isSupabaseMode) syncStatus = "保存中";
  render();

  try {
    if (isSupabaseMode) {
      state = await commitSaleToRemote(sale);
      state.currentUserId = authProfile?.id || state.currentUserId;
    } else {
      applySaleToState(state, sale);
      await saveState();
    }

    ui.cart = [];
    ui.cashReceived = "";
    clearPendingSaleDraft();
    showToast(`販売を登録しました ${yen(sale.total)}`);
  } catch (error) {
    console.error("Failed to confirm sale.", error);
    if (isSupabaseMode) syncStatus = "保存失敗";
    showToast(saleCommitErrorMessage(error), 7000);
  } finally {
    ui.saleSaving = false;
    render();
  }
}

async function commitSaleToRemote(sale) {
  const { data, error } = await supabase.rpc("create_sale", { p_sale: sale }).maybeSingle();
  if (error) throw error;
  return applyRemoteStateResult(data);
}

function applySaleToState(targetState, sale) {
  if (targetState.sales.some((item) => item.id === sale.id)) {
    return { ok: true, alreadyApplied: true };
  }

  const event = targetState.events.find((item) => item.id === sale.eventId);
  if (!event || event.status !== "open") {
    return { ok: false, message: "販売中のイベントではないため保存できませんでした" };
  }

  for (const item of sale.items) {
    const inventory = inventoryInState(targetState, sale.eventId, item.variantId);
    if (!inventory || inventory.current < item.quantity) {
      return { ok: false, message: "サーバー側の在庫が不足しています。画面を更新して確認してください" };
    }
  }

  for (const item of sale.items) {
    const inventory = inventoryInState(targetState, sale.eventId, item.variantId);
    inventory.current -= item.quantity;
  }

  targetState.sales.push(sale);
  return { ok: true, alreadyApplied: false };
}

function inventoryInState(targetState, eventId, variantId) {
  return targetState.inventories.find((inventory) => inventory.eventId === eventId && inventory.variantId === variantId);
}

function saleCommitErrorMessage(error) {
  const message = error?.message || "";
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("fetch")) {
    return "通信エラーのため販売を保存できませんでした。カートは残しています。接続を確認してもう一度確定してください";
  }
  return `${message || "販売を保存できませんでした"}。カートは残しています`;
}

function remoteActionErrorMessage(error, fallback) {
  const message = error?.message || "";
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("fetch")) {
    return `通信エラーのため${fallback}。接続を確認してもう一度実行してください`;
  }
  if (isRemoteStateConflict(error)) {
    return "別の端末で更新されたため保存できませんでした。最新データを確認してもう一度実行してください";
  }
  return message || fallback;
}

async function cancelSale(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale || sale.status !== "completed") return;
  if (!canCancelSale(sale)) {
    showToast("現在の権限では取消できません");
    return;
  }

  const reason = prompt("取消理由を入力してください", "誤登録");
  if (reason === null) return;
  const cancelReason = reason.trim() || "未入力";

  if (isSupabaseMode) {
    try {
      await runRemoteStateRpc("cancel_sale", {
        p_sale_id: saleId,
        p_reason: cancelReason,
      });
      showToast("販売を取消しました");
      render();
    } catch (error) {
      console.error("Failed to cancel sale.", error);
      syncStatus = "保存失敗";
      showToast(remoteActionErrorMessage(error, "販売取消に失敗しました"), 7000);
      render();
    }
    return;
  }

  sale.status = "cancelled";
  sale.cancelReason = cancelReason;
  sale.cancelledAt = new Date().toISOString();

  for (const item of sale.items) {
    const inventory = inventoryFor(sale.eventId, item.variantId);
    if (inventory) inventory.current += item.quantity;
  }

  saveState();
  showToast("販売を取消しました");
}

async function deleteCancelledSale(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale || sale.status !== "cancelled") return;
  if (!canDeleteCancelledSale(sale)) {
    showToast("現在の権限では削除できません");
    return;
  }

  const ok = confirm("取消済みの販売履歴を削除します。削除後はバックアップ以外から戻せません。よろしいですか？");
  if (!ok) return;

  if (isSupabaseMode) {
    try {
      await runRemoteStateRpc("delete_cancelled_sale", { p_sale_id: saleId });
      showToast("取消済みの販売履歴を削除しました");
      render();
    } catch (error) {
      console.error("Failed to delete cancelled sale.", error);
      syncStatus = "保存失敗";
      showToast(remoteActionErrorMessage(error, "取消済み販売の削除に失敗しました"), 7000);
      render();
    }
    return;
  }

  state.sales = state.sales.filter((item) => item.id !== sale.id);
  saveState();
  showToast("取消済みの販売履歴を削除しました");
}

function addEvent(form) {
  if (!can("manageEvents")) return;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  const date = String(data.get("date"));
  const venue = String(data.get("venue")).trim();

  if (!name || !date || !venue) {
    showToast("イベント名、開催日、会場を入力してください");
    return;
  }

  const event = {
    id: uid("evt"),
    name,
    date,
    venue,
    status: "draft",
    memo: "",
  };

  state.events.push(event);
  state.selectedEventId = event.id;
  ui.reportEventId = event.id;
  ui.category = "すべて";
  ui.cart = [];
  ui.cashReceived = "";
  saveState();
  form.reset();
  showToast("イベントを追加しました");
}

function saveEvent(eventId, row) {
  if (!can("manageEvents")) return;

  const event = state.events.find((item) => item.id === eventId);
  if (!event || !row) return;

  const name = row.querySelector('[name="eventName"]')?.value.trim() ?? "";
  const date = row.querySelector('[name="eventDate"]')?.value ?? "";
  const venue = row.querySelector('[name="eventVenue"]')?.value.trim() ?? "";
  const memo = row.querySelector('[name="eventMemo"]')?.value.trim() ?? "";

  if (!name || !date || !venue) {
    showToast("イベント名、開催日、会場を入力してください");
    return;
  }

  event.name = name;
  event.date = date;
  event.venue = venue;
  event.memo = memo;
  saveState();
  showToast("イベントを更新しました");
}

function deleteEvent(eventId) {
  if (!can("manageEvents")) return;

  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  if (state.events.length <= 1) {
    showToast("最後のイベントは削除できません");
    return;
  }

  const relatedSalesCount = state.sales.filter((sale) => sale.eventId === event.id).length;
  const relatedInventoryCount = state.inventories.filter((inventory) => inventory.eventId === event.id).length;
  const relatedProductCount = state.products.filter((product) => productEventIds(product).includes(event.id)).length;
  const message = `${event.name} を削除します。関連する販売履歴 ${relatedSalesCount}件、在庫データ ${relatedInventoryCount}件、イベント商品 ${relatedProductCount}件も削除されます。`;
  if (!confirm(message)) return;

  state.products = state.products
    .map((product) => ({
      ...product,
      eventIds: productEventIds(product).filter((id) => id !== event.id),
      eventStatuses: Object.fromEntries(Object.entries(product.eventStatuses || {}).filter(([id]) => id !== event.id)),
    }))
    .filter((product) => product.eventIds.length > 0);
  state.events = state.events.filter((item) => item.id !== event.id);
  state.sales = state.sales.filter((sale) => sale.eventId !== event.id);
  state.inventories = state.inventories.filter((inventory) => inventory.eventId !== event.id);
  state.adjustments = state.adjustments.filter((adjustment) => adjustment.eventId !== event.id);

  if (state.selectedEventId === event.id) {
    state.selectedEventId = state.events[0].id;
    ui.reportEventId = state.selectedEventId;
    ui.category = "すべて";
    ui.cart = [];
    ui.cashReceived = "";
  } else if (ui.reportEventId === event.id) {
    ui.reportEventId = state.selectedEventId;
  }

  saveState();
  showToast("イベントを削除しました");
}

function addProduct(form) {
  if (!can("manageProducts")) return;
  const data = new FormData(form);
  const productId = uid("prd");
  const variantId = uid("var");
  const name = String(data.get("name")).trim();
  const code = normalizeCode(data.get("code"));
  const category = String(data.get("category")).trim();
  const variantName = String(data.get("variantName")).trim();
  const sku = normalizeCode(`${code}-${variantName}`);
  const priceRaw = String(data.get("price") ?? "");
  const stockRaw = String(data.get("stock") ?? "");
  const thresholdRaw = String(data.get("threshold") ?? "");
  const price = Number(priceRaw);
  const stock = Number(stockRaw);
  const threshold = Number(thresholdRaw);

  if (!name || !code || !category || !variantName) {
    showToast("商品名、商品コード、カテゴリ、バリエーションを入力してください");
    return;
  }

  if (isDuplicateSku(sku, variantId)) {
    showToast("同じSKUがすでに使われています");
    return;
  }

  if (
    priceRaw === "" ||
    stockRaw === "" ||
    thresholdRaw === "" ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(stock) ||
    stock < 0 ||
    !Number.isFinite(threshold) ||
    threshold < 0
  ) {
    showToast("価格、初期在庫、低在庫しきい値は0以上の数値で入力してください");
    return;
  }

  const product = {
    id: productId,
    name,
    code,
    category,
    status: "active",
    eventIds: [state.selectedEventId],
    eventStatuses: { [state.selectedEventId]: "active" },
    variants: [
      {
        id: variantId,
        name: variantName,
        sku,
        price,
        color: String(data.get("color")),
      },
    ],
  };

  state.products.push(product);
  ensureInventory(state.selectedEventId, variantId, stock, threshold);
  saveState();
  form.reset();
  showToast("商品を追加しました");
}

function linkProductToEvent(form) {
  if (!can("manageProducts")) return;
  const data = new FormData(form);
  const event = getActiveEvent();
  const productId = String(data.get("productId") || "");
  const stockRaw = String(data.get("stock") ?? "");
  const thresholdRaw = String(data.get("threshold") ?? "");
  const stock = Number(stockRaw);
  const threshold = Number(thresholdRaw);
  const product = state.products.find((item) => item.id === productId);

  if (!product) {
    showToast("紐づける商品を選択してください");
    return;
  }

  if (productBelongsToEvent(product, event.id)) {
    showToast("この商品はすでにイベントに紐づいています");
    return;
  }

  if (stockRaw === "" || thresholdRaw === "" || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(threshold) || threshold < 0) {
    showToast("初期在庫と低在庫しきい値は0以上の数値で入力してください");
    return;
  }

  const duplicateVariant = product.variants.find((variant) => isDuplicateSku(normalizeCode(variant.sku), variant.id, event.id));
  if (duplicateVariant) {
    showToast(`SKU ${duplicateVariant.sku} がこのイベントですでに使われています`);
    return;
  }

  product.eventIds = [...new Set([...productEventIds(product), event.id])];
  product.eventStatuses = {
    ...(product.eventStatuses || {}),
    [event.id]: "active",
  };

  for (const variant of product.variants) {
    const inventory = inventoryFor(event.id, variant.id);
    if (inventory) {
      inventory.threshold = threshold;
      continue;
    }
    state.inventories.push({
      eventId: event.id,
      variantId: variant.id,
      initial: stock,
      current: stock,
      threshold,
      actual: null,
    });
  }

  saveState();
  form.reset();
  showToast("登録済み商品をイベントに紐づけました");
  render();
}

function saveProduct(productId, variantId, row) {
  if (!can("manageProducts")) return;

  const product = state.products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant || !row) return;

  const name = row.querySelector('[name="productName"]')?.value.trim() ?? "";
  const code = normalizeCode(row.querySelector('[name="productCode"]')?.value ?? "");
  const category = row.querySelector('[name="productCategory"]')?.value.trim() ?? "";
  const variantName = row.querySelector('[name="variantName"]')?.value.trim() ?? "";
  const sku = normalizeCode(row.querySelector('[name="variantSku"]')?.value ?? "");
  const priceRaw = row.querySelector('[name="variantPrice"]')?.value ?? "";
  const price = Number(priceRaw);
  const color = row.querySelector('[name="variantColor"]')?.value || "#0f766e";

  if (!name || !code || !category || !variantName || !sku) {
    showToast("商品名、商品コード、カテゴリ、バリエーション、SKUを入力してください");
    return;
  }

  if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
    showToast("価格は0以上の数値で入力してください");
    return;
  }

  if (isDuplicateSku(sku, variantId)) {
    showToast("同じSKUがすでに使われています");
    return;
  }

  product.name = name;
  product.code = code;
  product.category = category;
  variant.name = variantName;
  variant.sku = sku;
  variant.price = Math.round(price);
  variant.color = color;

  saveState();
  showToast("商品を更新しました");
}

function deleteProduct(productId, variantId) {
  if (!can("manageProducts")) return;

  const product = state.products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) return;

  const event = getActiveEvent();
  const saleCount = salesCountForProductEvent(product, event.id);
  if (saleCount > 0) {
    showToast("このイベントで販売履歴がある商品は削除できません。停止を使用してください");
    return;
  }

  const variantIds = product.variants.map((item) => item.id);
  const inventoryCount = state.inventories.filter((inventory) => inventory.eventId === event.id && variantIds.includes(inventory.variantId)).length;
  const adjustmentCount = state.adjustments.filter((adjustment) => adjustment.eventId === event.id && variantIds.includes(adjustment.variantId)).length;
  const message = `${event.name} から ${product.name} を削除します。関連する在庫データ ${inventoryCount}件、調整履歴 ${adjustmentCount}件も削除されます。`;
  if (!confirm(message)) return;

  const remainingEventIds = productEventIds(product).filter((id) => id !== event.id);
  if (remainingEventIds.length === 0) {
    state.products = state.products.filter((item) => item.id !== productId);
  } else {
    product.eventIds = remainingEventIds;
    product.eventStatuses = Object.fromEntries(Object.entries(product.eventStatuses || {}).filter(([id]) => id !== event.id));
  }
  state.inventories = state.inventories.filter((inventory) => inventory.eventId !== event.id || !variantIds.includes(inventory.variantId));
  state.adjustments = state.adjustments.filter((adjustment) => adjustment.eventId !== event.id || !variantIds.includes(adjustment.variantId));
  ui.cart = ui.cart.filter((line) => !variantIds.includes(line.variantId));

  saveState();
  showToast("イベント商品を削除しました");
  render();
}

async function addUser(form) {
  if (!can("manageUsers")) return;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();

  if (isSupabaseMode) {
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const role = String(data.get("role") || "");
    const active = String(data.get("active")) === "true";

    if (!name || !email || !password) {
      showToast("名前、ログインID、仮パスワードを入力してください");
      return;
    }
    if (!email.includes("@")) {
      showToast("ログインIDはメールアドレス形式で入力してください");
      return;
    }
    if (password.length < 6) {
      showToast("仮パスワードは6文字以上で入力してください");
      return;
    }
    if (!roles[role]) {
      showToast("権限の指定が正しくありません");
      return;
    }

    try {
      await createUserByAdmin({ name, email, password, role, active });
      await loadRemoteData();
      form.reset();
      showToast("ユーザーを追加しました");
      render();
    } catch (error) {
      console.error("Failed to create user.", error);
      showToast(authErrorMessage(error, "ユーザー追加に失敗しました"), 7000);
    }
    return;
  }

  if (!name) {
    showToast("ユーザー名を入力してください");
    return;
  }

  state.users.push({
    id: uid("usr"),
    name,
    role: String(data.get("role")),
    active: true,
  });
  saveState();
  form.reset();
  showToast("ユーザーを追加しました");
}

async function createUserByAdmin(payload) {
  const session = authSession || (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) throw new Error("ログイン情報を確認できません");

  const response = await fetch("/api/admin-create-user", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "ユーザーを追加できませんでした");
  }
  return result;
}

async function saveUser(userId, row) {
  if (!can("manageUsers")) return;

  const user = state.users.find((item) => item.id === userId);
  if (!user || !row) return;

  const name = row.querySelector('[name="userName"]')?.value.trim() ?? "";
  const email = row.querySelector('[name="userEmail"]')?.value.trim() ?? user.email ?? "";
  const password = row.querySelector('[name="userPassword"]')?.value ?? "";
  const role = row.querySelector('[name="userRole"]')?.value ?? user.role;
  const active = row.querySelector('[name="userActive"]')?.value === "true";

  if (!name) {
    showToast("ユーザー名を入力してください");
    return;
  }

  if (isSupabaseMode && !email) {
    showToast("ログインIDを入力してください");
    return;
  }

  if (isSupabaseMode && !email.includes("@")) {
    showToast("ログインIDはメールアドレス形式で入力してください");
    return;
  }

  if (isSupabaseMode && password && password.length < 6) {
    showToast("パスワードは6文字以上で入力してください");
    return;
  }

  if (!roles[role]) {
    showToast("権限の指定が正しくありません");
    return;
  }

  if (user.id === state.currentUserId && !active) {
    showToast("現在の操作ユーザーは無効化できません");
    return;
  }

  if (user.id === state.currentUserId && user.role === "admin" && role !== "admin") {
    showToast("自分自身の管理者権限は外せません");
    return;
  }

  if (isLastActiveAdmin(user.id) && (role !== "admin" || !active)) {
    showToast("最後の有効な管理者は変更できません");
    return;
  }

  user.name = name;
  user.email = email;
  user.role = role;
  user.active = active;

  if (isSupabaseMode) {
    try {
      await updateUserByAdmin({ userId: user.id, name, email, role, active, password });
    } catch (error) {
      console.error("Failed to update user.", error);
      showToast(authErrorMessage(error, "ユーザー更新に失敗しました"), 7000);
      return;
    }
    await loadRemoteData();
  }

  saveState();
  showToast("ユーザーを更新しました");
  render();
}

async function updateUserByAdmin(payload) {
  const session = authSession || (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) throw new Error("ログイン情報を確認できません");

  const response = await fetch("/api/admin-update-user", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      ...payload,
      password: payload.password || "",
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "ユーザー情報を変更できませんでした");
  }
  return result;
}

async function deleteUser(userId) {
  if (!can("manageUsers")) return;

  const user = state.users.find((item) => item.id === userId);
  if (!user) return;

  if (user.id === state.currentUserId) {
    showToast("現在の操作ユーザーは削除できません");
    return;
  }

  if (isLastActiveAdmin(user.id)) {
    showToast("最後の有効な管理者は削除できません");
    return;
  }

  if (!confirm(`${user.name} を削除します。販売履歴の担当者名は「不明」表示になります。`)) return;

  if (isSupabaseMode) {
    const { error } = await supabase.from("profiles").update({ active: false }).eq("id", user.id);
    if (error) {
      console.error("Failed to deactivate profile.", error);
      showToast("ユーザー削除に失敗しました");
      return;
    }
    await loadRemoteData();
    saveState();
    showToast("ユーザーを無効化しました");
    render();
    return;
  }

  state.users = state.users.filter((item) => item.id !== user.id);
  saveState();
  showToast("ユーザーを削除しました");
}

function backupData() {
  if (!can("manageData")) {
    showToast("現在の権限ではバックアップを出力できません");
    return;
  }

  const payload = {
    app: "event-merch-sales-web",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  downloadJson(`merch-sales-backup-${filenameTimestamp()}.json`, payload);
  showToast("バックアップを書き出しました");
}

async function restoreDataFromFile(input) {
  if (!can("manageData")) {
    input.value = "";
    showToast("現在の権限ではバックアップを復元できません");
    return;
  }

  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const restored = normalizeState(parsed.state ?? parsed);
    const eventCount = restored.events.length;
    const saleCount = restored.sales.length;

    if (!confirm(`バックアップを復元します。現在のローカルデータは置き換わります。\nイベント ${eventCount}件 / 販売履歴 ${saleCount}件`)) {
      input.value = "";
      return;
    }

    state = restored;
    if (isSupabaseMode && authSession) {
      const profiles = await fetchProfiles();
      const profile = profiles.find((item) => item.id === authSession.user.id) || authProfile;
      state.users = profiles.length ? profiles : state.users;
      state.currentUserId = profile?.id || authSession.user.id;
      authProfile = profile || authProfile;
    }
    ui = {
      ...ui,
      cart: [],
      paymentMethod: CASH_METHOD,
      cashReceived: "",
      search: "",
      category: "すべて",
      historyQuery: "",
      reportEventId: state.selectedEventId,
    };
    saveState();
    input.value = "";
    showToast("バックアップから復元しました");
  } catch (error) {
    console.warn("Failed to restore backup.", error);
    input.value = "";
    showToast("復元できませんでした。JSONファイルを確認してください");
  }
}

async function adjustStock(form) {
  if (!can("adjustInventory")) return;
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  const reason = String(data.get("reason")).trim();
  const variantId = String(data.get("variantId"));
  const eventId = getActiveEvent().id;
  const inventory = inventoryFor(eventId, variantId);

  if (!inventory || !Number.isFinite(amount) || amount === 0) {
    showToast("調整数を入力してください");
    return;
  }
  if (inventory.current + amount < 0) {
    showToast("在庫はマイナスにできません");
    return;
  }

  if (isSupabaseMode) {
    try {
      await runRemoteStateRpc("adjust_inventory", {
        p_event_id: eventId,
        p_variant_id: variantId,
        p_amount: Math.trunc(amount),
        p_reason: reason || "未入力",
      });
      form.reset();
      showToast("在庫を調整しました");
      render();
    } catch (error) {
      console.error("Failed to adjust inventory.", error);
      syncStatus = "保存失敗";
      showToast(remoteActionErrorMessage(error, "在庫調整に失敗しました"), 7000);
      render();
    }
    return;
  }

  inventory.current += amount;
  state.adjustments.push({
    id: uid("adj"),
    eventId,
    variantId,
    amount,
    reason: reason || "未入力",
    userId: state.currentUserId,
    createdAt: new Date().toISOString(),
  });

  saveState();
  showToast("在庫を調整しました");
}

async function saveActualStock(form) {
  if (!can("adjustInventory")) return;
  const data = new FormData(form);
  const variantId = String(data.get("variantId"));
  const actualRaw = String(data.get("actual"));
  const eventId = getActiveEvent().id;
  const inventory = inventoryFor(eventId, variantId);
  if (!inventory) return;

  const actual = actualRaw === "" ? null : Number(actualRaw);
  if (actual !== null && !Number.isFinite(actual)) {
    showToast("実在庫は数値で入力してください");
    return;
  }

  if (isSupabaseMode) {
    try {
      await runRemoteStateRpc("save_actual_stock", {
        p_event_id: eventId,
        p_variant_id: variantId,
        p_actual: actual,
      });
      showToast("実在庫を保存しました");
      render();
    } catch (error) {
      console.error("Failed to save actual stock.", error);
      syncStatus = "保存失敗";
      showToast(remoteActionErrorMessage(error, "実在庫保存に失敗しました"), 7000);
      render();
    }
    return;
  }

  inventory.actual = actual;
  saveState();
  showToast("実在庫を保存しました");
}

function setEventStatus(eventId, status) {
  if (status === "closed" && !can("closeEvent")) return;
  if (status !== "closed" && !can("manageEvents")) return;

  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  event.status = status;
  saveState();
  showToast("イベント状態を更新しました");
}

function toggleProduct(productId) {
  if (!can("manageProducts")) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const event = getActiveEvent();
  const currentStatus = productStatusForEvent(product, event.id);
  product.eventStatuses = {
    ...(product.eventStatuses || {}),
    [event.id]: currentStatus === "active" ? "inactive" : "active",
  };
  saveState();
  showToast("商品状態を更新しました");
  render();
}

function exportCsv(type) {
  if (!can("exportCsv")) {
    showToast("現在の権限ではCSV出力できません");
    return;
  }

  const event = state.events.find((item) => item.id === ui.reportEventId) || getActiveEvent();
  let rows = [];
  let filename = "";

  if (type === "sales") {
    rows = [["販売ID", "日時", "状態", "担当", "決済方法", "受取金額", "おつり", "商品", "バリエーション", "数量", "単価", "小計"]].concat(
      state.sales
        .filter((sale) => sale.eventId === event.id)
        .flatMap((sale) =>
          sale.items.map((item) => [
            sale.id,
            formatDateTime(sale.createdAt),
            sale.status === "completed" ? "完了" : "取消",
            userById(sale.userId)?.name ?? "",
            sale.paymentMethod,
            sale.cashReceived ?? "",
            sale.changeDue ?? "",
            item.name,
            item.variantName,
            item.quantity,
            item.unitPrice,
            item.subtotal,
          ]),
        ),
    );
    filename = `${event.name}_sales.csv`;
  }

  if (type === "products") {
    rows = [["商品", "SKU", "販売数", "売上"]].concat(productReportRows(event.id).map((row) => [row.name, row.sku, row.quantity, row.total]));
    filename = `${event.name}_products.csv`;
  }

  if (type === "payments") {
    rows = [["決済方法", "販売件数", "売上"]].concat(paymentReportRows(event.id).map((row) => [row.method, row.count, row.total]));
    filename = `${event.name}_payments.csv`;
  }

  if (type === "inventory") {
    rows = [["商品", "SKU", "初期在庫", "現在庫", "しきい値", "実在庫", "差異"]].concat(
      inventoryRows(event.id).map((row) => [
        `${row.product.name} / ${row.variant.name}`,
        row.variant.sku,
        row.initial,
        row.current,
        row.threshold,
        row.actual ?? "",
        row.actual === null || row.actual === "" ? "" : Number(row.actual) - row.current,
      ]),
    );
    filename = `${event.name}_inventory.csv`;
  }

  downloadCsv(filename, rows);
  showToast("CSVを出力しました");
}

function getActiveEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || state.events[0];
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0];
}

function userById(userId) {
  return state.users.find((user) => user.id === userId);
}

function normalizeCode(value) {
  return String(value).trim().toUpperCase();
}

function productEventIds(product, fallbackEventIds = state.events.map((event) => event.id)) {
  const validFallbackIds = Array.isArray(fallbackEventIds) ? fallbackEventIds : [];
  if (Array.isArray(product.eventIds)) {
    return [...new Set(product.eventIds.filter((id) => validFallbackIds.length === 0 || validFallbackIds.includes(id)))];
  }
  if (product.eventId && (validFallbackIds.length === 0 || validFallbackIds.includes(product.eventId))) {
    return [product.eventId];
  }
  return validFallbackIds;
}

function normalizeProductEventIds(product, events, inventories) {
  const eventIds = events.map((event) => event.id);
  const explicitIds = productEventIds(product, eventIds);
  if (Array.isArray(product.eventIds) || product.eventId) {
    return explicitIds;
  }

  const variantIds = new Set(Array.isArray(product.variants) ? product.variants.map((variant) => variant.id) : []);
  const inventoryEventIds = inventories
    .filter((inventory) => variantIds.has(inventory.variantId) && eventIds.includes(inventory.eventId))
    .map((inventory) => inventory.eventId);
  return [...new Set(inventoryEventIds.length > 0 ? inventoryEventIds : eventIds)];
}

function productBelongsToEvent(product, eventId) {
  return productEventIds(product).includes(eventId);
}

function productStatusForEvent(product, eventId) {
  return product.eventStatuses?.[eventId] || product.status || "active";
}

function productsForEvent(eventId, includeInactive = true) {
  return state.products.filter((product) => productBelongsToEvent(product, eventId) && (includeInactive || productStatusForEvent(product, eventId) === "active"));
}

function isDuplicateSku(sku, currentVariantId, eventId = getActiveEvent().id) {
  return productsForEvent(eventId).some((product) =>
    product.variants.some((variant) => variant.id !== currentVariantId && normalizeCode(variant.sku) === sku),
  );
}

function salesCountForVariant(variantId, eventId = null) {
  return state.sales.filter((sale) => (!eventId || sale.eventId === eventId) && sale.items.some((item) => item.variantId === variantId)).length;
}

function salesCountForProductEvent(product, eventId) {
  const variantIds = new Set(product.variants.map((variant) => variant.id));
  return state.sales.filter((sale) => sale.eventId === eventId && sale.items.some((item) => variantIds.has(item.variantId))).length;
}

function activeAdminUsers() {
  return state.users.filter((user) => user.active && user.role === "admin");
}

function isLastActiveAdmin(userId) {
  const user = state.users.find((item) => item.id === userId);
  return Boolean(user?.active && user.role === "admin" && activeAdminUsers().length <= 1);
}

function can(permission) {
  const user = getCurrentUser();
  return Boolean(user?.active && permissions[user.role]?.[permission]);
}

function canCancelSale(sale) {
  if (can("cancelAny")) return true;
  const user = getCurrentUser();
  if (user.role !== "staff" || sale.userId !== user.id) return false;
  const ageMinutes = (Date.now() - new Date(sale.createdAt).getTime()) / 60000;
  return ageMinutes <= 15;
}

function canDeleteCancelledSale(sale) {
  return sale?.status === "cancelled" && can("deleteCancelledSales");
}

function completedSales(eventId) {
  return state.sales.filter((sale) => sale.eventId === eventId && sale.status === "completed");
}

function cancelledSales(eventId) {
  return state.sales.filter((sale) => sale.eventId === eventId && sale.status === "cancelled");
}

function catalogRows(includeInactive = false, eventId = getActiveEvent().id) {
  return productsForEvent(eventId, includeInactive)
    .flatMap((product) =>
      product.variants.map((variant) => ({
        product,
        variant,
        inventory: ensureInventory(eventId, variant.id, 0, 5),
      })),
    );
}

function catalogRowByVariant(variantId, eventId = getActiveEvent().id) {
  return catalogRows(true, eventId).find((row) => row.variant.id === variantId);
}

function inventoryRows(eventId) {
  return productsForEvent(eventId).flatMap((product) =>
    product.variants.map((variant) => ({
      product,
      variant,
      ...ensureInventory(eventId, variant.id, 0, 5),
    })),
  );
}

function inventoryFor(eventId, variantId) {
  return state.inventories.find((inventory) => inventory.eventId === eventId && inventory.variantId === variantId);
}

function ensureInventory(eventId, variantId, initial = 0, threshold = 5) {
  let inventory = inventoryFor(eventId, variantId);
  if (!inventory) {
    inventory = { eventId, variantId, initial, current: initial, threshold, actual: null };
    state.inventories.push(inventory);
    if (!isSupabaseMode) saveState();
  }
  return inventory;
}

function salesSummary(eventId) {
  const sales = completedSales(eventId);
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const units = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const productKinds = new Set(sales.flatMap((sale) => sale.items.map((item) => item.variantId))).size;
  const stock = inventoryRows(eventId).reduce((sum, row) => sum + row.current, 0);
  return {
    total,
    units,
    productKinds,
    stock,
    salesCount: sales.length,
    average: sales.length ? Math.round(total / sales.length) : 0,
  };
}

function paymentReportRows(eventId) {
  const sales = completedSales(eventId);
  return paymentMethods.map((method) => {
    const filtered = sales.filter((sale) => sale.paymentMethod === method);
    return {
      method,
      count: filtered.length,
      total: filtered.reduce((sum, sale) => sum + sale.total, 0),
    };
  });
}

function productReportRows(eventId) {
  const map = new Map();
  for (const sale of completedSales(eventId)) {
    for (const item of sale.items) {
      const row = catalogRowByVariant(item.variantId, eventId);
      const key = item.variantId;
      const existing = map.get(key) || {
        name: `${item.name} / ${item.variantName}`,
        sku: row?.variant.sku ?? "",
        quantity: 0,
        total: 0,
      };
      existing.quantity += item.quantity;
      existing.total += item.subtotal;
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function hourlyReportRows(eventId) {
  const map = new Map();
  for (const sale of completedSales(eventId)) {
    const hour = String(new Date(sale.createdAt).getHours()).padStart(2, "0");
    const existing = map.get(hour) || { hour, salesCount: 0, units: 0, total: 0 };
    existing.salesCount += 1;
    existing.units += sale.items.reduce((sum, item) => sum + item.quantity, 0);
    existing.total += sale.total;
    map.set(hour, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.hour.localeCompare(b.hour));
}

function renderPaymentBars(eventId) {
  const rows = paymentReportRows(eventId);
  const max = Math.max(...rows.map((row) => row.total), 1);
  return `
    <div class="bar-list">
      ${rows
        .map(
          (row) => `
            <div class="bar-row">
              <div class="bar-meta">
                <strong>${escapeHtml(row.method)}</strong>
                <span>${yen(row.total)} / ${row.count}件</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${Math.round((row.total / max) * 100)}%"></div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function metricCard(label, value, detail) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function cartTotal() {
  return ui.cart.reduce((sum, line) => {
    const row = catalogRowByVariant(line.variantId);
    return sum + (row ? row.variant.price * line.quantity : 0);
  }, 0);
}

function cashReceivedAmount() {
  if (ui.cashReceived === "" || ui.cashReceived === null || ui.cashReceived === undefined) return null;
  const received = Number(ui.cashReceived);
  return Number.isFinite(received) ? received : null;
}

function cashChangeDue(total = cartTotal()) {
  const received = cashReceivedAmount();
  if (received === null) return null;
  return received - total;
}

function canConfirmCurrentSale(event) {
  if (ui.saleSaving) return false;
  if (!can("sell") || event.status !== "open" || ui.cart.length === 0) return false;
  if (ui.paymentMethod !== CASH_METHOD) return true;
  const change = cashChangeDue();
  return change !== null && change >= 0;
}

function saleBlockingNotice(event, total = cartTotal()) {
  if (event.status !== "open") return "このイベントは販売登録できる状態ではありません。";
  if (!can("sell")) return "現在の権限では販売登録できません。";
  if (ui.paymentMethod !== CASH_METHOD || ui.cart.length === 0) return "";
  if (cashReceivedAmount() === null) return "受取金額を入力してください。";
  const change = cashChangeDue(total);
  if (change !== null && change < 0) return `受取金額が${yen(Math.abs(change))}不足しています。`;
  return "";
}

function canRestoreSelection(element) {
  if (element.tagName === "TEXTAREA") return true;
  return ["text", "search", "tel", "url", "password"].includes(element.type);
}

function eventStatusLabel(status) {
  if (status === "open") return "販売中";
  if (status === "closed") return "終了";
  return "準備中";
}

function showToast(message, duration = 2200) {
  ui.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.toast = "";
    render();
  }, duration);
}

function authErrorMessage(error, fallback) {
  const message = String(error?.message || "");
  const normalized = message.toLowerCase();

  if (message.includes("Email address not authorized")) {
    return "Supabase標準メールでは送信先が制限されています。Custom SMTPを設定してください。";
  }
  if (normalized.includes("rate limit") || message.includes("For security purposes")) {
    return "メール送信制限に達しています。時間を置くかCustom SMTPを設定してください。";
  }
  if (normalized.includes("redirect")) {
    return "SupabaseのRedirect URLsにVercelのURLを追加してください。";
  }
  if (normalized.includes("profiles_role_check")) {
    return "Supabaseの権限制約にテスト販売ロールが未追加です。supabase/add-tester-role.sql をSQL Editorで実行してください。";
  }

  return message ? `${fallback}: ${message}` : fallback;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadJson(filename, payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function sanitizeFilename(filename) {
  return filename.replace(/[\\/:*?"<>|]/g, "_");
}

function filenameTimestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}`;
}

function uid(prefix) {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function yen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function icon(name) {
  const paths = {
    gauge: `<path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14l4-5"/><path d="M7 14h.01"/><path d="M17 14h.01"/>`,
    cart: `<circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7"/>`,
    receipt: `<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>`,
    boxes: `<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M3 9v6l9 5 9-5V9"/><path d="M12 14v6"/>`,
    chart: `<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>`,
    calendar: `<path d="M7 3v4"/><path d="M17 3v4"/><path d="M4 7h16"/><rect x="4" y="5" width="16" height="16" rx="2"/>`,
    tag: `<path d="M20 12l-8 8-9-9V4h7l10 8z"/><circle cx="7.5" cy="7.5" r="1"/>`,
    users: `<path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    menu: `<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>`,
    plus: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
    minus: `<path d="M5 12h14"/>`,
    trash: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>`,
    x: `<path d="M6 6l12 12"/><path d="M18 6L6 18"/>`,
    check: `<path d="M20 6L9 17l-5-5"/>`,
    download: `<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>`,
    upload: `<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>`,
    refresh: `<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>`,
    save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>`,
    mail: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>`,
    play: `<path d="M8 5v14l11-7-11-7z"/>`,
    lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
    logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`,
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.check}</svg>`;
}

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  bindLifecyclePersistence();
  initApp();
});

async function initApp() {
  if (!isSupabaseMode) {
    restoreUiForCurrentState();
    render();
    return;
  }

  appReady = false;
  render();

  try {
    authSession = (await supabase.auth.getSession()).data.session;
    if (authSession && isPasswordRecoveryUrl()) {
      ui.authMode = "update-password";
    }
    if (authSession && ui.authMode !== "update-password") {
      await loadRemoteData();
    }
    appReady = true;
    render();

    supabase.auth.onAuthStateChange(async (authEvent, session) => {
      authSession = session;
      if (authEvent === "PASSWORD_RECOVERY") {
        ui.authMode = "update-password";
        appReady = true;
        render();
        return;
      }
      if (!session) {
        await unsubscribeRemoteStateChanges();
        authProfile = null;
        remoteStateVersion = null;
        remoteStateEpoch += 1;
        ui.authMode = "sign-in";
        appReady = true;
        render();
        return;
      }
      if (session) {
        await unsubscribeRemoteStateChanges();
        appReady = false;
        render();
        if (ui.authMode !== "update-password") {
          await loadRemoteData();
        }
      }
      appReady = true;
      render();
    });
  } catch (error) {
    console.error("Failed to initialize app.", error);
    appReady = true;
    showToast("Supabaseの初期化に失敗しました");
    render();
  }
}

function bindLifecyclePersistence() {
  window.addEventListener("pagehide", saveUiState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveUiState();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.warn("Service worker registration failed.", error);
  });
}
