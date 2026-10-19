import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verify } from "@/lib/crypto";
import { exchangeCode, getConnection, listLocations, selectLocation, syncGoogle } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verify<{ businessId: string; userId: string }>(url.searchParams.get("state") ?? "");
  const user = await getCurrentUser();
  if (!state || !user || user.id !== state.userId) return NextResponse.redirect(new URL("/login", req.url));

  const back = (q: string) => NextResponse.redirect(new URL(`/b/${state.businessId}/settings?${q}#google`, req.url));
  const code = url.searchParams.get("code");
  if (!code) return back("error=google-denied");

  try {
    await exchangeCode(state.businessId, code);
    const conn = await getConnection(state.businessId);
    const locations = conn ? await listLocations(conn) : [];
    if (locations.length === 1) {
      const l = locations[0];
      await selectLocation(state.businessId, l.accountName, l.locationName, l.title);
      await syncGoogle(state.businessId);
      return back("google=connected");
    }
    return back(locations.length ? "google=choose" : "error=google-no-locations");
  } catch (err) {
    console.error("google callback failed", err);
    return back("error=google-failed");
  }
}
