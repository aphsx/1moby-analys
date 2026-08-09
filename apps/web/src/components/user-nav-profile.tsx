"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusDialog } from "@/components/status-dialog";
import { signOut, useSession } from "@/lib/auth";

const WHITESPACE_RE = /\s+/;

function initials(name: string) {
  const parts = name.trim().split(WHITESPACE_RE).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
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
      <div className="border-gray-200 border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-gray-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user.name?.trim() || user.email?.split("@")[0] || "User";

  return (
    <>
      <div className="border-gray-200 border-t px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50"
            href="/profile"
            title="จัดการบัญชี"
          >
            {user.image ? (
              <img
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                height={36}
                referrerPolicy="no-referrer"
                src={user.image}
                width={36}
              />
            ) : (
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--moby-600)] font-semibold text-white text-xs"
              >
                {initials(displayName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[13px] text-[color:var(--ink-1)]">
                {displayName}
              </p>
              {user.email && (
                <p className="truncate text-[11.5px] text-[color:var(--ink-4)]">
                  {user.email}
                </p>
              )}
            </div>
          </Link>
          <button
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--ink-4)] transition-colors hover:bg-gray-100 hover:text-[color:var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loggingOut}
            onClick={() => setConfirmLogout(true)}
            title="Sign out"
            type="button"
          >
            <LogOut size={16} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      {confirmLogout && (
        <StatusDialog
          cancelLabel="ยกเลิก"
          confirmLabel="ออกจากระบบ"
          loading={loggingOut}
          message="คุณต้องการออกจากระบบใช่หรือไม่?"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => void handleLogout()}
          open
          title="ยืนยันการออกจากระบบ"
          tone="warning"
        />
      )}
    </>
  );
}
