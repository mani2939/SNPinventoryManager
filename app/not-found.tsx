import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Piece not found</h1>
      <p>This product may have been removed.</p>
      <Link className="button primary" href="/inventory">
        Back to inventory
      </Link>
    </main>
  );
}
