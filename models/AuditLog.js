const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  id_user: { type: DataTypes.INTEGER, allowNull: true },
  username: { type: DataTypes.STRING(100), allowNull: true },
  action: { type: DataTypes.STRING(50), allowNull: false },
  entity_type: { type: DataTypes.STRING(50), allowNull: true },
  entity_id: { type: DataTypes.INTEGER, allowNull: true },
  detail: { type: DataTypes.TEXT, allowNull: true },
  ip_address: { type: DataTypes.STRING(45), allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
  indexes: [
    { fields: ['entity_type', 'entity_id'] },
    { fields: ['id_user'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

module.exports = AuditLog;
