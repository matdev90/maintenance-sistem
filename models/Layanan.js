const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Layanan = sequelize.define('Layanan', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nama_layanan: { type: DataTypes.STRING(100), allowNull: false },
  kode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  deskripsi: { type: DataTypes.TEXT, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'layanans',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Layanan;
