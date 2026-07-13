const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Setting = sequelize.define('Setting', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  setting_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  setting_value: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'settings',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Setting;
