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
  listCount: "list-count",
  form: "request-form",
  materialName: "material-name",
  materialQty: "material-qty",
  requesterName: "requester-name",
  formError: "form-error",
  submitButton: "submit-button",
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
 * 현재 목록(currentRequests)을 화면의 목록 영역에 채워 넣고,
 * 목록이 비어 있으면 안내 문구를 보여주는 함수
 */
function renderRequestList(requests) {
  const listElement = document.getElementById(ELEMENT_ID.requestList);
  const emptyStateElement = document.getElementById(ELEMENT_ID.emptyState);
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
 * 데이터베이스에서 신청 목록 전체를 최신순으로 가져와서 화면에 그리는 함수
 */
async function loadRequestsFromDatabase() {
  if (!supabaseClient) {
    setFormError(LOAD_ERROR_MESSAGE);
    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("id, material_name, quantity, requester, requested_at, status")
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("[자재 신청] 목록을 불러오는 중 문제가 발생했어요:", error);
    setFormError(LOAD_ERROR_MESSAGE);
    return;
  }

  currentRequests = data.map(mapDatabaseRowToRequest);
  renderRequestList(currentRequests);
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

  // 삭제된 결과가 목록에 바로 반영되도록 다시 불러옵니다
  await loadRequestsFromDatabase();
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

  // 바뀐 상태(배지 색, 다음 버튼 문구)가 바로 반영되도록 목록을 다시 불러옵니다
  await loadRequestsFromDatabase();
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

  // 방금 저장한 내용이 정확히 반영되도록 목록을 다시 불러옵니다
  await loadRequestsFromDatabase();

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

    loadRequestsFromDatabase();

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
  } catch (error) {
    // 예상치 못한 문제가 생겨도 화면이 완전히 멈추지 않도록 방지합니다
    console.error("[자재 신청] 화면을 준비하는 중 문제가 발생했어요:", error);
  }
});
