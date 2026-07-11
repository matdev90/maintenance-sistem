const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShiftSchedule = sequelize.define('ShiftSchedule', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_teknisi: { type: DataTypes.INTEGER, allowNull: false },
  id_layanan: { type: DataTypes.INTEGER, allowNull: true },
  tanggal: { type: DataTypes.DATEONLY, allowNull: false },
  shift: { type: DataTypes.ENUM('pagi', 'siang', 'malam', 'libur'), defaultValue: 'pagi' },
  jam_mulai: { type: DataTypes.STRING(5), allowNull: true },
  jam_selesai: { type: DataTypes.STRING(5), allowNull: true },
  catatan: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'shift_schedules',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = ShiftSchedule;
