import type { Metadata } from "next";
import { pageTitle } from "@/lib/nav";
import { ProfileView } from "@/features/profile/profile-view";

export const metadata: Metadata = { title: pageTitle("/profile") };

export default function ProfilePage() {
  return <ProfileView />;
}
