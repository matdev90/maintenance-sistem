const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SlaTarget = sequelize.define('SlaTarget', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  prioritas: { type: DataTypes.ENUM('ringan', 'sedang', 'berat', 'kritis'), allowNull: false, unique: true },
  batas_validasi_jam: { type: DataTypes.INTEGER, defaultValue: 24 },
  batas_investigasi_jam: { type: DataTypes.INTEGER, defaultValue: 48 },
  batas_selesai_jam: { type: DataTypes.INTEGER, defaultValue: 72 }
}, {
  tableName: 'sla_targets',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = SlaTarget;
