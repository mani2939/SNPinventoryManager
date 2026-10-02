"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Gem, LayoutList, Plus, Settings, LogOut } from "lucide-react";
export function Shell({
  children,
  demo,
}: {
  children: React.ReactNode;
  demo: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error("Unable to sign out. Try again.");
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/inventory" className="brand">
          <Image
            src="/logo.webp"
            alt="Shapes and Pieces"
            width={66}
            height={66}
          />
          <div>
            Shapes & Pieces<span>THE INVENTORY STUDIO</span>
          </div>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { href: "/inventory", label: "Inventory", icon: LayoutList },
            { href: "/products/new", label: "Add product", icon: Plus },
            { href: "/settings", label: "Settings", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              className={pathname === href ? "nav-link active" : "nav-link"}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="brand-note">
            <Gem size={25} />
            <p>
              Every piece,
              <br />
              <strong>beautifully accounted for.</strong>
            </p>
          </div>
          <button className="logout" onClick={logout} disabled={busy}>
            <LogOut size={18} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="topbar-title">Inventory studio</span>
            <span className="topbar-divider">/</span>
            <span className="muted">
              {pathname === "/settings"
                ? "Settings"
                : pathname.includes("/products")
                  ? "Product entry"
                  : "Collection"}
            </span>
          </div>
          <div className="account">
            <span className="avatar">SA</span>
            <span>
              Admin<span className="account-caption">Shapes & Pieces</span>
            </span>
            <button
              className="icon-button mobile-logout"
              aria-label="Sign out"
              onClick={logout}
              disabled={busy}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {demo ? (
          <div className="demo-banner">
            Local demo · Neon and PeaSoup are not connected. Preview data
            stays on this computer.
          </div>
        ) : null}
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
