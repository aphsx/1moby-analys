/** Contact log on the customer page. Values match the CHECKs in db/migrations/004_customer_contacts.sql. */
export const CONTACT_CHANNELS = ["phone", "email", "meeting", "other"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_OUTCOMES = ["reached", "no_answer", "follow_up", "resolved"] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export interface CustomerContact {
  id: string;
  acc_id: number;
  channel: ContactChannel;
  outcome: ContactOutcome;
  note: string;
  next_follow_up: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CustomerContactInput {
  channel: ContactChannel;
  outcome: ContactOutcome;
  note: string;
  next_follow_up: string | null;
}
