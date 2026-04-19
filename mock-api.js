(function () {
  const DB_KEY = "inventory_static_db_v1";
  const SESSION_KEY = "inventory_static_session_user_id";

  const ORDER_STATUSES = ["draft", "ordered", "received", "cancelled"];
  const ROLES = ["admin", "editor", "viewer"];
  const ITEM_FIELDS = [
    { key: "name", label: "물품명", type: "text", required: true, placeholder: "예: 치아바타 포장봉투" },
    { key: "preferred_vendor_id", label: "기본 거래처", type: "select", required: false, default: "" },
    { key: "package_unit", label: "포장단위", type: "text", placeholder: "예: 1박스 / 100매" },
    { key: "safety_stock", label: "유지재고 기준수량", type: "number", required: true, default: 0, min: 0, step: 1 },
    { key: "current_stock", label: "현재 재고 수량", type: "number", required: true, default: 0, step: 1 },
    { key: "order_unit", label: "주문 단위", type: "text", placeholder: "예: 1박스" },
    { key: "location", label: "물품 위치", type: "text", placeholder: "예: 창고 A-3" },
    { key: "lead_time_days", label: "배송기간", type: "number", required: true, default: 0, min: 0, step: 1, suffix: "일" },
  ];

  function nowIso() {
    return new Date().toISOString().slice(0, 19);
  }

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      const db = JSON.parse(raw);

      if (Array.isArray(db.users)) {
        db.users = db.users.map((user) => ({
          ...user,
          display_name:
            user.display_name === "愿由ъ" || user.display_name === "ê´ë¦¬ì"
              ? "관리자"
              : user.display_name,
        }));
      }

      saveDB(db);
      return db;
    } catch {
      localStorage.removeItem(DB_KEY);
    }
  }

  const ts = nowIso();
  const db = {
    users: [
      {
        id: 1,
        username: "admin",
        display_name: "관리자",
        password: "admin1234",
        role: "admin",
        is_active: true,
        created_at: ts,
        updated_at: ts,
      },
    ],
    vendors: [],
    items: [],
    activities: [],
    purchase_orders: [],
    counters: { users: 1, vendors: 0, items: 0, activities: 0, purchase_orders: 0 },
  };
  saveDB(db);
  return db;
}

  function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function nextId(db, table) {
    db.counters[table] = (db.counters[table] || 0) + 1;
    return db.counters[table];
  }

  function getSessionUser(db) {
    const userId = Number(localStorage.getItem(SESSION_KEY));
    if (!userId) return null;
    const user = db.users.find((u) => u.id === userId && u.is_active);
    return user || null;
  }

  function sanitizeUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      is_active: Boolean(user.is_active),
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  function requireUser(db) {
    const user = getSessionUser(db);
    if (!user) throw { status: 401, error: "로그인이 필요합니다." };
    return user;
  }

  function requireRole(db, roles) {
    const user = requireUser(db);
    if (!roles.includes(user.role)) throw { status: 403, error: "이 작업을 수행할 권한이 없습니다." };
    return user;
  }

  function vendorName(db, vendorId) {
    if (!vendorId) return "-";
    return db.vendors.find((v) => v.id === Number(vendorId))?.name || "-";
  }

  function displayName(db, userId) {
    return db.users.find((u) => u.id === Number(userId))?.display_name || "-";
  }

function enrichItems(db) {
  return db.items
    .map((item) => {
      const safety = Number(item.safety_stock || 0);
      const current = Number(item.current_stock || 0);
      return {
        ...item,
        preferred_vendor_name: vendorName(db, item.preferred_vendor_id),
        stock_gap: current - safety,
        is_low_stock: current < safety,
        updated_by_name: displayName(db, item.updated_by),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

  function addActivity(db, user, type, message, itemId = null, delta = 0) {
    const ts = nowIso();
    db.activities.unshift({
      id: nextId(db, "activities"),
      item_id: itemId,
      type,
      message,
      delta,
      actor_id: user.id,
      actor_name: user.display_name,
      created_at: ts,
    });
    db.activities = db.activities.slice(0, 120);
  }

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

  function parseBody(init) {
    const body = init?.body;
    if (!body) return {};
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch { return {}; }
    }
    return {};
  }

function csvExport(db) {
  const rows = [["ID", "물품명", "기본 거래처", "포장단위", "유지재고 기준수량", "현재 재고 수량", "주문 단위", "물품 위치", "배송기간"]];

  enrichItems(db).forEach((item) => {
    rows.push([
      item.id,
      item.name || "",
      item.preferred_vendor_name === "-" ? "" : item.preferred_vendor_name,
      item.package_unit || "",
      item.safety_stock || 0,
      item.current_stock || 0,
      item.order_unit || "",
      item.location || "",
      item.lead_time_days || 0,
    ]);
  });

  const bom = "\uFEFF";
  const content =
    bom +
    rows
      .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");

  return new Response(new Blob([content], { type: "text/csv;charset=utf-8" }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename*=UTF-8''inventory-static.csv",
    },
  });
}

  async function handleApi(url, init = {}) {
    const db = loadDB();
    const u = new URL(url, window.location.origin);
    const path = u.pathname;
    const method = (init.method || "GET").toUpperCase();

    try {
      if (path === "/api/config" && method === "GET") {
        return json({ fields: ITEM_FIELDS, roles: ROLES, order_statuses: ORDER_STATUSES, default_admin_username: "admin" });
      }

      if (path === "/api/auth/me" && method === "GET") {
        const user = sanitizeUser(getSessionUser(db));
        return json({ authenticated: Boolean(user), user });
      }

      if (path === "/api/auth/login" && method === "POST") {
        const payload = parseBody(init);
        const user = db.users.find((it) => it.username === String(payload.username || "") && it.password === String(payload.password || "") && it.is_active);
        if (!user) return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
        localStorage.setItem(SESSION_KEY, String(user.id));
        return json({ user: sanitizeUser(user) });
      }

      if (path === "/api/auth/logout" && method === "POST") {
        localStorage.removeItem(SESSION_KEY);
        return json({ ok: true });
      }

      if (path === "/api/auth/change-password" && method === "POST") {
        const user = requireUser(db);
        const payload = parseBody(init);
        if (String(payload.current_password || "") !== user.password) return json({ error: "현재 비밀번호가 올바르지 않습니다." }, 400);
        user.password = String(payload.new_password || "").trim();
        user.updated_at = nowIso();
        saveDB(db);
        return json({ ok: true });
      }

      if (path === "/api/items" && method === "GET") {
        requireUser(db);
        return json({ items: enrichItems(db), summary: {} });
      }
      if (path === "/api/items" && method === "POST") {
        const user = requireRole(db, ["admin", "editor"]);
        const payload = parseBody(init);
        const ts = nowIso();
        const item = {
          id: nextId(db, "items"),
          name: String(payload.name || "").trim(),
          preferred_vendor_id: payload.preferred_vendor_id ? Number(payload.preferred_vendor_id) : null,
          package_unit: String(payload.package_unit || "").trim(),
          safety_stock: Number(payload.safety_stock || 0),
          current_stock: Number(payload.current_stock || 0),
          order_unit: String(payload.order_unit || "").trim(),
          location: String(payload.location || "").trim(),
          lead_time_days: Number(payload.lead_time_days || 0),
          updated_by: user.id,
          created_at: ts,
          updated_at: ts,
        };
        db.items.push(item);
        addActivity(db, user, "item_created", `${item.name} 품목을 등록했습니다.`, item.id, 0);
        saveDB(db);
        return json({ item: enrichItems(db).find((it) => it.id === item.id) });
      }

      if (path.startsWith("/api/items/") && path.endsWith("/adjust") && method === "POST") {
        const user = requireRole(db, ["admin", "editor"]);
        const itemId = Number(path.split("/")[3]);
        const item = db.items.find((it) => it.id === itemId);
        if (!item) return json({ error: "품목을 찾지 못했습니다." }, 404);
        const payload = parseBody(init);
        const amount = Number(payload.amount || 0);
        item.current_stock += amount;
        item.updated_by = user.id;
        item.updated_at = nowIso();
        addActivity(db, user, "stock_adjusted", `${item.name} 재고를 ${amount > 0 ? "증가" : "감소"} 조정했습니다.`, item.id, amount);
        saveDB(db);
        return json({ item: enrichItems(db).find((it) => it.id === item.id) });
      }

      if (/^\/api\/items\/\d+$/.test(path) && method === "PUT") {
        const user = requireRole(db, ["admin", "editor"]);
        const itemId = Number(path.split("/")[3]);
        const item = db.items.find((it) => it.id === itemId);
        if (!item) return json({ error: "품목을 찾지 못했습니다." }, 404);
        const payload = parseBody(init);
        Object.assign(item, {
          name: String(payload.name || item.name).trim(),
          preferred_vendor_id: payload.preferred_vendor_id ? Number(payload.preferred_vendor_id) : null,
          package_unit: String(payload.package_unit || "").trim(),
          safety_stock: Number(payload.safety_stock || 0),
          current_stock: Number(payload.current_stock || 0),
          order_unit: String(payload.order_unit || "").trim(),
          location: String(payload.location || "").trim(),
          lead_time_days: Number(payload.lead_time_days || 0),
          updated_by: user.id,
          updated_at: nowIso(),
        });
        addActivity(db, user, "item_updated", `${item.name} 품목 정보를 수정했습니다.`, item.id, 0);
        saveDB(db);
        return json({ item: enrichItems(db).find((it) => it.id === item.id) });
      }

      if (/^\/api\/items\/\d+$/.test(path) && method === "DELETE") {
        const user = requireRole(db, ["admin", "editor"]);
        const itemId = Number(path.split("/")[3]);
        const idx = db.items.findIndex((it) => it.id === itemId);
        if (idx < 0) return json({ error: "품목을 찾지 못했습니다." }, 404);
        const [removed] = db.items.splice(idx, 1);
        addActivity(db, user, "item_deleted", `${removed.name} 품목을 삭제했습니다.`, removed.id, 0);
        saveDB(db);
        return json({ ok: true });
      }

      if (path === "/api/activities" && method === "GET") {
        requireUser(db);
        return json({ activities: db.activities });
      }

      if (path === "/api/vendors" && method === "GET") {
        requireUser(db);
        return json({ vendors: [...db.vendors].sort((a, b) => a.name.localeCompare(b.name, "ko")) });
      }
      if (path === "/api/vendors" && method === "POST") {
        const user = requireRole(db, ["admin", "editor"]);
        const payload = parseBody(init);
        const ts = nowIso();
        const vendor = {
          id: nextId(db, "vendors"),
          name: String(payload.name || "").trim(),
          contact_name: String(payload.contact_name || "").trim(),
          phone: String(payload.phone || "").trim(),
          email: String(payload.email || "").trim(),
          memo: String(payload.memo || "").trim(),
          is_active: payload.is_active !== false,
          created_at: ts,
          updated_at: ts,
        };
        db.vendors.push(vendor);
        addActivity(db, user, "vendor_created", `${vendor.name} 거래처를 등록했습니다.`);
        saveDB(db);
        return json({ vendor });
      }

      if (/^\/api\/vendors\/\d+$/.test(path) && method === "PUT") {
        const user = requireRole(db, ["admin", "editor"]);
        const vendorId = Number(path.split("/")[3]);
        const vendor = db.vendors.find((it) => it.id === vendorId);
        if (!vendor) return json({ error: "거래처를 찾지 못했습니다." }, 404);
        Object.assign(vendor, parseBody(init), { id: vendor.id, updated_at: nowIso() });
        addActivity(db, user, "vendor_updated", `${vendor.name} 거래처 정보를 수정했습니다.`);
        saveDB(db);
        return json({ vendor });
      }

      if (path === "/api/users" && method === "GET") {
        requireRole(db, ["admin"]);
        return json({ users: db.users.map(sanitizeUser) });
      }
      if (path === "/api/users" && method === "POST") {
        requireRole(db, ["admin"]);
        const payload = parseBody(init);
        const ts = nowIso();
        const user = {
          id: nextId(db, "users"),
          username: String(payload.username || "").trim(),
          display_name: String(payload.display_name || "").trim(),
          password: String(payload.password || "123456"),
          role: payload.role || "viewer",
          is_active: true,
          created_at: ts,
          updated_at: ts,
        };
        db.users.push(user);
        saveDB(db);
        return json({ user: sanitizeUser(user) });
      }

      if (/^\/api\/users\/\d+$/.test(path) && method === "PUT") {
        requireRole(db, ["admin"]);
        const userId = Number(path.split("/")[3]);
        const user = db.users.find((it) => it.id === userId);
        if (!user) return json({ error: "사용자를 찾지 못했습니다." }, 404);
        const payload = parseBody(init);
        user.display_name = String(payload.display_name ?? user.display_name);
        user.role = payload.role || user.role;
        if (typeof payload.is_active === "boolean") user.is_active = payload.is_active;
        user.updated_at = nowIso();
        saveDB(db);
        return json({ user: sanitizeUser(user) });
      }

      if (path === "/api/purchase-orders" && method === "GET") {
        requireUser(db);
        return json({ purchase_orders: db.purchase_orders });
      }
      if (path === "/api/purchase-orders" && method === "POST") {
        const user = requireRole(db, ["admin", "editor"]);
        const payload = parseBody(init);
        const ts = nowIso();
        const po = {
          id: nextId(db, "purchase_orders"),
          vendor_id: Number(payload.vendor_id),
          vendor_name: vendorName(db, payload.vendor_id),
          status: payload.status || "draft",
          note: String(payload.note || ""),
          is_received_applied: false,
          created_by: user.id,
          created_by_name: user.display_name,
          created_at: ts,
          updated_at: ts,
          lines: (payload.lines || []).map((line, idx) => ({ id: idx + 1, item_id: Number(line.item_id), item_name: db.items.find((i) => i.id === Number(line.item_id))?.name || "-", quantity: Number(line.quantity || 0) })),
        };
        db.purchase_orders.unshift(po);
        addActivity(db, user, "purchase_order_created", `${po.vendor_name} 발주서를 생성했습니다.`);
        saveDB(db);
        return json({ purchase_order: po });
      }

      if (/^\/api\/purchase-orders\/\d+$/.test(path) && method === "PUT") {
        const user = requireRole(db, ["admin", "editor"]);
        const orderId = Number(path.split("/")[3]);
        const po = db.purchase_orders.find((it) => it.id === orderId);
        if (!po) return json({ error: "발주서를 찾지 못했습니다." }, 404);
        const payload = parseBody(init);
        const prevStatus = po.status;
        po.status = payload.status || po.status;
        po.note = String(payload.note ?? po.note);
        po.updated_at = nowIso();
        if (prevStatus !== "received" && po.status === "received" && !po.is_received_applied) {
          po.is_received_applied = true;
          po.lines.forEach((line) => {
            const item = db.items.find((it) => it.id === line.item_id);
            if (item) {
              item.current_stock += Number(line.quantity || 0);
              item.updated_by = user.id;
              item.updated_at = nowIso();
            }
          });
        }
        addActivity(db, user, "purchase_order_updated", `${po.vendor_name} 발주서 상태를 ${po.status}로 변경했습니다.`);
        saveDB(db);
        return json({ purchase_order: po });
      }

      if (path === "/api/import" && method === "POST") {
        requireRole(db, ["admin", "editor"]);
        return json({ result: { inserted: 0, updated: 0, skipped: 0, message: "정적 모드에서는 업로드를 지원하지 않습니다." } });
      }

	if (path === "/api/export.csv" && method === "GET") {
	  requireUser(db);
	  return csvExport(db);
	}

      return json({ error: "요청하신 경로를 찾지 못했습니다." }, 404);
    } catch (err) {
      if (err && typeof err.status === "number") {
        return json({ error: err.error || "요청 처리 중 문제가 발생했습니다." }, err.status);
      }
      return json({ error: "요청 처리 중 문제가 발생했습니다." }, 500);
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/api/")) {
      return handleApi(parsed.toString(), init);
    }
    return nativeFetch(input, init);
  };

  const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const target = new URL(url, window.location.origin);

  if (target.pathname.startsWith("/api/")) {
    return handleApi(target.toString(), init);
  }

  return originalFetch(input, init);
};
})();
