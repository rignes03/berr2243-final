const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors'); 
const port = 3000;

const app = express();
app.use(cors());
app.use(express.json());

let db;
async function connectToMongoDB() {
    const url = "mongodb://localhost:27017";
    const client = new MongoClient(url);

    try {
        await client.connect();
        console.log("Connected to MongoDB!");
        db = client.db("testDB");
    } catch (err) {
        console.error("Error:", err);
    }
}

// Call function to connect to MongoDB
connectToMongoDB();

//RIDE ENDPOINTS

// 1. GET /rides – Fetch Allrides
app.get('/rides', async (req, res) => {
    try {
        const rides = await db.collection('rides').find().toArray();
        res.status(200).json(rides);
    } catch (err) {
        res.status(500).json({ error: "failed to fetch rides" });
    }
});

// 2. POST /rides - Create a New rides
app.post('/rides', async (req, res) => {
    try {
        const result = await db.collection('rides').insertOne(req.body);
        res.status(201).json({ id: result.insertedId });
    } catch (err) {
        res.status(400).json({ error: "Invalid rides data" });
    }
});

// 3. PATCH but in task ask (put) /rides/:id - Update rides Status
app.patch('/rides/:id', async (req, res) => {
    try {
        const result = await db.collection('rides').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: req.body.status } }
        );
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "user not found" });
        }
        
        res.status(200).json({ updated: result.modifiedCount });
    } catch (err) {
        res.status(400).json({ error: "Invalid user ID or data" });
    }
});

// 4. DELETE /rides/:id - Cancel a Ride
app.delete('/rides/:id', async (req, res) => {
    try {
        const result = await db.collection('rides').deleteOne(
            { _id: new ObjectId(req.params.id) }
        );
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "rides not found" });
        }
        
        res.status(200).json({ deleted: result.deletedCount });
    } catch (err) {
        res.status(400).json({ error: "Invalid ride ID" });
    }
});

// Start server
app.use(express.static(__dirname));
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});