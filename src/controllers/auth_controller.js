const userModel = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function clearAuthCookie(res) {
  const variants = [
    { httpOnly: true, secure: true, sameSite: 'none', path: '/' },
    { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
    { httpOnly: true, path: '/' },
  ];
  for (const options of variants) {
    res.clearCookie('token', options);
  }
}

module.exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    const firstName = fullName?.firstName?.trim();
    const lastName = fullName?.lastName?.trim();

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await userModel.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User Already Exist' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await userModel.create({
      fullName: { firstName, lastName },
      email,
      password: hashed,
    });

    const token = jwt.sign({ id: user._id }, process.env.KEY);
    res.cookie('token', token, cookieOptions());

    return res.status(201).json({
      message: 'User Successfully Registered',
      token,
      user: {
        email: user.email,
        id: user._id,
        fullName: user.fullName,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};

module.exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const user = await userModel.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid Credentials' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ message: 'Invalid Credentials' });

    const token = jwt.sign({ id: user._id }, process.env.KEY);
    res.cookie('token', token, cookieOptions());

    return res.status(200).json({
      message: 'User Successfully Logedin',
      token,
      user: {
        email: user.email,
        id: user._id,
        fullName: user.fullName,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};

module.exports.logOut = async (req, res) => {
  try {
    clearAuthCookie(res);
    return res.status(200).json({ message: 'User Successfully LogeOut' });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};
