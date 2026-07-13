const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Unit = sequelize.define('Unit', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nama_unit: { type: DataTypes.STRING(100), allowNull: false }
}, {
  tableName: 'units',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Unit;
