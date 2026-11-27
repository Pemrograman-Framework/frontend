export const TAX_RATE = 0.11

// Total memakai angka dari backend bila ada (PO lama bisa tanpa PPN); selain itu subtotal + PPN 11%
export const total = (purchaseOrder) =>
  purchaseOrder.total ?? purchaseOrder.items.reduce((sum, item) => sum + item.q * item.p, 0) * (1 + TAX_RATE)

export const kg = (purchaseOrder) =>
  purchaseOrder.items.reduce((sum, item) => sum + item.q, 0)
