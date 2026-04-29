import { getOrCreateCurrentUser } from "@/lib/current-user";
import { LOCAL_USER_ID } from "@/lib/constants";
import { userDbEnabled } from "@/lib/userdb";

export async function requireUserId(): Promise<string> {
  if (!userDbEnabled()) return LOCAL_USER_ID;
  const u = await getOrCreateCurrentUser({ createIfMissing: true });
  if (!u) throw new Error("no_user");
  return u.id;
}

