/** Static support-desk documents. Same in starter and solution: the lesson is about how they are exposed. */
export interface Policy {
  topic: string;
  title: string;
  body: string;
}

export const POLICIES: Policy[] = [
  {
    topic: 'refunds',
    title: 'Refund policy',
    body: '# Refund policy\n\nRefunds are issued to the original payment method within 5 business days. Orders can be refunded up to 30 days after delivery. Duplicate charges are always refunded in full and escalated to billing.',
  },
  {
    topic: 'shipping',
    title: 'Shipping policy',
    body: '# Shipping policy\n\nOrders ship within 2 business days. Carriers: UPS, DHL, FedEx. Premium customers get free express shipping. Tracking numbers appear once an order is shipped.',
  },
  {
    topic: 'warranty',
    title: 'Warranty policy',
    body: '# Warranty policy\n\nElectronics carry a 2-year warranty. Warranty claims need the order id and a description of the defect.',
  },
  {
    topic: 'account-security',
    title: 'Account security',
    body: '# Account security\n\nPassword reset emails expire after 1 hour. Never ask a customer for their password. Locked accounts are escalated to a human.',
  },
];
