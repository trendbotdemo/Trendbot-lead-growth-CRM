import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { sign } from "@/lib/crypto";
import { features } from "@/lib/env";
import { authUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get("businessId") ?? "";
  const { user } = await requireBusiness(businessId);
  if (!features.google) {
    return NextResponse.redirect(new URL(`/b/${businessId}/settings?error=google-not-configured#google`, req.url));
  }
  const state = sign({ businessId, userId: user.id });
  return NextResponse.redirect(authUrl(state));
}
