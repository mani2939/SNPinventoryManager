"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { api, money, displayDate } from "@/lib/client";
import type { Invoice } from "@/lib/invoices/types";
export function InvoiceRegister() {
  const [rows, setRows] = useState<Invoice[]>([]),
    [count, setCount] = useState(0),
    [name, setName] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void api<{ invoices: Invoice[]; count: number }>("/api/invoices/search", {
        method: "POST",
        body: JSON.stringify({
          name,
          from: from || undefined,
          to: to || undefined,
          page,
        }),
        signal: c.signal,
      })
        .then((v) => {
          if (c.signal.aborted) return;
          setRows(v.invoices);
          setCount(v.count);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setRows([]);
            setCount(0);
          }
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [name, from, to, page]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DAILY CUSTOMER ORDERS</span>
          <h1>Invoice register</h1>
          <p className="muted">
            Find daily invoices by customer name and date.
          </p>
        </div>
        <Link className="button primary" href="/invoices/new">
          <Plus size={18} />
          Create invoice
        </Link>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="card inventory-card">
        <div className="table-title">
          <div>
            <h2>Customer invoices</h2>
            <p>GBP · saved prices and customer details</p>
          </div>
          <span className="count-pill">{loading ? "…" : count} invoices</span>
        </div>
        <div className="filters">
          <label>
            Customer name
            <input
              type="search"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPage(1);
              }}
              placeholder="Start of a first or last name"
              maxLength={150}
            />
          </label>
          <label>
            From date
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {name || from || to ? (
            <button
              className="text-button"
              onClick={() => {
                setName("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {loading ? (
          <div className="table-empty" role="status">
            Loading invoices…
          </div>
        ) : rows.length ? (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Customer invoices"
          >
            <table>
              <thead>
                <tr>
                  <th>Invoice / customer</th>
                  <th>Date</th>
                  <th>Due date</th>
                  <th>Items</th>
                  <th>Total · GBP</th>
                  <th>Status</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link
                        className="invoice-number-link"
                        href={`/invoices/${i.id}`}
                      >
                        {i.invoice_number}
                      </Link>
                      <span className="description">{i.customer_name}</span>
                    </td>
                    <td>{displayDate(i.invoice_date)}</td>
                    <td>{displayDate(i.due_date)}</td>
                    <td>{i.items.reduce((n, item) => n + item.quantity, 0)}</td>
                    <td className="number-strong">
                      {money(i.total_gbp, "GBP")}
                    </td>
                    <td>
                      <span className={`invoice-status ${i.status}`}>
                        {i.status}
                      </span>
                    </td>
                    <td>
                      <a
                        className="icon-button"
                        href={`/api/invoices/${i.id}/pdf`}
                        aria-label={`Download ${i.invoice_number} PDF`}
                      >
                        <Download size={17} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-empty">
            <h3>No invoices found</h3>
            <p>
              {name || from || to
                ? "Try another customer name or date range."
                : "Create an invoice after your next live."}
            </p>
          </div>
        )}
        <div className="pagination">
          <span>
            {count
              ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}`
              : "0 invoices"}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(count / 25))}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={page * 25 >= count || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
