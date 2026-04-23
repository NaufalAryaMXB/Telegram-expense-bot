const axios = require("axios")
require("dotenv").config()

async function analyzeReceipt(base64Image){

 const prompt = `
Analisa struk belanja pada gambar ini dan berikan format:

TOKO:
TOTAL:
ITEMS:
TANGGAL:

Jika tidak terbaca tulis:
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