// The sign-in card for the daughter: setup (/start) and her dashboard. One action, a few facts, no clutter.
import Image from "next/image";
import Link from "next/link";
import LogoMark from "./LogoMark";

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0">
      <circle cx="8" cy="8" r="8" className="fill-foreground" />
      <path d="M4.8 8.2 7 10.3l4.2-4.6" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthCard({
  title,
  subtitle,
  action,
  busy = false,
  onAction,
  points,
  alt,
  error,
  image,
}: {
  title: string;
  subtitle: string;
  action: string;
  busy?: boolean;
  onAction: () => void;
  points: string[];
  alt: { text: string; link: string; href: string };
  error?: string | null;
  image?: { src: string; alt: string; position?: string };
}) {
  return (
    <div className="mx-auto w-full max-w-sm pt-6 sm:pt-12">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_12px_32px_-12px_rgba(10,10,10,0.12)]">
        {image && (
          <div className="relative h-48 bg-surface">
            <Image src={image.src} alt={image.alt} fill priority sizes="384px" className="object-cover" style={{ objectPosition: image.position ?? "center" }} />
          </div>
        )}
        <div className={`p-7 ${image ? "pt-0" : ""}`}>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${image ? "relative -mt-6 border-4 border-white bg-white shadow-sm" : "bg-surface"}`}>
          <LogoMark className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[15px] text-secondary">{subtitle}</p>

        <button
          onClick={onAction}
          disabled={busy}
          className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-foreground px-5 font-medium text-background transition-colors duration-150 hover:bg-[#262626] disabled:opacity-60"
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" aria-hidden="true" />}
          {action}
        </button>
        <p className="mt-3 text-center text-[13px] text-muted">Email or Google. No password to remember.</p>

        {error && <p className="mt-4 rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

        <ul className="mt-7 space-y-3 border-t border-line pt-6 text-[15px]">
          {points.map((p) => (
            <li key={p} className="flex gap-3">
              <Check />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        {alt.text}{" "}
        <Link href={alt.href} className="font-medium text-foreground underline-offset-4 hover:underline">{alt.link}</Link>
      </p>
    </div>
  );
}
