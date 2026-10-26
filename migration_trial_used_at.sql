-- Trial activation tracking: one 14-day trial per account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMP WITH TIME ZONE;
