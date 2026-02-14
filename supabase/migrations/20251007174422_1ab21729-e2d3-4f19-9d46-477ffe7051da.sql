-- Add model registry table for MLOps
CREATE TABLE IF NOT EXISTS public.model_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  model_type text NOT NULL DEFAULT 'GradientBoosting',
  training_date timestamp with time zone NOT NULL DEFAULT now(),
  mae numeric NOT NULL,
  rmse numeric,
  r2_score numeric,
  dataset_summary jsonb,
  feature_importance jsonb,
  hyperparameters jsonb,
  is_active boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add prediction history with detailed metadata
CREATE TABLE IF NOT EXISTS public.prediction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  model_version_id uuid REFERENCES public.model_registry(id),
  predicted_demand numeric NOT NULL,
  confidence_score numeric,
  feature_values jsonb NOT NULL,
  feature_contributions jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Add alert configurations table
CREATE TABLE IF NOT EXISTS public.alert_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL CHECK (alert_type IN ('low_stock', 'critical_stock', 'expiry_warning', 'data_drift', 'prediction_error')),
  threshold_value numeric,
  threshold_type text CHECK (threshold_type IN ('absolute', 'percentage')),
  notification_channels text[] DEFAULT ARRAY['in_app'],
  recipient_roles text[] DEFAULT ARRAY['admin', 'inventory_manager'],
  is_enabled boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add alerts history table
CREATE TABLE IF NOT EXISTS public.alerts_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  is_read boolean DEFAULT false,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid REFERENCES auth.users(id)
);

-- Add cost optimization table
CREATE TABLE IF NOT EXISTS public.cost_optimization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  eoq numeric,
  reorder_point numeric,
  safety_stock numeric,
  optimal_order_quantity numeric,
  estimated_annual_cost numeric,
  calculation_date timestamp with time zone NOT NULL DEFAULT now(),
  parameters jsonb
);

-- Enable RLS
ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_optimization ENABLE ROW LEVEL SECURITY;

-- RLS Policies for model_registry
CREATE POLICY "All authenticated users can view model registry"
  ON public.model_registry FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage model registry"
  ON public.model_registry FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for prediction_history
CREATE POLICY "All authenticated users can view prediction history"
  ON public.prediction_history FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert predictions"
  ON public.prediction_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for alert_configurations
CREATE POLICY "All authenticated users can view alert configurations"
  ON public.alert_configurations FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers can manage alert configurations"
  ON public.alert_configurations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'inventory_manager'::app_role));

-- RLS Policies for alerts_history
CREATE POLICY "Users can view alerts for their roles"
  ON public.alerts_history FOR SELECT
  USING (true);

CREATE POLICY "System can insert alerts"
  ON public.alerts_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their alerts"
  ON public.alerts_history FOR UPDATE
  USING (true);

-- RLS Policies for cost_optimization
CREATE POLICY "All authenticated users can view cost optimization"
  ON public.cost_optimization FOR SELECT
  USING (true);

CREATE POLICY "Managers and admins can manage cost optimization"
  ON public.cost_optimization FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'inventory_manager'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_alert_configurations_updated_at
  BEFORE UPDATE ON public.alert_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_prediction_history_item_id ON public.prediction_history(item_id);
CREATE INDEX idx_prediction_history_created_at ON public.prediction_history(created_at DESC);
CREATE INDEX idx_alerts_history_created_at ON public.alerts_history(created_at DESC);
CREATE INDEX idx_alerts_history_is_read ON public.alerts_history(is_read);
CREATE INDEX idx_model_registry_is_active ON public.model_registry(is_active);

-- Insert default alert configurations
INSERT INTO public.alert_configurations (alert_type, threshold_value, threshold_type, notification_channels)
VALUES 
  ('low_stock', 20, 'percentage', ARRAY['in_app', 'email']),
  ('critical_stock', 10, 'percentage', ARRAY['in_app', 'email']),
  ('expiry_warning', 30, 'absolute', ARRAY['in_app', 'email']),
  ('data_drift', 0.15, 'absolute', ARRAY['in_app', 'email']),
  ('prediction_error', 0.20, 'percentage', ARRAY['in_app']);

-- Insert initial model version
INSERT INTO public.model_registry (
  model_version,
  model_type,
  mae,
  rmse,
  hyperparameters,
  is_active
) VALUES (
  'v1.0.0',
  'GradientBoosting',
  157.17,
  NULL,
  '{"n_estimators": 100, "learning_rate": 0.1, "max_depth": 3, "random_state": 42}'::jsonb,
  true
);