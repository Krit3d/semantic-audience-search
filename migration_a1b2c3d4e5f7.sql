BEGIN;

-- Running upgrade d7e9f1a3b5c7 -> a1b2c3d4e5f7

CREATE TABLE subscription_plans (
    id SERIAL NOT NULL, 
    name VARCHAR(100) NOT NULL, 
    price NUMERIC(12, 2), 
    period_days INTEGER NOT NULL, 
    prodamus_plan_id VARCHAR(255), 
    payment_url VARCHAR(1024), 
    is_active BOOLEAN DEFAULT 'true' NOT NULL, 
    is_custom BOOLEAN DEFAULT 'false' NOT NULL, 
    limits JSONB DEFAULT '{}'::jsonb NOT NULL, 
    features JSONB DEFAULT '{}'::jsonb NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_subscription_plans_name UNIQUE (name), 
    CONSTRAINT uq_subscription_plans_prodamus_plan_id UNIQUE (prodamus_plan_id)
);

INSERT INTO subscription_plans
                (name, price, period_days, prodamus_plan_id, is_active, is_custom, limits, features)
            VALUES
                ('trial', 0, 14, NULL, true, false,
                 '{"brand_limit": 1, "dialogs_monthly_limit": 50}'::jsonb,
                 '{"automation_dialogs": false, "automation_contracts": false, "automation_marking": false}'::jsonb),
                ('basic', 7900, 31, NULL, true, false,
                 '{"brand_limit": 2, "dialogs_monthly_limit": 350}'::jsonb,
                 '{"automation_dialogs": false, "automation_contracts": false, "automation_marking": false}'::jsonb),
                ('pro', 39900, 31, NULL, false, false,
                 '{"brand_limit": 10, "dialogs_monthly_limit": 1000}'::jsonb,
                 '{"automation_dialogs": true, "automation_contracts": true, "automation_marking": true}'::jsonb),
                ('enterprise', NULL, 31, NULL, true, true,
                 '{}'::jsonb,
                 '{"automation_dialogs": true, "automation_contracts": true, "automation_marking": true}'::jsonb);

ALTER TABLE users ADD COLUMN subscription_status VARCHAR(20) DEFAULT 'trial' NOT NULL;

ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users ADD COLUMN gateway_subscription_id VARCHAR(255);

ALTER TABLE users ADD COLUMN billing_email VARCHAR(255);

ALTER TABLE users ADD COLUMN billing_phone VARCHAR(50);

ALTER TABLE users ADD COLUMN plan_id INTEGER;

ALTER TABLE users ADD CONSTRAINT fk_users_plan_id FOREIGN KEY(plan_id) REFERENCES subscription_plans (id) ON DELETE SET NULL;

ALTER TABLE users ADD CONSTRAINT ck_users_subscription_status CHECK (subscription_status IN ('free', 'trial', 'active', 'past_due', 'expired'));

CREATE TABLE payment_events (
    id BIGSERIAL NOT NULL, 
    event_key VARCHAR(512) NOT NULL, 
    user_id INTEGER, 
    event_type VARCHAR(50) NOT NULL, 
    amount NUMERIC(12, 2), 
    currency VARCHAR(3), 
    status VARCHAR(50), 
    raw_payload JSONB NOT NULL, 
    received_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_payment_events_event_key ON payment_events (event_key);

CREATE INDEX ix_payment_events_user_id ON payment_events (user_id);

CREATE INDEX ix_payment_events_received_at ON payment_events (received_at);

UPDATE alembic_version SET version_num='a1b2c3d4e5f7' WHERE alembic_version.version_num = 'd7e9f1a3b5c7';

COMMIT;

