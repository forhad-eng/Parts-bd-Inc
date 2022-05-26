const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const mg = require('nodemailer-mailgun-transport')
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const accessToken = authHeader.split(' ')[1]
    jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded
        next()
    })
}

const auth = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY,
        domain: 'sandbox2d1e6859ee254f04bfe00690163241db.mailgun.org'
    }
}

const nodemailerMailgun = nodemailer.createTransport(mg(auth))

const sendEmail = order => {
    const { partsName, quantity, amount, name, email, paid, status } = order

    let subject
    let html

    if (!paid) {
        ;(subject = `Your order for ${partsName} is received`),
            (html = `
            <div>
                <h2>Hello ${name}</h2>
                <p>Your order for ${partsName}, quantity ${quantity} has been placed!</p>
                <p>Please pay ${amount} to confirm the order.</p>
                <p>Thank You.</p>

                <h3>Our Address</h3>
                <p>Agrabad, Chittagong</p>
                <p>Bangladesh</p>
                <a href="https://web.programming-hero.com">unsubscribe</a>
            </div>
        `)
    } else if (paid) {
        ;(subject = `Your order for ${partsName} is pending for shipping`),
            (html = `
            <div>
                <h2>Hello ${name}</h2>
                <p>Your order for ${partsName}, quantity ${quantity} is pending for shipping!</p>
                <p>Thank You.</p>

                <h3>Our Address</h3>
                <p>Agrabad, Chittagong</p>
                <p>Bangladesh</p>
                <a href="https://web.programming-hero.com">unsubscribe</a>
            </div>
        `)
    } else if (status === 'shipped') {
        ;(subject = `Your order for ${partsName} is shipped`),
            (html = `
            <div>
                <h2>Hello ${name}</h2>
                <p>Your order for ${partsName}, quantity ${quantity} is shipped!</p>
                <p>Thank You for being with us.</p>

                <h3>Our Address</h3>
                <p>Agrabad, Chittagong</p>
                <p>Bangladesh</p>
                <a href="https://web.programming-hero.com">unsubscribe</a>
            </div>
        `)
    }

    const emailClient = {
        from: process.env.EMAIL_SENDER,
        to: email,
        subject: subject,
        html: html
    }

    nodemailerMailgun.sendMail(emailClient, (err, info) => {
        if (err) {
            console.log(`Error: ${err}`)
        } else {
            console.log(`Response: ${info}`)
        }
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kqhr3.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

async function run() {
    try {
        await client.connect()
        const partsCollection = client.db('partsBd').collection('parts')
        const usersCollection = client.db('partsBd').collection('user')
        const ordersCollection = client.db('partsBd').collection('order')
        const paymentsCollection = client.db('partsBd').collection('payment')
        const reviewsCollection = client.db('partsBd').collection('review')

        async function verifyAdmin(req, res, next) {
            const email = req.decoded.email
            const user = await usersCollection.findOne({ email })
            const isAdmin = user.role === 'admin'
            if (isAdmin) {
                next()
            }
        }

        //PAYMENT
        app.post('/create-payment-intent', async (req, res) => {
            const order = req.body
            const total = order.amount
            const paymentIntent = await stripe.paymentIntents.create({
                amount: total * 100,
                currency: 'usd',
                payment_method_types: ['card']
            })

            res.send({ clientSecret: paymentIntent.client_secret })
        })

        //ADMIN
        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const user = await usersCollection.findOne({ email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })

        //USER
        app.get('/user', verifyJWT, async (req, res) => {
            const user = await usersCollection.find().toArray()
            res.send(user)
        })

        app.get('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const user = await usersCollection.findOne({ email })
            res.send({ user })
        })

        app.patch('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email }
            const updatedDoc = { $set: { role: 'admin' } }
            const updatedUser = await usersCollection.updateOne(filter, updatedDoc)
            if (updatedUser.modifiedCount) {
                res.send({ success: true, message: 'Make admin success' })
            }
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email }
            const options = { upsert: true }
            const updatedDoc = { $set: user }
            const accessToken = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET)
            const result = await usersCollection.updateOne(filter, updatedDoc, options)
            if (result) {
                res.send({ accessToken })
            }
        })

        app.put('/user/update/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email }
            const options = { upsert: true }
            const updatedDoc = { $set: user }
            const updatedUser = await usersCollection.updateOne(filter, updatedDoc, options)
            if (updatedUser.modifiedCount || updatedUser.matchedCount) {
                res.send({ success: true, message: 'Profile updated!' })
            }
        })

        app.delete('/user/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.deleteOne({ email })
            if (result.deletedCount) {
                res.send({ success: true, message: 'User removed' })
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

        app.get('/parts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const item = await partsCollection.findOne(query)
            res.send(item)
        })

        app.post('/parts', verifyJWT, verifyAdmin, async (req, res) => {
            const parts = req.body
            const result = await partsCollection.insertOne(parts)
            if (result.insertedId) {
                res.send({ success: true, message: 'Product added successfully' })
            }
        })

        app.delete('/parts/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const item = await partsCollection.deleteOne(query)
            if (item.deletedCount) {
                res.send({ success: true, message: 'Product deleted' })
            }
        })

        //ORDERs
        app.get('/order', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await ordersCollection.find().toArray()
            res.send(result)
        })

        app.get('/order/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const orders = await ordersCollection.find({ email }).toArray()
            res.send(orders)
        })

        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const order = await ordersCollection.findOne(query)
            res.send(order)
        })

        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body
            const result = await ordersCollection.insertOne(order)
            if (result.insertedId) {
                sendEmail(order)
                res.send({ success: true, message: 'Order Confirmed! Pay Now' })
            }
        })

        app.put('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = { _id: ObjectId(id) }
            const updatedDoc = { $set: { paid: true, transactionId: payment.transactionId, status: 'pending' } }
            await paymentsCollection.insertOne(payment)
            const result = await ordersCollection.updateOne(filter, updatedDoc)
            if (result.modifiedCount) {
                sendEmail(order)
                res.send({ success: true })
            }
        })

        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const filter = { _id: ObjectId(id) }
            const updatedDoc = { $set: { status: 'shipped' } }
            const result = await ordersCollection.updateOne(filter, updatedDoc)
            if (result.modifiedCount) {
                sendEmail(order)
                res.send({ success: true, message: 'Status updated to shipped' })
            }
        })

        app.delete('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await ordersCollection.deleteOne(query)
            if (result.deletedCount) {
                res.send({ success: true, message: 'Order canceled' })
            }
        })

        //REVIEW
        app.get('/review', async (req, res) => {
            const result = await reviewsCollection.find().toArray()
            res.send(result)
        })

        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body
            const result = await reviewsCollection.insertOne(review)
            if (result.insertedId) {
                res.send({ success: true, message: 'Thanks for your review!' })
            }
        })
    } finally {
    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Parts-bd Inc Server Is Running!')
})

app.listen(port, () => {
    console.log('Listening to port', port)
})
