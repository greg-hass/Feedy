import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api";
import { getNavigationData } from "@/lib/data";

export async function GET() {
  const user = await requireApiUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const navigation = await getNavigationData(user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      settings: user.settings,
    },
    navigation,
  });
}
