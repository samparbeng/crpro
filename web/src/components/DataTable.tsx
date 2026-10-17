import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** Value used for sorting and text search (defaults to row[key]). */
  value?: (row: T) => string | number | null | undefined;
  align?: "right";
  sortable?: boolean;
  /** Hide this column on phone-sized screens. */
  hideSm?: boolean;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: string;
  footer?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
};

export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty = "Nothing here yet.", footer, initialSort }: Props<T>) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.value ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string | number | null);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  if (!rows.length) return <div className="empty">{empty}</div>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false;
              return (
                <th
                  key={c.key}
                  className={`${c.align ?? ""} ${sortable ? "sortable" : ""} ${c.hideSm ? "hide-sm" : ""}`}
                  onClick={sortable ? () => toggle(c.key) : undefined}
                  aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.header}
                  {sort?.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? "clickable" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${c.align ?? ""} ${c.hideSm ? "hide-sm" : ""}`}>
                  {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

/** Client-side text filter across the given fields. */
export function useSearch<T>(rows: T[] | undefined, fields: (row: T) => (string | number | null | undefined)[]) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => fields(r).some((v) => v != null && String(v).toLowerCase().includes(needle)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);
  return { q, setQ, filtered };
}
