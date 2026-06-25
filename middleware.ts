import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/api/scan"];

function unauthorizedResponse() {
  const res = new NextResponse("Unauthorized", { status: 401 });
  res.headers.set("WWW-Authenticate", "Basic realm=\"Protected\"");
  return res;
}

function checkBasicAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;
  const encoded = authHeader.slice("Basic ".length);
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const [user, pass] = decoded.split(":");
  return (
    user === process.env.BASIC_AUTH_USER && pass === process.env.BASIC_AUTH_PASSWORD
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (!checkBasicAuth(authHeader)) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/(.*)"],
};
