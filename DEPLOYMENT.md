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
```

Catatan:

- `DATABASE_URL="file:../database/dashboard-bot.db"` menyimpan SQLite DB di folder `/www/wwwroot/dashboard-bot/database/dashboard-bot.db`.
- Jangan gunakan `AUTH_SECRET` contoh di production.
- `WAHA_URL` harus bisa diakses dari VPS. Bisa domain publik, subdomain, atau `http://127.0.0.1:3001` jika WAHA berjalan di VPS yang sama.

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
Username: USERNAME
Password: PASSWORD
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

## 8. Update aplikasi

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

## 9. Backup

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

## 10. Troubleshooting

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

## 11. Checklist selesai deploy

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
