-- Recurring Invoices for Pro/Business plans

-- Add recurring invoice columns to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_frequency text CHECK (recurring_frequency IN ('weekly', 'monthly', 'quarterly', 'yearly'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_start_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_end_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_next_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_count integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recurring_parent_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- Index for efficient querying of recurring invoices that need to run
CREATE INDEX IF NOT EXISTS idx_invoices_recurring_next 
  ON invoices(recurring_next_date) 
  WHERE is_recurring = true AND status != 'cancelled';

-- Function to generate recurring invoices
CREATE OR REPLACE FUNCTION public.generate_recurring_invoices()
RETURNS void AS $$
DECLARE
  v_invoice RECORD;
  v_new_invoice_id uuid;
  v_next_date date;
BEGIN
  -- Find all recurring invoices that are due today or past due
  FOR v_invoice IN 
    SELECT * FROM invoices 
    WHERE is_recurring = true 
      AND recurring_next_date <= CURRENT_DATE
      AND (recurring_end_date IS NULL OR recurring_end_date >= CURRENT_DATE)
      AND status NOT IN ('cancelled')
  LOOP
    -- Calculate next date based on frequency
    CASE v_invoice.recurring_frequency
      WHEN 'weekly' THEN v_next_date := v_invoice.recurring_next_date + INTERVAL '7 days';
      WHEN 'monthly' THEN v_next_date := v_invoice.recurring_next_date + INTERVAL '1 month';
      WHEN 'quarterly' THEN v_next_date := v_invoice.recurring_next_date + INTERVAL '3 months';
      WHEN 'yearly' THEN v_next_date := v_invoice.recurring_next_date + INTERVAL '1 year';
    END CASE;

    -- Create new invoice from the recurring template
    INSERT INTO invoices (
      user_id, invoice_number, invoice_date, due_date, status,
      client_name, client_email, client_phone, client_address,
      client_state, client_gstin, client_country,
      items, notes, 
      discount_type, discount_value, discount_amount,
      base_currency, invoice_currency, exchange_rate,
      business_country,
      is_recurring, recurring_frequency, recurring_start_date, recurring_end_date,
      recurring_next_date, recurring_count, recurring_parent_id
    ) VALUES (
      v_invoice.user_id,
      -- Generate new invoice number (will be overridden by app logic ideally)
      'REC-' || v_invoice.invoice_number || '-' || (v_invoice.recurring_count + 1),
      CURRENT_DATE,
      CURRENT_DATE + (v_invoice.due_date - v_invoice.invoice_date),
      'draft',
      v_invoice.client_name, v_invoice.client_email, v_invoice.client_phone,
      v_invoice.client_address, v_invoice.client_state, v_invoice.client_gstin,
      v_invoice.client_country,
      v_invoice.items, v_invoice.notes,
      v_invoice.discount_type, v_invoice.discount_value, v_invoice.discount_amount,
      v_invoice.base_currency, v_invoice.invoice_currency, v_invoice.exchange_rate,
      v_invoice.business_country,
      false, NULL, NULL, NULL, NULL, 0, v_invoice.id
    ) RETURNING id INTO v_new_invoice_id;

    -- Update the parent invoice's recurring state
    UPDATE invoices SET
      recurring_next_date = v_next_date,
      recurring_count = recurring_count + 1
    WHERE id = v_invoice.id;

    -- Log the event
    INSERT INTO audit_events (event_type, entity_type, entity_id, actor_user_id, metadata)
    VALUES ('invoice.recurring_created', 'invoice', v_new_invoice_id, v_invoice.user_id, 
      jsonb_build_object('parent_id', v_invoice.id, 'frequency', v_invoice.recurring_frequency));
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.generate_recurring_invoices() TO authenticated, service_role;

-- Schedule the function to run daily (at midnight)
-- Note: pg_cron must be enabled for this to work
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('generate-recurring-invoices', '0 0 * * *', 'select public.generate_recurring_invoices();');
  END IF;
END $$;

COMMENT ON FUNCTION public.generate_recurring_invoices() IS 'Generates new invoices from recurring templates. Runs daily via pg_cron.';
COMMENT ON COLUMN invoices.is_recurring IS 'Whether this invoice is a recurring template';
COMMENT ON COLUMN invoices.recurring_frequency IS 'How often to generate: weekly, monthly, quarterly, yearly';
COMMENT ON COLUMN invoices.recurring_next_date IS 'Next date to generate an invoice';
COMMENT ON COLUMN invoices.recurring_parent_id IS 'Links generated invoices back to their template';
