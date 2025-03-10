const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Security headers for camera access
app.use((req, res, next) => {
    res.setHeader('Feature-Policy', 'camera *');
    res.setHeader('Permissions-Policy', 'camera=*');
    next();
});

// Database setup
const db = new sqlite3.Database('cargo.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Items table
        db.run(`CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            description TEXT,
            status TEXT,
            date_scanned DATETIME,
            user_id INTEGER,
            metadata TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        console.log('Database tables initialized');
    });
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Auth routes
app.post('/api/register', async (req, res) => {
    console.log('Registration attempt:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
        console.log('Missing email or password');
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Check if user exists
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (row) {
                console.log('Email already registered:', email);
                return res.status(400).json({ error: 'Email already registered' });
            }

            // Hash password and create user
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run('INSERT INTO users (email, password) VALUES (?, ?)',
                [email, hashedPassword],
                function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return res.status(500).json({ error: 'Error creating user' });
                    }

                    console.log('User registered successfully:', email);
                    const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET);
                    res.status(201).json({ token, message: 'Registration successful' });
                }
            );
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
            res.json({ token });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Items routes
app.post('/api/items', authenticateToken, (req, res) => {
    const items = req.body;
    const userId = req.user.id;

    db.serialize(() => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO items (id, description, status, date_scanned, user_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        items.forEach(item => {
            stmt.run(
                item.id,
                item.description,
                item.status,
                item.dateScanned,
                userId,
                JSON.stringify(item)
            );
        });

        stmt.finalize((err) => {
            if (err) {
                console.error('Error saving items:', err);
                return res.status(500).json({ error: 'Error saving items' });
            }
            res.json({ message: 'Items saved successfully' });
        });
    });
});

app.get('/api/items', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all('SELECT * FROM items WHERE user_id = ?', [userId], (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            return res.status(500).json({ error: 'Error fetching items' });
        }
        
        const parsedItems = items.map(item => ({
            ...JSON.parse(item.metadata),
            dateScanned: item.date_scanned
        }));
        
        res.json(parsedItems);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server with HTTP for local development
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log('Access the application at:');
    console.log(`http://localhost:${port}`);
    console.log(`http://YOUR_LOCAL_IP:${port}`);
});

// Uncomment for HTTPS when SSL certificates are available
/*
// SSL/HTTPS configuration
const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
};

// Start server with HTTPS
https.createServer(sslOptions, app).listen(port, '0.0.0.0', () => {
    console.log(`Secure server running on port ${port}`);
    console.log('Access the application from your phone using:');
    console.log(`https://YOUR_LOCAL_IP:${port}`);
});
*/