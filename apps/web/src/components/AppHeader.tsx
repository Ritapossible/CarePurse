"use client";
// The header inside the app (setup, dashboard, account). Signed in: Dashboard, her notifications
// bell (with the unread count) and her photo with an account menu. Signed out: a quiet Sign in.
// No marketing links and no "Launch App" here.
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Profile, useFamilyApi } from "@/lib/family";
import { Logo } from "./SiteHeader";

export function Avatar({ name, src, className = "h-9 w-9 text-sm" }: { name?: string | null; src?: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small data URL from her own upload
    <img src={src} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-foreground font-medium text-background ${className}`}>
      {(name ?? "?").trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

export default function AppHeader() {
  const { ready, authenticated, logout, user } = usePrivy();
  const api = useFamilyApi();
  const router = useRouter();
  const path = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const email = user?.email?.address ?? user?.google?.email ?? null;

  const load = useCallback(() => {
    api<{ profile: Profile | null }>("GET", "profile").then((r) => setProfile(r.profile)).catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setTimeout(load, 0);
    window.addEventListener("carepurse:profile", load); // the account page saved a change
    // The bell's count stays fresh: when she comes back to the tab, and every minute while it's open.
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => { clearTimeout(t); clearInterval(timer); window.removeEventListener("carepurse:profile", load); document.removeEventListener("visibilitychange", refresh); };
  }, [ready, authenticated, load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const name = profile?.name ?? email?.split("@")[0] ?? null;
  const item = "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 hover:bg-surface";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[#fbf9f6]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        {ready && !authenticated && (
          <Link href="/dashboard" className="text-[15px] font-medium text-secondary transition-colors duration-150 hover:text-foreground">Sign in</Link>
        )}
        {ready && authenticated && (
          <div className="flex items-center gap-3 sm:gap-4">
            {path !== "/dashboard" && profile && (
              <Link href="/dashboard" className="text-[15px] text-secondary transition-colors duration-150 hover:text-foreground">Dashboard</Link>
            )}
            {profile?.purseStatus === "active" && (
              <button
                onClick={() => (path === "/dashboard" ? window.dispatchEvent(new Event("carepurse:open-alerts")) : router.push("/dashboard?alerts=1"))}
                aria-label={`Notifications${profile.unread ? `, ${profile.unread} new` : ""}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-colors duration-150 hover:bg-surface hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {profile.unread ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-medium leading-none text-background">{profile.unread > 9 ? "9+" : profile.unread}</span>
                ) : null}
              </button>
            )}
            <div className="relative" ref={menu}>
              <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="rounded-full ring-offset-2 transition-shadow focus-visible:ring-2 focus-visible:ring-foreground">
                <Avatar name={name} src={profile?.avatar} />
              </button>
              {open && (
                <div className="absolute right-0 top-12 w-64 rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <Avatar name={name} src={profile?.avatar} className="h-10 w-10 text-sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="truncate text-xs text-muted">{email}</div>
                    </div>
                  </div>
                  <div className="my-1 border-t border-line" />
                  {profile && <Link href="/dashboard" onClick={() => setOpen(false)} className={item}>Dashboard</Link>}
                  <Link href="/account" onClick={() => setOpen(false)} className={item}>Account settings</Link>
                  <div className="my-1 border-t border-line" />
                  <button onClick={() => logout().then(() => router.push("/"))} className={item}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
