import { handleSongSearch } from "@/lib/game/catalogue";
export const dynamic = "force-dynamic";
// Blind-test song search, proxied so phones stay same-origin and never call the catalogue.
export async function GET(req: Request) {
  return handleSongSearch(req);
}
