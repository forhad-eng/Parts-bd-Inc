const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kqhr3.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

async function run() {
    try {
        await client.connect()
        const partsCollection = client.db('partsBd').collection('parts')
        const usersCollection = client.db('partsBd').collection('user')

        //USER
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            console.log(user)
            const filter = { email }
            const options = { upsert: true }
            const updatedDoc = { $set: user }
            const accessToken = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET)
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            if (result) {
                res.send({ accessToken })
            }
        })

        //PARTS
        app.get('/parts', async (req, res) => {
            const pageText = req.query.page
            const sizeText = req.query.size
            const page = parseInt(pageText)
            const size = parseInt(sizeText)
            const result = await partsCollection.find().skip(page).limit(size).toArray()
            res.send({ success: true, data: result })
        })
    } finally {
    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Parts Inc Server Is Running!')
})

app.listen(port, () => {
    console.log('Listening to port', port)
})
