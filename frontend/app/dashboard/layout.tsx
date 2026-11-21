"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AppSidebar from "@/components/AppSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) {
      router.push("/login");
    }
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-sm text-neutral-500">Checking credentials...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full flex-1">
      <div className="flex flex-col md:flex-row border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black min-h-[calc(100vh-6rem)]">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-x-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}
