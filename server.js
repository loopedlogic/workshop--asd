const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express()
const port = 3000
const cache = Object.create(null);

const PathToFile = path.join(__dirname, 'db.json');


async function readFile() {
  const data = await fs.readFile(PathToFile, 'utf-8');
  return JSON.parse(data);
}

async function readFileWithDelay(){
    await new Promise(resolve => setTimeout(resolve, 1500));
    let products = await readFile();
    return products;
}


app.get('/products', async (req, res) => {
    try {
    const key = req.url;
    if (cache[key]) {
      return res.json(cache[key]);
    }

    const products = await readFileWithDelay();
        cache[key] = products;
        res.json(products);
    }
    catch (error) {
        console.log(error);
    res.status(500).send('Internal Server Error');
    }
});

app.get('/products/:id', async (req, res) => {
  try {
    const products = await readFileWithDelay();
    const id = Number(req.params.id);
    const product = products.find(product => product.id === id);
    if (!product) {
      return res.status(404).send('Product not found');
    }
    res.json(product);
  }
  catch (error) {
    console.log(error);
    res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
