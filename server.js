const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");

const feeByGrade = { 6: 110, 7: 125, 8: 140, 9: 155, 10: 175 };
const addonFees = { transport: 35, meal: 25, hostel: 90 };
const validEventTypes = ["academic", "sports", "community"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(file) {
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw);
}

async function writeJson(file, data) {
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-7)}`;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));
}

function isPhone(v) {
  return /^\d{10}$/.test(String(v || "").trim());
}

function normalizeType(type) {
  return validEventTypes.includes(type) ? type : null;
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok", service: "Shanti Namuna v2 backend" });
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    const [admissions, contacts, events] = await Promise.all([
      readJson("admissions.json"),
      readJson("contacts.json"),
      readJson("events.json")
    ]);
    return sendJson(res, 200, {
      admissions: admissions.length,
      messages: contacts.length,
      events: events.length
    });
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const events = await readJson("events.json");
    const type = url.searchParams.get("type");
    const filtered = type && type !== "all" ? events.filter((e) => e.type === type) : events;
    return sendJson(res, 200, filtered);
  }

  if (req.method === "POST" && url.pathname === "/api/events") {
    const body = await parseBody(req);
    const { title, date, type, description } = body;
    const normalizedType = normalizeType(type);

    if (!title || !description || !date || !normalizedType) {
      return sendJson(res, 400, {
        error: "title, date, type (academic/sports/community) and description are required."
      });
    }

    if (!isValidDate(date)) {
      return sendJson(res, 400, { error: "Provide a valid event date." });
    }

    const events = await readJson("events.json");
    const newEvent = {
      id: generateId("EVT"),
      title: String(title).trim(),
      date: new Date(date).toISOString().slice(0, 10),
      type: normalizedType,
      description: String(description).trim(),
      createdAt: new Date().toISOString()
    };
    events.push(newEvent);
    await writeJson("events.json", events);
    return sendJson(res, 201, { message: "Event created.", event: newEvent });
  }

  if (req.method === "POST" && url.pathname === "/api/admissions") {
    const body = await parseBody(req);
    const { studentName, grade, parentEmail, contact } = body;

    if (!studentName || !grade || !parentEmail || !contact) {
      return sendJson(res, 400, { error: "All admission fields are required." });
    }
    if (!feeByGrade[grade]) return sendJson(res, 400, { error: "Invalid grade." });
    if (!isEmail(parentEmail) || !isPhone(contact)) {
      return sendJson(res, 400, { error: "Please provide a valid email and 10-digit phone." });
    }

    const admissions = await readJson("admissions.json");
    const record = {
      id: generateId("SN"),
      studentName: String(studentName).trim(),
      grade: String(grade),
      parentEmail: String(parentEmail).trim(),
      contact: String(contact).trim(),
      createdAt: new Date().toISOString()
    };
    admissions.push(record);
    await writeJson("admissions.json", admissions);
    return sendJson(res, 201, {
      message: "Application submitted successfully.",
      applicationId: record.id
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admissions") {
    const admissions = await readJson("admissions.json");
    const limit = Number(url.searchParams.get("limit") || admissions.length);
    return sendJson(res, 200, admissions.slice(-limit));
  }

  if (req.method === "POST" && url.pathname === "/api/fees/estimate") {
    const { grade, transport, meal, hostel } = await parseBody(req);
    if (!feeByGrade[grade]) return sendJson(res, 400, { error: "Valid grade is required." });

    let total = feeByGrade[grade];
    if (transport) total += addonFees.transport;
    if (meal) total += addonFees.meal;
    if (hostel) total += addonFees.hostel;

    return sendJson(res, 200, {
      baseFee: feeByGrade[grade],
      addons: { transport: !!transport, meal: !!meal, hostel: !!hostel },
      total
    });
  }

  if (req.method === "POST" && url.pathname === "/api/contact") {
    const { name, email, message } = await parseBody(req);
    if (!name || !email || !message) {
      return sendJson(res, 400, { error: "All contact fields are required." });
    }
    if (!isEmail(email)) return sendJson(res, 400, { error: "Provide a valid email address." });

    const contacts = await readJson("contacts.json");
    contacts.push({
      id: generateId("MSG"),
      name: String(name).trim(),
      email: String(email).trim(),
      message: String(message).trim(),
      createdAt: new Date().toISOString()
    });
    await writeJson("contacts.json", contacts);
    return sendJson(res, 201, { message: "Thanks! Your inquiry has been sent successfully." });
  }

  if (req.method === "GET" && url.pathname === "/api/contact") {
    const contacts = await readJson("contacts.json");
    const limit = Number(url.searchParams.get("limit") || contacts.length);
    return sendJson(res, 200, contacts.slice(-limit));
  }

  return sendJson(res, 404, { error: "Route not found." });
}

async function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method not allowed");
  }

  const relPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(ROOT, relPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    const status = error.message === "Payload too large" ? 413 : 400;
    return sendJson(res, status, { error: error.message || "Unexpected server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Shanti Namuna v2 running on http://0.0.0.0:${PORT}`);
});
