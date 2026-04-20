(function () {
  const SESSION_KEY = "inventory_supabase_session_token";
  const ORDER_STATUSES = ["draft", "ordered", "received", "cancelled"];
  const ROLES = ["admin", "editor", "viewer"];
  const ITEM_FIELDS = [
    { key: "name", label: "품목명", type: "text", required: true, placeholder: "예: 치아바타 포장 봉투" },
    { key: "preferred_vendor_id", label: "기본 거래처", type: "select", required: false, default: "" },
    { key: "package_unit", label: "포장단위", type: "text", placeholder: "예: 1박스 / 100매" },
    { key: "safety_stock", label: "유지재고 기준수량", type: "number", required: true, default: 0, min: 0, step: 1 },
    { key: "current_stock", label: "현재 재고 수량", type: "number", required: true, default: 0, step: 1 },
    { key: "order_unit", label: "주문 단위", type: "text", placeholder: "예: 1박스" },
    { key: "location", label: "품목 위치", type: "text", placeholder: "예: 창고 A-3" },
    { key: "lead_time_days", label: "납기일(일)", type: "number", required: true, default: 0, min: 0, step: 1, suffix: "일" },
  ];

  const nativeFetch = window.fetch.bind(window);

  function getSupabaseUrl() {
    return (
      window.__SUPABASE_URL__ ||
      window.__INVENTORY_API_BASE__ ||
      document.querySelector('meta[name="inventory-api-base"]')?.content ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");
  }

  function getSupabaseKey() {
    return (
      window.__SUPABASE_PUBLIC_KEY__ ||
      window.__SUPABASE_ANON_KEY__ ||
      ""
    ).trim();
  }

  function ensureSupabaseConfig() {
    if (!getSupabaseUrl() || !getSupabaseKey()) {
      throw {
        status: 500,
        error: "docs/config.js에 Supabase URL과 anon key를 입력해 주세요.",
      };
    }
  }

  function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    });
  }

  function csv(content, filename) {
    return new Response(new Blob([content], { type: "text/csv;charset=utf-8" }), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  }

  function parseBody(init) {
    const body = init?.body;
    if (!body) {
      return {};
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }
    return body;
  }


function getSessionToken() {
  // 소문자 키로 먼저 찾고, 없으면 대문자 키로도 찾아봅니다.
  return localStorage.getItem(SESSION_KEY) || localStorage.getItem("Inventory_supabase_session_token");
}

  function setSessionToken(token) {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
      return;
    }
    localStorage.removeItem(SESSION_KEY);
  }

  function requireSessionToken() {
    const token = getSessionToken();
    if (!token) {
      throw { status: 401, error: "로그인이 필요합니다." };
    }
    return token;
  }

  function buildSupabaseHeaders(extraHeaders = {}) {
    const supabaseKey = getSupabaseKey();
    return {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    };
  }

  function extractSupabaseError(response, payload) {
    const message =
      payload?.message ||
      payload?.error_description ||
      payload?.details ||
      payload?.hint ||
      `Supabase 요청에 실패했습니다. (${response.status})`;

    if (/로그인이 필요합니다/.test(message)) {
      return { status: 401, error: message };
    }
    if (/권한/.test(message)) {
      return { status: 403, error: message };
    }
    return { status: response.status || 400, error: message };
  }

  async function supabaseRpc(functionName, payload = {}) {
    ensureSupabaseConfig();

    const response = await nativeFetch(`${getSupabaseUrl()}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: buildSupabaseHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw extractSupabaseError(response, data);
    }
    if (Array.isArray(data) && data.length === 1) {
      return data[0];
    }
    if (data && typeof data === "object" && Object.keys(data).length === 1 && functionName in data) {
      return data[functionName];
    }
    return data;
  }

  function escapeCsvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  async function buildInventoryCsvResponse() {
    const sessionToken = requireSessionToken();
    const payload = await supabaseRpc("inventory_list_items", { p_session_token: sessionToken });
    const items = payload?.items || [];
    const rows = [
      ["ID", "품목명", "기본 거래처", "포장단위", "유지재고 기준수량", "현재 재고 수량", "주문 단위", "품목 위치", "납기일(일)"],
    ];

    items.forEach((item) => {
      rows.push([
        item.id,
        item.name,
        item.preferred_vendor_name && item.preferred_vendor_name !== "-" ? item.preferred_vendor_name : "",
        item.package_unit,
        item.safety_stock,
        item.current_stock,
        item.order_unit,
        item.location,
        item.lead_time_days,
      ]);
    });

    const content = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
    return csv(content, "inventory-supabase.csv");
  }

  async function handleApi(url, init = {}) {
    const target = new URL(url, window.location.origin);
    const path = target.pathname;
    const method = (init.method || "GET").toUpperCase();

    try {
      if (path === "/api/config" && method === "GET") {
        return json({
          fields: ITEM_FIELDS,
          roles: ROLES,
          order_statuses: ORDER_STATUSES,
          default_admin_username: "admin",
        });
      }

if (path === "/api/auth/me" && method === "GET") {
  const sessionToken = getSessionToken();
  if (!sessionToken) {
    return json({ authenticated: false, user: null });
  }

  try {
    const payload = await supabaseRpc("inventory_auth_me", {
      p_session_token: sessionToken,
    });

    return json({
      authenticated: Boolean(payload?.user),
      user: payload?.user || null,
    });
  } catch (error) {
    if (Number(error?.status) === 401) {
      setSessionToken("");
      return json({ authenticated: false, user: null });
    }
    throw error;
  }
}



      if (path === "/api/auth/login" && method === "POST") {
        const payload = parseBody(init);
        const response = await supabaseRpc("inventory_auth_login", {
          p_username: payload.username || "",
          p_password: payload.password || "",
        });
        setSessionToken(response?.session_token || "");
        return json({ user: response?.user || null });
      }

      if (path === "/api/auth/logout" && method === "POST") {
        const sessionToken = getSessionToken();
        try {
          if (sessionToken) {
            await supabaseRpc("inventory_auth_logout", { p_session_token: sessionToken });
          }
        } finally {
          setSessionToken("");
        }
        return json({ ok: true });
      }

      if (path === "/api/auth/change-password" && method === "POST") {
        const sessionToken = requireSessionToken();
        const payload = parseBody(init);
        const response = await supabaseRpc("inventory_change_password", {
          p_session_token: sessionToken,
          p_current_password: payload.current_password || "",
          p_new_password: payload.new_password || "",
        });
        return json(response || { ok: true });
      }

      if (path === "/api/items" && method === "GET") {
        const response = await supabaseRpc("inventory_list_items", {
          p_session_token: requireSessionToken(),
        });
        return json(response || { items: [], summary: {} });
      }

      if (path === "/api/items" && method === "POST") {
        const response = await supabaseRpc("inventory_create_item", {
          p_session_token: requireSessionToken(),
          p_payload: parseBody(init),
        });
        return json(response);
      }

// 1. 재고 조정
      if (/^\/api\/items\/\d+\/adjust$/.test(path) && method === "POST") {
        try {
          const itemId = path.split("/")[3];
          const body = parseBody(init);
          
          const response = await supabaseRpc("inventory_adjust_item_stock", {
            p_session_token: requireSessionToken(),
            p_item_id: String(itemId),
            p_adjustment: Number(body.adjustment)
          });
          
          return json(response);
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }

      // 2. 품목 수정
      if (/^\/api\/items\/\d+$/.test(path) && method === "PUT") {
        try {
          const itemId = Number(path.split("/")[3]);
          const response = await supabaseRpc("inventory_update_item", {
            p_session_token: requireSessionToken(),
            p_item_id: itemId,
            p_payload: parseBody(init),
          });
          return json(response);
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }

      if (/^\/api\/items\/\d+$/.test(path) && method === "DELETE") {
        const itemId = Number(path.split("/")[3]);
        const response = await supabaseRpc("inventory_delete_item", {
          p_session_token: requireSessionToken(),
          p_item_id: itemId,
        });
        return json(response || { ok: true });
      }

      if (path === "/api/activities" && method === "GET") {
        const response = await supabaseRpc("inventory_list_activities", {
          p_session_token: requireSessionToken(),
        });
        return json(response || { activities: [] });
      }

      if (path === "/api/vendors" && method === "GET") {
        const response = await supabaseRpc("inventory_list_vendors", {
          p_session_token: requireSessionToken(),
        });
        return json(response || { vendors: [] });
      }

      if (path === "/api/vendors" && method === "POST") {
        const response = await supabaseRpc("inventory_create_vendor", {
          p_session_token: requireSessionToken(),
          p_payload: parseBody(init),
        });
        return json(response);
      }
	  if (/^\/api\/vendors\/\d+$/.test(path) && method === "DELETE") {
		  const vendorId = Number(path.split("/")[3]);
		  const response = await supabaseRpc("inventory_delete_vendor", {
			p_session_token: requireSessionToken(),
			p_vendor_id: vendorId,
		  });
		  return json(response || { ok: true });
		}

      if (/^\/api\/vendors\/\d+$/.test(path) && method === "PUT") {
        const vendorId = Number(path.split("/")[3]);
        const response = await supabaseRpc("inventory_update_vendor", {
          p_session_token: requireSessionToken(),
          p_vendor_id: vendorId,
          p_payload: parseBody(init),
        });
        return json(response);
      }

      if (path === "/api/users" && method === "GET") {
        const response = await supabaseRpc("inventory_list_users", {
          p_session_token: requireSessionToken(),
        });
        return json(response || { users: [] });
      }

      if (path === "/api/users" && method === "POST") {
        const response = await supabaseRpc("inventory_create_user", {
          p_session_token: requireSessionToken(),
          p_payload: parseBody(init),
        });
        return json(response);
      }

      if (/^\/api\/users\/\d+$/.test(path) && method === "PUT") {
        const userId = Number(path.split("/")[3]);
        const response = await supabaseRpc("inventory_update_user", {
          p_session_token: requireSessionToken(),
          p_user_id: userId,
          p_payload: parseBody(init),
        });
        return json(response);
      }

      if (path === "/api/purchase-orders" && method === "GET") {
        const response = await supabaseRpc("inventory_list_purchase_orders", {
          p_session_token: requireSessionToken(),
        });
        return json(response || { purchase_orders: [] });
      }

      if (path === "/api/purchase-orders" && method === "POST") {
        const response = await supabaseRpc("inventory_create_purchase_order", {
          p_session_token: requireSessionToken(),
          p_payload: parseBody(init),
        });
        return json(response);
      }

      if (/^\/api\/purchase-orders\/\d+$/.test(path) && method === "PUT") {
        const orderId = Number(path.split("/")[3]);
        const response = await supabaseRpc("inventory_update_purchase_order", {
          p_session_token: requireSessionToken(),
          p_order_id: orderId,
          p_payload: parseBody(init),
        });
        return json(response);
      }

      if (path === "/api/import" && method === "POST") {
        return json({
          result: {
            inserted: 0,
            updated: 0,
            skipped: 0,
            message: "Supabase 연동 버전에서는 아직 엑셀 일괄 업로드를 지원하지 않습니다.",
          },
        });
      }

      if (path === "/api/export.csv" && method === "GET") {
        return await buildInventoryCsvResponse();
      }

      return json({ error: "요청하신 경로를 찾지 못했습니다." }, 404);
    } catch (error) {
      return json(
        { error: error?.error || error?.message || "요청 처리 중 문제가 발생했습니다." },
        Number(error?.status || 500)
      );
    }
  }

  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const target = new URL(url, window.location.origin);

    if (target.pathname.startsWith("/api/")) {
      return handleApi(target.toString(), init);
    }

    return nativeFetch(input, init);
  };
})();
