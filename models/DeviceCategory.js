const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeviceCategory = sequelize.define('DeviceCategory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nama_kategori: { type: DataTypes.STRING(100), allowNull: false },
  id_layanan: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'device_categories',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = DeviceCategory;
