const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "community.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '자유게시판',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id)
      ON DELETE CASCADE,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created
    ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_post
    ON comments(post_id);
`);

const postCount = db.prepare("SELECT COUNT(*) AS count FROM posts").get().count;

if (postCount === 0) {
  const insert = db.prepare(`
    INSERT INTO posts (title, content, author, category)
    VALUES (?, ?, ?, ?)
  `);

  insert.run(
    "My Website 커뮤니티에 오신 것을 환영합니다!",
    "이곳에서 자유롭게 이야기를 나누고 정보를 공유해 보세요.",
    "관리자",
    "공지사항",
  );
  insert.run(
    "요즘 어떤 프로젝트를 만들고 계신가요?",
    "만들고 있는 프로젝트와 개발 경험을 함께 공유해요.",
    "developer",
    "자유게시판",
  );
  insert.run(
    "웹 개발 초보자를 위한 질문 공간",
    "궁금한 점을 편하게 질문해 보세요.",
    "community",
    "질문·답변",
  );
}

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

// 입력값 검증
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function validateText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

const categories = ["자유게시판", "질문·답변", "정보공유", "공지사항"];

function postSummary(post) {
  return {
    ...post,
    comment_count: db
      .prepare("SELECT COUNT(*) AS count FROM comments WHERE post_id = ?")
      .get(post.id).count,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 게시글 목록 및 검색
app.get("/api/posts", (req, res) => {
  const search = cleanText(req.query.search, 100);
  const category = cleanText(req.query.category, 30);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
  );
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = "WHERE 1 = 1";
  const params = [];

  if (search) {
    where += " AND (title LIKE ? OR content LIKE ? OR author LIKE ?)";
    const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    params.push(term, term, term);
  }

  if (category && categories.includes(category)) {
    where += " AND category = ?";
    params.push(category);
  }

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM posts ${where}`)
    .get(...params).count;

  const posts = db
    .prepare(
      `
    SELECT * FROM posts ${where}
    ORDER BY id DESC LIMIT ? OFFSET ?
  `,
    )
    .all(...params, limit, offset)
    .map(postSummary);

  res.json({ posts, total, page, limit });
});

// 게시글 상세 및 댓글
app.get("/api/posts/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "잘못된 게시글 번호입니다." });
  }

  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);

  if (!post) {
    return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  }

  const comments = db
    .prepare(
      `
    SELECT * FROM comments
    WHERE post_id = ?
    ORDER BY id ASC
  `,
    )
    .all(id);

  res.json({ post, comments });
});

// 게시글 작성
app.post("/api/posts", (req, res) => {
  const title = req.body?.title;
  const content = req.body?.content;
  const author = req.body?.author;
  const category = req.body?.category;

  if (
    !validateText(title, 100) ||
    !validateText(content, 10000) ||
    !validateText(author, 30) ||
    typeof category !== "string" ||
    !categories.includes(category)
  ) {
    return res.status(400).json({
      error: "제목, 내용, 작성자 또는 카테고리를 확인해 주세요.",
    });
  }

  const result = db
    .prepare(
      `
    INSERT INTO posts (title, content, author, category)
    VALUES (?, ?, ?, ?)
  `,
    )
    .run(
      cleanText(title, 100),
      content.trim(),
      cleanText(author, 30),
      category,
    );

  const post = db
    .prepare("SELECT * FROM posts WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({ post: postSummary(post) });
});

// 댓글 작성
app.post("/api/posts/:id/comments", (req, res) => {
  const postId = Number(req.params.id);
  const { author, content } = req.body || {};

  if (!Number.isSafeInteger(postId) || postId < 1) {
    return res.status(400).json({ error: "잘못된 게시글 번호입니다." });
  }

  if (!db.prepare("SELECT id FROM posts WHERE id = ?").get(postId)) {
    return res.status(404).json({ error: "게시글이 없습니다." });
  }

  if (!validateText(author, 30) || !validateText(content, 1000)) {
    return res.status(400).json({
      error: "작성자와 댓글은 비워 둘 수 없습니다.",
    });
  }

  const result = db
    .prepare(
      `
    INSERT INTO comments (post_id, author, content)
    VALUES (?, ?, ?)
  `,
    )
    .run(postId, cleanText(author, 30), content.trim());

  const comment = db
    .prepare("SELECT * FROM comments WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({ comment });
});

app.use(express.static(path.join(__dirname, "public")));

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API를 찾을 수 없습니다." });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error:
      err.status === 413
        ? "요청 데이터가 너무 큽니다."
        : "서버 오류가 발생했습니다.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`My Website is running on port ${PORT}`);
});
