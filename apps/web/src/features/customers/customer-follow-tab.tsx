"use client";
/** การติดตาม: log a contact and read the account's history (CUSTOMER-PAGES.md §3.6). */
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, type ContactChannel, type ContactOutcome } from "@moby/types";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BUTTON, EmptyState, Panel, Skeleton, StatusPill } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { CONTACT_CHANNEL_LABEL, CONTACT_OUTCOME_LABEL } from "@/lib/labels";
import { createCustomerContact, fetchCustomerContacts } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { useAsync } from "@/lib/use-async";

const FIELD = "h-9 w-full rounded-control border border-control bg-surface px-3 text-body text-text max-[859px]:h-11";
const NOTE_MAX = 2000;

export function CustomerFollowTab({ accId, focusForm }: { accId: string; focusForm: boolean }) {
  const contacts = useAsync(() => fetchCustomerContacts(accId), [accId]);
  const [channel, setChannel] = useState<ContactChannel>("phone");
  const [outcome, setOutcome] = useState<ContactOutcome>("reached");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusForm) noteRef.current?.focus();
  }, [focusForm]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await createCustomerContact(accId, { channel, outcome, note: note.trim(), next_follow_up: nextFollowUp || null });
      setNote("");
      setNextFollowUp("");
      contacts.reload();
    } catch (err: unknown) {
      setSaveError(getDisplayError(err, "บันทึกการติดตามไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="บันทึกการติดต่อ" meta="ทุกคนในทีมเห็นประวัติเดียวกัน">
        <form onSubmit={submit} className="grid gap-4 min-[860px]:grid-cols-3">
          <label className="block text-small text-muted">
            ช่องทาง
            <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)} className={`${FIELD} mt-1`}>
              {CONTACT_CHANNELS.map((c) => (
                <option key={c} value={c}>{CONTACT_CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <label className="block text-small text-muted">
            ผลการติดต่อ
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as ContactOutcome)} className={`${FIELD} mt-1`}>
              {CONTACT_OUTCOMES.map((o) => (
                <option key={o} value={o}>{CONTACT_OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </label>
          <label className="block text-small text-muted">
            ติดตามครั้งถัดไป
            <input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="block text-small text-muted min-[860px]:col-span-3">
            บันทึก
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={3}
              className="mt-1 w-full rounded-control border border-control bg-surface px-3 py-2 text-body text-text"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 min-[860px]:col-span-3">
            <button type="submit" disabled={saving} className={BUTTON.primary}>
              {saving ? "กำลังบันทึก…" : "บันทึกการติดตาม"}
            </button>
            {saveError ? <p role="alert" className="text-small text-negative">{saveError}</p> : null}
          </div>
        </form>
      </Panel>

      <Panel title="ประวัติการติดตาม">
        {contacts.error ? (
          <p role="alert" className="text-body text-text">
            โหลดประวัติไม่สำเร็จ · {getDisplayError(contacts.error, "เกิดข้อผิดพลาด")}{" "}
            <button type="button" onClick={contacts.reload} className="font-medium text-accent-ink underline underline-offset-2">
              ลองอีกครั้ง
            </button>
          </p>
        ) : !contacts.data ? (
          <Skeleton className="h-24" />
        ) : contacts.data.length === 0 ? (
          <EmptyState title="ยังไม่มีการติดตาม" hint="บันทึกการโทรครั้งแรกเพื่อเริ่มดูผลลัพธ์" />
        ) : (
          <ul className="divide-y divide-rule">
            {contacts.data.map((c) => (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill>{CONTACT_OUTCOME_LABEL[c.outcome]}</StatusPill>
                  <span className="text-body text-text">{CONTACT_CHANNEL_LABEL[c.channel]}</span>
                  <span className="num text-small text-muted">
                    {formatDateTime(c.created_at)}
                    {c.created_by_name ? ` · ${c.created_by_name}` : ""}
                  </span>
                </div>
                {c.note ? <p className="mt-1 whitespace-pre-wrap break-words text-body text-text">{c.note}</p> : null}
                {c.next_follow_up ? <p className="num mt-1 text-small text-muted">ติดตามครั้งถัดไป {formatDate(c.next_follow_up)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
