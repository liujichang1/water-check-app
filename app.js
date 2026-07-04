const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);

const demoLibrary = [
  {
    id: uid(), title: "施工临时用电不规范", type: "安全", level: "较重",
    fact: "经查，施工现场临时用电线路敷设及配电管理不规范。",
    standard: "《施工现场临时用电安全技术规范》（JGJ 46—2005）相关条款（待核验）",
    rectification: "立即规范临时用电线路敷设和配电管理，全面检查漏电保护及接地措施。",
    source: "内置匹配示例"
  },
  {
    id: uid(), title: "临边安全防护不到位", type: "安全", level: "较重",
    fact: "经查，施工现场临边部位安全防护措施设置不到位。",
    standard: "水利水电工程施工安全相关规范条款（待核验）",
    rectification: "立即完善临边防护、警示标识和封闭措施，消除高处坠落风险。",
    source: "内置匹配示例"
  },
  {
    id: uid(), title: "施工质量控制资料不完善", type: "质量", level: "一般",
    fact: "经查，相关施工质量检查、验收记录不完整。",
    standard: "水利水电工程施工质量检验与评定相关规程（待核验）",
    rectification: "补充完善质量检查和验收资料，确保工程实体与资料同步。",
    source: "内置匹配示例"
  }
];

let state = {
  view: "inspections",
  modal: null,
  projects: [],
  projectLibrary: [],
  inspections: [],
  library: demoLibrary,
  standards: [],
  currentInspectionId: null,
  importDraft: [],
  reportId: null,
  monthFilter: new Date().toISOString().slice(0, 7),
  editingProjectId: null
};

const db = {
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("xunjian-chenggao", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("app");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async get() {
    const database = await this.open();
    return new Promise(resolve => {
      const request = database.transaction("app").objectStore("app").get("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  },
  async set(value) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction("app", "readwrite").objectStore("app").put(value, "state");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }
};

async function save() {
  const persisted = {
    projects: state.projects,
    projectLibrary: state.projectLibrary,
    inspections: state.inspections,
    library: state.library,
    standards: state.standards
  };
  await db.set(persisted);
}

function inspection(id = state.currentInspectionId) {
  return state.inspections.find(item => item.id === id);
}

function setView(view) {
  state.view = view;
  state.modal = null;
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function nav() {
  const items = [["inspections","","检查"],["rectifications","","整改单"],["create","＋",""],["monthly","","月通报"],["me","","我的"]];
  const active = ["inspection-detail","review","notice"].includes(state.view) ? "inspections"
    : ["project-library","library","standards","settings"].includes(state.view) ? "me" : state.view;
  return `<nav class="bottom-nav">${items.map(([key, icon, label]) => `
    <button class="nav-btn ${key === "create" ? "create-btn" : ""} ${active === key ? "active" : ""}" ${key === "create" ? `data-action="new-inspection"` : `data-view="${key}"`}>
      ${key === "create" ? `<span class="nav-icon">${icon}</span>` : `<span class="nav-label">${label}</span>`}
    </button>`).join("")}</nav>`;
}

function topbar() {
  const titles = {inspections:"现场检查",rectifications:"整改单",monthly:"月通报",me:"我的",
    "inspection-detail":inspection()?.projectName||"工程检查",review:"问题确认",notice:"整改通知单",
    "project-library":"工程库",library:"历史通报库",standards:"规范库",settings:"设置"};
  const backs = {"inspection-detail":"inspections",review:"inspection-detail",notice:"review",
    "project-library":"me",library:"me",standards:"me",settings:"me"};
  const editableTitle = state.view === "inspection-detail" ? `button data-action="edit-project" aria-label="修改工程资料"` : "div";
  return `<header class="topbar">${backs[state.view] ? `<button class="top-back" data-view="${backs[state.view]}">‹</button>` : `<span class="top-side"></span>`}
    <${editableTitle} class="top-title">${esc(titles[state.view] || "水利监督检查")}</${editableTitle.split(" ")[0]}>
    <button class="top-search" data-action="open-search" aria-label="搜索">⌕</button></header>`;
}

function homeView() { return inspectionsView(); }

function inspectionCard(item) {
  const photoCount = item.records.reduce((n, r) => n + r.photos.length, 0);
  return `<div class="inspection-row"><button class="wx-cell inspection-cell" data-open-inspection="${item.id}">
    <span class="wx-avatar">工</span><span class="grow"><h3>${esc(item.projectName)}</h3>
    <p>${esc(item.date)} · ${photoCount}张照片 · ${item.records.length}条记录</p></span>
    <span class="cell-status">${esc(item.status)}</span><span class="chevron">›</span></button></div>`;
}

function emptyBlock(icon, title, text, action, label) {
  return `<div class="wx-empty"><div class="big-icon">${icon}</div><h3>${title}</h3><p>${text}</p>
    <button class="wx-primary" data-action="${action}">${label}</button></div>`;
}

function inspectionsView() {
  const items = [...state.inspections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `<main class="project-feed">${items.length ? items.map(projectSlide).join("")
    : `<div class="feed-empty"><b>还没有检查工程</b><span>点击底部“＋”开始检查</span></div>`}</main>`;
}

function projectSlide(item) {
  const photos = item.records.flatMap(record => record.photos || []);
  const cover = photos[photos.length - 1];
  const style = cover ? `style="background-image:linear-gradient(0deg,rgba(0,0,0,.82),rgba(0,0,0,.05) 55%),url('${cover}')"`
    : `style="background-image:linear-gradient(145deg,#29313c,#111 68%)"`;
  return `<div class="project-slide-row">
    <button class="project-slide" data-open-inspection="${item.id}" ${style}>
      <span class="slide-state">${esc(item.status)}</span>
      <span class="slide-info"><b>${esc(item.projectName)}</b><small>${esc(item.date)} · ${item.records.length}个问题 · ${photos.length}张照片</small></span>
      ${cover ? "" : `<span class="no-cover">暂无现场照片</span>`}
    </button>
  </div>`;
}

function rectificationsView() {
  const items = [...state.inspections].filter(item => item.records?.length).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return `<main class="page wx-page"><div class="wx-group">${items.length ? items.map(item => `
    <button class="wx-cell" data-open-inspection="${item.id}"><span class="wx-avatar notice-icon">单</span>
    <span class="grow"><h3>${esc(item.projectName)}</h3><p>${esc(item.date)} · ${item.issues?.length || item.records.length}个问题</p></span>
    <span class="cell-status">${item.noticeGeneratedAt ? "已生成" : "待生成"}</span><span class="chevron">›</span></button>`).join("")
    : `<div class="wx-empty">还没有需要生成的整改单</div>`}</div></main>`;
}

function monthlyView() {
  const items = state.inspections.filter(item => item.date?.startsWith(state.monthFilter));
  const completed = items.filter(item => item.issues?.length);
  const issueCount = completed.reduce((sum,item)=>sum+item.issues.length,0);
  const missing = completed.filter(item => !item.basicSituation);
  return `<main class="page wx-page">
    <div class="wx-group"><label class="wx-cell month-cell"><span>检查月份</span><input id="month-filter" type="month" value="${esc(state.monthFilter)}"></label></div>
    <div class="month-summary"><span>${completed.length}<small>工程</small></span><span>${issueCount}<small>问题</small></span></div>
    ${missing.length ? `<div class="wx-warning">${missing.length}个工程待补基本情况</div>` : ""}
    <div class="wx-section-label">本月工程</div><div class="wx-group">${completed.length ? completed.map(inspectionCard).join("") : `<div class="wx-empty">暂无已整理工程</div>`}</div>
    ${completed.length ? `<button class="wx-primary" data-action="prepare-monthly">生成月通报</button>` : ""}</main>`;
}

function libraryView() {
  return `<main class="page wx-page"><button class="wx-primary" data-action="import-history">导入往期通报</button>
    <div class="wx-section-label">${state.library.length}条问题</div>
    <div class="list compact-list">${state.library.map(item => `<article class="wx-card issue-card">
      <div class="issue-top"><h3>${esc(item.title)}</h3><span class="badge ${item.type}">${item.type}</span></div>
      <p class="fact">${esc(item.fact)}</p><p class="help">${esc(item.standard || "未提取到规范条文")}</p>
      <span class="badge ${item.level}">${item.level}</span></article>`).join("")}</div></main>`;
}

function menuCell(view, icon, label, value) {
  return `<button class="wx-cell" data-view="${view}"><span class="menu-icon">${icon}</span><span class="grow">${label}</span>
    <span class="cell-value">${value}</span><span class="chevron">›</span></button>`;
}

function meView() {
  return `<main class="page wx-page"><div class="profile-cell"><img class="profile-logo" src="./icons/app-icon-192.png" alt="娄底水利">
    <div><h2>娄底水利</h2><p>现场检查与通报整理</p></div></div>
    <div class="wx-group menu-group">${menuCell("project-library","▦","工程库",`${state.projectLibrary.length}个`)}
      ${menuCell("library","▤","历史通报库",`${state.library.length}条`)}${menuCell("standards","§","规范库",`${state.standards.length}份`)}</div>
    <div class="wx-group menu-group">${menuCell("settings","⚙","设置","")}</div></main>`;
}

function projectLibraryView() {
  return `<main class="page wx-page"><div class="wx-group">${state.projectLibrary.length ? state.projectLibrary.map(project => `
    <button class="wx-cell" data-project-id="${project.id}"><span class="wx-avatar">工</span><span class="grow"><h3>${esc(project.name)}</h3>
    <p>${esc(project.district || "未填写县市区")}</p></span><span class="chevron">›</span></button>`).join("") : `<div class="wx-empty">还没有保存工程</div>`}</div>
    <button class="wx-primary" data-action="new-project">＋ 新增工程</button></main>`;
}

function standardsView() {
  return `<main class="page wx-page"><button class="wx-primary" data-action="import-standard">导入规范 PDF / Word / 文本</button>
    <div class="wx-section-label">${state.standards.length}份规范</div><div class="wx-group">${state.standards.length ? state.standards.map(item => `
    <div class="wx-cell"><span class="menu-icon">§</span><span class="grow"><h3>${esc(item.name)}</h3><p>${item.clauses.length}条已识别条文</p></span></div>`).join("")
    : `<div class="wx-empty">导入规范后，整理问题时自动推荐条文</div>`}</div></main>`;
}

function settingsView() {
  return `<main class="page wx-page"><div class="wx-group">
    <div class="wx-cell text-cell"><span class="grow"><h3>本机存储</h3><p>检查记录、照片和资料库保存在本机</p></span></div>
    <div class="wx-cell text-cell"><span class="grow"><h3>安装到主屏幕</h3><p>用 Safari 打开网址，点“分享”→“添加到主屏幕”</p></span></div>
    <div class="wx-cell text-cell"><span class="grow"><h3>数据提醒</h3><p>不要清除 Safari 网站数据；正式使用前请定期导出通知书和月通报</p></span></div></div>
    <button class="wx-danger" data-action="clear-all">清除本机全部数据</button></main>`;
}

function inspectionDetailView() {
  const item = inspection();
  if (!item) return inspectionsView();
  const types = item.issues?.length ? item.issues.map(issue => issue.type) : item.records.map(record => guessType(record.remark));
  const qualityCount = types.filter(type => type === "质量").length;
  const safetyCount = types.filter(type => type === "安全").length;
  const otherCount = types.filter(type => type === "其他").length;
  const stats = `共${types.length}个问题 · 质量${qualityCount}个 · 安全${safetyCount}个${otherCount ? ` · 其他${otherCount}个` : ""}`;
  return `<main class="page wx-page">
    <div class="project-meta"><input id="inspection-date" type="date" value="${esc(item.date)}" aria-label="检查日期">
      <span>${stats}</span></div>
    <div class="wx-section-label">发现问题</div><div class="list compact-list">
      ${item.records.length ? item.records.map((record, index) => `
        <article class="wx-card issue-card">
          <div class="issue-top"><h3>问题 ${index + 1}</h3><button class="text-danger" data-delete-record="${record.id}">删除</button></div>
          ${record.photos?.[0] ? `<div class="single-photo"><img src="${record.photos[0]}" alt="问题${index + 1}现场照片">${record.photos.length > 1 ? `<span>共${record.photos.length}张</span>` : ""}</div>` : `<div class="single-photo empty-photo">暂无照片</div>`}
          <p>${esc(record.remark || "未填写备注")}</p>
        </article>`).join("") : `<div class="wx-empty">还没有记录问题</div>`}</div>
    <button class="wx-primary" data-action="add-record">＋ 添加问题</button>
    ${item.records.length ? `<button class="wx-secondary" data-action="auto-draft">自动整理并生成初稿</button>` : ""}
    ${item.issues?.length ? `<button class="wx-secondary" data-action="review-draft">查看已生成初稿</button>` : ""}
    <button class="wx-danger" data-action="delete-inspection">删除本次检查</button>
  </main>`;
}

function speechControl(targetId) {
  return `<button type="button" class="speech-btn" data-speech-target="${targetId}" aria-label="语音输入">语音</button>`;
}

function noticeCategoryOptions(issue) {
  const quality = ["主要岗位责任制落实及人员到位履职情况", "质量行为检查情况", "实体工程质量情况", "质量其他"];
  const safety = ["安全体系运行情况", "施工现场管理及安全隐患情况", "防洪度汛及应急预案情况", "安全其他"];
  const options = issue.type === "安全" ? safety : quality;
  const selected = issue.noticeCategory || classifyNoticeCategory(issue.type, `${issue.title}${issue.fact}`);
  return options.map(value => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function responsibilityPicker(item, issue) {
  const units = [
    ["建设单位", item.ownerUnit],
    ["施工单位", item.constructionUnit],
    ["监理单位", item.supervisionUnit],
    ["勘察设计单位", item.designUnit]
  ].filter(([, name]) => name);
  if (!units.length) {
    return `<input class="input" name="responsibility" value="${esc(issue.responsibility || "")}" placeholder="请填写责任单位">`;
  }
  const selected = new Set((issue.responsibility || "").split(/[、，,；;]/).map(value => value.trim()).filter(Boolean));
  return `<div class="responsibility-picker">${units.map(([role, name]) => `
    <label class="unit-option"><input type="checkbox" data-responsibility-option value="${esc(name)}" ${selected.has(name) ? "checked" : ""}>
      <span><b>${role}</b><small>${esc(name)}</small></span></label>`).join("")}</div>`;
}

function reviewView() {
  const item = inspection();
  if (!item) return inspectionsView();
  return `<main class="page wx-page">
    <div class="wx-warning">请核对问题等级、责任单位和规范条文</div>
    <form id="review-form" class="list">
      ${item.issues.map((issue, index) => `
        <article class="wx-card form" data-issue="${issue.id}">
          <div class="issue-top"><h3>问题 ${index + 1}</h3><span class="badge">${Math.round(issue.confidence * 100)}% 匹配</span></div>
          <div class="field"><label>问题标题</label><input class="input" name="title" value="${esc(issue.title)}"></div>
          <div class="row">
            <div class="field"><label>问题类型</label><select name="type">${["质量","安全","其他"].map(v => `<option ${v===issue.type?"selected":""}>${v}</option>`).join("")}</select></div>
            <div class="field"><label>问题等级</label><select name="level">${["一般","较重","严重"].map(v => `<option ${v===issue.level?"selected":""}>${v}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label>通知单归类</label><select name="noticeCategory">${noticeCategoryOptions(issue)}</select></div>
          <div class="field"><label>责任单位（可多选）</label>${responsibilityPicker(item, issue)}</div>
          <div class="field"><label>“经查”正式表述</label><div class="speech-field"><textarea id="fact-${issue.id}" name="fact">${esc(issue.fact)}</textarea>${speechControl(`fact-${issue.id}`)}</div></div>
          <div class="field"><label>推荐规范条文</label><textarea name="standard">${esc(issue.standard)}</textarea><p class="help">${issue.standardSource ? `匹配来源：${esc(issue.standardSource)}。` : ""}正式发布前须对照规范库原文核验。</p></div>
          <div class="field"><label>整改要求</label><textarea name="rectification">${esc(issue.rectification)}</textarea></div>
          <div class="photo-grid">${issue.photos.map(src => `<div class="photo-tile"><img src="${src}" alt="问题照片"></div>`).join("")}</div>
        </article>`).join("")}
      <button type="button" class="wx-primary" data-action="confirm-notice">生成现场整改通知单</button>
      <button type="button" class="wx-secondary" data-action="save-draft">保存问题初稿</button>
    </form>
  </main>`;
}

function noticeView() {
  const item = inspection();
  if (!item) return inspectionsView();
  const qualityCount = item.issues.filter(issue => issue.type === "质量").length;
  const safetyCount = item.issues.filter(issue => issue.type === "安全").length;
  return `<main class="page">
    <button class="btn small secondary" data-action="back-review">‹ 返回修改问题</button>
    <div class="eyebrow" style="margin-top:18px">现场打印签字</div><h1>生成整改通知单</h1>
    <p class="lead">按上传模板生成 Word：质量问题进入质量页，安全问题进入安全页，并保留各方现场签字栏。</p>
    <div class="grid">
      <article class="card stat"><span>质量问题</span><b>${qualityCount}</b><span>条进入质量通知书</span></article>
      <article class="card stat"><span>安全问题</span><b>${safetyCount}</b><span>条进入安全通知书</span></article>
    </div>
    <form id="notice-form" class="card form" style="margin-top:14px">
      <h2>工程及参建单位</h2>
      <div class="field"><label>项目名称</label><input class="input" name="projectName" value="${esc(item.projectName)}" required></div>
      <div class="field"><label>项目法人 / 建设单位</label><input class="input" name="ownerUnit" value="${esc(item.ownerUnit || "")}" placeholder="填写全称" required></div>
      <div class="field"><label>施工单位</label><input class="input" name="constructionUnit" value="${esc(item.constructionUnit || "")}" placeholder="填写全称" required></div>
      <div class="field"><label>监理单位</label><input class="input" name="supervisionUnit" value="${esc(item.supervisionUnit || "")}" placeholder="填写全称" required></div>
      <div class="field"><label>勘察设计单位</label><input class="input" name="designUnit" value="${esc(item.designUnit || "")}" placeholder="填写全称"></div>
      <div class="field"><label>工程基本情况（用于月通报）</label><textarea name="basicSituation" placeholder="填写建设内容、投资、合同工期、开工日期及本次检查时形象进度">${esc(item.basicSituation || "")}</textarea></div>
      <div class="divider"></div>
      <h2>监督意见</h2>
      <div class="row">
        <div class="field"><label>整改方式</label><select name="actionType"><option ${item.actionType !== "停工整改" ? "selected" : ""}>责令整改</option><option ${item.actionType === "停工整改" ? "selected" : ""}>停工整改</option></select></div>
        <div class="field"><label>整改期限</label><input class="input" type="date" name="deadline" value="${esc(item.deadline || "")}" required></div>
      </div>
      <div class="field"><label>上次整改落实情况</label><textarea name="previousRectification" placeholder="无上次问题可填写：无">${esc(item.previousRectification || "")}</textarea></div>
      <div class="notice-tip"><b>签字栏原样保留</b><span>监督人员、项目法人、监理、施工、勘察设计现场负责人打印后手写签字。</span></div>
      <button class="btn primary full" type="submit">⬇ 导出 Word 整改通知单</button>
      <button class="btn secondary full" type="button" data-view="inspections">完成本工程，返回检查列表</button>
    </form>
  </main>`;
}

function reportView() {
  const item = inspection(state.reportId || state.currentInspectionId);
  if (!item) return inspectionsView();
  return `<main class="page">
    <div class="report-actions"><button class="btn secondary" data-action="back-review">‹ 修改</button>
      <button class="btn" data-action="print-report">打印 / 存 PDF</button>
      <button class="btn primary" data-action="download-html">下载 HTML</button></div>
    ${reportMarkup(item)}
  </main>`;
}

function reportMarkup(item) {
  const typeCount = type => item.issues.filter(i => i.type === type).length;
  return `<article class="report" id="report">
    <div style="text-align:center">监督检查通报（初稿）</div>
    <h1>${esc(item.projectName)}检查通报</h1>
    <h2>一、检查基本情况</h2>
    <p>${esc(item.date)}，对${esc(item.projectName)}开展监督检查。本次共发现问题${item.issues.length}个，其中质量问题${typeCount("质量")}个、安全问题${typeCount("安全")}个、其他问题${typeCount("其他")}个。</p>
    <h2>二、检查发现问题</h2>
    <h3>（一）${esc(item.projectName)}</h3>
    ${item.issues.map((issue, index) => `
      <section>
        <p class="issue-title">${index + 1})${esc(issue.title)}。（${esc(issue.level)}问题）</p>
        <p class="responsibility">责任单位：${esc(issue.responsibility || "待确认")}</p>
        <p>${esc(issue.fact)}${issue.standard ? ` 不符合${esc(issue.standard)}。` : ""}</p>
        ${issue.photos.length ? `<div class="report-photos">${issue.photos.map(src => `<img src="${src}" alt="现场问题照片">`).join("")}</div>` : ""}
        <p class="responsibility">整改要求：${esc(issue.rectification)}</p>
      </section>`).join("")}
    <h2>三、整改要求</h2>
    <p>请有关责任单位对照本次检查发现的问题逐项整改，举一反三开展自查，并按要求报送整改情况。</p>
  </article>`;
}

function searchResultsMarkup(query = "") {
  const q = query.trim();
  if (!q) return `<div class="search-hint">可搜索工程、检查记录、历史问题和规范条文</div>`;
  const projects = state.projectLibrary.filter(item => `${item.name}${item.district}`.includes(q)).slice(0, 8);
  const checks = state.inspections.filter(item => `${item.projectName}${item.date}${item.records.map(r => r.remark).join("")}`.includes(q)).slice(0, 8);
  const issues = state.library.filter(item => `${item.title}${item.fact}${item.standard}`.includes(q)).slice(0, 8);
  const standards = state.standards.filter(item => `${item.name}${item.clauses.join("")}`.includes(q)).slice(0, 8);
  if (!projects.length && !checks.length && !issues.length && !standards.length) return `<div class="search-hint">没有找到“${esc(q)}”</div>`;
  return `${projects.map(item => `<button class="search-result" data-project-id="${item.id}"><b>工程</b><span>${esc(item.name)}</span><i>›</i></button>`).join("")}
    ${checks.map(item => `<button class="search-result" data-open-inspection="${item.id}"><b>检查</b><span>${esc(item.projectName)} · ${esc(item.date)}</span><i>›</i></button>`).join("")}
    ${issues.map(item => `<button class="search-result" data-view="library"><b>问题</b><span>${esc(item.title)}</span><i>›</i></button>`).join("")}
    ${standards.map(item => `<button class="search-result" data-view="standards"><b>规范</b><span>${esc(item.name)}</span><i>›</i></button>`).join("")}`;
}

function modalMarkup() {
  if (!state.modal) return "";
  if (state.modal === "search") {
    return `<div class="search-overlay"><div class="search-bar"><button class="search-back" data-action="close-modal">‹</button>
      <input id="global-search" type="search" placeholder="搜索" autofocus><button class="search-cancel" data-action="close-modal">取消</button></div>
      <div id="search-results" class="search-results">${searchResultsMarkup()}</div></div>`;
  }
  if (state.modal === "new") {
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><h2>选择工程</h2><span></span></div>
      <div class="wx-group project-picker">${state.projectLibrary.length ? state.projectLibrary.map(project => `
        <button class="wx-cell" data-select-project="${project.id}"><span class="wx-avatar">工</span><span class="grow"><h3>${esc(project.name)}</h3>
        <p>${esc(project.district || "未填写县市区")}</p></span><span class="chevron">›</span></button>`).join("")
        : `<div class="wx-empty">工程库为空</div>`}</div>
      <button class="wx-primary" data-action="new-project">＋ 新增工程</button></section></div>`;
  }
  if (state.modal === "project-form") {
    const project = state.projectLibrary.find(item => item.id === state.editingProjectId);
    const current = inspection();
    const editing = Boolean(project);
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><h2>${editing ? "修改工程资料" : "新增工程"}</h2><span></span></div>
      <form id="new-form" class="form">
        <input type="hidden" name="editingProjectId" value="${esc(project?.id || "")}">
        <div class="field"><label>工程名称 *</label><div class="speech-field"><input id="project-name" class="input" name="projectName" value="${esc(project?.name || "")}" required>${speechControl("project-name")}</div></div>
        <div class="row"><div class="field"><label>检查日期 *</label><input class="input" type="date" name="date" value="${esc(current?.date || today())}" required></div>
        <div class="field"><label>县市区</label><div class="speech-field"><input id="project-district" class="input" name="district" value="${esc(project?.district || "")}">${speechControl("project-district")}</div></div></div>
        <details><summary>参建单位信息</summary><div class="form details-form">
          <div class="field"><label>项目法人 / 建设单位</label><div class="speech-field"><input id="owner-unit" class="input" name="ownerUnit" value="${esc(project?.ownerUnit || "")}">${speechControl("owner-unit")}</div></div>
          <div class="field"><label>施工单位</label><div class="speech-field"><input id="construction-unit" class="input" name="constructionUnit" value="${esc(project?.constructionUnit || "")}">${speechControl("construction-unit")}</div></div>
          <div class="field"><label>监理单位</label><div class="speech-field"><input id="supervision-unit" class="input" name="supervisionUnit" value="${esc(project?.supervisionUnit || "")}">${speechControl("supervision-unit")}</div></div>
          <div class="field"><label>勘察设计单位</label><div class="speech-field"><input id="design-unit" class="input" name="designUnit" value="${esc(project?.designUnit || "")}">${speechControl("design-unit")}</div></div>
          <div class="field"><label>工程基本情况</label><div class="speech-field"><textarea id="basic-situation" name="basicSituation">${esc(project?.basicSituation || "")}</textarea>${speechControl("basic-situation")}</div></div>
        </div></details><button class="wx-primary" type="submit">${editing ? "保存修改" : "保存并开始检查"}</button>
      </form></section></div>`;
  }
  if (state.modal === "record") {
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><h2>添加问题</h2><span></span></div>
      <div class="form"><div class="camera-box"><input id="photo-input" type="file" accept="image/*" capture="environment" multiple>
        <div class="camera">📷</div><b>拍照或从相册选择</b></div>
        <div class="field"><label>简单备注</label><div class="speech-field"><textarea id="record-remark" placeholder="例如：溢洪道右侧临边没有防护栏"></textarea>${speechControl("record-remark")}</div></div>
        <div id="pending-photos" class="photo-grid"></div>
        <button class="wx-primary" data-action="save-record">保存并继续添加</button>
        <button class="wx-secondary" data-action="save-record-finish">保存并返回工程</button>
      </div></section></div>`;
  }
  if (state.modal === "standard") {
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><h2>导入规范</h2><span></span></div>
      <div class="form"><div class="dropzone"><input id="standard-file" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain">
        <div style="font-size:28px">§</div><b>选择规范 PDF、Word 或文本</b></div>
        <button class="wx-primary" data-action="extract-standard">识别条文</button><p class="help" id="standard-status">文件仅在本机处理。</p>
      </div></section></div>`;
  }
  if (state.modal === "import") {
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><h2>导入往期通报</h2><span></span></div>
      <div class="form">
        <div class="dropzone"><input id="history-file" type="file" accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
          <div style="font-size:30px">⇧</div><b>选择 Word 或文本文件</b><span>首版支持 .docx 和 .txt</span></div>
        <div class="field"><label>也可以直接粘贴通报文本</label><textarea id="history-text" style="min-height:180px" placeholder="粘贴包含问题标题、经查表述、规范条文和整改要求的内容"></textarea></div>
        <button class="btn full" data-action="extract-history">自动提取问题</button>
        <p class="help" id="import-status">文件仅在本机解析，不上传。</p>
      </div></section></div>`;
  }
  if (state.modal === "import-preview") {
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><div><h2>确认提取结果</h2><p class="help">共识别 ${state.importDraft.length} 条</p></div><span></span></div>
      <div class="list">${state.importDraft.map(item => `<article class="card issue-card"><h3>${esc(item.title)}</h3><p class="fact">${esc(item.fact)}</p><p class="help">${esc(item.standard || "未识别规范条文")}</p></article>`).join("")}</div>
      <button class="btn primary full" style="margin-top:14px" data-action="confirm-import">导入问题库</button>
    </section></div>`;
  }
  if (state.modal === "organizing") {
    return `<div class="modal"><section class="sheet"><div class="grabber"></div><div class="eyebrow">本机智能整理</div><h2 style="margin:8px 0 18px">正在匹配历史问题库…</h2>
      <div class="progress"><span style="width:78%"></span></div>
      <p class="help">生成问题标题、“经查”表述、分类、等级、规范候选与整改要求。</p></section></div>`;
  }
  if (state.modal === "monthly") {
    const year = Number(state.monthFilter.slice(0, 4));
    const month = Number(state.monthFilter.slice(5, 7));
    return `<div class="modal page-modal"><section class="sheet"><div class="sheet-head"><button class="page-back" data-action="close-modal">‹</button><div><h2>生成${year}年${month}月通报</h2></div><span></span></div>
      <form id="monthly-form" class="form">
        <div class="row">
          <div class="field"><label>通报期号 *</label><input class="input" name="issueNo" type="number" min="1" placeholder="例如：6" required></div>
          <div class="field"><label>落款日期 *</label><input class="input" name="reportDate" type="date" value="${today()}" required></div>
        </div>
        <div class="field"><label>发文号</label><input class="input" name="documentNo" placeholder="例如：娄水办函〔2026〕 号"></div>
        <div class="field"><label>本月检查说明</label><textarea name="intro" placeholder="如无特殊说明，App按工程数和问题数自动汇总"></textarea></div>
        <div class="field"><label>上期问题整改情况</label><textarea name="monthlyRectification" placeholder="请填写核实后的整改情况；留空则在通报中标记待补充"></textarea></div>
        <div class="row">
          <div class="field"><label>联系人</label><input class="input" name="contactName" placeholder="请填写"></div>
          <div class="field"><label>联系电话</label><input class="input" name="contactPhone" placeholder="请填写"></div>
        </div>
        <div class="field"><label>邮箱</label><input class="input" name="email" placeholder="请填写"></div>
        <button class="btn primary full" type="submit">生成并导出 Word 月通报</button>
      </form>
    </section></div>`;
  }
  return "";
}

function render() {
  let content;
  if (state.view === "home") content = homeView();
  if (state.view === "inspections") content = inspectionsView();
  if (state.view === "rectifications") content = rectificationsView();
  if (state.view === "monthly") content = monthlyView();
  if (state.view === "me") content = meView();
  if (state.view === "project-library") content = projectLibraryView();
  if (state.view === "library") content = libraryView();
  if (state.view === "standards") content = standardsView();
  if (state.view === "settings") content = settingsView();
  if (state.view === "inspection-detail") content = inspectionDetailView();
  if (state.view === "review") content = reviewView();
  if (state.view === "notice") content = noticeView();
  if (state.view === "report") content = reportView();
  const shellClass = state.view === "inspections" ? "shell feed-shell" : "shell light-shell";
  $("#app").innerHTML = `<div class="${shellClass}">${topbar()}${content}${nav()}</div>${modalMarkup()}`;
}

let pendingPhotos = [];
let activeRecognition = null;

function startSpeechInput(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    target.focus();
    toast("请点击 iPhone 键盘上的麦克风进行语音输入");
    return;
  }
  activeRecognition?.stop?.();
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;
  const original = target.value.trim();
  recognition.onstart = () => toast("请开始说话…");
  recognition.onresult = event => {
    const text = [...event.results].map(result => result[0].transcript).join("");
    target.value = original ? `${original}${/[，。；]$/.test(original) ? "" : "，"}${text}` : text;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };
  recognition.onerror = () => {
    target.focus();
    toast("未能启动语音识别，可使用 iPhone 键盘麦克风");
  };
  recognition.onend = () => { activeRecognition = null; };
  recognition.start();
}

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", .76);
}

function showPendingPhotos() {
  const target = $("#pending-photos");
  if (!target) return;
  target.innerHTML = pendingPhotos.map((src, index) => `<div class="photo-tile"><img src="${src}" alt="待保存照片"><button data-remove-pending="${index}">×</button></div>`).join("");
}

function guessTitle(text) {
  const rules = [
    [/临边|防护栏|洞口|高处/, "临边安全防护不到位"],
    [/用电|电线|配电|漏电|电缆/, "施工临时用电不规范"],
    [/脚手架|操作平台/, "脚手架及作业平台搭设不规范"],
    [/安全帽|安全带|防护用品/, "安全防护用品使用不规范"],
    [/钢筋|保护层|焊接/, "钢筋施工质量控制不到位"],
    [/混凝土|蜂窝|麻面|裂缝/, "混凝土外观质量存在缺陷"],
    [/资料|记录|签字|验收/, "施工质量管理资料不完善"],
    [/扬尘|垃圾|堆放|环境/, "施工现场文明施工管理不到位"]
  ];
  return rules.find(([regex]) => regex.test(text))?.[1] || `${text.replace(/[，。；;,.]/g, " ").trim().slice(0, 18) || "现场管理"}存在问题`;
}

function guessType(text) {
  if (/临边|防护|用电|电线|漏电|脚手架|安全帽|安全带|起重|基坑|消防|通道/.test(text)) return "安全";
  if (/混凝土|钢筋|模板|压实|渗漏|裂缝|强度|验收|质量|资料/.test(text)) return "质量";
  return "其他";
}

function guessLevel(text) {
  if (/坍塌|重大|严重|失稳|危及/.test(text)) return "严重";
  if (/高处|临边|漏电|起重|深基坑|脚手架|无防护/.test(text)) return "较重";
  return "一般";
}

function tokens(text) {
  const clean = text.replace(/\s+/g, "");
  const result = new Set();
  for (let i = 0; i < clean.length - 1; i++) result.add(clean.slice(i, i + 2));
  return result;
}

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  const intersection = [...A].filter(x => B.has(x)).length;
  return intersection / Math.max(1, A.size + B.size - intersection);
}

function bestHistory(remark) {
  return state.library.map(item => ({ item, score: Math.max(similarity(remark, item.title), similarity(remark, item.fact)) }))
    .sort((a, b) => b.score - a.score)[0];
}

function bestStandard(remark) {
  const keywords = remark.replace(/[，。；、：:（）()\s]/g, " ").split(/\s+/).filter(word => word.length >= 2);
  return state.standards.flatMap(standard => standard.clauses.map(clause => {
    const directHits = keywords.filter(word => clause.includes(word)).length;
    const clauseNo = clause.match(/(?:第\s*)?\d+(?:\.\d+){1,3}(?:\s*条)?|第[一二三四五六七八九十百]+条/)?.[0] || "";
    return { standard, clause, clauseNo, score: similarity(remark, clause) + directHits * .08 };
  })).sort((a, b) => b.score - a.score)[0];
}

function classifyNoticeCategory(type, text) {
  if (type === "安全") {
    if (/应急|预案|度汛|防汛|演练|物资/.test(text)) return "防洪度汛及应急预案情况";
    if (/体系|责任制|制度|人员|履职|到岗|安全费用/.test(text)) return "安全体系运行情况";
    if (/临边|用电|配电|脚手架|基坑|起重|通道|消防|防护|安全帽|隐患/.test(text)) return "施工现场管理及安全隐患情况";
    return "安全其他";
  }
  if (/履职|到岗|人员|责任制|项目经理|总监|质量责任/.test(text)) return "主要岗位责任制落实及人员到位履职情况";
  if (/资料|记录|签字|检测|试验|评定|验收|工序|报验/.test(text)) return "质量行为检查情况";
  if (/混凝土|钢筋|模板|裂缝|蜂窝|麻面|平整度|压实|渗漏|外观|实体|强度/.test(text)) return "实体工程质量情况";
  return "质量其他";
}

function formalFact(remark) {
  let text = remark.trim().replace(/[。；;，,\s]+$/, "");
  if (/^经查[，,]/.test(text)) return `${text}。`;
  return `经查，${text || "现场相关管理措施落实不到位"}。`;
}

function rectificationFor(type, title) {
  if (/临边|洞口/.test(title)) return "立即完善临边、洞口防护和安全警示措施，验收合格后方可继续相关作业。";
  if (/用电/.test(title)) return "立即规范施工临时用电，全面检查配电、漏电保护、接地及线路敷设情况。";
  if (type === "安全") return "立即消除现场安全隐患，完善防护和警示措施，并举一反三开展安全检查。";
  if (type === "质量") return "立即制定处理方案，完善质量控制和验收程序，整改完成后按规定复验。";
  return "立即落实整改，完善现场管理措施，并留存整改前后资料。";
}

function generateIssues(item) {
  return item.records.map(record => {
    const match = bestHistory(record.remark);
    const useMatch = match && match.score >= .12;
    const standardMatch = bestStandard(`${record.remark}${useMatch ? match.item.title : ""}`);
    const type = useMatch ? match.item.type : guessType(record.remark);
    const title = useMatch ? match.item.title : guessTitle(record.remark);
    const exactStandard = standardMatch?.score >= .12 && standardMatch.clauseNo;
    const standardText = exactStandard
      ? `《${standardMatch.standard.name}》${standardMatch.clause}`
      : useMatch && /(?:第\s*\d+(?:\.\d+)*\s*条|表\s*\d+)/.test(match.item.standard || "")
        ? match.item.standard
        : "规范库暂无可直接核验的具体条文";
    return {
      id: uid(),
      title,
      type,
      level: useMatch ? match.item.level : guessLevel(record.remark),
      responsibility: "",
      fact: useMatch && match.score > .34 ? adaptFact(match.item.fact, record.remark) : formalFact(record.remark),
      standard: standardText,
      standardSource: exactStandard ? standardMatch.standard.source : useMatch ? match.item.source : "",
      rectification: useMatch && match.item.rectification ? match.item.rectification : rectificationFor(type, title),
      photos: record.photos,
      confidence: useMatch ? Math.min(.96, .55 + match.score) : .42,
      noticeCategory: classifyNoticeCategory(type, `${title}${record.remark}`),
      sourceRecordId: record.id
    };
  });
}

function adaptFact(historyFact, remark) {
  const place = remark.match(/(?:在|位于)?([^，,。]{2,16}(?:左侧|右侧|上游|下游|进口|出口|部位|现场))/)?.[1];
  if (!place) return formalFact(remark);
  return historyFact.replace(/^经查[，,]/, `经查，${place}`).replace(/。。$/, "。");
}

function cleanTitle(line) {
  return line.replace(/^\s*(?:[（(]?\d+[）).、]|[一二三四五六七八九十]+、)\s*/, "")
    .replace(/[。（(](?:一般|较重|严重)(?:问题)?[）)]?[。.]?$/, "").trim();
}

function extractHistory(text, source = "粘贴文本") {
  const plain = text.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const found = [];
  lines.forEach((line, index) => {
    if (!/经查[，,]/.test(line)) return;
    const previous = [...lines.slice(Math.max(0, index - 3), index)].reverse();
    const titleLine = previous.find(x => !/^责任单位/.test(x) && !/检查发现问题|基本情况/.test(x)) || "历史问题";
    const responsibility = previous.find(x => /^责任单位/.test(x))?.replace(/^责任单位[：:]/, "").trim() || "";
    const standardMatch = line.match(/不符合(.+?)(?:。|$)/);
    const factPart = line.split(/不符合/)[0].trim();
    const next = lines.slice(index + 1, index + 4);
    const rectification = next.find(x => /整改|立即|完善|规范/.test(x) && !/^\d+[)）.]/.test(x)) || "";
    const title = cleanTitle(titleLine);
    const combined = `${title}${factPart}`;
    found.push({
      id: uid(), title: title || guessTitle(factPart), type: guessType(combined),
      level: /严重/.test(titleLine) ? "严重" : /较重/.test(titleLine) ? "较重" : "一般",
      responsibility, fact: /。$/.test(factPart) ? factPart : `${factPart}。`,
      standard: standardMatch?.[1]?.trim() || "", rectification, source
    });
  });
  if (!found.length) {
    lines.filter(line => line.length >= 8).slice(0, 50).forEach(line => found.push({
      id: uid(), title: guessTitle(line), type: guessType(line), level: guessLevel(line),
      responsibility: "", fact: formalFact(line), standard: "", rectification: "", source
    }));
  }
  return found;
}

function extractStandardClauses(text) {
  const lines = text.replace(/\r/g, "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  const clauses = [];
  let current = "";
  for (const line of lines) {
    if (/^(?:第[一二三四五六七八九十百\d.]+条|\d+(?:\.\d+){1,3})/.test(line)) {
      if (current) clauses.push(current);
      current = line;
    } else if (current && current.length < 900) {
      current += line;
    }
  }
  if (current) clauses.push(current);
  return clauses.slice(0, 2000);
}

async function extractDocx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 Word 文件");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === "word/document.xml") {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      let data = bytes.slice(start, start + compressedSize);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (method !== 0) throw new Error("暂不支持此 Word 压缩格式");
      const xml = new TextDecoder("utf-8").decode(data);
      return xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n").replace(/<\/w:tr>/g, "\n")
        .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Word 文件中未找到正文");
}

async function extractPdf(file) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
  const documentTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await documentTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }
  return pages.join("\n");
}

async function unzipAll(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("模板不是有效的 Word 文件");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Word 模板目录损坏");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    let data = bytes.slice(start, start + compressedSize);
    if (method === 8 && data.length) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (method !== 0) {
      throw new Error(`模板含暂不支持的压缩格式：${method}`);
    }
    files.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const [name, dataValue] of files) {
    const nameBytes = encoder.encode(name);
    const data = dataValue instanceof Uint8Array ? dataValue : encoder.encode(dataValue);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    localOffset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.size, true);
  ev.setUint16(10, files.size, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localOffset, true);
  const result = new Uint8Array(localOffset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

function directChildren(node, localName) {
  return [...node.children].filter(child => child.localName === localName);
}

function replaceCellLines(xml, cell, lines, options = {}) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = directChildren(cell, "p");
  const templateParagraph = paragraphs[0];
  const templateRun = templateParagraph?.getElementsByTagNameNS(W, "r")[0];
  paragraphs.forEach(p => p.remove());
  (lines.length ? lines : [""]).forEach(line => {
    const paragraph = templateParagraph ? templateParagraph.cloneNode(true) : xml.createElementNS(W, "w:p");
    [...paragraph.children].filter(child => child.localName !== "pPr").forEach(child => child.remove());
    const run = templateRun ? templateRun.cloneNode(true) : xml.createElementNS(W, "w:r");
    [...run.children].filter(child => child.localName !== "rPr").forEach(child => child.remove());
    if (options.kaitiFive) {
      let rPr = directChildren(run, "rPr")[0];
      if (!rPr) {
        rPr = xml.createElementNS(W, "w:rPr");
        run.insertBefore(rPr, run.firstChild);
      }
      let fonts = rPr.getElementsByTagNameNS(W, "rFonts")[0];
      if (!fonts) { fonts = xml.createElementNS(W, "w:rFonts"); rPr.appendChild(fonts); }
      ["ascii", "hAnsi", "eastAsia", "cs"].forEach(name => fonts.setAttributeNS(W, `w:${name}`, "楷体"));
      ["sz", "szCs"].forEach(name => {
        let size = rPr.getElementsByTagNameNS(W, name)[0];
        if (!size) { size = xml.createElementNS(W, `w:${name}`); rPr.appendChild(size); }
        size.setAttributeNS(W, "w:val", "21");
      });
    }
    const text = xml.createElementNS(W, "w:t");
    text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    text.textContent = line;
    run.appendChild(text);
    paragraph.appendChild(run);
    cell.appendChild(paragraph);
  });
}

function issueLine(issue, index) {
  const fact = issue.fact.replace(/^经查[，,]/, "").replace(/。$/, "");
  return `${index + 1}.${issue.title}：${fact}。`;
}

async function buildRectificationDocx(item) {
  const response = await fetch("./assets/水利工程质量安全监督整改通知书模板.docx");
  if (!response.ok) throw new Error("未找到整改通知书模板");
  const files = await unzipAll(await response.arrayBuffer());
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  const parser = new DOMParser();
  const xml = parser.parseFromString(decoder.decode(files.get("word/document.xml")), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("无法读取 Word 模板正文");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const tables = [...xml.getElementsByTagNameNS(W, "tbl")];
  const tableCell = (tableIndex, rowIndex, cellIndex) => {
    const rows = directChildren(tables[tableIndex], "tr");
    return directChildren(rows[rowIndex], "tc")[cellIndex];
  };
  const setCell = (t, r, c, value, options = {}) => replaceCellLines(xml, tableCell(t, r, c), Array.isArray(value) ? value : [value || ""], options);
  const identity = tableIndex => {
    setCell(tableIndex, 0, 1, item.projectName);
    setCell(tableIndex, 1, 1, item.ownerUnit);
    setCell(tableIndex, 1, 3, item.designUnit || "");
    setCell(tableIndex, 2, 1, item.constructionUnit);
    setCell(tableIndex, 2, 3, item.supervisionUnit);
    setCell(tableIndex, 11, 1, ["（五）上次提出的整改意见及要求落实情况", item.previousRectification || "无"]);
    const deadline = item.deadline.split("-");
    const checked = item.actionType === "停工整改"
      ? "（□责令整改、☑停工整改）" : "（☑责令整改、□停工整改）";
    setCell(tableIndex, 12, 1, `（六）项目法人应对本次检查发现的质量安全问题立即组织整改${checked}，限于${deadline[0]}年${Number(deadline[1])}月${Number(deadline[2])}日前整改完毕，整改结果报娄底市水利工程质量安全监督事务中心审核。`);
  };
  identity(0); identity(1);

  const quality = item.issues.filter(issue => issue.type === "质量");
  const safety = item.issues.filter(issue => issue.type === "安全");
  const others = item.issues.filter(issue => issue.type === "其他");
  const linesFor = (issues, category) => issues
    .filter(issue => (issue.noticeCategory || classifyNoticeCategory(issue.type, `${issue.title}${issue.fact}`)) === category)
    .map(issue => issueLine(issue, item.issues.indexOf(issue)));
  const kaitiFive = { kaitiFive: true };
  setCell(0, 4, 1, linesFor(quality, "主要岗位责任制落实及人员到位履职情况"), kaitiFive);
  setCell(0, 6, 1, linesFor(quality, "质量行为检查情况"), kaitiFive);
  setCell(0, 8, 1, linesFor(quality, "实体工程质量情况"), kaitiFive);
  setCell(0, 10, 1, [...linesFor(quality, "质量其他"), ...others.map(issue => issueLine(issue, item.issues.indexOf(issue)))], kaitiFive);

  setCell(1, 4, 1, linesFor(safety, "安全体系运行情况"), kaitiFive);
  setCell(1, 6, 1, linesFor(safety, "施工现场管理及安全隐患情况"), kaitiFive);
  setCell(1, 8, 1, linesFor(safety, "防洪度汛及应急预案情况"), kaitiFive);
  setCell(1, 10, 1, linesFor(safety, "安全其他"), kaitiFive);

  const body = xml.getElementsByTagNameNS(W, "body")[0];
  if (!quality.length && !others.length) {
    const firstTable = tables[0];
    const previous = [];
    let paragraphCount = 0;
    let cursor = firstTable.previousElementSibling;
    while (cursor && paragraphCount < 2) {
      previous.push(cursor);
      if (cursor.localName === "p") paragraphCount++;
      cursor = cursor.previousElementSibling;
    }
    previous.forEach(node => node.remove());
    firstTable.remove();
  } else if (!safety.length) {
    const secondTable = tables[1];
    const previous = [];
    let paragraphCount = 0;
    let cursor = secondTable.previousElementSibling;
    while (cursor && paragraphCount < 2) {
      previous.push(cursor);
      if (cursor.localName === "p") paragraphCount++;
      cursor = cursor.previousElementSibling;
    }
    previous.forEach(node => node.remove());
    secondTable.remove();
  }
  files.set("word/document.xml", encoder.encode(new XMLSerializer().serializeToString(xml)));
  return zipStored(files);
}

function replaceParagraphText(xml, paragraph, value) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const templateRun = paragraph.getElementsByTagNameNS(W, "r")[0];
  [...paragraph.children].filter(child => child.localName !== "pPr").forEach(child => child.remove());
  const run = templateRun ? templateRun.cloneNode(true) : xml.createElementNS(W, "w:r");
  [...run.children].filter(child => child.localName !== "rPr").forEach(child => child.remove());
  const text = xml.createElementNS(W, "w:t");
  text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  text.textContent = value;
  run.appendChild(text);
  paragraph.appendChild(run);
  const paragraphProps = directChildren(paragraph, "pPr")[0];
  paragraphProps?.getElementsByTagNameNS(W, "sectPr")[0]?.remove();
  return paragraph;
}

function nodeText(node, W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main") {
  return [...node.getElementsByTagNameNS(W, "t")].map(item => item.textContent).join("");
}

function chineseNumber(number) {
  const values = ["零","一","二","三","四","五","六","七","八","九","十"];
  if (number <= 10) return values[number];
  if (number < 20) return `十${values[number - 10]}`;
  return String(number);
}

function decodeDataUrl(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function removeMerge(cell, W) {
  const tcPr = directChildren(cell, "tcPr")[0];
  tcPr?.getElementsByTagNameNS(W, "vMerge")[0]?.remove();
}

function setMerge(xml, cell, value) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const tcPr = directChildren(cell, "tcPr")[0];
  let merge = tcPr?.getElementsByTagNameNS(W, "vMerge")[0];
  if (!merge && tcPr) {
    merge = xml.createElementNS(W, "w:vMerge");
    tcPr.appendChild(merge);
  }
  if (merge) {
    if (value) merge.setAttributeNS(W, "w:val", value);
    else merge.removeAttributeNS(W, "val");
  }
}

function unitNature(unit, item) {
  if (unit === item.constructionUnit) return "施工单位";
  if (unit === item.supervisionUnit) return "监理单位";
  if (unit === item.ownerUnit) return "建设单位";
  if (unit === item.designUnit) return "勘察设计单位";
  return "责任单位";
}

async function buildMonthlyDocx(items, meta) {
  const response = await fetch("./assets/监督检查月通报模板_2026年第5期.docx");
  if (!response.ok) throw new Error("未找到月通报模板");
  const files = await unzipAll(await response.arrayBuffer());
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  const xml = parser.parseFromString(decoder.decode(files.get("word/document.xml")), "application/xml");
  const rels = parser.parseFromString(decoder.decode(files.get("word/_rels/document.xml.rels")), "application/xml");
  if (xml.querySelector("parsererror") || rels.querySelector("parsererror")) throw new Error("无法读取月通报模板");
  const body = xml.getElementsByTagNameNS(W, "body")[0];
  const original = [...body.children];
  const findParagraph = prefix => original.find(node => node.localName === "p" && nodeText(node, W).startsWith(prefix));
  const openingEnd = original.indexOf(findParagraph("二、检查项目基本情况"));
  const closingStart = original.indexOf(findParagraph("三、标后关键人员履约情况"));
  const attachmentLabel = original.find(node => node.localName === "p" && nodeText(node, W).trim() === "附件1");
  const attachmentIndex = original.indexOf(attachmentLabel);
  const attachmentTable = original.slice(attachmentIndex + 1).find(node => node.localName === "tbl");
  const photoTableTemplate = original.find(node => node.localName === "tbl" && node.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip").length);
  const sectPr = original.find(node => node.localName === "sectPr").cloneNode(true);
  const paragraphTemplate = {
    district: findParagraph("（一）双峰县"),
    project: findParagraph("1．双峰县金子冲水库新建工程"),
    basic: findParagraph("（1）基本情况"),
    issueHead: findParagraph("（2）检查发现问题"),
    issueTitle: findParagraph("1)单元工程质量验收资料填写不规范"),
    responsibility: findParagraph("责任单位：河南省旭创"),
    fact: findParagraph("经查，单元工程施工质量"),
    blank: original.find((node, index) => index > openingEnd && node.localName === "p" && !nodeText(node, W))
  };
  if (Object.values(paragraphTemplate).some(value => !value) || !attachmentTable || !photoTableTemplate) {
    throw new Error("月通报模板结构与预期不一致");
  }

  const opening = original.slice(0, openingEnd + 1).map(node => node.cloneNode(true));
  const closing = original.slice(closingStart, attachmentIndex).filter(node => node.localName === "p").map(node => node.cloneNode(true));
  while (body.firstChild) body.removeChild(body.firstChild);
  opening.forEach(node => body.appendChild(node));

  const year = Number(meta.month.slice(0, 4));
  const month = Number(meta.month.slice(5, 7));
  const allIssues = items.flatMap(item => item.issues);
  const projectNames = items.map(item => item.projectName);
  const countType = type => allIssues.filter(issue => issue.type === type).length;
  const openingParagraphs = directChildren(body, "p");
  const setOpening = (prefix, value) => {
    const paragraph = openingParagraphs.find(node => nodeText(node, W).startsWith(prefix));
    if (paragraph) replaceParagraphText(xml, paragraph, value);
  };
  setOpening("娄水办函", meta.documentNo || `娄水办函〔${year}〕 号`);
  setOpening("（2026年第5期）", `（${year}年第${meta.issueNo}期）`);
  const intro = meta.intro || `为进一步加强我市水利建设项目质量安全监管，推动水利建设高质量发展，${year}年${month}月，我局有关科室和质安中心对全市部分在建水利工程质量、安全等进行了监督检查，现将检查情况通报如下：`;
  const salutationIndex = openingParagraphs.findIndex(node => nodeText(node, W).startsWith("各县市区水利局"));
  if (salutationIndex >= 0 && openingParagraphs[salutationIndex + 1]) replaceParagraphText(xml, openingParagraphs[salutationIndex + 1], intro);
  setOpening("检查组检查了", `检查组检查了${projectNames.join("、")}。本月共检查项目${items.length}个，下发检查整改通知书${items.length}份，发现安全问题${countType("安全")}个、质量问题${countType("质量")}个、其他问题${countType("其他")}个。`);

  const orderWeight = district => {
    if (district === "冷水江市") return 800;
    if (district === "新化县") return 900;
    return 100;
  };
  const districts = [...new Set(items.map(item => item.district || "未填写县市区"))]
    .sort((a, b) => orderWeight(a) - orderWeight(b) || a.localeCompare(b, "zh-CN"));
  let imageCounter = 10;
  let relationshipCounter = 100;
  const relationshipRoot = rels.documentElement;

  function addPhotoTable(photos) {
    for (let start = 0; start < photos.length; start += 4) {
      const chunk = photos.slice(start, start + 4);
      const table = photoTableTemplate.cloneNode(true);
      const rows = directChildren(table, "tr");
      if (chunk.length <= 2 && rows[1]) rows[1].remove();
      const blips = [...table.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")];
      blips.forEach((blip, index) => {
        let drawing = blip;
        while (drawing && drawing.localName !== "drawing") drawing = drawing.parentNode;
        if (!chunk[index]) {
          if (drawing) drawing.remove();
          return;
        }
        const imageName = `app_photo_${imageCounter++}.jpeg`;
        const relId = `rIdApp${relationshipCounter++}`;
        files.set(`word/media/${imageName}`, decodeDataUrl(chunk[index]));
        const relationship = rels.createElementNS(PKG, "Relationship");
        relationship.setAttribute("Id", relId);
        relationship.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
        relationship.setAttribute("Target", `media/${imageName}`);
        relationshipRoot.appendChild(relationship);
        blip.setAttributeNS(R, "r:embed", relId);
      });
      body.appendChild(table);
    }
  }

  districts.forEach((district, districtIndex) => {
    const districtParagraph = paragraphTemplate.district.cloneNode(true);
    replaceParagraphText(xml, districtParagraph, `（${chineseNumber(districtIndex + 1)}）${district}`);
    body.appendChild(districtParagraph);
    items.filter(item => (item.district || "未填写县市区") === district).forEach((item, projectIndex) => {
      const project = paragraphTemplate.project.cloneNode(true);
      replaceParagraphText(xml, project, `${projectIndex + 1}．${item.projectName}`);
      body.appendChild(project);
      const basic = paragraphTemplate.basic.cloneNode(true);
      const situation = item.basicSituation || "待补充工程建设内容、投资、工期、开工日期及本次检查时形象进度。";
      replaceParagraphText(xml, basic, `（1）基本情况：${situation.replace(/^（1）基本情况[：:]?/, "")}`);
      body.appendChild(basic);
      const issueHead = paragraphTemplate.issueHead.cloneNode(true);
      replaceParagraphText(xml, issueHead, "（2）检查发现问题：");
      body.appendChild(issueHead);
      item.issues.forEach((issue, issueIndex) => {
        const title = paragraphTemplate.issueTitle.cloneNode(true);
        replaceParagraphText(xml, title, `${issueIndex + 1})${issue.title}。（${issue.level}）`);
        body.appendChild(title);
        const responsibility = paragraphTemplate.responsibility.cloneNode(true);
        replaceParagraphText(xml, responsibility, `责任单位：${issue.responsibility || "待确认"}`);
        body.appendChild(responsibility);
        const fact = paragraphTemplate.fact.cloneNode(true);
        const citation = issue.standard ? `不符合${issue.standard.replace(/^不符合/, "")}。` : "规范条文待核验。";
        replaceParagraphText(xml, fact, `${issue.fact.replace(/。$/, "")}。${citation}`);
        body.appendChild(fact);
        if (issue.photos?.length) addPhotoTable(issue.photos);
        body.appendChild(paragraphTemplate.blank.cloneNode(true));
      });
    });
  });

  closing.forEach(node => {
    const text = nodeText(node, W);
    if (text.startsWith("检查当日，")) {
      const personnel = allIssues.filter(issue => /关键人员|履职|到岗/.test(issue.title + issue.fact));
      replaceParagraphText(xml, node, personnel.length ? personnel.map(issue => issue.fact).join("") : "本月检查未发现需要单列通报的标后关键人员履约问题。");
    }
    if (text.startsWith("截至2026年")) replaceParagraphText(xml, node, meta.monthlyRectification || "上期检查发现问题整改情况待核实补充。");
    if (text.startsWith("联系人：")) replaceParagraphText(xml, node, `联系人：${meta.contactName || ""}，电话：${meta.contactPhone || ""}；`);
    if (text.startsWith("邮")) replaceParagraphText(xml, node, `邮  箱：${meta.email || ""}。`);
    if (/^2026年7月2日/.test(text)) {
      const [y, m, d] = meta.reportDate.split("-");
      replaceParagraphText(xml, node, `${y}年${Number(m)}月${Number(d)}日`);
    }
    body.appendChild(node);
  });

  const label = attachmentLabel.cloneNode(true);
  body.appendChild(label);
  const table = attachmentTable.cloneNode(true);
  const rows = directChildren(table, "tr");
  const titleRow = rows[0].cloneNode(true);
  const headerRow = rows[1].cloneNode(true);
  const dataTemplate = rows[2].cloneNode(true);
  rows.forEach(row => row.remove());
  table.appendChild(titleRow);
  table.appendChild(headerRow);
  let issueNumber = 1;
  items.forEach(item => {
    item.issues.forEach(issue => {
      const units = (issue.responsibility || "").split(/[、，,；;]/).map(x => x.trim()).filter(Boolean);
      const responsibilityUnits = units.length ? units : ["待确认"];
      responsibilityUnits.forEach((unit, unitIndex) => {
        const row = dataTemplate.cloneNode(true);
        const cells = directChildren(row, "tc");
        cells.forEach(cell => removeMerge(cell, W));
        replaceCellLines(xml, cells[0], [String(issueNumber)]);
        replaceCellLines(xml, cells[1], [item.projectName]);
        replaceCellLines(xml, cells[2], [unit]);
        replaceCellLines(xml, cells[3], [unitNature(unit, item)]);
        replaceCellLines(xml, cells[4], [issue.title + "。"]);
        replaceCellLines(xml, cells[5], [issue.level]);
        replaceCellLines(xml, cells[6], [issue.type]);
        if (responsibilityUnits.length > 1) {
          setMerge(xml, cells[0], unitIndex === 0 ? "restart" : "");
          setMerge(xml, cells[1], unitIndex === 0 ? "restart" : "");
          setMerge(xml, cells[4], unitIndex === 0 ? "restart" : "");
          setMerge(xml, cells[5], unitIndex === 0 ? "restart" : "");
          setMerge(xml, cells[6], unitIndex === 0 ? "restart" : "");
          if (unitIndex > 0) {
            [0,1,4,5,6].forEach(index => replaceCellLines(xml, cells[index], [""]));
          }
        }
        table.appendChild(row);
      });
      issueNumber++;
    });
  });
  body.appendChild(table);
  body.appendChild(sectPr);
  files.set("word/document.xml", encoder.encode(serializer.serializeToString(xml)));
  files.set("word/_rels/document.xml.rels", encoder.encode(serializer.serializeToString(rels)));
  return zipStored(files);
}

function saveReviewEdits() {
  const item = inspection();
  $$("[data-issue]").forEach(card => {
    const issue = item.issues.find(x => x.id === card.dataset.issue);
    ["title","type","level","noticeCategory","fact","standard","rectification"].forEach(key => {
      issue[key] = card.querySelector(`[name="${key}"]`).value.trim();
    });
    const options = $$("[data-responsibility-option]:checked", card);
    issue.responsibility = options.length
      ? options.map(option => option.value).join("、")
      : card.querySelector('[name="responsibility"]')?.value.trim() || "";
  });
  return item;
}

async function startInspectionFromProject(project, date = today()) {
  const existing = state.inspections.find(item => item.date === date && item.projectName === project.name);
  if (existing) {
    state.currentInspectionId = existing.id;
  } else {
    const item = {
      id: uid(), projectId: project.id, projectName: project.name, date, district: project.district || "",
      ownerUnit: project.ownerUnit || "", constructionUnit: project.constructionUnit || "",
      supervisionUnit: project.supervisionUnit || "", designUnit: project.designUnit || "",
      basicSituation: project.basicSituation || "", records: [], issues: [], status: "现场记录",
      createdAt: new Date().toISOString()
    };
    state.inspections.push(item);
    state.currentInspectionId = item.id;
  }
  state.modal = null;
  state.view = "inspection-detail";
  await save();
  render();
}

async function handleAction(action) {
  if (action === "open-search") { state.modal = "search"; render(); setTimeout(() => $("#global-search")?.focus(), 0); }
  if (action === "new-inspection") { state.modal = "new"; render(); }
  if (action === "new-project") { state.editingProjectId = null; state.modal = "project-form"; render(); }
  if (action === "edit-project") {
    const item = inspection();
    state.editingProjectId = item?.projectId || state.projectLibrary.find(project => project.name === item?.projectName)?.id || null;
    state.modal = "project-form";
    render();
  }
  if (action === "add-record") { pendingPhotos = []; state.modal = "record"; render(); }
  if (action === "close-modal") { state.modal = null; state.editingProjectId = null; render(); }
  if (action === "import-history") { state.modal = "import"; render(); }
  if (action === "import-standard") { state.modal = "standard"; render(); }
  if (action === "back-detail") { state.view = "inspection-detail"; render(); }
  if (action === "back-review") { state.view = "review"; render(); }
  if (action === "print-report") window.print();
  if (action === "delete-inspection") {
    const item = inspection();
    if (!item || !confirm(`确定删除“${item.projectName}”这次检查记录？`)) return;
    state.inspections = state.inspections.filter(record => record.id !== item.id);
    state.currentInspectionId = null;
    await save();
    setView("inspections");
    return;
  }
  if (action === "save-record" || action === "save-record-finish") {
    const remark = $("#record-remark")?.value.trim();
    if (!remark) return toast("请写一句简单备注");
    inspection().records.push({ id: uid(), remark, photos: pendingPhotos, createdAt: new Date().toISOString() });
    inspection().status = "待整理";
    pendingPhotos = [];
    await save();
    if (action === "save-record") {
      state.modal = "record";
      render();
      toast("已保存，可继续添加下一条");
    } else {
      state.modal = null;
      render();
      toast("问题已保存");
    }
  }
  if (action === "auto-draft") {
    state.modal = "organizing"; render();
    setTimeout(async () => {
      const item = inspection();
      item.issues = generateIssues(item);
      item.status = "待确认";
      await save();
      state.modal = null; state.view = "review"; render();
    }, 750);
  }
  if (action === "review-draft") { state.view = "review"; render(); }
  if (action === "confirm-notice") {
    const item = saveReviewEdits();
    item.status = "待出通知单";
    await save();
    state.view = "notice";
    render();
    scrollTo(0, 0);
  }
  if (action === "save-draft") {
    const item = saveReviewEdits();
    item.status = "已确认";
    await save();
    state.view = "inspections";
    render();
    toast("问题初稿已保存，可在月通报中汇总");
  }
  if (action === "prepare-monthly") {
    state.modal = "monthly";
    render();
  }
  if (action === "confirm-draft") {
    const item = saveReviewEdits();
    item.status = "已生成"; await save(); state.reportId = item.id; state.view = "report"; render(); scrollTo(0, 0);
  }
  if (action === "download-html") {
    const item = inspection(state.reportId);
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(item.projectName)}检查通报</title><style>${await fetch("./styles.css").then(r=>r.text())}</style><body>${reportMarkup(item)}</body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    link.download = `${item.projectName}_${item.date}_检查通报.html`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (action === "extract-history") {
    const status = $("#import-status");
    try {
      let text = $("#history-text").value.trim();
      const file = $("#history-file").files[0];
      if (file) {
        status.textContent = "正在本机读取文件…";
        text = file.name.toLowerCase().endsWith(".docx") ? await extractDocx(file) : await file.text();
      }
      if (!text) return toast("请选择文件或粘贴通报文本");
      state.importDraft = extractHistory(text, file?.name || "粘贴文本");
      state.modal = "import-preview"; render();
    } catch (error) { status.textContent = `读取失败：${error.message}`; }
  }
  if (action === "confirm-import") {
    state.library = [...state.importDraft, ...state.library];
    await save(); state.importDraft = []; state.modal = null; render(); toast("历史问题已加入问题库");
  }
  if (action === "extract-standard") {
    const status = $("#standard-status");
    const file = $("#standard-file")?.files[0];
    if (!file) return toast("请选择规范文件");
    try {
      status.textContent = "正在识别条文…";
      const lowerName = file.name.toLowerCase();
      const text = lowerName.endsWith(".pdf") ? await extractPdf(file)
        : lowerName.endsWith(".docx") ? await extractDocx(file) : await file.text();
      const clauses = extractStandardClauses(text);
      state.standards.unshift({ id: uid(), name: file.name.replace(/\.(pdf|docx|txt)$/i, ""), clauses, source: file.name });
      await save();
      state.modal = null;
      state.view = "standards";
      render();
      toast(`已识别${clauses.length}条条文`);
    } catch (error) {
      status.textContent = `识别失败：${error.message}`;
    }
  }
  if (action === "clear-library") {
    if (!confirm("清除所有导入的问题，保留内置示例？")) return;
    state.library = demoLibrary; await save(); render();
  }
  if (action === "clear-all") {
    if (!confirm("确定清除本机全部检查记录和历史问题库？")) return;
    state.projects = []; state.projectLibrary = []; state.inspections = []; state.library = demoLibrary; state.standards = [];
    await save(); setView("inspections");
  }
}

document.addEventListener("click", async event => {
  const speechTarget = event.target.closest("[data-speech-target]")?.dataset.speechTarget;
  if (speechTarget) return startSpeechInput(speechTarget);
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) return setView(view);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action) return handleAction(action);
  const openId = event.target.closest("[data-open-inspection]")?.dataset.openInspection;
  if (openId) { state.currentInspectionId = openId; state.view = "inspection-detail"; pendingPhotos = []; render(); }
  const selectProjectId = event.target.closest("[data-select-project]")?.dataset.selectProject;
  if (selectProjectId) {
    const project = state.projectLibrary.find(item => item.id === selectProjectId);
    if (project) await startInspectionFromProject(project);
  }
  const projectId = event.target.closest("[data-project-id]")?.dataset.projectId;
  if (projectId) {
    const project = state.projectLibrary.find(item => item.id === projectId);
    if (project) await startInspectionFromProject(project);
  }
  const deleteId = event.target.closest("[data-delete-record]")?.dataset.deleteRecord;
  if (deleteId && confirm("删除这条现场记录？")) {
    const item = inspection(); item.records = item.records.filter(r => r.id !== deleteId); item.issues = [];
    await save(); render();
  }
  const removeIndex = event.target.closest("[data-remove-pending]")?.dataset.removePending;
  if (removeIndex !== undefined) { pendingPhotos.splice(Number(removeIndex), 1); showPendingPhotos(); }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "monthly-form") {
    const data = Object.fromEntries(new FormData(event.target));
    const items = state.inspections.filter(item => item.date?.startsWith(state.monthFilter) && item.issues?.length);
    try {
      toast("正在汇总工程、问题、照片和附件1…");
      state.modal = "organizing";
      render();
      const bytes = await buildMonthlyDocx(items, { ...data, month: state.monthFilter });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      link.download = `水利工程建设项目检查通报（${state.monthFilter.slice(0,4)}年第${data.issueNo}期）自动汇总版.docx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1800);
      state.modal = null;
      state.monthlyLastGenerated = { ...data, month: state.monthFilter, generatedAt: new Date().toISOString() };
      await save();
      render();
      toast("Word 月通报已导出");
    } catch (error) {
      console.error(error);
      state.modal = null;
      render();
      toast(`月通报生成失败：${error.message}`);
    }
    return;
  }
  if (event.target.id === "notice-form") {
    const item = inspection();
    const data = Object.fromEntries(new FormData(event.target));
    ["projectName","ownerUnit","constructionUnit","supervisionUnit","designUnit","basicSituation","actionType","deadline","previousRectification"].forEach(key => item[key] = data[key]?.trim() || "");
    const project = state.projectLibrary.find(project => project.id === item.projectId || project.name === item.projectName);
    if (project) {
      project.name = item.projectName;
      ["ownerUnit","constructionUnit","supervisionUnit","designUnit","basicSituation","district"].forEach(key => project[key] = item[key] || project[key] || "");
    }
    try {
      toast("正在生成 Word 整改通知单…");
      const bytes = await buildRectificationDocx(item);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      link.download = `${item.projectName}_${item.date}_质量安全监督整改通知书.docx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
      item.status = "已出通知单";
      item.noticeGeneratedAt = new Date().toISOString();
      await save();
      render();
      toast("Word 整改通知单已导出");
    } catch (error) {
      console.error(error);
      toast(`导出失败：${error.message}`);
    }
    return;
  }
  if (event.target.id !== "new-form") return;
  const data = Object.fromEntries(new FormData(event.target));
  if (data.editingProjectId) {
    const project = state.projectLibrary.find(item => item.id === data.editingProjectId);
    if (!project) return toast("未找到工程资料");
    const oldName = project.name;
    Object.assign(project, {
      name: data.projectName.trim(), district: data.district.trim(),
      ownerUnit: data.ownerUnit?.trim() || "", constructionUnit: data.constructionUnit?.trim() || "",
      supervisionUnit: data.supervisionUnit?.trim() || "", designUnit: data.designUnit?.trim() || "",
      basicSituation: data.basicSituation?.trim() || ""
    });
    state.inspections.filter(item => item.projectId === project.id || item.projectName === oldName).forEach(item => {
      item.projectId = project.id;
      item.projectName = project.name;
      item.district = project.district;
      ["ownerUnit","constructionUnit","supervisionUnit","designUnit","basicSituation"].forEach(key => item[key] = project[key]);
      if (item.id === state.currentInspectionId) item.date = data.date;
    });
    state.projects = [...new Set(state.projects.map(name => name === oldName ? project.name : name))];
    state.editingProjectId = null;
    state.modal = null;
    await save();
    render();
    toast("工程资料已修改");
    return;
  }
  const project = {
    id: uid(), name: data.projectName.trim(), district: data.district.trim(),
    ownerUnit: data.ownerUnit?.trim() || "", constructionUnit: data.constructionUnit?.trim() || "",
    supervisionUnit: data.supervisionUnit?.trim() || "", designUnit: data.designUnit?.trim() || "",
    basicSituation: data.basicSituation?.trim() || ""
  };
  const existingProject = state.projectLibrary.find(item => item.name === project.name);
  const savedProject = existingProject || project;
  if (!existingProject) state.projectLibrary.push(project);
  if (!state.projects.includes(project.name)) state.projects.push(project.name);
  await startInspectionFromProject(savedProject, data.date);
});

document.addEventListener("change", async event => {
  if (event.target.id === "inspection-date") {
    const item = inspection();
    item.date = event.target.value;
    await save();
    toast("检查日期已修改");
    return;
  }
  if (event.target.id === "month-filter") {
    state.monthFilter = event.target.value;
    render();
    return;
  }
  if (event.target.id !== "photo-input") return;
  toast("正在处理照片…");
  for (const file of [...event.target.files]) pendingPhotos.push(await resizeImage(file));
  showPendingPhotos(); toast(`已选择 ${pendingPhotos.length} 张照片`);
});

document.addEventListener("input", event => {
  if (event.target.id !== "global-search") return;
  const results = $("#search-results");
  if (results) results.innerHTML = searchResultsMarkup(event.target.value);
});

(async function init() {
  const persisted = await db.get();
  if (persisted) state = { ...state, ...persisted };
  if (!state.projectLibrary.length && state.inspections.length) {
    const seen = new Set();
    state.projectLibrary = state.inspections.filter(item => {
      if (seen.has(item.projectName)) return false;
      seen.add(item.projectName);
      return true;
    }).map(item => ({
      id: item.projectId || uid(), name: item.projectName, district: item.district || "",
      ownerUnit: item.ownerUnit || "", constructionUnit: item.constructionUnit || "",
      supervisionUnit: item.supervisionUnit || "", designUnit: item.designUnit || "",
      basicSituation: item.basicSituation || ""
    }));
    await save();
  }
  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js");
})();
