import { setPendingAction } from "./pending-action";

export async function rememberLaunchFromUrl(url: string | null) {
  if (!url) return;
  const desafio = url.match(/\/d\/([0-9a-fA-F-]{8,})/);
  if (desafio?.[1]) {
    await setPendingAction({ kind: "open_desafio", desafioId: desafio[1] });
    return;
  }
  const predio = url.match(/\/p\/([A-Za-z0-9_-]+)/);
  if (predio?.[1] && predio[1] !== "privacidad") {
    await setPendingAction({ kind: "open_predio", slug: predio[1] });
  }
}
