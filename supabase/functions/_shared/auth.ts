import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.74.0";

export type AppRole = "admin" | "inventory_manager" | "nurse";

/**
 * Verifies the request's bearer token against Supabase Auth and returns the
 * authenticated user. Throws if the header is missing or the token is invalid.
 */
export async function requireUser(
  supabase: SupabaseClient,
  req: Request
): Promise<User> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}

/**
 * Checks whether a user holds one of the given roles. Queries user_roles
 * directly (rather than relying on RLS) since callers typically hold a
 * service-role client that bypasses RLS.
 */
export async function userHasAnyRole(
  supabase: SupabaseClient,
  userId: string,
  roles: AppRole[]
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles);

  if (error) {
    throw new Error("Failed to verify user role");
  }

  return (data?.length ?? 0) > 0;
}

export function createServiceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}
