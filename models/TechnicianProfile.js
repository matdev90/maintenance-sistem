const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TechnicianProfile = sequelize.define('TechnicianProfile', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_user: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  spesialisasi: { type: DataTypes.STRING(200), allowNull: true },
  max_tugas_aktif: { type: DataTypes.INTEGER, defaultValue: 5 },
  telegram_chat_id: { type: DataTypes.STRING(50), allowNull: true },
  whatsapp_number: { type: DataTypes.STRING(20), allowNull: true },
  is_available: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'technician_profiles',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = TechnicianProfile;
