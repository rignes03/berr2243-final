require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

app.use(cors());
app.use(express.json());

let db;

async function connectToDB() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    db = client.db('eHailingApp');
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}
connectToDB();

app.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = { email, password: hashedPassword, role };

    await db.collection('users').insertOne(user);
    res.status(201).json({ message: "User created" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Registration failed" });
  }
});


app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await db.collection('users').findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

app.delete('/admin/users/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(userId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(204).send(); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Deletion failed" });
  }
});

app.listen(port, () => {
  console.log(`erver running at http://localhost:${port}`);
});