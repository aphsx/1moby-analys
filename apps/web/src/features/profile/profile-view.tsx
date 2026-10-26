"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import { deleteUser, updateUser, useSession } from "@/lib/auth/client";
import { formatDate } from "@/lib/format";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ProfileView() {
  const router = useRouter();
  const { data: session, isPending, refetch } = useSession();
  const user = session?.user;

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed the form once the session resolves.
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setImage(user.image ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-faint">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-muted">ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่</div>
    );
  }

  const displayName = name.trim() || user.email?.split("@")[0] || "ผู้ใช้";
  const dirty = name.trim() !== (user.name ?? "").trim() || image.trim() !== (user.image ?? "").trim();
  const createdAt = formatDate(user.createdAt);

  const handleSave = async () => {
    if (!dirty || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateUser({ name: name.trim(), image: image.trim() || undefined });
      if (res.error) throw new Error(res.error.message || "บันทึกไม่สำเร็จ");
      await refetch();
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteUser();
      if (res.error) throw new Error(res.error.message || "ลบบัญชีไม่สำเร็จ");
      router.push("/login");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "ลบบัญชีไม่สำเร็จ");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Identity card */}
      <section className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-start gap-4 sm:items-center">
          {image.trim() ? (
            <img
              src={image.trim()}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-white">
              {initials(displayName)}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 truncate text-[18px] font-semibold text-text">{displayName}</h2>
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-micro font-medium text-accent">
                  <BadgeCheck size={13} /> ยืนยันแล้ว
                </span>
              )}
            </div>
            <p className="truncate text-small text-muted">{user.email}</p>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section className="mt-6 rounded-card border border-border bg-surface p-6">
        <h3 className="mb-4 text-small font-semibold text-faint">
          ข้อมูลส่วนตัว
        </h3>

        <div className="space-y-4">
          <Field label="ชื่อที่แสดง (Display name)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-surface px-3 text-body outline-none focus:border-accent"
              placeholder="ชื่อที่แสดง"
            />
          </Field>

          <Field label="ลิงก์รูปโปรไฟล์ (Image URL)">
            <input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-surface px-3 text-body outline-none focus:border-accent"
              placeholder="https://…"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnly label="ชื่อ (จาก Google)" value={user.givenName} />
            <ReadOnly label="นามสกุล (จาก Google)" value={user.familyName} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnly label="ภาษา/ภูมิภาค" value={user.locale} />
            <ReadOnly label="สมัครเมื่อ" value={createdAt} />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-control border border-negative bg-[var(--pill-negative-bg)] px-4 py-3 text-small text-negative">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
          {savedTick && <span className="text-small text-positive">บันทึกแล้ว</span>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || !name.trim() || saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-5 text-body font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="animate-spin" size={15} />}
            บันทึกการเปลี่ยนแปลง
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="mt-6 rounded-card border border-negative bg-surface p-6">
        <h3 className="text-small font-semibold text-negative">
          ลบบัญชี
        </h3>
        <p className="mt-2 text-small leading-6 text-muted">
          การลบบัญชีจะลบข้อมูลผู้ใช้ของคุณและออกจากทุกอุปกรณ์อย่างถาวร ไม่สามารถกู้คืนได้
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-11 items-center gap-2 rounded-control border border-negative px-5 text-body font-medium text-negative transition-colors hover:bg-[var(--pill-negative-bg)]"
          >
            <Trash2 size={15} /> ลบบัญชีของฉัน
          </button>
        </div>
      </section>

      {confirmDelete && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบบัญชี"
          message="คุณต้องการลบบัญชีนี้อย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
          confirmLabel="ลบบัญชี"
          cancelLabel="ยกเลิก"
          loading={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro font-medium text-text">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="mb-1.5 block text-micro font-medium text-text">{label}</span>
      <div className="flex h-11 items-center rounded-control bg-raised px-3 text-body text-text">
        {value?.trim() || "—"}
      </div>
    </div>
  );
}
