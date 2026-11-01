-- Contact log for the customer page's follow-up tab (CUSTOMER-PAGES.md §3.6).
-- Keyed by account, not by run: the history outlives any single prediction run.
CREATE TABLE customer_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    acc_id integer NOT NULL,
    channel text NOT NULL CHECK (channel IN ('phone', 'email', 'meeting', 'other')),
    outcome text NOT NULL CHECK (outcome IN ('reached', 'no_answer', 'follow_up', 'resolved')),
    note text NOT NULL DEFAULT '',
    next_follow_up date,
    created_by text REFERENCES "user" (id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_contacts_acc_created ON customer_contacts (acc_id, created_at DESC);
