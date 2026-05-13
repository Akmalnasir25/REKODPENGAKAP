# 🚀 Cara Deploy ke Firebase Hosting

## Langkah-langkah Deploy:

### 1️⃣ Set Configuration dalam Developer Admin
1. Login sebagai Developer (icon di bottom-right)
2. Toggle settings mengikut keperluan:
   - Maintenance Mode: **OFF** (untuk allow access)
   - User Access: **ON** (untuk allow users login/register)
   - Admin Access: **ON** (untuk allow admin login)
   - District Access: **ON** (untuk allow district login)

### 2️⃣ Download Config File
1. Dalam Developer Admin Dashboard, pergi ke section **"Firebase Deployment Config"**
2. Klik butang **"Download config.json"**
3. File akan download ke komputer anda

### 3️⃣ Replace Config File
```bash
# Copy file config.json yang baru download ke folder public/
# Replace file lama dengan yang baru
cp ~/Downloads/config.json ./public/config.json
```

### 4️⃣ Build Project
```bash
npm run build
```

### 5️⃣ Deploy ke Firebase
```bash
firebase deploy
```

## 🔄 Bila Nak Update Settings Production:

**PENTING:** Setiap kali anda ubah settings dalam Developer Admin (maintenance, access controls), anda MESTI:

1. ✅ Download config.json baru
2. ✅ Replace file dalam `public/config.json`
3. ✅ Run `npm run build`
4. ✅ Run `firebase deploy`

## 📁 Struktur File:

```
pengakap---pengurusan-data/
├── public/
│   └── config.json          ← File ini control production settings
├── dist/                    ← Generated selepas npm run build
│   ├── index.html
│   ├── assets/
│   └── config.json         ← Auto-copy dari public/
└── firebase.json
```

## ⚙️ Priority Settings:

Sistem akan check settings dalam order ini:
1. **URL Parameters** (highest priority) - untuk override manual
2. **config.json** (production) - untuk Firebase deployment
3. **localStorage** (lowest priority) - untuk local development

## 💡 Tips:

### Quick Deploy Command:
```bash
# Selepas download config.json baru
npm run build && firebase deploy
```

### Check Config Before Deploy:
```bash
# Verify config.json content
cat public/config.json
```

### Test Locally Before Deploy:
```bash
npm run build
npm run preview
# Buka http://localhost:4173 untuk test
```

## 🔍 Troubleshooting:

**Problem:** Deploy tapi masih dalam maintenance mode
**Solution:** 
- Check `public/config.json` ada `"maintenance": false`
- Download config.json baru dari Developer Admin
- Rebuild dan deploy semula

**Problem:** Users tak boleh login selepas deploy
**Solution:**
- Check `public/config.json` ada `"userAccess": true`
- Download config.json baru
- Rebuild dan deploy semula

**Problem:** Settings local berbeza dengan production
**Solution:**
- Normal! Local guna localStorage, production guna config.json
- Untuk production, selalu download config.json terkini

## 📞 Contact Developer:
Untuk sebarang masalah deployment, hubungi system developer.
