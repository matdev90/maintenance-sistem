const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Asset = sequelize.define('Asset', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  kode_asset: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  nama_perangkat: { type: DataTypes.STRING(150), allowNull: false },
  id_kategori: { type: DataTypes.INTEGER, allowNull: true },
  id_unit: { type: DataTypes.INTEGER, allowNull: true },
  lokasi_detail: { type: DataTypes.STRING(200), allowNull: true },
  merk: { type: DataTypes.STRING(100), allowNull: true },
  model: { type: DataTypes.STRING(100), allowNull: true },
  serial_number: { type: DataTypes.STRING(100), allowNull: true },
  tahun_pembelian: { type: DataTypes.INTEGER, allowNull: true },
  kondisi: { type: DataTypes.ENUM('baik', 'rusak_ringan', 'rusak_berat', 'tidak_aktif'), defaultValue: 'baik' },
  foto: { type: DataTypes.STRING(255), allowNull: true },
  qr_code: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'assets',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Asset;
