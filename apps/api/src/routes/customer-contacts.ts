import Elysia, { t } from "elysia";
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, type ContactChannel, type ContactOutcome, type CustomerContact } from "@moby/types";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { customerContacts, user } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest } from "../lib/http/errors";

const NOTE_MAX = 2000;
const CONTACTS_LIMIT = 200;
/** Postgres `integer`: anything larger would fail the query instead of returning a clean 400. */
const ACC_ID_MAX = 2_147_483_647;

function parseAccId(raw: string): number {
  const accId = Number(raw);
  if (!Number.isInteger(accId) || accId < 0 || accId > ACC_ID_MAX) throw badRequest("Invalid account id");
  return accId;
}

const params = t.Object({ acc_id: t.String() });

/** Contact log per account. Org-wide like the rest of the app: any signed-in user reads and adds. */
export const customerContactRoutes = new Elysia({ prefix: "/customers" })
  .use(requireUser)
  .get(
    "/:acc_id/contacts",
    async ({ params }): Promise<CustomerContact[]> => {
      const rows = await db
        .select({
          id: customerContacts.id,
          acc_id: customerContacts.accId,
          channel: customerContacts.channel,
          outcome: customerContacts.outcome,
          note: customerContacts.note,
          next_follow_up: customerContacts.nextFollowUp,
          created_at: customerContacts.createdAt,
          creator_name: user.name,
          creator_email: user.email,
        })
        .from(customerContacts)
        .leftJoin(user, eq(user.id, customerContacts.createdBy))
        .where(eq(customerContacts.accId, parseAccId(params.acc_id)))
        .orderBy(desc(customerContacts.createdAt))
        .limit(CONTACTS_LIMIT);
      return rows.map(({ creator_name, creator_email, ...row }) => ({
        ...row,
        channel: row.channel as ContactChannel,
        outcome: row.outcome as ContactOutcome,
        created_by_name: creator_name ?? creator_email ?? null,
      }));
    },
    { params }
  )
  .post(
    "/:acc_id/contacts",
    async ({ params, body, userId }): Promise<CustomerContact> => {
      const [row] = await db
        .insert(customerContacts)
        .values({
          accId: parseAccId(params.acc_id),
          channel: body.channel,
          outcome: body.outcome,
          note: body.note.trim(),
          nextFollowUp: body.next_follow_up,
          createdBy: userId,
        })
        .returning();
      return {
        id: row.id,
        acc_id: row.accId,
        channel: row.channel as ContactChannel,
        outcome: row.outcome as ContactOutcome,
        note: row.note,
        next_follow_up: row.nextFollowUp,
        created_by_name: null,
        created_at: row.createdAt,
      };
    },
    {
      params,
      body: t.Object({
        channel: t.Union(CONTACT_CHANNELS.map((c) => t.Literal(c))),
        outcome: t.Union(CONTACT_OUTCOMES.map((o) => t.Literal(o))),
        note: t.String({ maxLength: NOTE_MAX }),
        next_follow_up: t.Union([t.String({ format: "date" }), t.Null()]),
      }),
    }
  );
