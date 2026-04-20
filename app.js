const state = {
  fields: [],
  roles: [],
  orderStatuses: [],
  items: [],
  activities: [],
  users: [],
  vendors: [],
  purchaseOrders: [],
  currentUser: null,
  search: "",
  lowStockOnly: false,
  editingItem: null,
  adjustingItem: null,
};

const apiBase =
  (
    window.__INVENTORY_API_BASE__ ||
    window.INVENTORY_API_BASE ||
    document.querySelector('meta[name="inventory-api-base"]')?.content ||
    ""
  ).trim().replace(/\/+$/, "");

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalizedPath}`;
}

function fetchOptions(options = {}) {
  const targetCredentials = apiBase ? "include" : "same-origin";
  return { credentials: targetCredentials, ...options };
}

const elements = {
  authGate: document.getElementById("auth-gate"),
  loginForm: document.getElementById("login-form"),
  sessionPanel: document.getElementById("session-panel"),
  currentUserName: document.getElementById("current-user-name"),
  currentUserRole: document.getElementById("current-user-role"),
  manageUsersButton: document.getElementById("manage-users-button"),
  changePasswordButton: document.getElementById("change-password-button"),
  logoutButton: document.getElementById("logout-button"),
  addItemButton: document.getElementById("add-item-button"),
  manageOrdersButton: document.getElementById("manage-orders-button"),
  manageVendorsButton: document.getElementById("manage-vendors-button"),
  importFileInput: document.getElementById("import-file-input"),
  exportButton: document.getElementById("export-button"),
  printButton: document.getElementById("print-button"),
  reloadButton: document.getElementById("reload-button"),
  searchInput: document.getElementById("search-input"),
  lowStockOnly: document.getElementById("low-stock-only"),
  inventoryHeadRow: document.getElementById("inventory-head-row"),
  inventoryBody: document.getElementById("inventory-body"),
  itemCountBadge: document.getElementById("item-count-badge"),
  emptyState: document.getElementById("empty-state"),
  summaryTotalItems: document.getElementById("summary-total-items"),
  summaryLowStock: document.getElementById("summary-low-stock"),
  summaryTotalStock: document.getElementById("summary-total-stock"),
  summaryTotalVendors: document.getElementById("summary-total-vendors"),
  summaryDraftOrders: document.getElementById("summary-draft-orders"),
  summaryUpdatedAt: document.getElementById("summary-updated-at"),
  activityList: document.getElementById("activity-list"),
  itemModal: document.getElementById("item-modal"),
  itemModalTitle: document.getElementById("item-modal-title"),
  itemForm: document.getElementById("item-form"),
  adjustModal: document.getElementById("adjust-modal"),
  adjustModalTitle: document.getElementById("adjust-modal-title"),
  adjustForm: document.getElementById("adjust-form"),
  passwordModal: document.getElementById("password-modal"),
  passwordForm: document.getElementById("password-form"),
  usersModal: document.getElementById("users-modal"),
  userCreateForm: document.getElementById("user-create-form"),
  userList: document.getElementById("user-list"),
  vendorsModal: document.getElementById("vendors-modal"),
  vendorCreateForm: document.getElementById("vendor-create-form"),
  vendorList: document.getElementById("vendor-list"),
  ordersModal: document.getElementById("orders-modal"),
  orderCandidateGroups: document.getElementById("order-candidate-groups"),
  purchaseOrderList: document.getElementById("purchase-order-list"),
  toast: document.getElementById("toast"),
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  elements.exportButton.href = apiUrl("/api/export.csv");
  await loadConfig();
  await restoreSession();
});

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.changePasswordButton.addEventListener("click", () => openModal("password"));
  elements.manageUsersButton.addEventListener("click", async () => {
    if (!userIsAdmin()) {
      return;
    }
    await loadUsers();
    openModal("users");
  });
  elements.manageVendorsButton.addEventListener("click", async () => {
    if (!state.currentUser) {
      return;
    }
    await loadVendors();
    openModal("vendors");
  });
  elements.manageOrdersButton.addEventListener("click", async () => {
    if (!state.currentUser) {
      return;
    }
    await loadOrders();
    renderOrderCandidates();
    openModal("orders");
  });

  elements.addItemButton.addEventListener("click", () => openItemModal());
  elements.reloadButton.addEventListener("click", refreshData);
  elements.printButton.addEventListener("click", () => window.print());
  elements.exportButton.addEventListener("click", handleExportClick);
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderItems();
  });
  elements.lowStockOnly.addEventListener("change", (event) => {
    state.lowStockOnly = event.target.checked;
    renderItems();
  });

  elements.importFileInput.addEventListener("change", handleImport);
  elements.itemForm.addEventListener("submit", handleItemSubmit);
  elements.adjustForm.addEventListener("submit", handleAdjustSubmit);
  elements.passwordForm.addEventListener("submit", handlePasswordSubmit);
  elements.userCreateForm.addEventListener("submit", handleUserCreateSubmit);
  elements.vendorCreateForm.addEventListener("submit", handleVendorCreateSubmit);

  document.getElementById("adjust-mode").addEventListener("change", syncAdjustReason);

  document.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => closeModal(node.dataset.closeModal));
  });

  elements.inventoryBody.addEventListener("click", handleInventoryTableClick);
  elements.userList.addEventListener("click", handleUserListClick);
  elements.vendorList.addEventListener("click", handleVendorListClick);
  elements.orderCandidateGroups.addEventListener("click", handleOrderCandidateClick);
  elements.purchaseOrderList.addEventListener("click", handlePurchaseOrderListClick);
}

async function loadConfig() {
  const payload = await fetch(apiUrl("/api/config"), fetchOptions()).then((response) => response.json());
  state.fields = payload.fields || [];
  state.roles = payload.roles || [];
  state.orderStatuses = payload.order_statuses || [];
  renderTableHead();
  renderItemForm();
}

async function restoreSession() {
  const payload = await api("/api/auth/me", {}, { allowUnauthorized: true, suppressAuthToast: true });
  if (payload?.user) {
    setCurrentUser(payload.user);
    await afterLogin();
    return;
  }
  clearData();
  setCurrentUser(null);
  showAuthGate();
}

async function afterLogin() {
  hideAuthGate();
  await refreshData();
  if (userIsAdmin()) {
    await loadUsers();
  } else {
    state.users = [];
    renderUsers();
  }
}

function setCurrentUser(user) {
  state.currentUser = user || null;
  const hasUser = Boolean(state.currentUser);
  const canEdit = userCanEdit();

  elements.sessionPanel.classList.toggle("hidden", !hasUser);
  elements.currentUserName.textContent = hasUser ? state.currentUser.display_name : "-";
  elements.currentUserRole.textContent = hasUser ? roleLabel(state.currentUser.role) : "-";
  elements.currentUserRole.className = `user-role-badge role-${hasUser ? state.currentUser.role : "viewer"}`;

  elements.manageUsersButton.classList.toggle("hidden", !userIsAdmin());
  elements.addItemButton.classList.toggle("hidden", !canEdit);
  elements.manageOrdersButton.classList.toggle("hidden", !hasUser);
  elements.manageVendorsButton.classList.toggle("hidden", !canEdit);
  elements.importFileInput.disabled = !canEdit;
  document.querySelector("label[for='import-file-input']").classList.toggle("hidden", !canEdit);
  elements.exportButton.classList.toggle("hidden", !hasUser);
}

async function refreshData() {
  if (!state.currentUser) {
    return;
  }
  const [itemsPayload, activitiesPayload, vendorsPayload, ordersPayload] = await Promise.all([
    api("/api/items"),
    api("/api/activities"),
    api("/api/vendors"),
    api("/api/purchase-orders"),
  ]);
  state.items = itemsPayload.items || [];
  state.activities = activitiesPayload.activities || [];
  state.vendors = vendorsPayload.vendors || [];
  state.purchaseOrders = ordersPayload.purchase_orders || [];

  renderSummary();
  renderItems();
  renderActivities();
  renderItemForm(state.editingItem);
  renderVendors();
  renderOrderCandidates();
  renderPurchaseOrders();
}

async function loadUsers() {
  if (!userIsAdmin()) {
    state.users = [];
    renderUsers();
    return;
  }
  const payload = await api("/api/users");
  state.users = payload.users || [];
  renderUsers();
}

async function loadVendors() {
  const payload = await api("/api/vendors");
  state.vendors = payload.vendors || [];
  renderVendors();
  renderItemForm(state.editingItem);
  renderSummary();
}

async function loadOrders() {
  const payload = await api("/api/purchase-orders");
  state.purchaseOrders = payload.purchase_orders || [];
  renderPurchaseOrders();
  renderSummary();
}

function renderSummary() {
  const lowStockItems = state.items.filter((item) => item.is_low_stock);
  const totalStock = state.items.reduce((sum, item) => sum + Number(item.current_stock || 0), 0);
  const latestUpdate = state.items
    .map((item) => item.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const draftOrderCount = state.purchaseOrders.filter((order) => order.status === "draft").length;

  elements.summaryTotalItems.textContent = formatNumber(state.items.length);
  elements.summaryLowStock.textContent = formatNumber(lowStockItems.length);
  elements.summaryTotalStock.textContent = formatNumber(totalStock);
  elements.summaryTotalVendors.textContent = formatNumber(state.vendors.filter((vendor) => vendor.is_active).length);
  elements.summaryDraftOrders.textContent = formatNumber(draftOrderCount);
  elements.summaryUpdatedAt.textContent = latestUpdate ? formatDateTime(latestUpdate) : "-";
}

function renderTableHead() {
  const headers = [
    "물품",
    "재고 상태",
    ...state.fields.filter((field) => field.key !== "name").map((field) => field.label),
    "작업",
  ];
  elements.inventoryHeadRow.innerHTML = headers.map((label) => `<th>${label}</th>`).join("");
}

function inventoryColumnLabel(fieldKey) {
  if (fieldKey === "name") {
    return "물품";
  }
  if (fieldKey === "stock_status") {
    return "재고 상태";
  }
  if (fieldKey === "actions") {
    return "작업";
  }
  return state.fields.find((field) => field.key === fieldKey)?.label || fieldKey || "-";
}

function filteredItems() {
  return state.items.filter((item) => {
    const matchesSearch =
      !state.search ||
      [
        item.name,
        item.preferred_vendor_name,
        item.location,
        item.order_unit,
        item.package_unit,
        item.updated_by_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(state.search));
    const matchesLowStock = !state.lowStockOnly || item.is_low_stock;
    return matchesSearch && matchesLowStock;
  });
}

function renderItems() {
  const items = filteredItems();
  const canEdit = userCanEdit();
  elements.itemCountBadge.textContent = `${items.length}개`;
  elements.emptyState.classList.toggle("hidden", items.length > 0);

  elements.inventoryBody.innerHTML = items
    .map((item) => {
      const statusClass = item.is_low_stock ? "status-low" : "status-normal";
      const statusText = item.is_low_stock ? `부족 ${Math.abs(item.stock_gap)}` : "정상";
      const cells = state.fields
        .filter((field) => field.key !== "name")
        .map((field) => `<td data-label="${escapeAttribute(inventoryColumnLabel(field.key))}">${renderFieldValue(item, field)}</td>`)
        .join("");
const actions = canEdit
  ? `
      <div class="actions-stack">
        <div class="quick-adjust">
          <button class="mini-button" data-action="quick-subtract" data-item-id="${item.id}">-차감</button>
          <button class="mini-button" data-action="quick-add" data-item-id="${item.id}">+추가</button>
          <input id="quick-${item.id}" type="number" min="1" step="1" value="1" aria-label="빠른 조정 수량">
        </div>
        <div class="inline-actions">
          <button class="mini-button" data-action="adjust" data-item-id="${item.id}">상세 조정</button>
          <button class="mini-button" data-action="edit" data-item-id="${item.id}">수정</button>
          <button class="mini-button mini-button-danger" data-action="delete" data-item-id="${item.id}">삭제</button>
        </div>
      </div>
    `
  : `<span class="item-sub">보기 전용 계정입니다.</span>`;

      return `
        <tr class="inventory-row ${item.is_low_stock ? "is-low-stock" : ""}">
          <td data-label="${escapeAttribute(inventoryColumnLabel("name"))}">
            <span class="item-name">${escapeHtml(item.name)}</span>
            <span class="item-sub">수정 ${formatDateTime(item.updated_at)} · ${escapeHtml(item.updated_by_name || "-")}</span>
          </td>
          <td data-label="${escapeAttribute(inventoryColumnLabel("stock_status"))}"><span class="status-pill ${statusClass}">${statusText}</span></td>
          ${cells}
          <td class="actions-cell" data-label="${escapeAttribute(inventoryColumnLabel("actions"))}">${actions}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFieldValue(item, field) {
  const value = item[field.key];
  if (field.key === "preferred_vendor_id") {
    return formatText(item.preferred_vendor_name && item.preferred_vendor_name !== "-" ? item.preferred_vendor_name : "미지정");
  }
  if (field.type === "number") {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return field.key === "lead_time_days" ? `${formatNumber(value)}일` : formatNumber(value);
  }
  return formatText(value);
}

function renderActivities() {
  if (!state.activities.length) {
    elements.activityList.innerHTML = `<li class="activity-item">최근 작업 기록이 아직 없습니다.</li>`;
    return;
  }

  elements.activityList.innerHTML = state.activities
    .map((activity) => {
      const title = activity.action || "작업";
      const actor = activity.user_name || "-";
      const itemLabel = activity.item_name || `ID ${activity.item_id ?? "-"}`;
      const details = activity.details || "-";

      return `
        <li class="activity-item">
          <div class="activity-title">
            <strong>${escapeHtml(title)}</strong>
          </div>
          <div class="activity-meta">
            품목: ${escapeHtml(itemLabel)}<br>
            상세: ${escapeHtml(details)}<br>
            처리자: ${escapeHtml(actor)}<br>
            ${formatDateTime(activity.created_at)}
          </div>
        </li>
      `;
    })
    .join("");
}

function renderItemForm(item = null) {
  elements.itemForm.innerHTML = state.fields
    .map((field) => {
      const value = item?.[field.key] ?? field.default ?? "";
      const required = field.required ? "required" : "";
      if (field.type === "select") {
        return `
          <label class="field">
            <span class="field-label">${field.label}</span>
            <select name="${field.key}" ${required}>
              <option value="">거래처 미지정</option>
              ${state.vendors
                .filter((vendor) => vendor.is_active || Number(vendor.id) === Number(value))
                .map((vendor) => `<option value="${vendor.id}" ${Number(value) === Number(vendor.id) ? "selected" : ""}>${escapeHtml(vendor.name)}</option>`)
                .join("")}
            </select>
          </label>
        `;
      }
      const min = field.min !== undefined ? `min="${field.min}"` : "";
      const step = field.step !== undefined ? `step="${field.step}"` : "";
      return `
        <label class="field">
          <span class="field-label">${field.label}</span>
          <input
            name="${field.key}"
            type="${field.type === "number" ? "number" : "text"}"
            value="${escapeAttribute(value)}"
            placeholder="${escapeAttribute(field.placeholder || "")}"
            ${required}
            ${min}
            ${step}
          >
        </label>
      `;
    })
    .join("");
}

function renderUsers() {
  if (!state.users.length) {
    elements.userList.innerHTML = `<div class="user-row empty-user-row">등록된 사용자가 없습니다.</div>`;
    return;
  }

  elements.userList.innerHTML = state.users
    .map((user) => {
      return `
        <div class="user-row" data-user-id="${user.id}">
          <div class="user-row-grid">
            <label class="field">
              <span class="field-label">아이디</span>
              <input data-field="username" type="text" value="${escapeAttribute(user.username)}">
            </label>
            <label class="field">
              <span class="field-label">이름</span>
              <input data-field="display_name" type="text" value="${escapeAttribute(user.display_name)}">
            </label>
            <label class="field">
              <span class="field-label">권한</span>
              <select data-field="role">
                ${state.roles.map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field-label">상태</span>
              <select data-field="is_active">
                <option value="true" ${user.is_active ? "selected" : ""}>사용중</option>
                <option value="false" ${!user.is_active ? "selected" : ""}>비활성</option>
              </select>
            </label>
            <label class="field field-full">
              <span class="field-label">비밀번호 재설정</span>
              <input data-field="password" type="text" placeholder="비워두면 유지">
            </label>
          </div>
          <div class="user-row-footer">
            <span class="item-sub">최근 로그인 ${user.last_login_at ? formatDateTime(user.last_login_at) : "기록 없음"}</span>
            <button class="button button-secondary small-button" data-action="save-user" data-user-id="${user.id}">저장</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderVendors() {
  if (!state.vendors.length) {
    elements.vendorList.innerHTML = `<div class="vendor-row empty-user-row">등록된 거래처가 없습니다.</div>`;
    return;
  }

  const canEdit = userCanEdit();
  elements.vendorList.innerHTML = state.vendors
    .map((vendor) => {
      const readonly = canEdit ? "" : "disabled";
		const actionButtons = canEdit
		  ? `
			  <div class="inline-actions">
				<button class="button button-secondary small-button" data-action="save-vendor" data-vendor-id="${vendor.id}">저장</button>
				<button class="button button-ghost small-button" data-action="delete-vendor" data-vendor-id="${vendor.id}">삭제</button>
			  </div>
			`
		  : "";
      return `
        <div class="vendor-row" data-vendor-id="${vendor.id}">
          <div class="vendor-row-grid">
            <label class="field">
              <span class="field-label">거래처명</span>
              <input data-field="name" type="text" value="${escapeAttribute(vendor.name)}" ${readonly}>
            </label>
            <label class="field">
              <span class="field-label">담당자명</span>
              <input data-field="contact_name" type="text" value="${escapeAttribute(vendor.contact_name || "")}" ${readonly}>
            </label>
            <label class="field">
              <span class="field-label">전화번호</span>
              <input data-field="phone" type="text" value="${escapeAttribute(vendor.phone || "")}" ${readonly}>
            </label>
            <label class="field">
              <span class="field-label">이메일</span>
              <input data-field="email" type="email" value="${escapeAttribute(vendor.email || "")}" ${readonly}>
            </label>
            <label class="field">
              <span class="field-label">상태</span>
              <select data-field="is_active" ${readonly}>
                <option value="true" ${vendor.is_active ? "selected" : ""}>사용중</option>
                <option value="false" ${!vendor.is_active ? "selected" : ""}>비활성</option>
              </select>
            </label>
            <label class="field field-full">
              <span class="field-label">메모</span>
              <textarea data-field="notes" rows="3" ${readonly}>${escapeHtml(vendor.notes || "")}</textarea>
            </label>
          </div>
			<div class="user-row-footer">
			  <span class="item-sub">최종 수정 ${formatDateTime(vendor.updated_at)}</span>
			  ${actionButtons}
			</div>
        </div>
      `;
    })
    .join("");
}

function getOrderCandidateGroups() {
  const groups = new Map();
  state.items
    .filter((item) => item.is_low_stock)
    .forEach((item) => {
      const vendorId = item.preferred_vendor_id || "";
      const key = vendorId ? String(vendorId) : "unassigned";
      if (!groups.has(key)) {
        const vendor = state.vendors.find((entry) => Number(entry.id) === Number(vendorId));
        groups.set(key, {
          vendorId: vendorId || null,
          vendorName: vendor?.name || "거래처 미지정",
          vendorContact: vendor?.contact_name || "",
          vendorPhone: vendor?.phone || "",
          items: [],
        });
      }
      groups.get(key).items.push({
        ...item,
        recommendedQuantity: Math.max(Math.abs(Number(item.stock_gap || 0)), 1),
      });
    });
  return [...groups.values()].sort((a, b) => {
    if (!a.vendorId) return 1;
    if (!b.vendorId) return -1;
    return a.vendorName.localeCompare(b.vendorName, "ko");
  });
}

function renderOrderCandidates() {
  const groups = getOrderCandidateGroups();
  if (!groups.length) {
    elements.orderCandidateGroups.innerHTML = `<div class="empty-user-row">현재 부족 재고가 없어 발주 후보가 없습니다.</div>`;
    return;
  }

  const canEdit = userCanEdit();
  elements.orderCandidateGroups.innerHTML = groups
    .map((group, index) => {
      const statusOptions = state.orderStatuses
        .map((status) => `<option value="${status}" ${status === "draft" ? "selected" : ""}>${orderStatusLabel(status)}</option>`)
        .join("");
      const createButton = canEdit && group.vendorId
        ? `<button class="button button-primary small-button" data-action="create-order" data-group-index="${index}">발주서 생성</button>`
        : "";
      const helperText = !group.vendorId
        ? `<p class="group-helper warning-text">품목에 기본 거래처를 지정해야 발주서를 만들 수 있습니다.</p>`
        : canEdit
          ? `<p class="group-helper">체크된 품목만 선택한 거래처의 발주서로 생성됩니다.</p>`
          : `<p class="group-helper">보기 전용 계정은 발주서를 생성할 수 없습니다.</p>`;

      return `
        <section class="candidate-group" data-group-index="${index}">
          <div class="candidate-group-head">
            <div>
              <h4>${escapeHtml(group.vendorName)}</h4>
              <p class="item-sub">
                ${escapeHtml(group.vendorContact || "담당자 미입력")}
                ${group.vendorPhone ? ` · ${escapeHtml(group.vendorPhone)}` : ""}
              </p>
            </div>
            <span class="user-role-badge role-editor">${group.items.length}개 품목</span>
          </div>

          <div class="candidate-lines">
            ${group.items
              .map((item) => {
                return `
                  <label class="candidate-line">
                    <input type="checkbox" class="candidate-line-check" ${group.vendorId ? "checked" : "disabled"}>
                    <div class="candidate-line-main">
                      <strong>${escapeHtml(item.name)}</strong>
                      <span class="item-sub">현재 ${formatNumber(item.current_stock)} / 기준 ${formatNumber(item.safety_stock)} / 주문단위 ${escapeHtml(item.order_unit || "-")}</span>
                    </div>
                    <input type="number" class="candidate-line-qty" min="1" step="1" value="${item.recommendedQuantity}" ${group.vendorId && canEdit ? "" : "disabled"}>
                    <input type="hidden" class="candidate-line-item-id" value="${item.id}">
                  </label>
                `;
              })
              .join("")}
          </div>

          <div class="candidate-group-actions">
            <label class="field">
              <span class="field-label">발주 상태</span>
              <select class="order-create-status" ${group.vendorId && canEdit ? "" : "disabled"}>
                ${statusOptions}
              </select>
            </label>
            <label class="field field-flex">
              <span class="field-label">메모</span>
              <input type="text" class="order-create-note" placeholder="예: 이번 주 금요일 오전 납품 요청" ${group.vendorId && canEdit ? "" : "disabled"}>
            </label>
            ${createButton}
          </div>
          ${helperText}
        </section>
      `;
    })
    .join("");
}

function renderPurchaseOrders() {
  if (!state.purchaseOrders.length) {
    elements.purchaseOrderList.innerHTML = `<div class="empty-user-row">등록된 발주서가 없습니다.</div>`;
    return;
  }

  const canEdit = userCanEdit();
  elements.purchaseOrderList.innerHTML = state.purchaseOrders
    .map((order) => {
      const statusControl = canEdit
        ? `
            <select class="purchase-order-status" data-order-id="${order.id}">
              ${state.orderStatuses
                .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${orderStatusLabel(status)}</option>`)
                .join("")}
            </select>
          `
        : `<span class="user-role-badge role-${order.status === "cancelled" ? "viewer" : "editor"}">${orderStatusLabel(order.status)}</span>`;
      const saveButton = canEdit
        ? `<button class="button button-secondary small-button" data-action="save-order" data-order-id="${order.id}">상태 저장</button>`
        : "";

      return `
        <section class="purchase-order-card" data-order-id="${order.id}">
          <div class="purchase-order-head">
            <div>
              <h4>발주서 #${order.id} · ${escapeHtml(order.vendor_name)}</h4>
              <p class="item-sub">작성 ${formatDateTime(order.created_at)} · ${escapeHtml(order.created_by_name || "-")}</p>
            </div>
            ${statusControl}
          </div>

          <div class="purchase-order-lines">
            ${order.lines
              .map((line) => {
                return `
                  <div class="purchase-order-line">
                    <strong>${escapeHtml(line.item_name_snapshot)}</strong>
                    <span class="item-sub">
                      발주수량 ${formatNumber(line.requested_quantity)}
                      · 주문단위 ${escapeHtml(line.order_unit_snapshot || "-")}
                      · 현재 ${formatNumber(line.current_stock_snapshot)}
                      · 기준 ${formatNumber(line.safety_stock_snapshot)}
                    </span>
                  </div>
                `;
              })
              .join("")}
          </div>

          <div class="purchase-order-footer">
            <label class="field field-flex">
              <span class="field-label">메모</span>
              <input type="text" class="purchase-order-note" value="${escapeAttribute(order.note || "")}" ${canEdit ? "" : "disabled"}>
            </label>
            ${saveButton}
          </div>
        </section>
      `;
    })
    .join("");
}

function showAuthGate() {
  elements.authGate.classList.remove("hidden");
  document.body.classList.add("auth-locked");
}

function hideAuthGate() {
  elements.authGate.classList.add("hidden");
  document.body.classList.remove("auth-locked");
}

function openModal(type) {
  const modal = {
    item: elements.itemModal,
    adjust: elements.adjustModal,
    password: elements.passwordModal,
    users: elements.usersModal,
    vendors: elements.vendorsModal,
    orders: elements.ordersModal,
  }[type];
  modal?.classList.remove("hidden");
}

function closeModal(type) {
  const modal = {
    item: elements.itemModal,
    adjust: elements.adjustModal,
    password: elements.passwordModal,
    users: elements.usersModal,
    vendors: elements.vendorsModal,
    orders: elements.ordersModal,
  }[type];
  modal?.classList.add("hidden");
  if (type === "item") {
    state.editingItem = null;
  }
  if (type === "adjust") {
    state.adjustingItem = null;
  }
  if (type === "password") {
    elements.passwordForm.reset();
  }
}

function openItemModal(item = null) {
  if (!userCanEdit()) {
    showToast("수정 권한이 없습니다.", true);
    return;
  }
  state.editingItem = item;
  elements.itemModalTitle.textContent = item ? "품목 수정" : "품목 추가";
  renderItemForm(item);
  openModal("item");
}

function openAdjustModal(item) {
  if (!userCanEdit()) {
    showToast("수정 권한이 없습니다.", true);
    return;
  }
  state.adjustingItem = item;
  elements.adjustModalTitle.textContent = `${item.name} 재고 조정`;
  elements.adjustForm.reset();
  document.getElementById("adjust-mode").value = "add";
  document.getElementById("adjust-amount").value = 1;
  syncAdjustReason();
  openModal("adjust");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  const payload = Object.fromEntries(formData.entries());
  const response = await api(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { allowUnauthorized: true }
  );
  setCurrentUser(response.user);
  elements.loginForm.reset();
  showToast("로그인되었습니다.");
  await afterLogin();
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" }, { allowUnauthorized: true, suppressAuthToast: true });
  } catch (error) {
    // Ignore logout cleanup failures.
  }
  clearData();
  setCurrentUser(null);
  showAuthGate();
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.passwordForm);
  const payload = Object.fromEntries(formData.entries());
  if (payload.new_password !== payload.confirm_password) {
    showToast("새 비밀번호 확인이 일치하지 않습니다.", true);
    return;
  }
  await api("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: payload.current_password,
      new_password: payload.new_password,
    }),
  });
  closeModal("password");
  showToast("비밀번호를 변경했습니다.");
}

async function handleItemSubmit(event) {
  event.preventDefault();
  if (!userCanEdit()) {
    showToast("수정 권한이 없습니다.", true);
    return;
  }

  const wasEditing = Boolean(state.editingItem);
  const formData = new FormData(elements.itemForm);
  const payload = Object.fromEntries(formData.entries());
  state.fields
    .filter((field) => field.type === "number")
    .forEach((field) => {
      payload[field.key] = Number(payload[field.key] || 0);
    });

  const url = wasEditing ? `/api/items/${state.editingItem.id}` : "/api/items";
  const method = wasEditing ? "PUT" : "POST";
  await api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  closeModal("item");
  showToast(wasEditing ? "품목을 수정했습니다." : "품목을 추가했습니다.");
  await refreshData();
}

async function handleAdjustSubmit(event) {
  event.preventDefault();
  if (!userCanEdit()) {
    showToast("수정 권한이 없습니다.", true);
    return;
  }
  const item = state.adjustingItem;
  if (!item) {
    return;
  }
  const mode = document.getElementById("adjust-mode").value;
  const inputAmount = Number(document.getElementById("adjust-amount").value || 0);
  const reason = document.getElementById("adjust-reason").value;
  const note = document.getElementById("adjust-note").value.trim();

  let delta = inputAmount;
  if (mode === "subtract") {
    delta = inputAmount * -1;
  }
  if (mode === "set") {
    delta = inputAmount - Number(item.current_stock);
  }

  await submitStockAdjustment(item.id, delta, reason, note);
  closeModal("adjust");
}

async function handleImport(event) {
  if (!userCanEdit()) {
    showToast("업로드 권한이 없습니다.", true);
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  const payload = await api("/api/import", { method: "POST", body: formData });
  const result = payload.result || {};
  showToast(`엑셀 반영 완료: 추가 ${result.inserted || 0}, 수정 ${result.updated || 0}, 건너뜀 ${result.skipped || 0}`);
  event.target.value = "";
  await refreshData();
}

async function handleExportClick(event) {
  event.preventDefault();
  if (!state.currentUser) {
    showToast("로그인이 필요합니다.", true);
    return;
  }

  try {
    await downloadFile("/api/export.csv", `inventory-${buildTimestampToken()}.csv`);
    showToast("엑셀에서 열 수 있는 CSV 파일을 다운로드했습니다.");
  } catch (error) {
    console.error("export error:", error);
    showToast(error?.message || "파일 다운로드 중 문제가 발생했습니다.", true);
  }
}

async function handleUserCreateSubmit(event) {
  event.preventDefault();
  if (!userIsAdmin()) {
    showToast("관리자만 사용자를 추가할 수 있습니다.", true);
    return;
  }
  const formData = new FormData(elements.userCreateForm);
  const payload = Object.fromEntries(formData.entries());
  payload.is_active = true;
  await api("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  elements.userCreateForm.reset();
  showToast("사용자를 생성했습니다.");
  await loadUsers();
}

async function handleVendorCreateSubmit(event) {
  event.preventDefault();
  if (!userCanEdit()) {
    showToast("거래처 수정 권한이 없습니다.", true);
    return;
  }
  const formData = new FormData(elements.vendorCreateForm);
  const payload = Object.fromEntries(formData.entries());
  payload.is_active = true;
  await api("/api/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  elements.vendorCreateForm.reset();
  showToast("거래처를 생성했습니다.");
  await refreshData();
}

async function handleInventoryTableClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const itemId = Number(button.dataset.itemId);
  const action = button.dataset.action;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }
  if (action === "edit") {
    openItemModal(item);
    return;
  }
  if (action === "delete") {
    await deleteItem(item);
    return;
  }
  if (action === "adjust") {
    openAdjustModal(item);
    return;
  }
  if (action === "quick-add" || action === "quick-subtract") {
    const input = document.getElementById(`quick-${itemId}`);
    const baseValue = Number(input?.value || 1);
    const amount = action === "quick-add" ? baseValue : baseValue * -1;
    await submitStockAdjustment(item.id, amount, action === "quick-add" ? "restock" : "usage", "");
  }
}

async function handleUserListClick(event) {
  const button = event.target.closest("[data-action='save-user']");
  if (!button) {
    return;
  }
  const row = button.closest(".user-row");
  if (!row) {
    return;
  }
  const userId = Number(button.dataset.userId);
  const payload = {
    username: row.querySelector("[data-field='username']").value.trim(),
    display_name: row.querySelector("[data-field='display_name']").value.trim(),
    role: row.querySelector("[data-field='role']").value,
    is_active: row.querySelector("[data-field='is_active']").value === "true",
    password: row.querySelector("[data-field='password']").value.trim(),
  };
  await api(`/api/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  showToast("사용자 정보를 저장했습니다.");
  await loadUsers();
}



async function handleVendorListClick(event) {
  const saveButton = event.target.closest("[data-action='save-vendor']");
  const deleteButton = event.target.closest("[data-action='delete-vendor']");

  if (!saveButton && !deleteButton) {
    return;
  }

  const button = saveButton || deleteButton;
  const row = button.closest(".vendor-row");
  if (!row) {
    return;
  }

  const vendorId = Number(button.dataset.vendorId);

  if (deleteButton) {
    const vendorName = row.querySelector("[data-field='name']")?.value?.trim() || `거래처 #${vendorId}`;
    const confirmed = window.confirm(`"${vendorName}" 거래처를 삭제하시겠습니까?`);
    if (!confirmed) {
      return;
    }

    await api(`/api/vendors/${vendorId}`, {
      method: "DELETE",
    });

    showToast("거래처를 삭제했습니다.");
    await refreshData();
    return;
  }

  const payload = {
    name: row.querySelector("[data-field='name']").value.trim(),
    contact_name: row.querySelector("[data-field='contact_name']").value.trim(),
    phone: row.querySelector("[data-field='phone']").value.trim(),
    email: row.querySelector("[data-field='email']").value.trim(),
    notes: row.querySelector("[data-field='notes']").value.trim(),
    is_active: row.querySelector("[data-field='is_active']").value === "true",
  };

  await api(`/api/vendors/${vendorId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  showToast("거래처 정보를 저장했습니다.");
  await refreshData();
}


async function handleOrderCandidateClick(event) {
  const button = event.target.closest("[data-action='create-order']");
  if (!button) {
    return;
  }
  if (!userCanEdit()) {
    showToast("발주 생성 권한이 없습니다.", true);
    return;
  }

  const groupCard = button.closest(".candidate-group");
  if (!groupCard) {
    return;
  }
  const groupIndex = Number(button.dataset.groupIndex);
  const groups = getOrderCandidateGroups();
  const group = groups[groupIndex];
  if (!group || !group.vendorId) {
    showToast("거래처가 지정된 품목만 발주서를 만들 수 있습니다.", true);
    return;
  }

  const lines = [...groupCard.querySelectorAll(".candidate-line")]
    .map((line) => {
      const checked = line.querySelector(".candidate-line-check").checked;
      const itemId = Number(line.querySelector(".candidate-line-item-id").value);
      const requestedQuantity = Number(line.querySelector(".candidate-line-qty").value || 0);
      return checked && requestedQuantity > 0 ? { item_id: itemId, requested_quantity: requestedQuantity } : null;
    })
    .filter(Boolean);

  if (!lines.length) {
    showToast("발주할 품목을 하나 이상 선택해 주세요.", true);
    return;
  }

  const status = groupCard.querySelector(".order-create-status").value;
  const note = groupCard.querySelector(".order-create-note").value.trim();
  await api("/api/purchase-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendor_id: group.vendorId,
      status,
      note,
      lines,
    }),
  });
  showToast(`${group.vendorName} 발주서를 생성했습니다.`);
  await refreshData();
}

async function handlePurchaseOrderListClick(event) {
  const button = event.target.closest("[data-action='save-order']");
  if (!button) {
    return;
  }
  if (!userCanEdit()) {
    showToast("발주 상태 수정 권한이 없습니다.", true);
    return;
  }
  const card = button.closest(".purchase-order-card");
  if (!card) {
    return;
  }
  const orderId = Number(button.dataset.orderId);
  const payload = {
    status: card.querySelector(".purchase-order-status").value,
    note: card.querySelector(".purchase-order-note").value.trim(),
  };
  await api(`/api/purchase-orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  showToast("발주서 상태를 저장했습니다.");
  await refreshData();
}

async function submitStockAdjustment(itemId, amount, reason, note) {
  if (!Number.isFinite(amount) || amount === 0) {
    showToast("조정 수량을 확인해 주세요.", true);
    return;
  }
  await api(`/api/items/${itemId}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adjustment: amount, reason, note }),
  });
  showToast("재고를 반영했습니다.");
  await refreshData();
}

async function deleteItem(item) {
  if (!userCanEdit()) {
    showToast("삭제 권한이 없습니다.", true);
    return;
  }
  const confirmed = window.confirm(`${item.name} 품목을 삭제할까요? 관련 이력은 작업 기록으로만 남고 품목 자체는 제거됩니다.`);
  if (!confirmed) {
    return;
  }
  await api(`/api/items/${item.id}`, { method: "DELETE" });
  showToast("품목을 삭제했습니다.");
  await refreshData();
}

async function api(url, options = {}, extra = {}) {
  const { allowUnauthorized = false, suppressAuthToast = false } = extra;
  const response = await fetch(apiUrl(url), fetchOptions(options));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !allowUnauthorized) {
      clearData();
      setCurrentUser(null);
      showAuthGate();
      if (!suppressAuthToast) {
        showToast(payload.error || "로그인이 필요합니다.", true);
      }
      throw new Error(payload.error || "Unauthorized");
    }
    if (!suppressAuthToast) {
      showToast(payload.error || "요청 중 문제가 발생했습니다.", true);
    }
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function downloadFile(url, fallbackFilename) {
  const response = await fetch(apiUrl(url), fetchOptions({ method: "GET" }));

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearData();
      setCurrentUser(null);
      showAuthGate();
      throw new Error(payload.error || "로그인이 필요합니다.");
    }
    throw new Error(payload.error || "파일 다운로드 중 문제가 발생했습니다.");
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("다운로드할 파일 내용이 없습니다.");
  }

  const filename = extractFilenameFromDisposition(response.headers.get("Content-Disposition"), fallbackFilename);
  triggerBrowserDownload(blob, filename);
}

function extractFilenameFromDisposition(disposition, fallbackFilename) {
  if (!disposition) {
    return fallbackFilename;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  return fallbackFilename;
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  if ("download" in link) {
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(objectUrl, "_blank", "noopener");
  }
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

function buildTimestampToken() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function clearData() {
  state.items = [];
  state.activities = [];
  state.users = [];
  state.vendors = [];
  state.purchaseOrders = [];
  renderSummary();
  renderItems();
  renderActivities();
  renderUsers();
  renderVendors();
  renderOrderCandidates();
  renderPurchaseOrders();
}

function userCanEdit() {
  return Boolean(state.currentUser && ["admin", "editor"].includes(state.currentUser.role));
}

function userIsAdmin() {
  return Boolean(state.currentUser && state.currentUser.role === "admin");
}

function syncAdjustReason() {
  const mode = document.getElementById("adjust-mode").value;
  const reasonField = document.getElementById("adjust-reason");
  const reasonByMode = {
    add: "restock",
    subtract: "usage",
    set: "stock_check",
  };
  reasonField.value = reasonByMode[mode] || "manual";
}

function roleLabel(role) {
  const labels = {
    admin: "관리자",
    editor: "수정 가능",
    viewer: "보기 전용",
  };
  return labels[role] || role || "-";
}

function activityLabel(actionType) {
  const labels = {
    create: "품목 등록",
    update: "품목 수정",
    delete: "품목 삭제",
    adjust: "재고 조정",
    purchase_order_create: "발주서 생성",
    purchase_order_update: "발주서 수정",
  };
  return labels[actionType] || actionType || "-";
}

function orderStatusLabel(status) {
  const labels = {
    draft: "발주 대기",
    ordered: "발주 완료",
    received: "입고 완료",
    cancelled: "취소",
  };
  return labels[status] || status || "-";
}

function formatText(value) {
  return value ? escapeHtml(String(value)) : "-";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.style.background = isError ? "rgba(154, 77, 48, 0.96)" : "rgba(36, 48, 38, 0.95)";
  elements.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function renderPurchaseOrders() {
  if (!state.purchaseOrders.length) {
    elements.purchaseOrderList.innerHTML = `<div class="empty-user-row">등록된 발주서가 없습니다.</div>`;
    return;
  }

  const canEdit = userCanEdit();
  elements.purchaseOrderList.innerHTML = state.purchaseOrders
    .map((order) => {
      const isStockApplied = Boolean(order.stock_applied_at);
      const statusControl = canEdit
        ? `
            <select class="purchase-order-status" data-order-id="${order.id}" ${isStockApplied ? "disabled" : ""}>
              ${state.orderStatuses
                .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${orderStatusLabel(status)}</option>`)
                .join("")}
            </select>
          `
        : `<span class="user-role-badge role-${order.status === "cancelled" ? "viewer" : "editor"}">${orderStatusLabel(order.status)}</span>`;
      const saveButton = canEdit
        ? `<button class="button button-secondary small-button" data-action="save-order" data-order-id="${order.id}">상태 저장</button>`
        : "";
      const receiptMeta = isStockApplied
        ? `<p class="purchase-order-meta">입고 반영: ${formatDateTime(order.stock_applied_at)} · ${escapeHtml(order.stock_applied_by_name || "-")}</p>`
        : `<p class="purchase-order-meta">입고 반영 전</p>`;
      const receiptBadge = isStockApplied ? `<span class="receipt-badge">재고 반영 완료</span>` : "";
      const receiptHelper = isStockApplied ? `<p class="purchase-order-helper">입고 반영이 끝난 발주서는 상태를 다시 바꿀 수 없습니다.</p>` : "";

      return `
        <section class="purchase-order-card" data-order-id="${order.id}" data-stock-applied="${isStockApplied ? "1" : "0"}">
          <div class="purchase-order-head">
            <div>
              <h4>발주서 #${order.id} · ${escapeHtml(order.vendor_name)}</h4>
              <p class="item-sub">작성 ${formatDateTime(order.created_at)} · ${escapeHtml(order.created_by_name || "-")}</p>
              ${receiptMeta}
            </div>
            <div class="purchase-order-status-stack">
              ${receiptBadge}
              ${statusControl}
              ${receiptHelper}
            </div>
          </div>

          <div class="purchase-order-lines">
            ${order.lines
              .map((line) => {
                return `
                  <div class="purchase-order-line">
                    <strong>${escapeHtml(line.item_name_snapshot)}</strong>
                    <span class="item-sub">
                      발주수량 ${formatNumber(line.requested_quantity)}
                      · 주문단위 ${escapeHtml(line.order_unit_snapshot || "-")}
                      · 현재 ${formatNumber(line.current_stock_snapshot)}
                      · 기준 ${formatNumber(line.safety_stock_snapshot)}
                    </span>
                  </div>
                `;
              })
              .join("")}
          </div>

          <div class="purchase-order-footer">
            <label class="field field-flex">
              <span class="field-label">메모</span>
              <input type="text" class="purchase-order-note" value="${escapeAttribute(order.note || "")}" ${canEdit ? "" : "disabled"}>
            </label>
            ${saveButton}
          </div>
        </section>
      `;
    })
    .join("");
}

async function handlePurchaseOrderListClick(event) {
  const button = event.target.closest("[data-action='save-order']");
  if (!button) {
    return;
  }
  if (!userCanEdit()) {
    showToast("발주 상태 수정 권한이 없습니다.", true);
    return;
  }
  const card = button.closest(".purchase-order-card");
  if (!card) {
    return;
  }
  const orderId = Number(button.dataset.orderId);
  const wasApplied = card.dataset.stockApplied === "1";
  const payload = {
    status: card.querySelector(".purchase-order-status").value,
    note: card.querySelector(".purchase-order-note").value.trim(),
  };
  const response = await api(`/api/purchase-orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const isNowApplied = Boolean(response.purchase_order?.stock_applied_at);
  if (payload.status === "received" && !wasApplied && isNowApplied) {
    showToast("입고 완료 처리와 재고 반영이 완료되었습니다.");
  } else {
    showToast("발주서 상태를 저장했습니다.");
  }
  await refreshData();
}

function activityLabel(actionType) {
  const labels = {
    create: "품목 등록",
    update: "품목 수정",
    delete: "품목 삭제",
    adjust: "재고 조정",
    purchase_order_create: "발주서 생성",
    purchase_order_update: "발주서 수정",
    purchase_order_receive: "입고 반영",
  };
  return labels[actionType] || actionType || "-";
}
