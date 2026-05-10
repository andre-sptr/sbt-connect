# Deployment ke VPS Ubuntu via aaPanel

Panduan ini menjelaskan cara deploy proyek `dashboard-bot` ke VPS Ubuntu yang dikelola lewat aaPanel. Proyek ini memakai Next.js, Prisma SQLite, Playwright Chromium, Sharp, dan WAHA untuk WhatsApp.

## 1. Prasyarat

Siapkan:

- VPS Ubuntu dengan aaPanel sudah terpasang.
- Domain/subdomain sudah mengarah ke IP VPS.
- Nginx aktif dari aaPanel.
- Node.js 20 atau 22 LTS.
- PM2 untuk menjalankan aplikasi Node.js.
- Akses SSH ke VPS.
- WAHA aktif dan bisa diakses oleh aplikasi.

Di aaPanel, install dari **App Store**:

- **Nginx**
- **Node.js version manager** atau **PM2 Manager**
- **Docker** jika WAHA ingin dijalankan di VPS yang sama

Jika memakai SSH, cek versi Node:

```bash
node -v
npm -v
```

Jika belum ada PM2:

```bash
npm install -g pm2
```

## 2. Upload proyek

Gunakan salah satu cara berikut.

### Opsi A: Git

Masuk ke VPS:

```bash
cd /www/wwwroot
git clone <URL_REPOSITORY_ANDA> dashboard-bot
cd dashboard-bot
```

### Opsi B: File Manager aaPanel

Upload isi proyek ke:

```text
/www/wwwroot/dashboard-bot
```

Jangan upload folder berikut:

```text
node_modules
.next
storage
database
```

Folder tersebut akan dibuat ulang di server.

## 3. Buat file environment

Masuk ke folder proyek:

```bash
cd /www/wwwroot/dashboard-bot
```

Buat secret:

```bash
openssl rand -base64 32
```

Buat file `.env`:

```bash
nano .env
```

Isi contoh:

```env
DATABASE_URL="file:../database/dashboard-bot.db"
AUTH_SECRET="ganti-dengan-hasil-openssl"
LOGIN_USERNAME="ganti-dengan-username-login"
LOGIN_PASSWORD="ganti-dengan-password-login-kuat"
WAHA_URL="https://waha.domain-anda.com"
WAHA_SESSION="default"
WAHA_API_KEY="ganti-dengan-api-key-waha"
TELEGRAM_BOT_TOKEN="token-bot-dari-botfather"
TELEGRAM_WEBHOOK_SECRET="secret-panjang-untuk-header-webhook"
TELEGRAM_BOT_USERNAME="username_bot_tanpa_at"
```

Catatan:

- `DATABASE_URL="file:../database/dashboard-bot.db"` menyimpan SQLite DB di folder `/www/wwwroot/dashboard-bot/database/dashboard-bot.db`.
- Jangan gunakan `AUTH_SECRET` contoh di production.
- `WAHA_URL` harus bisa diakses dari VPS. Bisa domain publik, subdomain, atau `http://127.0.0.1:3001` jika WAHA berjalan di VPS yang sama.
- `TELEGRAM_WEBHOOK_SECRET` dipakai untuk memvalidasi header `X-Telegram-Bot-Api-Secret-Token` dari Telegram.

## 4. Install dependency

```bash
cd /www/wwwroot/dashboard-bot
npm ci
```

Install browser Chromium untuk Playwright:

```bash
npx playwright install --with-deps chromium
```

Buat folder data:

```bash
mkdir -p database storage/screenshots
```

Generate Prisma client dan buat database SQLite:

```bash
npx prisma generate
npx prisma db push
```

Build aplikasi:

```bash
npm run build
```

## 5. Jalankan dengan PM2

Jalankan Next.js di port `3000`:

```bash
pm2 start npm --name dashboard-bot -- start
pm2 save
pm2 startup
```

Jika `pm2 startup` menampilkan perintah tambahan, jalankan perintah tersebut.

Cek status:

```bash
pm2 status
pm2 logs dashboard-bot
```

Tes dari server:

```bash
curl http://127.0.0.1:3000
```

## 6. Setup website di aaPanel

Di aaPanel:

1. Buka **Website**.
2. Klik **Add site**.
3. Isi domain/subdomain, misalnya `bot.domain-anda.com`.
4. Pilih PHP **Static** atau **Pure static** jika tersedia.
5. Set root ke folder apa saja, misalnya `/www/wwwroot/dashboard-bot-public`.
6. Aktifkan SSL dari menu **SSL** jika domain sudah mengarah ke VPS.

Setelah site dibuat, buka konfigurasi Nginx site tersebut dan tambahkan reverse proxy ke aplikasi Next.js.
Pastikan blok `location ^~ /_next/` diletakkan sebelum `location /`.
Modifier `^~` penting karena rule regex static/cache aaPanel untuk `.css` dan `.js` bisa mengalahkan `location /_next/` biasa.

Contoh konfigurasi di blok `server`:

```nginx
location ^~ /_next/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Jika aaPanel membuat rule khusus untuk file statis seperti `.css`, `.js`, gambar, atau font, hapus/nonaktifkan rule tersebut untuk site ini atau pastikan rule tersebut tidak menangani path `/_next/`.
Rule seperti ini bisa membuat CSS/JS Next.js mendapat `404` karena Nginx mencari file di root static, bukan meneruskan request ke Next.js:

```nginx
location ~ .*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    root /www/wwwroot/dashboard-bot-public;
}
```

Reload Nginx dari aaPanel atau SSH:

```bash
nginx -t
systemctl reload nginx
```

Buka:

```text
https://bot.domain-anda.com
```

Login aplikasi memakai nilai dari `.env`:

```text
Username: LOGIN_USERNAME
Password: LOGIN_PASSWORD
```

## 7. Menjalankan WAHA di VPS yang sama

Lewati bagian ini jika WAHA sudah tersedia di server lain.

Contoh menjalankan WAHA via Docker di port `3001`:

```bash
docker run -d \
  --name waha \
  --restart unless-stopped \
  -p 3001:3000 \
  -e WAHA_API_KEY="ganti-dengan-api-key-kuat" \
  devlikeapro/waha
```

Jika aplikasi dan WAHA berada di VPS yang sama, `.env` aplikasi bisa memakai:

```env
WAHA_URL="http://127.0.0.1:3001"
WAHA_SESSION="default"
WAHA_API_KEY="api-key-yang-sama"
```

Cek WAHA:

```bash
curl http://127.0.0.1:3001/api/sessions
```

Untuk akses dashboard/API WAHA dari browser, lebih aman buat subdomain terpisah seperti `waha.domain-anda.com` dan lindungi dengan firewall, Basic Auth, atau pembatasan IP.

## 8. Menggunakan bot command WhatsApp

Bot command dipakai dengan mengirim pesan WhatsApp ke akun WAHA yang terhubung. Pesan bisa dikirim dari chat pribadi atau grup, selama WAHA menerima event pesan tersebut dan webhook mengarah ke aplikasi.

### Aktifkan webhook WAHA

Set webhook WAHA ke endpoint aplikasi:

```text
https://bot.domain-anda.com/api/webhook/waha
```

Jika WAHA berjalan di VPS yang sama dan hanya diakses dari server, endpoint aplikasi tetap harus memakai domain publik aplikasi, bukan `127.0.0.1`, karena WAHA perlu memanggil route Next.js tersebut.

Di dashboard atau konfigurasi WAHA, pastikan:

- Session yang dipakai sama dengan `WAHA_SESSION` di `.env`.
- Webhook URL mengarah ke `/api/webhook/waha`.
- Event pesan masuk atau `message` aktif.
- `WAHA_API_KEY` di aplikasi sama dengan API key WAHA.

Setelah mengubah konfigurasi webhook atau `.env`, restart aplikasi:

```bash
pm2 restart dashboard-bot
```

### Daftar command

Command bersifat case-insensitive. Pesan yang bukan command dikenal akan diabaikan.

| Command | Fungsi |
| --- | --- |
| `!status` | Menampilkan daftar project aktif dan jadwal berikutnya. |
| `!laporan` | Menjalankan project aktif dengan jadwal terdekat berikutnya. |
| `!run nama-project` | Menjalankan project berdasarkan nama. Nama boleh exact atau sebagian nama project. |

Contoh:

```text
!status
!laporan
!run Reporting Harian
!run reporting
```

Jika `!run` dikirim tanpa nama project, bot akan membalas bahwa nama project harus disertakan.

### Cara memakai dari WhatsApp

1. Pastikan session WAHA sudah tersambung ke WhatsApp.
2. Pastikan aplikasi `dashboard-bot` online di PM2.
3. Pastikan minimal ada satu project aktif di dashboard.
4. Kirim `!status` ke nomor WhatsApp yang dipakai WAHA.
5. Jika ingin menjalankan project tertentu, kirim `!run nama-project`.
6. Jika ingin menjalankan laporan terdekat, kirim `!laporan`.

Bot akan membalas status proses di chat yang sama. Untuk `!run` dan `!laporan`, bot akan mengirim balasan awal saat proses dimulai, lalu balasan sukses atau gagal setelah proses selesai.

## 8b. Menggunakan Telegram request approval

Telegram dipakai sebagai kanal request provisioning. Request yang valid akan masuk ke dashboard **Approvals** dan menunggu admin menekan Approve atau Reject.

### Set webhook Telegram

Ganti `TOKEN`, `DOMAIN`, dan `SECRET` sesuai `.env`:

```bash
curl -X POST "https://api.telegram.org/botTOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://DOMAIN/api/webhook/telegram",
    "secret_token": "SECRET"
  }'
```

Pastikan `SECRET` sama dengan `TELEGRAM_WEBHOOK_SECRET`.

### Command Telegram

| Command | Fungsi |
| --- | --- |
| `/help` | Menampilkan contoh format request. |
| `/groupid` | Menampilkan daftar WhatsApp group ID yang tersimpan di database/cache dashboard. |

### Format request Telegram

```text
PIC Pengaju: Nama / NIK / Unit
Nama Project: Sales Daily
Group ID Tujuan: 120363xxxxxxxx@g.us
URL Spreadsheet: https://docs.google.com/spreadsheets/d/xxxx/edit
GID Sheet: 0
Rentang Cell: A1:K22
Caption: *Laporan {projectName}*
Tanggal: {date}
Jam Running: 0 8 * * *
```

Setelah request diterima, buka:

```text
https://bot.domain-anda.com/dashboard/approvals
```

Approve akan membuat project aktif dan reload scheduler. Approve tidak langsung mengirim WhatsApp; pengiriman pertama mengikuti `Jam Running` atau bisa dijalankan manual dari halaman project.

### Catatan perilaku

- Command dari pesan yang dikirim oleh bot sendiri akan diabaikan.
- `!run nama-project` mencari project berdasarkan nama yang mengandung teks tersebut. Jika ada beberapa nama mirip, project pertama yang ditemukan database akan dijalankan.
- `!laporan` hanya memilih project yang `enabled` dan memiliki jadwal paling dekat berdasarkan `nextRunAt`.
- Jika proses gagal, bot membalas ringkasan error. Detail lengkap tetap dicek dari log aplikasi.

### Tes webhook command

Cek log aplikasi sambil mengirim command dari WhatsApp:

```bash
pm2 logs dashboard-bot
```

Jika ingin mengetes route webhook langsung dari server, gunakan payload contoh berikut:

```bash
curl -X POST https://bot.domain-anda.com/api/webhook/waha \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message",
    "payload": {
      "body": "!status",
      "from": "6281234567890@c.us",
      "id": {
        "remote": "6281234567890@c.us",
        "fromMe": false
      }
    }
  }'
```

Hasil route yang benar:

```json
{"ok":true}
```

Jika hasilnya `{"ok":true,"skipped":true}`, berarti payload bukan command yang dikenal, event bukan `message`, pesan kosong, atau dianggap dikirim oleh bot sendiri.

### Troubleshooting command

Jika bot tidak membalas:

- Pastikan webhook WAHA benar: `https://bot.domain-anda.com/api/webhook/waha`.
- Pastikan domain aplikasi bisa diakses dari server WAHA.
- Pastikan session WAHA tersambung dan menerima pesan masuk.
- Pastikan `.env` berisi `WAHA_URL`, `WAHA_SESSION`, dan `WAHA_API_KEY` yang benar.
- Cek `pm2 logs dashboard-bot` saat command dikirim.
- Coba command sederhana `!status` sebelum mengetes `!run` atau `!laporan`.

Jika `!run nama-project` tidak menemukan project, cek nama project di dashboard dan coba pakai nama yang lebih spesifik.

## 9. Update aplikasi

Jika memakai Git:

```bash
cd /www/wwwroot/dashboard-bot
git pull
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart dashboard-bot
```

### Update dari local ke VPS

Gunakan cara ini jika perubahan program dibuat di komputer local, lalu ingin dikirim ke VPS tanpa `git pull`.

Sebelum upload, pastikan perubahan di local sudah dites:

```bash
npm ci
npx prisma generate
npm run build
```

Jangan kirim folder/file runtime local berikut ke VPS:

```text
node_modules
.next
.env
.env.local
database
storage
```

Folder `database` dan `storage` di VPS berisi data production, jadi jangan ditimpa dari local.

#### Opsi A: Upload lewat aaPanel File Manager

1. Zip isi proyek dari komputer local.
2. Pastikan zip tidak berisi `node_modules`, `.next`, `.env`, `.env.local`, `database`, dan `storage`.
3. Upload zip ke `/www/wwwroot/dashboard-bot`.
4. Extract zip dan overwrite file program.
5. Jangan overwrite file `.env`, folder `database`, dan folder `storage` production.

Setelah upload selesai, masuk SSH ke VPS dan jalankan:

```bash
cd /www/wwwroot/dashboard-bot
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart dashboard-bot
pm2 logs dashboard-bot
```

#### Opsi B: Upload dari terminal local dengan rsync

Jalankan dari folder proyek di komputer local:

```bash
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .env \
  --exclude .env.local \
  --exclude database \
  --exclude storage \
  ./ root@IP_VPS_ANDA:/www/wwwroot/dashboard-bot/
```

Ganti `root@IP_VPS_ANDA` sesuai user dan IP VPS Anda.

Setelah upload selesai, masuk SSH ke VPS:

```bash
ssh root@IP_VPS_ANDA
```

Lalu jalankan:

```bash
cd /www/wwwroot/dashboard-bot
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart dashboard-bot
pm2 logs dashboard-bot
```

Jika ada perubahan struktur database Prisma, perintah `npx prisma db push` akan menerapkan perubahan schema ke SQLite production. Backup database sebelum update jika perubahan schema cukup besar.

Setelah restart, cek aplikasi:

```bash
pm2 status
curl http://127.0.0.1:3000
```

Lalu buka domain production:

```text
https://bot.domain-anda.com
```

Jika upload manual dari aaPanel, upload file baru lalu jalankan:

```bash
cd /www/wwwroot/dashboard-bot
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart dashboard-bot
```

## 10. Backup

Backup minimal:

```text
/www/wwwroot/dashboard-bot/.env
/www/wwwroot/dashboard-bot/database/dashboard-bot.db
/www/wwwroot/dashboard-bot/storage
```

Di aaPanel, Anda bisa memakai fitur backup folder. Untuk backup manual:

```bash
cd /www/wwwroot
tar -czf dashboard-bot-backup-$(date +%F).tar.gz dashboard-bot/.env dashboard-bot/database dashboard-bot/storage
```

## 11. Troubleshooting

### Build gagal pada Prisma

Jalankan:

```bash
npx prisma generate
npx prisma db push
```

Lalu ulangi:

```bash
npm run build
```

### Screenshot gagal atau Chromium error

Pastikan dependency Playwright sudah terpasang:

```bash
npx playwright install --with-deps chromium
```

Jika masih gagal, cek log:

```bash
pm2 logs dashboard-bot
```

### Aplikasi tidak bisa akses WAHA

Cek `.env`:

```env
WAHA_URL=
WAHA_SESSION=
WAHA_API_KEY=
```

Tes koneksi:

```bash
curl -H "X-Api-Key: API_KEY_ANDA" http://127.0.0.1:3001/api/sessions
```

Sesuaikan URL jika WAHA memakai domain atau server lain.

### Domain menampilkan 502 Bad Gateway

Cek apakah aplikasi hidup:

```bash
pm2 status
curl http://127.0.0.1:3000
```

Jika aplikasi mati:

```bash
pm2 restart dashboard-bot
pm2 logs dashboard-bot
```

### CSS/JS tidak render dan `/_next/static` 404

Jika browser console menampilkan error seperti ini:

```text
GET https://domain-anda.com/_next/static/css/....css 404 (Not Found)
GET https://domain-anda.com/_next/static/chunks/....js 404 (Not Found)
```

Pastikan konfigurasi Nginx site memiliki `location ^~ /_next/` yang diproxy ke aplikasi Next.js:

```nginx
location ^~ /_next/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Hapus/nonaktifkan rule static aaPanel yang menangani `.css` atau `.js` dari root dummy. Setelah itu rebuild aplikasi dan restart PM2:

```bash
cd /www/wwwroot/dashboard-bot
npm ci
npm run build
pm2 restart dashboard-bot
nginx -t
systemctl reload nginx
```

Tes file asset dari Next.js langsung dan dari domain:

```bash
curl -I http://127.0.0.1:3000/_next/static/css/NAMA_FILE.css
curl -I https://domain-anda.com/_next/static/css/NAMA_FILE.css
```

Ambil `NAMA_FILE.css` dari tab Network browser atau dari HTML halaman login. Hasil yang benar adalah `200`, bukan `404`.

### Scheduler tidak berjalan

Scheduler dimuat saat dashboard/API diakses. Setelah deploy atau restart, buka halaman dashboard sekali:

```text
https://bot.domain-anda.com/dashboard
```

Pastikan timezone proyek adalah `Asia/Jakarta` atau timezone lain yang valid.

## 12. Checklist selesai deploy

- `.env` production sudah dibuat.
- `npm ci` berhasil.
- `npx playwright install --with-deps chromium` berhasil.
- `npx prisma db push` berhasil.
- `npm run build` berhasil.
- PM2 status `dashboard-bot` online.
- Nginx reverse proxy mengarah ke `127.0.0.1:3000`.
- SSL aktif di aaPanel.
- WAHA bisa diakses dari aplikasi.
- Login dashboard berhasil.
- Test screenshot dan kirim WhatsApp berhasil.
