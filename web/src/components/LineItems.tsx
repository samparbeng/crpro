import { fmtMoney } from "../format";

export type EditableItem = {
  description: string;
  quantity: string;
  unitPrice: string;
  unit?: string;
  rateId?: number | null;
  reservationId?: number | null;
};

export const blankItem = (): EditableItem => ({ description: "", quantity: "1", unitPrice: "", unit: "" });

export const itemsTotal = (items: EditableItem[]) =>
  items.reduce((s, i) => s + Math.round((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * 100) / 100, 0);

type Props = {
  items: EditableItem[];
  onChange: (items: EditableItem[]) => void;
  showUnit?: boolean;
  currency?: "USD" | "GHS";
  quantityLabel?: string;
};

export function LineItemsEditor({ items, onChange, showUnit, currency, quantityLabel = "Qty" }: Props) {
  const update = (i: number, patch: Partial<EditableItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="table-wrap">
      <table className="table items-editor">
        <thead>
          <tr>
            <th style={{ width: "45%" }}>Description</th>
            {showUnit && <th>Unit</th>}
            <th className="right">{quantityLabel}</th>
            <th className="right">Unit price{currency ? ` (${currency})` : ""}</th>
            <th className="right">Total</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>
                <input className="input" aria-label="Description" value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
              </td>
              {showUnit && (
                <td>
                  <input className="input" aria-label="Unit" value={it.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} />
                </td>
              )}
              <td>
                <input className="input right" aria-label={quantityLabel} type="number" min="0" step="any" value={it.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              </td>
              <td>
                <input className="input right" aria-label="Unit price" type="number" min="0" step="any" value={it.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
              </td>
              <td className="right mono" style={{ verticalAlign: "middle" }}>
                {fmtMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
              </td>
              <td style={{ verticalAlign: "middle" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} disabled={items.length === 1} aria-label="Remove line">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={showUnit ? 4 : 3}>
              <button type="button" className="btn btn-sm" onClick={() => onChange([...items, blankItem()])}>
                + Add line
              </button>
            </td>
            <td className="right mono">{fmtMoney(itemsTotal(items), currency)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export const toPayloadItems = (items: EditableItem[]) =>
  items.map((i) => ({
    description: i.description,
    unit: i.unit || null,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unitPrice || 0),
    rateId: i.rateId ?? null,
    reservationId: i.reservationId ?? null,
  }));
