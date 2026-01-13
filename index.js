const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs'); // Switched to bcryptjs
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// --- 1. MIDDLEWARE --
app.use(cors());
app.use(express.json());

// Serve the Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// --- 2. DATABASE CONNECTION ---
let db;
async function connectToDB() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        db = client.db('MAXIM SYSTEM');
        console.log("✅ Connected to MongoDB");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
    }
}
connectToDB();

// --- 3. SECURITY FUNCTIONS ---

const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized: No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};

const authorize = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden: Access denied" });
    }
    next();
};

// ==================================================
//               ROUTES
// ==================================================

// 1. Customer Register
app.post('/users/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = {
            name, email, password: hashedPassword, phone,
            role: 'customer', blocked: false, created_at: new Date()
        };
        const result = await db.collection('users').insertOne(newUser);
        res.status(201).json({ message: "Customer registered", id: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

// 2. Customer Login
app.post('/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.collection('users').findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        if (user.blocked) return res.status(403).json({ error: "Account is blocked" });

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: "Login successful", token, user });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// 3. View Profile
app.get('/users/:id', authenticate, async (req, res) => {
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.id) });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.status(200).json(user);
    } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
    }
});

// 4. Book a Ride
app.post('/rides', authenticate, async (req, res) => {
    try {
        const { pickup_location, dropoff_location, scheduled_time } = req.body;
        const newRide = {
            customer_id: new ObjectId(req.user.userId),
            pickup_location, dropoff_location, scheduled_time: new Date(scheduled_time),
            status: "pending", driver_id: null, created_at: new Date()
        };
        const result = await db.collection('rides').insertOne(newRide);
        res.status(201).json({ message: "Ride booked", id: result.insertedId });
    } catch (err) {
        res.status(400).json({ error: "Booking failed" });
    }
});

// 5. Track Ride
app.get('/rides/:id', authenticate, async (req, res) => {
    try {
        const ride = await db.collection('rides').findOne({ _id: new ObjectId(req.params.id) });
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        res.status(200).json(ride);
    } catch (err) {
        res.status(400).json({ error: "Invalid Ride ID" });
    }
});

// 6. Rate Driver
app.post('/rides/:id/rate', authenticate, async (req, res) => {
    try {
        const { rating, review } = req.body;
        const result = await db.collection('rides').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { rating, review } }
        );
        if (result.modifiedCount === 0) return res.status(404).json({ error: "Ride not found" });
        res.status(200).json({ message: "Rating submitted" });
    } catch (err) {
        res.status(400).json({ error: "Rating failed" });
    }
});

// --- DASHBOARD ROUTE: View All Rides ---
app.get('/rides', async (req, res) => {
    try {
        const rides = await db.collection('rides').find({}).toArray();
        res.status(200).json(rides);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch rides" });
    }
});

// 7. Driver Register
app.post('/drivers/register', async (req, res) => {
    try {
        const { name, email, password, phone, vehicle_info } = req.body;
        const existingDriver = await db.collection('drivers').findOne({ email });
        if (existingDriver) return res.status(400).json({ error: "Driver already exists" });

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newDriver = {
            name, email, password: hashedPassword, phone, vehicle_info,
            role: 'driver', approved: false, availability: false, blocked: false
        };
        const result = await db.collection('drivers').insertOne(newDriver);
        res.status(201).json({ message: "Driver registered (Pending Approval)", id: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

// 8. Driver Login
app.post('/drivers/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const driver = await db.collection('drivers').findOne({ email });
        if (!driver || !(await bcrypt.compare(password, driver.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        if (!driver.approved) return res.status(403).json({ error: "Account pending approval" });
        if (driver.blocked) return res.status(403).json({ error: "Account is blocked" });

        const token = jwt.sign({ userId: driver._id, role: 'driver' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: "Login successful", token });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// 9. Update Availability
app.patch('/drivers/:id/availability', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const result = await db.collection('drivers').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { availability: req.body.availability } } 
        );
        res.status(200).json({ updated: result.modifiedCount });
    } catch (err) {
        res.status(400).json({ error: "Update failed" });
    }
});

// 10. Accept Ride
app.patch('/rides/:id/accept', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const result = await db.collection('rides').updateOne(
            { _id: new ObjectId(req.params.id), status: "pending" }, 
            { $set: { driver_id: new ObjectId(req.user.userId), status: "accepted" } }
        );
        if (result.modifiedCount === 0) return res.status(404).json({ error: "Ride unavailable" });
        res.status(200).json({ message: "Ride accepted" });
    } catch (err) {
        res.status(400).json({ error: "Acceptance failed" });
    }
});

// 10.5 Complete Ride
app.patch('/rides/:id/complete', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const { fare } = req.body; 
        const result = await db.collection('rides').updateOne(
            { _id: new ObjectId(req.params.id), driver_id: new ObjectId(req.user.userId), status: "accepted" },
            { $set: { status: "completed", fare: parseFloat(fare), completed_at: new Date() } }
        );
        if (result.modifiedCount === 0) return res.status(404).json({ error: "Ride not found or not assigned" });
        res.status(200).json({ message: "Ride marked as completed" });
    } catch (err) {
        res.status(400).json({ error: "Completion failed" });
    }
});

// 11. View Earnings
app.get('/drivers/:id/earnings', authenticate, authorize(['driver']), async (req, res) => {
    try {
        const rides = await db.collection('rides').find({ driver_id: new ObjectId(req.params.id), status: "completed" }).toArray();
        const earnings = rides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
        res.status(200).json({ total_earnings: earnings, completed_rides: rides.length });
    } catch (err) {
        res.status(500).json({ error: "Error fetching earnings" });
    }
});

// 12. Admin Login & System Analytics omitted for brevity but should be here.
// (Keeping the rest of your admin routes is fine, just ensure they are included in the file)

// 15. System Analytics (Example)
app.get('/admin/analytics', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const usersCount = await db.collection('users').countDocuments();
        const driversCount = await db.collection('drivers').countDocuments();
        const ridesCount = await db.collection('rides').countDocuments();
        res.status(200).json({ users: usersCount, drivers: driversCount, rides: ridesCount });
    } catch (err) {
        res.status(500).json({ error: "Analytics failed" });
    }
});

// --- SINGLE START POINT ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});