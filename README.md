# 💸 ChiaTiền — chia tiền đi chơi

Web app tĩnh (chạy được trên GitHub Pages, hoạt động offline) để chia chi phí chuyến đi.

## Tính năng
- **Nhiều loại tiền tệ**: mỗi khoản một loại tiền; tỷ giá tự động theo ngày (fawazahmed0 currency-api / Frankfurter), ghi đè tay, hoặc tính từ các lần đổi tiền thực tế; phí thẻ %.
- **Trợ lý AI (Gemma 4, agentic)**: gõ hoặc nói tự nhiên — "Tối qua An trả 1tr2 lẩu, chia đều trừ Chi", "tạo chuyến Đà Lạt với 4 người", "ai nợ ai?" — trợ lý tự gọi các tool (tạo chuyến, thêm người, thêm/sửa/xóa khoản, chuyển tiền, tỷ giá, nhóm…), gửi kèm ảnh hóa đơn được, và có nút **Hoàn tác** cho mỗi lượt.
- **Quét hóa đơn bằng Gemma 4** với structured JSON output: đọc tên quán, ngày, từng món, thuế/phí/tip/giảm giá → gán món cho từng người.
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
Vào <https://aistudio.google.com/apikey> → Create API key → dán vào **Cài đặt** trong app. Model mặc định `gemma-4-31b-it` (nhanh hơn: `gemma-4-26b-a4b-it`); bật "Chế độ suy nghĩ" cho yêu cầu phức tạp.

## Cấu trúc
- `src/domain/` — engine thuần (tiền tệ, chia, số dư, quyết toán, gộp) + test.
- `src/agent/` — trợ lý: khai báo tool, thực thi (có snapshot để hoàn tác), vòng lặp function calling + test.
- `src/services/` — IndexedDB, tỷ giá, Gemini API client, quét hóa đơn, chia sẻ, VietQR, CSV.
- `src/features/` — các màn hình.
