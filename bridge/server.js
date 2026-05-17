import express from "express";
import cors from "cors";
import { AternosWrapper } from "./aternos-wrapper.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const BRIDGE_KEY = process.env.BRIDGE_KEY || "";

function send(res, status, body) {
  res.status(status).json(body);
}

function auth(req) {
  const header = req.get("authorization") || "";
  return BRIDGE_KEY && header === `Bearer ${BRIDGE_KEY}`;
}

function authFail(res) {
  return send(res, 401, { ok: false, error: "Unauthorized" });
}

async function runAction(action, req, res) {
  if (!auth(req)) return authFail(res);

  const { email, password, serverRef, name, settings, version, software } = req.body || {};
  if (!email || !password) {
    return send(res, 400, { ok: false, error: "email and password are required" });
  }

  const bridge = new AternosWrapper({
    email,
    password,
    libraryOptions: {
      version,
      software,
    },
  });

  try {
    if (action === "create") {
      const result = await bridge.createServer({ name, settings, version, software });
      return send(res, 200, { ok: true, action, ...result });
    }

    const result = await bridge.action(action, serverRef);
    return send(res, 200, { ok: true, action, ...result });
  } catch (error) {
    return send(res, 500, { ok: false, error: error?.message || "Bridge error" });
  }
}

app.get("/health", (_req, res) => {
  send(res, 200, { ok: true, status: "up" });
});

app.post("/start", (req, res) => runAction("start", req, res));
app.post("/stop", (req, res) => runAction("stop", req, res));
app.post("/refresh", (req, res) => runAction("refresh", req, res));
app.post("/create", (req, res) => runAction("create", req, res));

app.listen(PORT, () => {
  console.log(`FreeMC bridge listening on ${PORT}`);
});
