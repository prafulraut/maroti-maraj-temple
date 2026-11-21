/**
 * Opens a printable donation receipt in a new window.
 * Works for both admins (any donation) and devotees (their own donations).
 */
const esc = (v: any): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

/** Indian numbering: 1,23,45,678 → "One Crore Twenty Three Lakh …" */
export function amountInWords(amount: number): string {
  let n = Math.floor(Number(amount) || 0);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) parts.push(`${amountInWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (n) parts.push(twoDigits(n));
  return parts.join(' ');
}

export function printDonationReceipt(d: any): void {
  const date = new Date(d.donationDate || d.createdAt);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const amount = Number(d.amount || 0).toLocaleString('en-IN');
  const statusColor = d.paymentStatus === 'Completed' ? '#166534' : d.paymentStatus === 'Pending' ? '#854d0e' : '#991b1b';
  const stop = d.palkhiStop && typeof d.palkhiStop === 'object' ? ` — ${esc(d.palkhiStop.familyName)}, ${esc(d.palkhiStop.city)}` : '';

  const row = (label: string, value: string) => value ? `<tr><th>${label}</th><td>${value}</td></tr>` : '';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 24px; }
  .receipt { max-width: 640px; margin: 0 auto; border: 2px solid #ea580c; border-radius: 12px; padding: 28px; }
  .head { text-align: center; border-bottom: 1px dashed #fdba74; padding-bottom: 14px; margin-bottom: 18px; }
  .head h1 { margin: 4px 0; color: #9a3412; font-size: 24px; }
  .head p { margin: 2px 0; color: #6b7280; font-size: 13px; }
  .meta { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th { text-align: left; width: 38%; color: #6b7280; font-weight: normal; padding: 7px 0; vertical-align: top; }
  td { padding: 7px 0; }
  .amount { margin: 18px 0; padding: 14px; background: #fff7ed; border-radius: 8px; text-align: center; }
  .amount strong { font-size: 26px; color: #9a3412; }
  .amount div { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .status { font-weight: bold; color: ${statusColor}; }
  .foot { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #6b7280; }
  .sign { border-top: 1px solid #9ca3af; padding-top: 4px; min-width: 180px; text-align: center; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body>
  <div class="receipt">
    <div class="head">
      <div style="font-size:32px">🛕</div>
      <h1>Maroti Maharaj Temple</h1>
      <p>Donation Receipt</p>
    </div>
    <div class="meta">
      <span><b>Receipt No:</b> ${esc(d.receiptNo || '—')}</span>
      <span><b>Date:</b> ${esc(dateStr)}</span>
    </div>
    <table>
      ${row('Received with thanks from', esc(d.name))}
      ${row('Phone', esc(d.phone))}
      ${row('Email', esc(d.email))}
      ${row('Address', esc(d.address))}
      ${row('Purpose', esc(d.purpose))}
      ${d.palkhiDay ? row('Palkhi', `Day ${esc(d.palkhiDay)}${stop}`) : ''}
      ${row('Payment mode', esc(d.paymentMode))}
      ${row('Transaction / Ref no.', esc(d.transactionId))}
      ${row('Status', `<span class="status">${esc(d.paymentStatus)}</span>`)}
    </table>
    <div class="amount">
      <strong>₹ ${amount}</strong>
      <div>Rupees ${esc(amountInWords(d.amount))} Only</div>
    </div>
    ${d.message ? `<p style="font-style:italic;color:#6b7280">“${esc(d.message)}”</p>` : ''}
    <div class="foot">
      <span>🙏 May Maroti Maharaj bless you and your family.</span>
      <span class="sign">Authorised Signatory</span>
    </div>
  </div>
  <p class="noprint" style="text-align:center;margin-top:16px">
    <button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer">🖨️ Print / Save as PDF</button>
  </p>
</body></html>`;

  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) {
    alert('Please allow pop-ups to view the receipt.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
