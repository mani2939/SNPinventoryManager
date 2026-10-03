import { redirect } from "next/navigation";
import Image from "next/image";
import { authenticated, demoMode, preferredWorkspace } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
export default async function Login() {
  if (await authenticated()) redirect(await preferredWorkspace());
  return (
    <main className="login-page">
      <section className="login-brand">
        <span className="eyebrow">SHAPES & PIECES</span>
        <Image
          src="/logo.webp"
          alt="Shapes and Pieces logo"
          width={460}
          height={460}
          priority
          className="login-logo"
        />
        <div>
          <h1>
            A place for
            <br />
            every precious piece.
          </h1>
          <p>Your collection. Your costs. All together.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">YOUR BUSINESS WORKSPACE</span>
          <h2>Welcome back</h2>
          <p className="muted">Choose a workspace to manage inventory or customer invoices.</p>
          <LoginForm />
          {demoMode() ? (
            <p className="notice">
              Local demo · changes stay on this computer.
            </p>
          ) : null}
          <p className="login-footer">
            Shapes & Pieces <span>Inventory & invoicing</span>
          </p>
        </div>
      </section>
    </main>
  );
}
