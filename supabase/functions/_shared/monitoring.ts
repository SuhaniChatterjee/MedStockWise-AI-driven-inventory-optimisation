import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

// Implements the three alert types that alert_configurations has defined since
// the original migration but that nothing ever computed: expiry_warning,
// data_drift, and prediction_error. All are derived from data the app already
// has, and are gated on real usage over time -- in a static demo (stock/usage
// never changes) drift and prediction-error correctly stay silent.

interface MonitoredItem {
  id: string;
  item_name: string;
  avg_usage_per_day: number;
  restock_lead_time: number;
  expiry_date: string | null;
}

export interface MonitorAlert {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  item_id: string;
  hospital_id: string;
  metadata: Record<string, unknown>;
}

interface AlertConfig {
  alert_type: string;
  is_enabled: boolean | null;
  threshold_value: number | null;
}

export async function runMonitoring(
  supabase: SupabaseClient,
  hospitalId: string,
  items: MonitoredItem[]
): Promise<MonitorAlert[]> {
  const alerts: MonitorAlert[] = [];

  const { data: configs } = await supabase
    .from("alert_configurations")
    .select("alert_type, is_enabled, threshold_value")
    .eq("hospital_id", hospitalId)
    .in("alert_type", ["expiry_warning", "data_drift", "prediction_error"]);

  const cfg = (type: string): AlertConfig | undefined =>
    (configs ?? []).find((c: AlertConfig) => c.alert_type === type);
  const enabled = (c: AlertConfig | undefined) => c !== undefined && c.is_enabled !== false;

  const expiryCfg = cfg("expiry_warning");
  const driftCfg = cfg("data_drift");
  const errCfg = cfg("prediction_error");

  const { data: baselineRows } = await supabase
    .from("demand_baselines")
    .select("item_id, baseline_avg_usage_per_day")
    .eq("hospital_id", hospitalId);
  const baselines = new Map<string, number>(
    (baselineRows ?? []).map((b: { item_id: string; baseline_avg_usage_per_day: number }) => [
      b.item_id,
      Number(b.baseline_avg_usage_per_day),
    ])
  );
  const newBaselines: { item_id: string; hospital_id: string; baseline_avg_usage_per_day: number }[] = [];

  for (const item of items) {
    // --- Expiry warning (fires immediately once expiry_date is set) ---
    if (item.expiry_date && enabled(expiryCfg)) {
      const days = Math.floor((new Date(item.expiry_date).getTime() - Date.now()) / 86_400_000);
      const threshold = expiryCfg?.threshold_value ?? 30;
      if (days <= threshold) {
        alerts.push({
          alert_type: "expiry_warning",
          severity: days <= 7 ? "critical" : "warning",
          title: `Expiry Warning: ${item.item_name}`,
          message:
            days < 0
              ? `${item.item_name} expired ${-days} day(s) ago.`
              : `${item.item_name} expires in ${days} day(s).`,
          item_id: item.id,
          hospital_id: hospitalId,
          metadata: { expiry_date: item.expiry_date, days_until_expiry: days },
        });
      }
    }

    // --- Data drift: current usage vs the captured baseline ---
    const baseline = baselines.get(item.id);
    if (baseline === undefined) {
      // First time we see this item -> capture its baseline for future runs.
      newBaselines.push({
        item_id: item.id,
        hospital_id: hospitalId,
        baseline_avg_usage_per_day: item.avg_usage_per_day,
      });
    } else if (baseline > 0 && enabled(driftCfg)) {
      const drift = Math.abs(item.avg_usage_per_day - baseline) / baseline;
      const threshold = driftCfg?.threshold_value ?? 0.15;
      if (drift > threshold) {
        alerts.push({
          alert_type: "data_drift",
          severity: "warning",
          title: `Demand Drift: ${item.item_name}`,
          message: `Usage (${item.avg_usage_per_day}/day) has drifted ${(drift * 100).toFixed(0)}% from its baseline (${baseline}/day). Consider updating the baseline or retraining the model.`,
          item_id: item.id,
          hospital_id: hospitalId,
          metadata: { current_usage: item.avg_usage_per_day, baseline_usage: baseline, drift_pct: Math.round(drift * 100) },
        });
      }
    }

    // --- Prediction error: the PRIOR run's forecast vs current demand ---
    if (enabled(errCfg)) {
      // range(1,1) = the second-most-recent prediction (the one from THIS run
      // was already inserted before monitoring; skip it and compare the prior).
      const { data: prior } = await supabase
        .from("prediction_history")
        .select("predicted_demand")
        .eq("item_id", item.id)
        .order("created_at", { ascending: false })
        .range(1, 1)
        .maybeSingle();

      if (prior) {
        const actual = item.avg_usage_per_day * item.restock_lead_time;
        if (actual > 0) {
          const err = Math.abs(Number(prior.predicted_demand) - actual) / actual;
          const threshold = errCfg?.threshold_value ?? 0.2;
          if (err > threshold) {
            alerts.push({
              alert_type: "prediction_error",
              severity: "info",
              title: `Prediction Drift: ${item.item_name}`,
              message: `The previous forecast (${Number(prior.predicted_demand).toFixed(0)}) is ${(err * 100).toFixed(0)}% off current demand (${actual.toFixed(0)}).`,
              item_id: item.id,
              hospital_id: hospitalId,
              metadata: { previous_forecast: Number(prior.predicted_demand), current_demand: actual, error_pct: Math.round(err * 100) },
            });
          }
        }
      }
    }
  }

  if (newBaselines.length > 0) {
    await supabase.from("demand_baselines").insert(newBaselines);
  }

  return alerts;
}
