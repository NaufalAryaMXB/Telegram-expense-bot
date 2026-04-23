const axios = require("axios")

async function downloadImage(url){

 const response = await axios({
  url,
  method:"GET",
  responseType:"arraybuffer"
 })

 return Buffer.from(response.data,"binary").toString("base64")

}

module.exports = downloadImage