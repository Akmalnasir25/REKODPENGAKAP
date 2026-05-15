# Panduan Setup Telegram Group untuk Admin Daerah/Negeri

Panduan lengkap untuk menambah group Telegram baru bagi admin daerah atau negeri.

---

## 📋 Prasyarat

1. Bot Telegram: `@ppmdaftar_bot`
2. Akses ke Supabase Dashboard
3. Akses ke BotFather (untuk setup pertama kali sahaja)

---

## 🔧 Setup Pertama Kali (Sekali Sahaja)

**Hanya perlu dilakukan sekali untuk bot ini:**

1. Buka Telegram, cari `@BotFather`
2. Hantar `/mybots`
3. Pilih `@ppmdaftar_bot`
4. Klik **Bot Settings** → **Group Privacy**
5. Klik **Turn off** (tukar dari ENABLED ke DISABLED)
6. Confirm perubahan

> ⚠️ **Penting:** Tanpa langkah ini, bot tidak boleh baca mesej dalam group.

---

## 📂 Kategori Pertanyaan

Sistem sekarang mempunyai 2 kategori pertanyaan:

| Kategori | Icon | Dihantar Ke | Kegunaan |
|----------|------|-------------|----------|
| **Umum** | 💬 | Admin Daerah & Admin Negeri | Pertanyaan umum berkaitan sekolah/daerah |
| **Sistem** | ⚙️ | Developer (Admin Utama) | Isu teknikal, bug, atau masalah sistem |

**Default:** Umum

---

## 📝 Langkah Setup Group Baru

### 1️⃣ Buat Telegram Group

1. Buka Telegram
2. Klik menu (☰) → **New Group**
3. Nama group mengikut format:
   - Untuk daerah: `Admin Daerah [Nama Daerah]`
   - Untuk negeri: `Admin Negeri [Nama Negeri]`
   - Contoh: `Admin Daerah Kinta Utara`
4. Pilih ahli (boleh pilih diri sendiri dulu)
5. Klik **Create**

---

### 2️⃣ Add Bot ke Group

1. Dalam group, klik nama group di atas (header)
2. Klik **Add Members**
3. Search: `@ppmdaftar_bot`
4. Pilih bot dan klik **Add**

---

### 3️⃣ Promote Bot Jadi Admin

1. Dalam group, klik nama group di atas
2. Klik **Administrators**
3. Klik **Add Administrator**
4. Pilih `@ppmdaftar_bot`
5. Pastikan permissions berikut **AKTIF**:
   - ✅ Delete Messages
   - ✅ Ban Users
   - ✅ Invite Users via Link
   - ✅ Pin Messages
   - ✅ Manage Video Chats
   - ✅ Remain Anonymous
6. Klik **Save**

---

### 4️⃣ Dapatkan Chat ID Group

1. Dalam group, hantar command:
   ```
   /getchatid
   ```

2. Bot akan reply dengan mesej seperti ini:
   ```
   🛡️ SISTEM DAFTAR PENGAKAP
   Pusat Kawalan Admin
   ━━━━━━━━━━━━━━━━━━━━━━

   📋 Chat ID:
   -1003963109363

   Group ini belum didaftarkan dalam sistem.
   Berikan chat ID di atas kepada developer untuk didaftarkan.
   ```

3. **Copy chat ID** (contoh: `-1003963109363`)
   - Mesti bermula dengan `-100`
   - Mesti ada tanda minus di depan

---

### 5️⃣ Dapatkan UUID Daerah/Negeri

1. Pergi ke Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/jvjxeckzmokoqjfsuene/sql/new
   ```

2. **Untuk Admin Daerah**, run query ini:
   ```sql
   SELECT 
     d.id as daerah_id,
     d.name as daerah_name,
     n.id as negeri_id,
     n.name as negeri_name
   FROM daerah d
   JOIN negeri n ON d.negeri_id = n.id
   ORDER BY n.name, d.name;
   ```

3. **Untuk Admin Negeri**, run query ini:
   ```sql
   SELECT 
     id as negeri_id,
     name as negeri_name
   FROM negeri
   ORDER BY name;
   ```

4. Cari dan **copy UUID** yang berkaitan:
   - Contoh UUID: `ada7b07f-16a3-4d23-aa6b-022f31ac1677`

---

### 6️⃣ Register Group dalam Database

1. Pergi ke Supabase SQL Editor (link sama seperti di atas)

2. **Untuk Admin Daerah**, run SQL ini:
   ```sql
   INSERT INTO telegram_groups (chat_id, role, daerah_id, negeri_id, label)
   VALUES (
     '-1003963109363',                          -- Ganti dengan chat_id dari step 4
     'daerah_admin',                            -- Role: daerah_admin
     'ada7b07f-16a3-4d23-aa6b-022f31ac1677',   -- UUID daerah dari step 5
     'e86fbce5-28bf-47c6-9439-8967eb0c7ef9',   -- UUID negeri dari step 5
     'Admin Daerah Kinta Utara'                 -- Label untuk reference
   );
   ```

3. **Untuk Admin Negeri**, run SQL ini:
   ```sql
   INSERT INTO telegram_groups (chat_id, role, negeri_id, label)
   VALUES (
     '-1003963109363',                          -- Ganti dengan chat_id dari step 4
     'negeri_admin',                            -- Role: negeri_admin
     'e86fbce5-28bf-47c6-9439-8967eb0c7ef9',   -- UUID negeri dari step 5
     'Admin Negeri Perak'                       -- Label untuk reference
   );
   ```

4. Klik **Run** atau tekan `Ctrl+Enter`

5. Verify berjaya - sepatutnya keluar mesej:
   ```
   Success. No rows returned
   ```

---

### 7️⃣ Activate Bot dalam Group

1. Kembali ke Telegram group
2. Hantar command:
   ```
   /start
   ```

3. Bot akan reply dengan mesej:
   ```
   🛡️ SISTEM DAFTAR PENGAKAP
   Pusat Kawalan Admin
   ━━━━━━━━━━━━━━━━━━━━━━

   ✅ Bot Aktif!

   📋 Group: Admin Daerah Kinta Utara
   🔑 Role: daerah_admin

   Menu Tersedia:
   /broadcast — 📢 Hantar Siaran
   ```

4. Klik **menu button** (☰) sebelah text input
5. Sepatutnya nampak command `/broadcast`

---

### 8️⃣ Test Fungsi Bot

#### Test 1: Broadcast
1. Klik menu (☰) → `/broadcast`
2. Pilih scope (mengikut role):
   - **Admin Daerah**: Semua dalam Daerah / Mengikut Sekolah
   - **Admin Negeri**: Semua dalam Negeri / Mengikut Daerah / Mengikut Sekolah
3. Taip mesej test
4. Verify mesej sampai ke user yang betul

#### Test 2: Terima Feedback
1. Login sebagai sekolah dalam daerah/negeri yang sama
2. Hantar feedback/pertanyaan melalui chatbot
3. **Test kategori Umum:**
   - Pilih button **💬 Umum**
   - Taip mesej test
   - Verify mesej masuk dalam group admin daerah DAN admin negeri
4. **Test kategori Sistem:**
   - Pilih button **⚙️ Sistem**
   - Taip mesej test
   - Verify mesej masuk dalam bot developer sahaja (TIDAK masuk group daerah/negeri)

#### Test 3: Reply Feedback
1. Bila mesej feedback masuk, **reply** mesej tu terus dalam group
2. Taip balasan
3. Verify user terima notification dengan label yang betul:
   - Dari group daerah: "Maklum Balas daripada **Admin Daerah**"
   - Dari group negeri: "Maklum Balas daripada **Admin Negeri**"
   - Dari bot developer: "Maklum Balas daripada **Admin Utama**"

---

## 🔍 Verify Setup Betul

Run query ini dalam Supabase SQL Editor untuk semak semua groups:

```sql
SELECT 
  tg.chat_id,
  tg.role,
  tg.label,
  n.name as negeri,
  d.name as daerah,
  tg.is_active,
  tg.created_at
FROM telegram_groups tg
LEFT JOIN negeri n ON tg.negeri_id = n.id
LEFT JOIN daerah d ON tg.daerah_id = d.id
ORDER BY tg.role, n.name, d.name;
```

Output sepatutnya tunjukkan semua groups yang dah register.

---

## ❌ Troubleshooting

### Bot tak reply dalam group

**Sebab:** Group Privacy masih ON

**Penyelesaian:**
1. Pergi ke `@BotFather`
2. `/mybots` → `@ppmdaftar_bot`
3. Bot Settings → Group Privacy → **Turn off**

---

### Command `/broadcast` tak keluar menu

**Sebab:** Bot belum promote jadi admin atau Group Privacy ON

**Penyelesaian:**
1. Promote bot jadi admin (step 3)
2. Turn off Group Privacy (step troubleshooting atas)
3. Hantar `/start` semula dalam group

---

### Feedback tak masuk ke group

**Sebab 1:** User login sebelum `schoolId` ditambah dalam sistem

**Penyelesaian:**
- Minta user **logout** dan **login semula**

**Sebab 2:** UUID daerah/negeri salah dalam database

**Penyelesaian:**
- Verify UUID dengan query di step 5
- Update record dalam `telegram_groups` table:
  ```sql
  UPDATE telegram_groups
  SET daerah_id = 'UUID_BETUL', negeri_id = 'UUID_BETUL'
  WHERE chat_id = 'CHAT_ID_GROUP';
  ```

---

### Reply tak sampai ke user

**Sebab:** User tak ada akaun berdaftar (feedback dari guest)

**Penyelesaian:**
- Bot akan bagi warning dan tunjukkan email user
- Hubungi user terus via email

---

### Feedback kategori "Sistem" masuk ke admin daerah/negeri

**Sebab:** User pilih kategori salah atau routing logic error

**Penyelesaian:**
- Verify kategori dalam database:
  ```sql
  SELECT id, sender_name, category, created_at 
  FROM feedbacks 
  ORDER BY created_at DESC 
  LIMIT 10;
  ```
- Kategori "sistem" sepatutnya hanya masuk ke developer
- Kategori "umum" masuk ke admin daerah & negeri

---

### Admin daerah/negeri tak terima feedback kategori "Umum"

**Sebab:** UUID daerah/negeri salah atau user login lama (sebelum `schoolId` ditambah)

**Penyelesaian:**
1. Minta user **logout** dan **login semula**
2. Verify UUID dalam `telegram_groups`:
   ```sql
   SELECT * FROM telegram_groups WHERE role IN ('daerah_admin', 'negeri_admin');
   ```
3. Verify feedback ada `negeri_id` dan `daerah_id`:
   ```sql
   SELECT id, sender_name, negeri_id, daerah_id, category 
   FROM feedbacks 
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

---

## 📊 Scope Access Mengikut Role

| Role | Terima Feedback Dari | Boleh Broadcast Ke |
|------|---------------------|-------------------|
| **Developer** | Kategori **Sistem** sahaja | Semua pengguna / Mengikut negeri / Mengikut daerah / Mengikut sekolah |
| **Admin Negeri** | Kategori **Umum** dari sekolah dalam negeri dia | Semua dalam negeri / Mengikut daerah / Mengikut sekolah |
| **Admin Daerah** | Kategori **Umum** dari sekolah dalam daerah dia | Semua dalam daerah / Mengikut sekolah |

---

## 📬 Reply Notification

Bila admin reply mesej pertanyaan, user akan terima notification dengan label mengikut siapa yang reply:

| Siapa Reply | Label Notification |
|-------------|-------------------|
| Developer | "Maklum Balas daripada **Admin Utama**" |
| Admin Negeri | "Maklum Balas daripada **Admin Negeri**" |
| Admin Daerah | "Maklum Balas daripada **Admin Daerah**" |

---

## 📞 Sokongan

Jika ada masalah atau soalan, hubungi developer sistem.

---

**Tarikh Dicipta:** 15 Mei 2026  
**Versi:** 2.0 (Tambah kategori Sistem/Umum & Reply Label)  
**Bot:** @ppmdaftar_bot
