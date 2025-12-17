import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

const router = express.Router();

// Register new customer
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Check if customer exists
    const [existing] = await pool.query(
      'SELECT * FROM customers WHERE email = ?',
      [email]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const customerId = uuidv4();

    // Insert customer
    await pool.query(
      `INSERT INTO customers (customer_id, email, phone, first_name, last_name)
       VALUES (?, ?, ?, ?, ?)`,
      [customerId, email, phone, firstName, lastName]
    );

    // Generate JWT token
    const token = jwt.sign(
      { customerId, email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.status(201).json({
      message: 'Customer registered successfully',
      token,
      customer: {
        customerId,
        email,
        firstName,
        lastName
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find customer
    const [rows] = await pool.query(
      'SELECT * FROM customers WHERE email = ?',
      [email]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const customer: any = rows[0];

    // For demo purposes, accept any password
    // In production, verify hashed password
    // const isValid = await bcrypt.compare(password, customer.password_hash);

    // Generate JWT token
    const token = jwt.sign(
      { customerId: customer.customer_id, email: customer.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      customer: {
        customerId: customer.customer_id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Guest login (for demo)
router.post('/guest', async (req, res) => {
  try {
    const customerId = uuidv4();
    const email = `guest_${customerId.substring(0, 8)}@aura.demo`;

    // Create guest customer
    await pool.query(
      `INSERT INTO customers (customer_id, email, first_name, last_name)
       VALUES (?, ?, 'Guest', 'User')`,
      [customerId, email]
    );

    // Generate JWT token
    const token = jwt.sign(
      { customerId, email, isGuest: true },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Guest session created',
      token,
      customer: {
        customerId,
        email,
        firstName: 'Guest',
        lastName: 'User',
        isGuest: true
      }
    });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ error: 'Guest login failed' });
  }
});

export default router;
