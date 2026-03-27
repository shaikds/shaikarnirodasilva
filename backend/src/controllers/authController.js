import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const SALT_ROUNDS = 12;

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;

    const existing = User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = User.create({ email, passwordHash, name });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      message: 'Registration successful.',
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    logger.info('User logged in', { userId: user.id });

    res.json({
      message: 'Login successful.',
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export default { register, login, getProfile };
