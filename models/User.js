const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  nama_lengkap: { type: DataTypes.STRING(100), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'teknisi', 'pelapor'), defaultValue: 'pelapor' },
  id_unit: { type: DataTypes.INTEGER, allowNull: true },
  foto: { type: DataTypes.STRING(255), allowNull: true },
  two_factor_secret: { type: DataTypes.STRING(64), allowNull: true },
  two_factor_enabled: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'users',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = User;
