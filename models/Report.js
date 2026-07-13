const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Report = sequelize.define('Report', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_unit: { type: DataTypes.INTEGER, allowNull: false },
  id_kategori: { type: DataTypes.INTEGER, allowNull: true },
  nama_perangkat: { type: DataTypes.STRING(150), allowNull: false },
  deskripsi: { type: DataTypes.TEXT, allowNull: true },
  prioritas: { type: DataTypes.ENUM('ringan', 'sedang', 'berat', 'kritis'), defaultValue: 'ringan' },
  status: { type: DataTypes.ENUM('dilaporkan', 'divalidasi', 'investigasi', 'dalam_perbaikan', 'selesai', 'tidak_dapat_diperbaiki', 'tidak_valid'), defaultValue: 'dilaporkan' },
  foto: { type: DataTypes.STRING(255), allowNull: true },
  foto_selesai: { type: DataTypes.STRING(255), allowNull: true },
  id_pelapor: { type: DataTypes.INTEGER, allowNull: false },
  id_validator: { type: DataTypes.INTEGER, allowNull: true },
  id_investigator: { type: DataTypes.INTEGER, allowNull: true },
  id_teknisi: { type: DataTypes.INTEGER, allowNull: true },
  tgl_validasi: { type: DataTypes.DATE, allowNull: true },
  tgl_investigasi: { type: DataTypes.DATE, allowNull: true },
  tgl_mulai_perbaikan: { type: DataTypes.DATE, allowNull: true },
  tgl_selesai: { type: DataTypes.DATE, allowNull: true },
  catatan_teknisi: { type: DataTypes.TEXT, allowNull: true },
  alasan_tidak_valid: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'reports',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Report;
