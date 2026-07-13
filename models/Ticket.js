const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ticket = sequelize.define('Ticket', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  no_tiket: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  subjek: { type: DataTypes.STRING(200), allowNull: false },
  deskripsi: { type: DataTypes.TEXT, allowNull: true },
  kategori: { type: DataTypes.ENUM('hardware', 'software', 'jaringan', 'akun', 'lainnya'), defaultValue: 'lainnya' },
  prioritas: { type: DataTypes.ENUM('rendah', 'sedang', 'tinggi', 'kritis'), defaultValue: 'sedang' },
  status: { type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed', 'reopened'), defaultValue: 'open' },
  sumber: { type: DataTypes.ENUM('web', 'whatsapp', 'telegram', 'email', 'langsung'), defaultValue: 'web' },
  foto: { type: DataTypes.STRING(255), allowNull: true },
  foto_selesai: { type: DataTypes.STRING(255), allowNull: true },
  akar_penyebab: { type: DataTypes.TEXT, allowNull: true },
  solusi: { type: DataTypes.TEXT, allowNull: true },
  id_kategori:     { type: DataTypes.INTEGER, allowNull: true },
  id_pelapor:      { type: DataTypes.INTEGER, allowNull: false },
  id_teknisi:      { type: DataTypes.INTEGER, allowNull: true },
  id_unit:         { type: DataTypes.INTEGER, allowNull: true },
  tgl_selesai:     { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'tickets',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Ticket;
