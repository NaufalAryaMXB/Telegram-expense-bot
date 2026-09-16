const axios = require("axios")
require("dotenv").config()

async function analyzeReceipt(base64Image){

 const prompt = `
Analisa struk belanja pada gambar ini dan balas HANYA dengan format berikut:

TOKO: <nama toko>
TOTAL: <angka tanpa Rp, boleh pakai koma/titik>
ITEMS:
- <nama item> | qty=<jumlah> | total=<total item bersih>
- <nama item> | qty=<jumlah> | total=<total item bersih>
TANGGAL:

Aturan penting:
- Jangan tambahkan kalimat pembuka atau penjelasan.
- Untuk item diskon, jangan jadikan baris terpisah jika diskon jelas milik item tertentu. Gabungkan ke total item tersebut.
- Jika ada diskon umum yang muncul setelah item tertentu, gabungkan ke item terdekat sebelumnya.
- Jika ada item gratis atau addon gratis, tulis total=0.
- Pastikan jumlah total semua item sama dengan TOTAL.
- Jangan tulis item tanpa nilai total. Jika total item tidak diketahui, tulis total=ERROR.
- Jika nama toko atau tanggal tidak terbaca, tetap isi dengan ERROR.

Jika benar-benar tidak terbaca, tulis:
ERROR
`

 const response = await axios.post(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
   contents:[
    {
     parts:[
      { text: prompt },
      {
       inline_data:{
        mime_type:"image/jpeg",
        data: base64Image
       }
      }
     ]
    }
   ]
  }
 )

 return response.data.candidates[0].content.parts[0].text

}

module.exports = { analyzeReceipt }
