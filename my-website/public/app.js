const $ = (selector) => document.querySelector(selector);

const feed = $("#feed");
const writeDialog = $("#write-dialog");
const detailDialog = $("#detail-dialog");

let selectedCategory = "";
let currentPage = 1;
let totalPosts = 0;
let activePostId = null;
let toastTimer;

$("#year").textContent = new Date().getFullYear();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "요청에 실패했습니다.");
  }
  return data;
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function formatDate(value) {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function excerpt(value, max = 120) {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function makePostCard(post) {
  const card = element("article", "post-card");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${post.title} 게시글 보기`);

  const head = element("div", "post-card-head");
  head.append(element("span", "category", post.category));
  head.append(element("time", "post-date", formatDate(post.created_at)));

  const title = element("h3", "post-title", post.title);
  const content = element("p", "post-excerpt", excerpt(post.content));

  const meta = element("div", "post-meta");
  meta.append(element("span", "avatar", (post.author || "?").slice(0, 1)));
  meta.append(element("span", "", post.author));
  meta.append(element("span", "comment-count", `댓글 ${post.comment_count}`));

  card.append(head, title, content, meta);

  const open = () => showDetail(post.id);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });

  return card;
}

function renderPagination() {
  const pagination = $("#pagination");
  pagination.replaceChildren();

  const pages = Math.ceil(totalPosts / 20);
  if (pages <= 1) return;

  const addButton = (label, page, active = false) => {
    const button = element(
      "button",
      `page-btn${active ? " active" : ""}`,
      label,
    );
    button.type = "button";
    if (active) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      currentPage = page;
      loadPosts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    pagination.append(button);
  };

  if (currentPage > 1) addButton("‹", currentPage - 1);

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(pages, currentPage + 2);

  for (let page = start; page <= end; page++) {
    addButton(String(page), page, page === currentPage);
  }

  if (currentPage < pages) addButton("›", currentPage + 1);
}

async function loadPosts() {
  feed.replaceChildren(
    element("div", "empty-state", "게시글을 불러오고 있어요..."),
  );

  const query = new URLSearchParams({
    page: String(currentPage),
  });
  const search = $("#search-input").value.trim();

  if (search) query.set("search", search);
  if (selectedCategory) query.set("category", selectedCategory);

  try {
    const data = await api(`/api/posts?${query}`);
    totalPosts = data.total;
    $("#post-total").textContent = `총 ${totalPosts}개의 이야기`;

    feed.replaceChildren();

    if (!data.posts.length) {
      feed.append(
        element(
          "div",
          "empty-state",
          "아직 게시글이 없어요. 첫 번째 이야기를 작성해 보세요!",
        ),
      );
    } else {
      data.posts.forEach((post) => feed.append(makePostCard(post)));
    }

    renderPagination();
  } catch (error) {
    feed.replaceChildren(element("div", "empty-state", error.message));
  }
}

function addCloseHandlers(dialog) {
  dialog.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

addCloseHandlers(writeDialog);
addCloseHandlers(detailDialog);

function openWriteDialog() {
  $("#write-error").textContent = "";
  writeDialog.showModal();
}

$("#open-write").addEventListener("click", openWriteDialog);
$("#hero-write").addEventListener("click", openWriteDialog);

$("#category-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  selectedCategory = button.dataset.category;
  currentPage = 1;

  $("#category-tabs")
    .querySelectorAll(".tab")
    .forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    });

  loadPosts();
});

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  currentPage = 1;
  loadPosts();
});

$("#write-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = $("#write-error");
  const button = form.querySelector('[type="submit"]');

  errorNode.textContent = "";
  button.disabled = true;

  try {
    const data = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        author: $("#write-author").value,
        category: $("#write-category").value,
        title: $("#write-title").value,
        content: $("#write-content").value,
      }),
    });

    writeDialog.close();
    form.reset();
    selectedCategory = "";
    $("#search-input").value = "";
    $("#category-tabs")
      .querySelectorAll(".tab")
      .forEach((tab) => {
        const active = tab.dataset.category === "";
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-pressed", String(active));
      });
    currentPage = 1;
    await loadPosts();
    notify("게시글이 등록되었습니다.");
    showDetail(data.post.id);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function showDetail(id) {
  activePostId = id;
  $("#detail-content").replaceChildren(element("p", "", "불러오는 중..."));
  $("#comment-list").replaceChildren();
  $("#comment-error").textContent = "";
  detailDialog.showModal();

  try {
    const data = await api(`/api/posts/${id}`);
    const post = data.post;
    const content = $("#detail-content");
    content.replaceChildren();

    const category = element("span", "category", post.category);
    const title = element("h2", "detail-title", post.title);
    const meta = element(
      "p",
      "muted",
      `${post.author} · ${formatDate(post.created_at)}`,
    );
    const body = element("div", "detail-body", post.content);

    content.append(category, title, meta, body);
    renderComments(data.comments);
  } catch (error) {
    $("#detail-content").replaceChildren(
      element("p", "form-error", error.message),
    );
  }
}

function renderComments(comments) {
  const list = $("#comment-list");
  list.replaceChildren();
  $("#comment-total").textContent = String(comments.length);

  if (!comments.length) {
    list.append(element("p", "muted", "첫 댓글을 남겨보세요."));
    return;
  }

  comments.forEach((comment) => {
    const item = element("article", "comment-item");
    item.append(element("strong", "", comment.author));
    item.append(element("p", "", comment.content));
    item.append(element("time", "", formatDate(comment.created_at)));
    list.append(item);
  });
}

$("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activePostId) return;

  const button = event.currentTarget.querySelector('[type="submit"]');
  $("#comment-error").textContent = "";
  button.disabled = true;

  try {
    await api(`/api/posts/${activePostId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        author: $("#comment-author").value,
        content: $("#comment-content").value,
      }),
    });

    $("#comment-content").value = "";
    const data = await api(`/api/posts/${activePostId}`);
    renderComments(data.comments);
    await loadPosts();
    notify("댓글이 등록되었습니다.");
  } catch (error) {
    $("#comment-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadPosts();
