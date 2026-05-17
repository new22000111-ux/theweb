const MODULE_CANDIDATES = ["aternos", "node-aternos"];

async function loadClientCtor() {
  let lastError = null;

  for (const pkg of MODULE_CANDIDATES) {
    try {
      const mod = await import(pkg);
      const Client = mod?.Client || mod?.default?.Client || mod?.default || mod?.AternosClient;
      if (typeof Client === "function") return Client;
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError?.message ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Unable to load an Aternos client library. Install one of: ${MODULE_CANDIDATES.join(", ")}.${message}`
  );
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function safeText(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function looksLikeMatch(server, ref) {
  if (!server || !ref) return false;
  const target = String(ref).toLowerCase();
  const candidates = [
    server.id,
    server.serverId,
    server.ref,
    server.name,
    server.displayName,
    server.slug,
    server.address,
  ].filter(Boolean).map(v => String(v).toLowerCase());
  return candidates.includes(target);
}

function normalizeServer(server) {
  return {
    id: safeText(server?.id ?? server?.serverId ?? server?.ref),
    name: safeText(server?.name ?? server?.displayName),
    status: safeText(server?.status ?? server?.state ?? server?.phase),
    ip: safeText(server?.ip ?? server?.address ?? server?.host),
    port: safeText(server?.port),
    software: safeText(server?.software ?? server?.type ?? server?.edition),
    version: safeText(server?.version ?? server?.mcVersion),
    playersOnline: server?.playersOnline ?? server?.onlinePlayers ?? null,
    raw: server ?? null,
  };
}

async function invokeFirstAvailable(target, methodNames, args = []) {
  for (const name of methodNames) {
    const fn = target?.[name];
    if (typeof fn === "function") {
      return await fn.apply(target, args);
    }
  }
  return null;
}

export class AternosWrapper {
  constructor({ email, password, libraryOptions = {} }) {
    this.email = email;
    this.password = password;
    this.libraryOptions = libraryOptions;
    this.client = null;
  }

  async connect() {
    if (this.client) return this.client;

    const Client = await loadClientCtor();
    const client = new Client({
      user: this.email,
      password: this.password,
      ...this.libraryOptions,
    });

    await invokeFirstAvailable(client, ["login", "auth", "connect", "startSession"]);
    this.client = client;
    return client;
  }

  async listServers() {
    const client = await this.connect();
    const servers = await invokeFirstAvailable(client, ["servers", "getServers", "listServers"], []);
    return asArray(servers).map(normalizeServer);
  }

  async resolveServer(serverRef) {
    const servers = await this.listServers();
    if (!serverRef) return servers[0] ?? null;
    const match = servers.find(s => looksLikeMatch(s, serverRef));
    return match ?? null;
  }

  async action(action, serverRef) {
    const client = await this.connect();
    const resolved = await this.resolveServer(serverRef);

    if (!resolved) {
      throw new Error(`Server not found for ref: ${serverRef || "default"}`);
    }

    const rawServers = await invokeFirstAvailable(client, ["servers", "getServers", "listServers"], []);
    const rawServer = asArray(rawServers).find(s => looksLikeMatch(s, serverRef) || looksLikeMatch(s, resolved.id) || looksLikeMatch(s, resolved.name)) || null;

    const subject = rawServer || resolved.raw || resolved;

    const actionMap = {
      start: ["start", "powerOn", "launch"],
      stop: ["stop", "powerOff", "shutdown"],
      refresh: ["refresh", "reload", "update"],
    };

    const tried = actionMap[action] || [action];
    const result = await invokeFirstAvailable(subject, tried, []);

    return {
      serverRef: resolved.id || resolved.name || serverRef || null,
      status: resolved.status || action,
      result: result ?? null,
      server: normalizeServer(subject),
    };
  }

  async createServer(payload = {}) {
    const client = await this.connect();

    const createPayload = {
      name: payload.name || payload.serverName || "New Server",
      version: payload.version || payload.mcVersion || null,
      software: payload.software || payload.type || null,
      settings: payload.settings || {},
    };

    const result = await invokeFirstAvailable(client, ["createServer", "create", "newServer"], [createPayload]);

    if (!result) {
      throw new Error("Server creation is not supported by the loaded Aternos library.");
    }

    return {
      ok: true,
      result,
    };
  }
}
