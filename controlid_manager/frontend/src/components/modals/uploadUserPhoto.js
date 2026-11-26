export async function syncUserPhoto({ userId, photoBase64, photoTimestamp }) {
  const id = encodeURIComponent(Number(userId));
  const rawBase64 = photoBase64
    ? photoBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "")
    : null;

  // Se não houver foto, usa o endpoint DELETE
  if (!rawBase64) {
    const delRes = await fetch(`api/users/${id}/image`, {
      method: "DELETE",
    });

    const delData = await delRes.json().catch(() => ({}));
    if (!delRes.ok || delData.success === false) {
      throw new Error(delData.error || "Erro ao remover a foto do usuário.");
    }
    return delData;
  }

  // Se houver foto, usa o endpoint POST
  const imgRes = await fetch(`api/users/${id}/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: rawBase64,
      timestamp: photoTimestamp,
    }),
  });

  const imgData = await imgRes.json().catch(() => ({}));

  if (!imgRes.ok || imgData.success === false) {
    const firstErr = imgData.errors?.[0];
    const errMsg =
      firstErr?.friendlyMessage ||
      firstErr?.message ||
      imgData.error ||
      "A foto não passou na validação biométrica do equipamento.";
    throw new Error(errMsg);
  }

  return imgData;
}