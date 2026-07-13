const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PreventiveMaintenance = sequelize.define('PreventiveMaintenance', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_asset: { type: DataTypes.INTEGER, allowNull: true },
  id_kategori: { type: DataTypes.INTEGER, allowNull: true },
  nama_perangkat: { type: DataTypes.STRING(200), allowNull: false },
  deskripsi: { type: DataTypes.TEXT, allowNull: true },
  frekuensi: { type: DataTypes.ENUM('harian', 'mingguan', 'bulanan', 'kuartalan', 'tahunan'), defaultValue: 'bulanan' },
  hari_interval: { type: DataTypes.INTEGER, defaultValue: 30 },
  terakhir_dilakukan: { type: DataTypes.DATEONLY, allowNull: true },
  berikutnya: { type: DataTypes.DATEONLY, allowNull: true },
  id_teknisi_default: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('aktif', 'nonaktif', 'selesai'), defaultValue: 'aktif' },
  catatan: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'preventive_maintenance',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = PreventiveMaintenance;
