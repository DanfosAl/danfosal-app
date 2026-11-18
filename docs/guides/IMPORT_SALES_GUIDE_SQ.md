# 📊 Udhëzues për Importin e Shitjeve Historike

## Hyrje

Ky mjet ju lejon të importoni të dhënat e shitjeve nga vitet e kaluara nga Excel në aplikacion, për të pasuruar statistikat dhe analizat tuaja.

## ✅ Karakteristikat Kryesore

### 1. **Kontroll Inteligjent i Duplikateve**
- Sistemi kontrollon automatikisht nëse një shitje është tashmë e regjistruar
- Krahasimi bëhet bazuar në:
  - Datën e shitjes
  - Kodin/emrin e produktit
  - Sasinë
  - Çmimin për njësi

### 2. **Mbrojtja e Stokut Aktual**
- Importi NUK ndikon në stokun aktual
- Këto janë vetëm të dhëna historike për statistika
- Produktet nuk shtohen apo ndryshohen në katalogun tuaj

### 3. **Filtrimi i Produkteve Jo-Aktive**
- Produktet që nuk janë më në katalogun tuaj aktiv shënohen si "jo-aktive"
- Këto produkte NUK do të shfaqen në:
  - Rekomandime për blerje
  - Sugjerimet për stock
  - Produktet që kanë nevojë për vëmendje

### 4. **Identifikimi i Burimit**
- Të gjitha shitjet e importuara shënohen me tag `"source": "imported"`
- Kjo ju lejon të dalloni shitjet historike nga ato të regjistruara normalisht

## 📋 Formati i Excel File

Excel file duhet të ketë këto kolona:

| Kolona | Përshkrimi | Shembull |
|--------|------------|----------|
| **Kodi/Ilogaria** | Kodi i produktit | `1.513-650.0` |
| **Përshkrimi** | Emri i produktit | `Karcher SC 3` |
| **Sasia** | Sasia e shitur | `1` |
| **Valuta** | Valuta (EUR) | `EUR` |
| **Cmimi_EUR** | Çmimi total | `185` |
| **Cmimi_per_njesi** | Çmimi për njësi | `185` |
| **Data** | Data e shitjes | `01/12/2025` |
| **Subjekti** | Emri i klientit (opsionale) | `Customer F` |

### Format të Pranuara
- `.xlsx` (Excel)
- `.xls` (Excel i vjetër)
- `.csv` (Comma-separated values)

## 🚀 Si të Përdorni

### Hapi 1: Hapni Faqen e Importit
1. Nga Dashboard-i kryesor, klikoni **"📊 Import Sales History"**
2. Ose shkoni direkt në `import-sales-history.html`

### Hapi 2: Ngarkoni File Excel
1. Klikoni në zonën e ngarkimit ose tërhiqni file
2. Zgjidhni file `.xlsx`, `.xls`, ose `.csv`

### Hapi 3: Shqyrtoni Parapamjen
- Sistemi do të analizojë automatikisht të dhënat
- Do të shihni:
  - ✅ **Shitje të Reja** - Gati për import
  - ⚠️ **Duplikate** - Do të kapërcehen (tashmë ekzistojnë)
  - ⚪ **Jo-Aktive** - Produkte që nuk janë në katalogun aktual

### Hapi 4: Kontrolloni Statistikat
Në krye të faqes do të shihni:
- Numrin e shitjeve të reja
- Numrin e duplikateve
- Numrin e produkteve jo-aktive
- Totalin e rreshtave

### Hapi 5: Importoni
1. Klikoni **"✅ Import Shitjet e Reja (X)"**
2. Konfirmoni veprimin
3. Prisni derisa importi të përfundojë

## ⚠️ Çfarë Duhet të Dini

### Do të Ndodhë:
- ✅ Shitjet e reja do të shtohen në `storeSales` collection
- ✅ Statistikat do të përditësohen automatikisht
- ✅ Të dhënat historike do të jenë të disponueshme për analiza
- ✅ Customer Portal do të shfaqë klientët nga shitjet e importuara

### NUK Do të Ndodhë:
- ❌ Stoku aktual NUK do të ndryshohet
- ❌ Produkte të reja NUK do të shtohen në katalog
- ❌ Çmimet aktuale NUK do të ndikohen
- ❌ Duplikatet NUK do të importohen
- ❌ Produktet jo-aktive NUK do të shfaqen në rekomandime për blerje

## 🔍 Verifikimi i të Dhënave

### Kontrolloni Duplikatet
Sistemi konsideron një shitje si duplikat nëse:
- Është e njëjta datë
- Është i njëjti produkt (bazuar në kod ose emër)
- Është e njëjta sasi
- Është i njëjti çmim për njësi

### Produktet Jo-Aktive
Një produkt konsiderohet "jo-aktiv" nëse:
- Nuk gjendet në `products` collection
- Është shitur në të kaluarën por tani nuk është në katalog

## 📊 Si Ndikon në Aplikacion

### Business Intelligence
- Të dhënat historike do të përdoren për:
  - Analiza të trendeve afatgjata
  - Parashikime më të sakta
  - Identifikimin e produkteve sezonale

### Smart Inventory
- **Produktet Aktive**: Do të marrin rekomandime bazuar në të gjitha të dhënat
- **Produktet Jo-Aktive**: Do të shfaqen në statistika por JO në rekomandime për blerje

### Customer Portal
- Klientët nga shitjet historike do të shfaqen
- Historia e blerjeve do të jetë e plotë

## 🛡️ Siguria

- Të dhënat importohen vetëm në Firebase Firestore
- Çdo shitje shënohet me timestamp të importit
- Burimi i të dhënave shënohet si `"imported"`
- Nuk ka rrezik për humbje të të dhënave ekzistuese

## 💡 Këshilla

1. **Testoni me një file të vogël**: Importoni 10-20 rreshta fillimisht për të testuar
2. **Verifikoni parapamjen**: Kontrolloni kolonën "Status" dhe "Arsyeja"
3. **Duplikatet janë OK**: Sistemi do t'i kapërcejë automatikisht
4. **Ruani backup**: Gjithmonë mbani një kopje të Excel file origjinal

## 🔧 Zgjidhja e Problemeve

### "Nuk po lexohet file"
- Sigurohuni që është `.xlsx`, `.xls`, ose `.csv`
- Kontrolloni që kolonat kanë emrat e duhur

### "Të gjitha janë duplikate"
- Kjo do të thotë që i keni importuar tashmë
- Kontrolloni në storeSales nëse janë aty

### "Shumë produkte jo-aktive"
- Kjo është normale për shitje historike
- Produktet jo-aktive nuk do të sugjeroen për blerje

## 📞 Mbështetje

Nëse keni pyetje ose probleme:
1. Kontrolloni këtë udhëzues
2. Shikoni log-un në faqen e importit
3. Kontaktoni mbështetjen teknike

---

**Krijuar:** Dhjetor 2025  
**Versioni:** 1.0  
**Aplikacioni:** Danfosal Business Management
