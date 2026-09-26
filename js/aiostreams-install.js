import { buildAioStreamsConfig } from "./aiostreams-builder.js";

function showStatus(message) {
  const button = document.querySelector("#addButton, #continue");
  if (button) {
    button.disabled = true;
    button.textContent = message;
  }
}

export async function installToStremio() {
  showStatus("Putting it together…");

  try {
    const config = buildAioStreamsConfig();

    const response = await fetch("/api/create-aiostreams-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config })
    });

    const result = await response.json();

    if (!response.ok || !result.success || !result.data?.manifestUrl) {
      throw new Error(result.error || "CYSE could not finish the setup.");
    }

    const { manifestUrl, uuid, encryptedPassword } = result.data;

    sessionStorage.setItem("simplyStremioAioManifestUrl", manifestUrl);
    sessionStorage.setItem("simplyStremioAioUuid", uuid);
    sessionStorage.setItem("simplyStremioAioEncryptedPassword", encryptedPassword);

    const stremioUrl = manifestUrl.replace(/^https?:\/\//, "stremio://");
    window.location.href = stremioUrl;
  } catch (error) {
    console.error(error);
    const button = document.querySelector("#addButton, #continue");
    if (button) {
      button.disabled = false;
      button.textContent = "Add to Stremio →";
    }
    alert(error.message || "Something went wrong while creating your Stremio setup.");
  }
}
