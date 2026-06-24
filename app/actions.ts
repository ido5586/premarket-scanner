"use server";

import { revalidatePath } from "next/cache";
import { runScan } from "@/lib/pipeline";

export async function runManualScan(): Promise<void> {
  // Manual path: always runs, no dedup, so it can be pressed repeatedly around
  // 16:00 Israel to watch the list develop. Runs server-side only.
  await runScan({ isAutomatic: false });
  revalidatePath("/");
}
