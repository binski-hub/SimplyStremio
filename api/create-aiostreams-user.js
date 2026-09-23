import crypto from "node:crypto";

const json = (res, status, body) => {
  res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(body));
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { success: false, error: "Method not allowed" });
  }

  const baseUrl = (process.env.AIOSTREAMS_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) {
    return json(res, 500, {
      success: false,
      error: "AIOSTREAMS_BASE_URL is not configured."
    });
  }

  const config = req.body?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return json(res, 400, { success: false, error: "Invalid AIOStreams config." });
  }

  const password = crypto.randomBytes(24).toString("base64url");

  try {
    const response = await fetch(baseUrl + "/api/v1/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, password })
    });

    const result = await response.json();

    if (!response.ok || !result.success || !result.data?.uuid || !result.data?.encryptedPassword) {
      return json(res, response.status || 502, {
        success: false,
        error: result.error?.message || result.detail || "AIOStreams could not create the configuration."
      });
    }

    const manifestUrl =
      baseUrl + "/stremio/" +
      encodeURIComponent(result.data.uuid) + "/" +
      encodeURIComponent(result.data.encryptedPassword) +
      "/manifest.json";

    return json(res, 201, {
      success: true,
      data: {
        uuid: result.data.uuid,
        encryptedPassword: result.data.encryptedPassword,
        manifestUrl
      }
    });
  } catch (error) {
    return json(res, 502, {
      success: false,
      error: "Could not reach the AIOStreams instance."
    });
  }
}
