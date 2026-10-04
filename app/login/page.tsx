import { redirect } from "next/navigation";
import Image from "next/image";
import { currentSession, demoMode, preferredWorkspace } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const params = await searchParams;
  const workspace =
    params.workspace === "invoicing"
      ? "invoicing"
      : params.workspace === "inventory"
        ? "inventory"
        : undefined;
  const session = await currentSession();
  if (
    session &&
    (!workspace || session.role === "master" || session.role === workspace)
  )
    redirect(
      workspace === "invoicing"
        ? "/invoices"
        : workspace === "inventory"
          ? "/inventory"
          : await preferredWorkspace(),
    );
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
          <p className="muted">
            Choose a workspace to manage inventory or customer invoices.
          </p>
          <LoginForm workspace={workspace || "inventory"} />
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
