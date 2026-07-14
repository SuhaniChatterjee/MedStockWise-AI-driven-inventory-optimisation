-- Adds a demand_category tag to inventory items so the weather-informed
-- global model (ml/train_global.py) can apply the right seasonal profile to
-- each item. The model learned demand dynamics for 5 categories from real
-- pharma-sales data; a hospital item tagged 'allergy' inherits allergy-med
-- seasonality (spring peak), 'respiratory_airway' inherits cold-season
-- respiratory dynamics, etc. Items with no seasonal analog (equipment, most
-- PPE) stay 'general' -> a flat 1.0 multiplier, i.e. no seasonal adjustment,
-- which is the honest behavior for a ventilator or an X-ray machine.
ALTER TABLE public.inventory_items
  ADD COLUMN demand_category text NOT NULL DEFAULT 'general'
  CHECK (demand_category IN (
    'general', 'allergy', 'respiratory_airway', 'analgesic', 'anti_inflammatory', 'sedative'
  ));

COMMENT ON COLUMN public.inventory_items.demand_category IS
  'Seasonal demand profile for the global model. general = no seasonality. See ml/README.md.';
