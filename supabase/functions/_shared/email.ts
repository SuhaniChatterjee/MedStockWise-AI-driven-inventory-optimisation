import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Resend's sandbox/test mode (no verified sending domain) only delivers to
// the account owner's own address and requires this sender -- see
// docs/deployment.md for verifying a real domain to email other staff.
const FROM_ADDRESS = Deno.env.get("ALERT_EMAIL_FROM") ?? "MedStock Wise <onboarding@resend.dev>";

export interface AlertForEmail {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
}

/**
 * Emails admins/inventory_managers about newly created warning/critical
 * alerts, if that alert_type's configuration has 'email' enabled as a
 * notification channel. Best-effort: failures are logged, not thrown --
 * a broken email send should never fail the prediction/seed request that
 * triggered it.
 */
export async function sendAlertEmails(
  supabase: SupabaseClient,
  hospitalId: string,
  alerts: AlertForEmail[]
): Promise<void> {
  const notifiable = alerts.filter((a) => a.severity === "warning" || a.severity === "critical");
  if (notifiable.length === 0) return;

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set -- skipping alert emails for", notifiable.length, "alert(s)");
    return;
  }

  try {
    const { data: configs } = await supabase
      .from("alert_configurations")
      .select("alert_type, is_enabled, notification_channels, recipient_roles")
      .eq("hospital_id", hospitalId)
      .in("alert_type", [...new Set(notifiable.map((a) => a.alert_type))]);

    const emailable = notifiable.filter((a) => {
      const config = configs?.find((c) => c.alert_type === a.alert_type);
      return config?.is_enabled && config.notification_channels?.includes("email");
    });
    if (emailable.length === 0) return;

    const recipientRoles = new Set(
      (configs ?? []).flatMap((c) => c.recipient_roles ?? ["admin", "inventory_manager"])
    );

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", [...recipientRoles]);

    const userIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
    if (userIds.length === 0) return;

    // Scoped to this hospital -- user_roles has no hospital concept of its
    // own (a user's hospital lives on profiles), so without this filter an
    // alert from one hospital would email admins at every other hospital.
    const { data: recipients } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("hospital_id", hospitalId)
      .in("id", userIds);

    if (!recipients || recipients.length === 0) return;

    const subject = emailable.some((a) => a.severity === "critical")
      ? `[Critical] ${emailable.length} inventory alert(s) need attention`
      : `${emailable.length} inventory alert(s) need attention`;

    const bodyHtml = `
      <h2>MedStock Wise Alerts</h2>
      <ul>
        ${emailable
          .map((a) => `<li><strong>[${a.severity.toUpperCase()}]</strong> ${a.title} -- ${a.message}</li>`)
          .join("")}
      </ul>
      <p style="color:#6b7280;font-size:12px">You're receiving this because your role is subscribed to these alert types in MedStock Wise.</p>
    `;

    await Promise.all(
      recipients.map((r) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: r.email,
            subject,
            html: bodyHtml,
          }),
        }).catch((err) => console.error(`Failed to email ${r.email}:`, err))
      )
    );
  } catch (error) {
    console.error("sendAlertEmails failed (non-fatal):", error);
  }
}
