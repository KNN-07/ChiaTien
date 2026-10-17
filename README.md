# 💸 ChiaTiền — chia tiền đi chơi

Web app tĩnh (chạy được trên GitHub Pages, hoạt động offline) để chia chi phí chuyến đi.

## Tính năng
- **Nhiều loại tiền tệ**: mỗi khoản một loại tiền; tỷ giá tự động theo ngày (fawazahmed0 currency-api / Frankfurter), ghi đè tay, hoặc tính từ các lần đổi tiền thực tế; phí thẻ %.
- **Quét hóa đơn bằng Gemma** (Google AI Studio API key): đọc tên quán, ngày, từng món, thuế/phí/tip/giảm giá → gán món cho từng người.
- **Ai trả**: một người, nhiều người cùng trả, hoặc **quỹ chung**.
- **Cách chia**: đều, theo số tiền, %, theo phần (trẻ em 0.5…), đều + điều chỉnh, theo món (thuế/phí phân bổ theo tỷ lệ hoặc chia đều), "bao".
- **Khoản thu / hoàn tiền** (hoàn cọc, bán lại đồ).
- **Nhóm con** (phòng, xe…), **hộ/cặp đôi** quyết toán chung, **khách** tính cho người mời, **ngày tham gia/rời đi**.
- **Quyết toán**: tối giản số lần chuyển hoặc trả trực tiếp người ứng tiền, chọn tiền tệ & làm tròn, **VietQR**, ghi nhận đã trả, sao chép tóm tắt dán Zalo/Messenger.
- Thống kê theo danh mục/người/ngày; xuất CSV/JSON; **link chia sẻ** (dữ liệu nén trong URL) có gộp thông minh.
- Tiếng Việt / English, giao diện sáng/tối, PWA.

Dữ liệu lưu trong IndexedDB của trình duyệt — không có server. API key chỉ lưu trên máy bạn và gửi thẳng tới Google.

## Chạy local
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test engine chia tiền
npm run build    # ra thư mục dist/
```

## Deploy GitHub Pages
1. Push repo lên GitHub (nhánh `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` sẽ test, build và deploy mỗi lần push.

`vite.config.ts` dùng `base: './'` và `HashRouter`, nên chạy được ở bất kỳ đường dẫn con nào (`https://<user>.github.io/<repo>/`).

## Lấy API key Gemma
Vào <https://aistudio.google.com/apikey> → Create API key → dán vào **Cài đặt** trong app. Model mặc định `gemma-3-27b-it`; bấm "Tải danh sách model" để chọn model khác.

## Cấu trúc
- `src/domain/` — engine thuần (tiền tệ, chia, số dư, quyết toán, gộp) + test.
- `src/services/` — IndexedDB, tỷ giá, Gemma, chia sẻ, VietQR, CSV.
- `src/features/` — các màn hình.
