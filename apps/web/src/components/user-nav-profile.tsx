"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import { signOut, useSession } from "@/lib/auth/client";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function UserNavProfile() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const user = session?.user;

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  if (isPending) {
    return (
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="h-8 w-8 shrink-0 rounded-full bg-raised" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-raised" />
            <div className="h-3 w-32 rounded bg-raised" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.name?.trim() || user.email?.split("@")[0] || "User";

  return (
    <>
      <div className="border-t border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href="/profile"
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
          >
            {user.image ? (
              <img
                src={user.image}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-micro font-semibold text-accent-ink"
                aria-hidden
              >
                {initials(displayName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-text">
                {displayName}
              </p>
              {user.email && (
                <p className="truncate text-micro text-muted">
                  {user.email}
                </p>
              )}
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            disabled={loggingOut}
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-50 min-[860px]:h-8 min-[860px]:w-8"
          >
            <LogOut size={16} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      {confirmLogout && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการออกจากระบบ"
          message="คุณต้องการออกจากระบบใช่หรือไม่?"
          confirmLabel="ออกจากระบบ"
          cancelLabel="ยกเลิก"
          loading={loggingOut}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => void handleLogout()}
        />
      )}
    </>
  );
}
