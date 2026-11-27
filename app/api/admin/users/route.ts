import {
  administrator,
  body,
  response,
  sameOrigin,
} from "../../../../lib/server";
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
async function store() {
  if ((env as any).QUIZMINT_RUNTIME !== "namecheap")
    throw Error("User management is available on the hosted runtime only.");
  const [{ namecheapDatabase }, { adminUserRepository }] = await Promise.all([
    import("../../../../db/namecheap.mjs"),
    import("../../../../db/namecheap-admin-users.mjs"),
  ]);
  return adminUserRepository(await namecheapDatabase());
}
export async function GET(req: Request) {
  const admin = await administrator(req);
  if (!admin) return response({ error: "Administrator access required." }, 403);
  try {
    const params = new URL(req.url).searchParams;
    const offset = Number(params.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw Error("Invalid account page.");
    return response(await (await store()).list(params.get("q") || "", offset));
  } catch (e) {
    return response(
      {
        error:
          e instanceof Error && e.message === "Invalid account page."
            ? e.message
            : "User management is not ready. Run the private admin and survey migrations first.",
      },
      e instanceof Error && e.message === "Invalid account page." ? 400 : 503,
    );
  }
}
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return response({ error: "Invalid origin." }, 403);
  const admin = await administrator(req);
  if (!admin) return response({ error: "Administrator access required." }, 403);
  try {
    const x = await body(req);
    if (
      typeof x.userId !== "string" ||
      !["suspend", "reactivate", "credits", "signout"].includes(x.action)
    )
      throw Error("Invalid user action.");
    await (
      await store()
    ).update({
      adminId: admin.id.slice(6),
      userId: x.userId,
      action: x.action,
      credits: x.credits,
      reason: typeof x.reason === "string" ? x.reason.slice(0, 500) : "",
    });
    return response({ ok: true });
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : "Unable to update user." },
      400,
    );
  }
}
