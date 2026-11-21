"use client";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type UserItem = {
  id: number;
  phone: string;
  name: string;
  role: string;
  page_name: string;
  page_url: string;
  seller_trust: number;
  buyer_trust: number;
  is_suspended: number;
  created_at: string;
  seller_deals_count: number;
  buyer_deals_count: number;
};

export default function AdminUsersPage() {
  const { t, lang } = useI18n();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<number | null>(null);

  const loadUsers = () => {
    setLoading(true);
    let url = "/admin/users";
    if (search.trim()) url += "?q=" + encodeURIComponent(search.trim());
    api<UserItem[]>(url)
      .then((data) => {
        // Exclude admin accounts defensively
        const nonAdmin = (data || []).filter(
          (u) =>
            u.phone !== "01700000000" &&
            !u.name?.toLowerCase().includes("admin") &&
            u.role?.toLowerCase() !== "admin"
        );
        setUsers(nonAdmin);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleSuspend = async (user: UserItem) => {
    const action = user.is_suspended ? "reactivate" : "suspend";
    const confirmMsg =
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে ${user.phone} নম্বর ব্যবহারকারীকে ${user.is_suspended ? "পুনরায় সক্রিয়" : "সাসপেন্ড"} করতে চান?`
        : `Are you sure you want to ${action} user ${user.phone}?`;
    if (!confirm(confirmMsg)) return;
    setActing(user.id);
    try {
      await post(`/admin/users/${user.id}/suspend`);
      loadUsers();
    } catch (x: any) {
      alert(x.message || (lang === "bn" ? "ব্যবহারকারীর স্ট্যাটাস আপডেট করতে ব্যর্থ হয়েছে" : "Failed to update user status"));
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("userManagement")}</h1>
        <p className="text-sm text-neutral-500">
          {lang === "bn"
            ? "অ্যাকাউন্টের ট্রাস্ট স্কোর, লেনদেনের ইতিহাস এবং নিরাপত্তা সাসপেনশন পর্যবেক্ষণ করুন।"
            : "Monitor account trust scores, transaction histories, and security suspensions."}
        </p>
      </div>

      <div className="flex justify-between items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadUsers();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder={lang === "bn" ? "ফোন বা নাম দিয়ে খুঁজুন..." : "Search by phone or name..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 text-xs py-1.5 px-3 border border-neutral-300 dark:border-neutral-700"
          />
          <button type="submit" className="btn text-xs py-1 px-4">
            {lang === "bn" ? "অনুসন্ধান" : "Search"}
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">{t("loading")}</p>
      ) : users.length === 0 ? (
        <div className="box p-8 text-center text-sm text-neutral-500">
          {lang === "bn" ? "কোনো ব্যবহারকারী পাওয়া যায়নি।" : "No users found."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs uppercase font-semibold text-neutral-500">
              <tr>
                <th className="px-4 py-3">{lang === "bn" ? "ব্যবহারকারী / দোকান" : "User / Shop"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ফোন নম্বর" : "Phone"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "সক্রিয় ভূমিকা" : "Active Role"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "বিক্রেতা ট্রাস্ট" : "Seller Trust"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ক্রেতা ট্রাস্ট" : "Buyer Trust"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "ডিলসমূহ (বি/ক)" : "Deals (S/B)"}</th>
                <th className="px-4 py-3">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</th>
                <th className="px-4 py-3 text-right">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{u.name || "—"}</div>
                    {u.page_name && <div className="text-neutral-500">{u.page_name}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono">{u.phone}</td>
                  <td className="px-4 py-3 uppercase text-neutral-600 dark:text-neutral-400">
                    {lang === "bn"
                      ? (u.role?.toLowerCase() === "seller" ? "বিক্রেতা" : u.role?.toLowerCase() === "buyer" ? "ক্রেতা" : u.role)
                      : u.role}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-accent">{u.seller_trust}/100</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {u.buyer_trust}/100
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {u.seller_deals_count} / {u.buyer_deals_count}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 border text-xs font-semibold ${
                        u.is_suspended
                          ? "border-rose-600 text-rose-600 bg-rose-600/5"
                          : "border-emerald-600 text-emerald-600 bg-emerald-600/5"
                      }`}
                    >
                      {u.is_suspended
                        ? (lang === "bn" ? "স্থগিত" : "Suspended")
                        : (lang === "bn" ? "সক্রিয়" : "Active")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleSuspend(u)}
                      disabled={acting === u.id}
                      className={u.is_suspended ? "btn-success text-xs py-1 px-3" : "btn-danger text-xs py-1 px-3"}
                    >
                      {acting === u.id
                        ? (lang === "bn" ? "প্রক্রিয়াকরণ..." : "...")
                        : u.is_suspended
                        ? t("unsuspend")
                        : t("suspend")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
