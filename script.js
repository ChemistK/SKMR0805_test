/*
  ===========================================================
  이 파일은 "화면에 어떤 데이터를 보여줄지" 그리고
  "그 데이터를 화면에 채워 넣는 방법"을 담당합니다.

  신청하기 버튼을 누르면 Supabase(데이터베이스)에 실제로 저장되고,
  화면 목록도 데이터베이스에 있는 내용을 그대로 보여줍니다.
  (이제 새로고침해도 신청 내용이 사라지지 않아요)
  ===========================================================
*/

// -----------------------------------------------------------
// [설정값 모음] 나중에 문구나 테이블 이름을 바꾸고 싶을 때
// 코드 여기저기를 찾아다니지 않고 이 부분만 고치면 됩니다.
// -----------------------------------------------------------

// Supabase(데이터베이스)에서 신청 목록을 저장해 둔 테이블 이름
const TABLE_NAME = "material_requests";

// 신청 상태별로 화면에 어떤 글자와 색을 보여줄지 정하는 표(맵)
const STATUS_CONFIG = {
  pending: { label: "대기중", className: "pending" },
  approved: { label: "승인됨", className: "approved" },
  completed: { label: "완료됨", className: "completed" },
};

// 상태 변경 버튼을 눌렀을 때 "지금 상태 -> 다음 상태"로 어떻게 넘어갈지 정하는 표(맵)
// 완료됨은 마지막 단계라서 다음 단계가 없어요 (null)
const STATUS_FLOW = {
  pending: { nextStatus: "approved", buttonLabel: "승인하기" },
  approved: { nextStatus: "completed", buttonLabel: "완료하기" },
  completed: null,
};

// 목록/빈 상태/폼 영역을 화면에서 찾을 때 쓰는 id 값 모음
const ELEMENT_ID = {
  requestList: "request-list",
  emptyState: "empty-state",
  emptyStateTitle: "empty-state-title",
  emptyStateDesc: "empty-state-desc",
  listCount: "list-count",
  form: "request-form",
  materialName: "material-name",
  materialQty: "material-qty",
  requesterName: "requester-name",
  formError: "form-error",
  submitButton: "submit-button",
  searchInput: "search-material",
  statusFilter: "status-filter",
};

// 상태 필터 드롭다운에서 "전체"를 뜻하는 값 (이 값일 때는 상태로 걸러내지 않아요)
const STATUS_FILTER_ALL = "all";

// 검색창에 글자를 입력할 때마다 매번 바로 검색하면 데이터베이스에 요청이 너무 자주 가서,
// 타이핑을 멈추고 이만큼(ms) 지난 뒤에 검색하도록 살짝 기다려주는 시간
const SEARCH_DEBOUNCE_DELAY_MS = 300;

// 목록이 비어있을 때 상황별로 보여줄 안내 문구
// (아예 신청이 하나도 없을 때 / 검색·필터 조건에 맞는 게 없을 때를 구분해요)
const EMPTY_STATE_MESSAGE = {
  noRequests: {
    title: "아직 신청한 자재가 없어요",
    desc: "위 폼에서 새 자재를 신청해 보세요.",
  },
  noMatch: {
    title: "조건에 맞는 자재가 없어요",
    desc: "다른 자재명이나 상태로 다시 검색해보세요.",
  },
};

// 신청 폼에 값을 하나라도 안 채웠을 때 보여줄 안내 문구
const VALIDATION_MESSAGE = "자재명, 수량, 신청자를 모두 입력해주세요.";

// 데이터베이스와 통신 중 문제가 생겼을 때 사용자에게 보여줄 안내 문구
const LOAD_ERROR_MESSAGE = "신청 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
const SAVE_ERROR_MESSAGE = "신청에 실패했어요. 잠시 후 다시 시도해주세요.";
const DELETE_ERROR_MESSAGE = "삭제에 실패했어요. 잠시 후 다시 시도해주세요.";
const STATUS_UPDATE_ERROR_MESSAGE = "상태 변경에 실패했어요. 잠시 후 다시 시도해주세요.";

// 새로 신청할 때 기본으로 붙는 상태값 (담당자가 검토하기 전이라는 뜻)
const DEFAULT_STATUS = "pending";

// 대시보드에 상태별 개수를 보여줄 때, 이 순서(대기중 -> 승인됨 -> 완료됨)대로 보여줍니다
const STATUS_ORDER = ["pending", "approved", "completed"];

// 대시보드(요약 현황) 영역을 화면에서 찾을 때 쓰는 id 값 모음
const DASHBOARD_ELEMENT_ID = {
  totalCount: "stat-total-count",
  totalQuantity: "stat-total-quantity",
  statusList: "stat-status-list",
};

// 신청하기 버튼의 평소 문구 / 저장 중일 때 문구
const SUBMIT_BUTTON_LABEL = "신청하기";
const SUBMIT_BUTTON_LOADING_LABEL = "저장 중...";

// 화면에 표시할 현재 목록을 담아두는 곳 (데이터베이스에서 불러온 내용)
let currentRequests = [];

// 데이터베이스(Supabase)와 통신하기 위한 연결 도구
// config.js의 주소/키를 이용해서 딱 한 번만 만들어 둡니다
let supabaseClient = null;

// -----------------------------------------------------------
// [데이터베이스 연결 준비]
// -----------------------------------------------------------

/**
 * config.js와 Supabase 라이브러리가 잘 불러와졌는지 확인하고,
 * 문제가 없으면 데이터베이스와 통신할 도구(supabaseClient)를 만드는 함수
 */
function setupSupabaseClient() {
  if (typeof CONFIG === "undefined") {
    console.error(
      "[자재 신청] config.js를 찾을 수 없어요. index.html에서 config.js를 먼저 불러오고 있는지 확인해주세요."
    );
    return null;
  }

  if (typeof window.supabase === "undefined") {
    console.error(
      "[자재 신청] Supabase 라이브러리를 찾을 수 없어요. 인터넷 연결 상태나 CDN 주소를 확인해주세요."
    );
    return null;
  }

  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// -----------------------------------------------------------
// [화면 그리기 담당 함수들]
// -----------------------------------------------------------

/**
 * 데이터베이스에 저장된 시각(예: 2026-08-05T05:52:45+00:00)을
 * 화면에 보여주기 좋은 "YYYY-MM-DD HH:mm" 형태로 바꿔주는 함수
 */
function formatRequestedAt(isoDateText) {
  const date = new Date(isoDateText);

  if (Number.isNaN(date.getTime())) {
    return isoDateText;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 데이터베이스에서 받아온 한 행(row)을 화면에서 쓰기 편한 형태로 바꿔주는 함수
 */
function mapDatabaseRowToRequest(row) {
  return {
    id: row.id,
    materialName: row.material_name,
    quantity: row.quantity,
    requester: row.requester,
    date: formatRequestedAt(row.requested_at),
    status: row.status ?? DEFAULT_STATUS,
  };
}

/**
 * 신청 데이터 1개를 받아서, 화면에 보여줄 카드(HTML 조각)를 만들어주는 함수
 * 삭제 버튼에는 데이터베이스의 행을 구분할 수 있는 id 값을 심어두고,
 * 실제 클릭 처리는 목록 전체에 한 번만 걸어둔 이벤트 위임(delegation)으로 합니다.
 */
function createRequestCardElement(request) {
  const statusInfo = STATUS_CONFIG[request.status] ?? {
    label: "알수없음",
    className: "pending",
  };

  // 다음 단계로 넘어가는 상태 변경 버튼을 만들어야 하는지 확인합니다
  // (완료됨은 마지막 단계라서 버튼이 필요 없어요)
  const statusFlow = STATUS_FLOW[request.status];
  const statusActionButtonHtml = statusFlow
    ? `
      <button
        type="button"
        class="status-action-button"
        data-request-id="${request.id}"
        data-next-status="${statusFlow.nextStatus}"
      >
        ${escapeHtml(statusFlow.buttonLabel)}
      </button>
    `
    : "";

  const card = document.createElement("article");
  card.className = "request-card";

  card.innerHTML = `
    <div class="request-card-info">
      <div class="request-card-top">
        <span class="request-card-name">${escapeHtml(request.materialName)}</span>
        <span class="status-badge ${statusInfo.className}">${statusInfo.label}</span>
      </div>
      <div class="request-card-meta">
        <span class="meta-item"><strong>수량</strong> ${escapeHtml(String(request.quantity))}개</span>
        <span class="meta-divider" aria-hidden="true">·</span>
        <span class="meta-item"><strong>신청자</strong> ${escapeHtml(request.requester)}</span>
        <span class="meta-divider" aria-hidden="true">·</span>
        <span class="meta-item meta-date">${escapeHtml(request.date)}</span>
      </div>
    </div>
    <div class="request-card-actions">
      ${statusActionButtonHtml}
      <button
        type="button"
        class="delete-icon-button"
        title="삭제"
        aria-label="${escapeHtml(request.materialName)} 삭제"
        data-request-id="${request.id}"
      >
        ✕
      </button>
    </div>
  `;

  return card;
}

/**
 * 문자열 안에 <, > 같은 특수문자가 있어도 화면이 깨지지 않도록
 * 안전한 형태로 바꿔주는 함수 (보안 및 화면 오류 방지용)
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 지금 검색창/상태 필터에 어떤 값이 들어있는지 읽어오는 함수
 * (검색어는 앞뒤 빈칸을 지우고, 필터 요소를 못 찾으면 "전체"로 취급합니다)
 */
function getCurrentFilters() {
  const searchInput = document.getElementById(ELEMENT_ID.searchInput);
  const statusFilterSelect = document.getElementById(ELEMENT_ID.statusFilter);

  return {
    searchText: searchInput ? searchInput.value.trim() : "",
    status: statusFilterSelect ? statusFilterSelect.value : STATUS_FILTER_ALL,
  };
}

/**
 * 검색/필터 조건이 하나라도 걸려있는지 확인하는 함수
 * (조건이 걸려있는데 결과가 없으면, "신청 자체가 없다"가 아니라
 *  "조건에 맞는 게 없다"는 문구를 보여줘야 하기 때문에 구분이 필요해요)
 */
function isAnyFilterActive(filters) {
  return Boolean(filters.searchText) || filters.status !== STATUS_FILTER_ALL;
}

/**
 * 함수를 바로 실행하지 않고, 마지막 호출 후 delay(ms)만큼 조용히 지나면 실행하는 함수
 * 검색창에 글자를 입력할 때마다 매번 데이터베이스에 요청을 보내면 낭비이므로,
 * 타이핑이 멈췄을 때 딱 한 번만 검색하도록 도와줍니다
 */
function debounce(functionToRun, delay) {
  let timerId = null;

  return (...args) => {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => functionToRun(...args), delay);
  };
}

/**
 * 현재 목록(currentRequests)을 화면의 목록 영역에 채워 넣고,
 * 목록이 비어 있으면 상황에 맞는 안내 문구를 보여주는 함수
 */
function renderRequestList(requests, filters) {
  const listElement = document.getElementById(ELEMENT_ID.requestList);
  const emptyStateElement = document.getElementById(ELEMENT_ID.emptyState);
  const emptyStateTitleElement = document.getElementById(ELEMENT_ID.emptyStateTitle);
  const emptyStateDescElement = document.getElementById(ELEMENT_ID.emptyStateDesc);
  const listCountElement = document.getElementById(ELEMENT_ID.listCount);

  // 화면 요소를 못 찾으면 더 진행하지 않고 원인을 콘솔에 남깁니다 (오류 처리)
  if (!listElement || !emptyStateElement) {
    console.error(
      "[자재 신청] 목록 영역을 찾지 못했어요. index.html의 id 값을 확인해주세요."
    );
    return;
  }

  // 제목 옆에 붙은 "N건" 표시를 최신 개수로 맞춰줍니다
  if (listCountElement) {
    listCountElement.textContent = `${requests ? requests.length : 0}건`;
  }

  // 목록이 비어있는 경우: 카드 대신 안내 문구를 보여줍니다
  if (!requests || requests.length === 0) {
    listElement.innerHTML = "";

    const message = isAnyFilterActive(filters ?? getCurrentFilters())
      ? EMPTY_STATE_MESSAGE.noMatch
      : EMPTY_STATE_MESSAGE.noRequests;

    if (emptyStateTitleElement) {
      emptyStateTitleElement.textContent = message.title;
    }
    if (emptyStateDescElement) {
      emptyStateDescElement.textContent = message.desc;
    }

    emptyStateElement.hidden = false;
    return;
  }

  // 목록에 데이터가 있는 경우: 안내 문구는 숨기고 카드를 하나씩 그립니다
  emptyStateElement.hidden = true;
  listElement.innerHTML = "";
  requests.forEach((request) => {
    const cardElement = createRequestCardElement(request);
    listElement.appendChild(cardElement);
  });
}

/**
 * 폼에 입력한 값이 비어있지 않은지 확인하는 함수
 * 문제가 있으면 이유를 담은 문자열을, 문제가 없으면 null을 돌려줍니다
 */
function validateRequestInput({ materialName, quantity, requester }) {
  const isQuantityValid = Number.isFinite(quantity) && quantity > 0;

  if (!materialName || !requester || !isQuantityValid) {
    return VALIDATION_MESSAGE;
  }

  return null;
}

/**
 * 폼 위에 오류 안내 문구를 보여주거나 숨기는 함수
 */
function setFormError(message) {
  const errorElement = document.getElementById(ELEMENT_ID.formError);
  if (!errorElement) {
    return;
  }

  if (message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
  } else {
    errorElement.hidden = true;
  }
}

/**
 * 신청하기 버튼을 저장 중 상태(비활성화 + 문구 변경)로 바꾸거나
 * 원래대로 되돌리는 함수 (같은 신청이 중복 저장되는 것을 막아줍니다)
 */
function setSubmitButtonLoading(isLoading) {
  const submitButton = document.getElementById(ELEMENT_ID.submitButton);
  if (!submitButton) {
    return;
  }

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? SUBMIT_BUTTON_LOADING_LABEL : SUBMIT_BUTTON_LABEL;
}

// -----------------------------------------------------------
// [데이터베이스 통신 담당 함수들]
// -----------------------------------------------------------

/**
 * 데이터베이스에서 신청 목록을 가져와 화면에 그리는 함수
 * 검색창(자재명)과 상태 필터에 값이 들어있으면, 그 조건에 맞는 데이터만
 * 데이터베이스에 요청해서 불러옵니다 (화면에서 걸러내는 게 아니라, DB에서부터 걸러서 가져와요)
 */
async function loadRequestsFromDatabase() {
  if (!supabaseClient) {
    setFormError(LOAD_ERROR_MESSAGE);
    return;
  }

  const filters = getCurrentFilters();

  let query = supabaseClient
    .from(TABLE_NAME)
    .select("id, material_name, quantity, requester, requested_at, status")
    .order("requested_at", { ascending: false });

  // 자재명 검색어가 있으면, 그 글자가 포함된 자재만 가져오도록 조건을 추가합니다
  // (ilike는 대소문자를 구분하지 않는 "포함 검색"이에요)
  if (filters.searchText) {
    query = query.ilike("material_name", `%${filters.searchText}%`);
  }

  // 상태 필터가 "전체"가 아니면, 그 상태에 딱 맞는 자재만 가져오도록 조건을 추가합니다
  if (filters.status !== STATUS_FILTER_ALL) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[자재 신청] 목록을 불러오는 중 문제가 발생했어요:", error);
    setFormError(LOAD_ERROR_MESSAGE);
    return;
  }

  currentRequests = data.map(mapDatabaseRowToRequest);
  renderRequestList(currentRequests, filters);
}

/**
 * 데이터베이스에 있는 "전체" 신청 데이터를 모아서
 * 총 건수 / 수량 합계 / 상태별 개수를 계산하고 화면에 그리는 함수
 * (검색창이나 상태 필터 값과는 상관없이, 항상 전체 데이터를 기준으로 집계해요)
 */
async function loadDashboardStats() {
  if (!supabaseClient) {
    return;
  }

  const { data, error } = await supabaseClient.from(TABLE_NAME).select("quantity, status");

  if (error) {
    console.error("[자재 신청] 요약 현황을 불러오는 중 문제가 발생했어요:", error);
    return;
  }

  const totalCount = data.length;
  const totalQuantity = data.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  // 상태별 개수를 세어두는 표(맵). 데이터가 하나도 없는 상태도 0으로 보여주기 위해
  // 먼저 STATUS_ORDER에 있는 모든 상태를 0으로 채워둡니다
  const statusCounts = {};
  STATUS_ORDER.forEach((status) => {
    statusCounts[status] = 0;
  });

  data.forEach((row) => {
    const status = row.status ?? DEFAULT_STATUS;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  });

  renderDashboardStats({ totalCount, totalQuantity, statusCounts });
}

/**
 * loadDashboardStats가 계산한 숫자를 실제 화면(대시보드 카드)에 채워 넣는 함수
 */
function renderDashboardStats({ totalCount, totalQuantity, statusCounts }) {
  const totalCountElement = document.getElementById(DASHBOARD_ELEMENT_ID.totalCount);
  const totalQuantityElement = document.getElementById(DASHBOARD_ELEMENT_ID.totalQuantity);
  const statusListElement = document.getElementById(DASHBOARD_ELEMENT_ID.statusList);

  if (!totalCountElement || !totalQuantityElement || !statusListElement) {
    console.error("[자재 신청] 대시보드 영역을 찾지 못했어요. index.html의 id 값을 확인해주세요.");
    return;
  }

  totalCountElement.textContent = `${totalCount}건`;
  totalQuantityElement.textContent = `${totalQuantity}개`;

  statusListElement.innerHTML = "";
  STATUS_ORDER.forEach((status) => {
    const statusInfo = STATUS_CONFIG[status] ?? { label: status, className: "pending" };
    const count = statusCounts[status] ?? 0;

    const itemElement = document.createElement("div");
    itemElement.className = "stat-status-item";
    itemElement.innerHTML = `
      <span class="status-badge ${statusInfo.className}">${escapeHtml(statusInfo.label)}</span>
      <span class="stat-status-count">${count}건</span>
    `;
    statusListElement.appendChild(itemElement);
  });
}

/**
 * 신청 목록과 대시보드 숫자를 동시에 새로고침하는 함수
 * 신청하기/삭제/상태변경처럼 데이터베이스 내용이 실제로 바뀌는 순간마다 이 함수를 불러서
 * 목록과 대시보드가 항상 같은 최신 상태를 보여주도록 맞춰줍니다
 */
async function refreshRequestsAndStats() {
  await Promise.all([loadRequestsFromDatabase(), loadDashboardStats()]);
}

/**
 * 삭제(✕) 버튼을 눌렀을 때 실행되는 함수
 * 카드 하나하나에 이벤트를 거는 대신, 목록 전체(#request-list)에
 * 클릭 이벤트를 한 번만 걸어두고 어떤 버튼을 눌렀는지 확인하는 방식입니다
 * (이벤트 위임 - 카드가 새로 생기거나 사라져도 따로 다시 연결할 필요가 없어요)
 */
async function handleDeleteButtonClick(event) {
  const deleteButton = event.target.closest(".delete-icon-button");
  if (!deleteButton) {
    return;
  }

  const requestId = deleteButton.dataset.requestId;
  if (!requestId) {
    return;
  }

  const isConfirmed = window.confirm("이 신청을 삭제할까요? 삭제하면 되돌릴 수 없어요.");
  if (!isConfirmed) {
    return;
  }

  if (!supabaseClient) {
    console.error("[자재 신청] 데이터베이스 연결이 준비되지 않았어요.");
    window.alert(DELETE_ERROR_MESSAGE);
    return;
  }

  deleteButton.disabled = true;

  const { error } = await supabaseClient.from(TABLE_NAME).delete().eq("id", requestId);

  if (error) {
    console.error("[자재 신청] 삭제 중 문제가 발생했어요:", error);
    window.alert(DELETE_ERROR_MESSAGE);
    deleteButton.disabled = false;
    return;
  }

  // 삭제된 결과가 목록과 대시보드에 바로 반영되도록 다시 불러옵니다
  await refreshRequestsAndStats();
}

/**
 * 상태 변경 버튼(예: "승인하기", "완료하기")을 눌렀을 때 실행되는 함수
 * 버튼에 미리 심어둔 data-next-status 값으로 데이터베이스의 status를 바꾸고,
 * 성공하면 목록을 다시 불러와서 배지 색과 버튼 문구를 즉시 갱신합니다
 */
async function handleStatusChangeButtonClick(event) {
  const statusButton = event.target.closest(".status-action-button");
  if (!statusButton) {
    return;
  }

  const requestId = statusButton.dataset.requestId;
  const nextStatus = statusButton.dataset.nextStatus;
  if (!requestId || !nextStatus) {
    return;
  }

  if (!supabaseClient) {
    console.error("[자재 신청] 데이터베이스 연결이 준비되지 않았어요.");
    window.alert(STATUS_UPDATE_ERROR_MESSAGE);
    return;
  }

  statusButton.disabled = true;

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({ status: nextStatus })
    .eq("id", requestId);

  if (error) {
    console.error("[자재 신청] 상태 변경 중 문제가 발생했어요:", error);
    window.alert(STATUS_UPDATE_ERROR_MESSAGE);
    statusButton.disabled = false;
    return;
  }

  // 바뀐 상태(배지 색, 다음 버튼 문구, 대시보드 숫자)가 바로 반영되도록 다시 불러옵니다
  await refreshRequestsAndStats();
}

/**
 * 신청 폼을 제출했을 때 실행되는 함수
 * 1) 입력값을 읽고 확인한 뒤
 * 2) 문제가 없으면 데이터베이스에 실제로 저장하고
 * 3) 저장에 성공하면 목록을 새로고침해서 방금 신청한 내용을 보여줍니다
 */
async function handleRequestSubmit(event) {
  event.preventDefault();

  const nameInput = document.getElementById(ELEMENT_ID.materialName);
  const qtyInput = document.getElementById(ELEMENT_ID.materialQty);
  const requesterInput = document.getElementById(ELEMENT_ID.requesterName);

  if (!nameInput || !qtyInput || !requesterInput) {
    console.error("[자재 신청] 입력 칸을 찾지 못했어요. index.html의 id 값을 확인해주세요.");
    return;
  }

  const newRequest = {
    materialName: nameInput.value.trim(),
    quantity: Number(qtyInput.value),
    requester: requesterInput.value.trim(),
  };

  const errorMessage = validateRequestInput(newRequest);
  if (errorMessage) {
    setFormError(errorMessage);
    return;
  }

  if (!supabaseClient) {
    setFormError(SAVE_ERROR_MESSAGE);
    console.error("[자재 신청] 데이터베이스 연결이 준비되지 않았어요.");
    return;
  }

  setFormError(null);
  setSubmitButtonLoading(true);

  const { error } = await supabaseClient.from(TABLE_NAME).insert({
    material_name: newRequest.materialName,
    quantity: newRequest.quantity,
    requester: newRequest.requester,
  });

  setSubmitButtonLoading(false);

  if (error) {
    console.error("[자재 신청] 저장 중 문제가 발생했어요:", error);
    setFormError(SAVE_ERROR_MESSAGE);
    return;
  }

  // 방금 저장한 내용이 목록과 대시보드에 정확히 반영되도록 다시 불러옵니다
  await refreshRequestsAndStats();

  // 다음 신청을 편하게 입력할 수 있도록 폼을 비워줍니다
  nameInput.value = "";
  qtyInput.value = "";
  requesterInput.value = "";
  nameInput.focus();
}

// -----------------------------------------------------------
// [실행 부분] 화면(HTML)이 다 준비되면 데이터베이스에 연결하고,
// 목록을 불러와서 그린 뒤, 폼 제출을 감지합니다
// -----------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  try {
    supabaseClient = setupSupabaseClient();

    refreshRequestsAndStats();

    const formElement = document.getElementById(ELEMENT_ID.form);
    if (!formElement) {
      console.error("[자재 신청] 신청 폼을 찾지 못했어요. index.html의 id 값을 확인해주세요.");
      return;
    }
    formElement.addEventListener("submit", handleRequestSubmit);

    const listElement = document.getElementById(ELEMENT_ID.requestList);
    if (!listElement) {
      console.error("[자재 신청] 목록 영역을 찾지 못했어요. index.html의 id 값을 확인해주세요.");
      return;
    }
    listElement.addEventListener("click", handleDeleteButtonClick);
    listElement.addEventListener("click", handleStatusChangeButtonClick);

    // 검색창은 타이핑이 멈춘 뒤 잠시 있다가 검색하고(디바운스), 상태 필터는 고르는 즉시 검색합니다
    const searchInput = document.getElementById(ELEMENT_ID.searchInput);
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce(loadRequestsFromDatabase, SEARCH_DEBOUNCE_DELAY_MS)
      );
    }

    const statusFilterSelect = document.getElementById(ELEMENT_ID.statusFilter);
    if (statusFilterSelect) {
      statusFilterSelect.addEventListener("change", () => loadRequestsFromDatabase());
    }
  } catch (error) {
    // 예상치 못한 문제가 생겨도 화면이 완전히 멈추지 않도록 방지합니다
    console.error("[자재 신청] 화면을 준비하는 중 문제가 발생했어요:", error);
  }
});
