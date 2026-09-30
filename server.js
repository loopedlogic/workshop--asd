const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express()
const port = 3000

const PathToFile = path.join(__dirname, 'db.json');


async function readFile() {
try {
  let  data = await fs.readFile(PathToFile, 'utf-8');
  return JSON.parse(data);
} catch (error) {
    console.log(error);
}
}

app.get('/products/:id', async (req, res) => {
    try {
   let products = await  readFile();
   let {id} = req.params;
   id = Number(id);
   let product = products.find(p => p.id === id);
   if (!product) {
       return res.status(404).send('Product not found');
   }
   console.log(product);
  res.json(product)
    }
    catch (error) {
        console.log(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
