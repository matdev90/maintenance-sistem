const { AuditLog } = require('../models');

function getIp(req) {
  return req?.ip || req?.connection?.remoteAddress || null;
}

async function log(user, action, entityType, entityId, detail, req) {
  try {
    await AuditLog.create({
      id_user: user?.id || null,
      username: user?.username || user?.nama_lengkap || 'system',
      action,
      entity_type: entityType,
      entity_id: entityId,
      detail: detail ? JSON.stringify(detail) : null,
      ip_address: getIp(req)
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

function logLogin(user, req) {
  return log(user, 'login', 'auth', user?.id, { method: 'password' }, req);
}

function logLogout(user, req) {
  return log(user, 'logout', 'auth', user?.id, null, req);
}

function logLoginFailed(username, req) {
  return log(null, 'login_failed', 'auth', null, { username }, req);
}

function logReport(user, action, reportId, detail, req) {
  return log(user, action, 'report', reportId, detail, req);
}

function logTicket(user, action, ticketId, detail, req) {
  return log(user, action, 'ticket', ticketId, detail, req);
}

function logUser(user, action, targetUserId, detail, req) {
  return log(user, action, 'user', targetUserId, detail, req);
}

function logAsset(user, action, assetId, detail, req) {
  return log(user, action, 'asset', assetId, detail, req);
}

function logSetting(user, action, detail, req) {
  return log(user, action, 'setting', null, detail, req);
}

function logLayanan(user, action, layananId, detail, req) {
  return log(user, action, 'layanan', layananId, detail, req);
}

function logCategory(user, action, categoryId, detail, req) {
  return log(user, action, 'category', categoryId, detail, req);
}

function logShift(user, action, shiftId, detail, req) {
  return log(user, action, 'shift', shiftId, detail, req);
}

function logPM(user, action, pmId, detail, req) {
  return log(user, action, 'preventive_maintenance', pmId, detail, req);
}

function logRating(user, entityType, entityId, detail, req) {
  return log(user, 'rating', entityType, entityId, detail, req);
}

module.exports = {
  log,
  logLogin, logLogout, logLoginFailed,
  logReport, logTicket, logUser, logAsset,
  logSetting, logLayanan, logCategory, logShift, logPM, logRating
};
