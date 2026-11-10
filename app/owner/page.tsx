import type { Metadata } from "next";
import { headers } from "next/headers";
import Dashboard from "../../components/analytics/Dashboard";
import { authorizeOwnerRequest } from "../../lib/owner-access";
import OwnerLogin from "./OwnerLogin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Owner analytics", robots: { index: false, follow: false, nocache: true } };

export default async function OwnerPage() {
  const requestHeaders = await headers();
  const origin = process.env.OWNER_ORIGIN;
  if (!origin) return <OwnerLogin />;
  let authorized = false;
  try {
    const expected = new URL(origin);
    if (requestHeaders.get("host") === expected.host) {
      const access = await authorizeOwnerRequest(new Request(`${origin}/owner`, { headers: requestHeaders }));
      authorized = access.status === "authorized";
    }
  } catch { /* An unavailable owner session never renders analytics. */ }
  return authorized ? <Dashboard /> : <OwnerLogin />;
}
