/** Common Vietnamese banks (NAPAS BIN). Any other BIN / VietQR bank code can be typed manually. */
export const BANKS: { bin: string; name: string }[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970443', name: 'SHB' },
  { bin: '970426', name: 'MSB' },
  { bin: '970448', name: 'OCB' },
  { bin: '970440', name: 'SeABank' },
  { bin: '970449', name: 'LPBank' },
  { bin: '970431', name: 'Eximbank' },
  { bin: '970428', name: 'Nam A Bank' },
];

export const bankName = (bin: string) => BANKS.find((b) => b.bin === bin)?.name ?? bin;

/** VietQR image (img.vietqr.io) with amount & message pre-filled. Amount in VND. */
export function vietQrUrl(bank: { bin: string; account: string; holder?: string }, amount: number, info: string) {
  const params = new URLSearchParams({ amount: String(Math.round(amount)), addInfo: info.slice(0, 50) });
  if (bank.holder) params.set('accountName', bank.holder);
  return `https://img.vietqr.io/image/${encodeURIComponent(bank.bin)}-${encodeURIComponent(bank.account)}-compact2.png?${params}`;
}
