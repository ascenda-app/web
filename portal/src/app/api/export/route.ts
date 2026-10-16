import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/api/client";
import { crossSiteProblem, isSameOriginRequest } from "@/lib/api/csrf";
import { endpoints } from "@/lib/api/endpoints";
import { serverFetch } from "@/lib/api/server";
import { ensureSession } from "@/lib/auth/refresh";

interface PersonalDataExport {
  exportedAtUtc: string;
  account: unknown;
  profile: unknown;
  ascents: unknown;
}

const fileName = (): string =>
  `ascenda-export-${new Date().toISOString().slice(0, 10)}.json`;

const collectProfile = async (): Promise<unknown> => {
  try {
    return await serverFetch<unknown>(endpoints.profiles.myExport, {
      authenticated: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.problem.status === 404) {
      return null;
    }

    throw error;
  }
};

const collect = async (): Promise<PersonalDataExport> => {
  const [account, profile, ascents] = await Promise.all([
    serverFetch<unknown>(endpoints.auth.exportMyData, { authenticated: true }),
    collectProfile(),
    serverFetch<unknown>(endpoints.ascents.myExport, { authenticated: true }),
  ]);

  return {
    exportedAtUtc: new Date().toISOString(),
    account,
    profile,
    ascents,
  };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return crossSiteProblem();
  }

  if (!(await ensureSession())) {
    return NextResponse.json(
      { status: 401, title: "Export.NotAuthenticated" },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await collect(), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { status: 503, title: "Export.Incomplete" },
      { status: 503 },
    );
  }
}
