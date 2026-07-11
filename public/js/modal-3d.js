/* global bootstrap */
var Modal3D = {
  showLoading: function (message) {
    var el = document.getElementById('loading3d');
    if (!el) return;
    var text = el.querySelector('.loading-3d-text');
    if (text) text.textContent = message || 'Memproses...';
    el.style.display = 'flex';
    el.style.opacity = '1';
  },
  hideLoading: function () {
    var el = document.getElementById('loading3d');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(function () { el.style.display = 'none'; }, 300);
  },
  showConfirm: function (opts) {
    var m = document.getElementById('modal3dConfirm');
    if (!m) return;

    var mc = m.querySelector('.modal-content');
    if (mc) mc.className = 'modal-content' + (opts.type === 'danger' ? ' border-danger' : '');

    m.className = 'modal fade modal-3d' + (opts.type === 'danger' ? ' danger' : '');

    var ic = m.querySelector('.modal-icon');
    if (ic) ic.className = (opts.icon || 'bi bi-question-circle') + ' modal-icon';

    var mt = m.querySelector('.modal-title-text');
    if (mt) mt.textContent = opts.title || 'Konfirmasi';

    var msg = m.querySelector('.modal-body-msg');
    if (msg) msg.innerHTML = opts.message || 'Apakah Anda yakin?';

    var btnConfirm = m.querySelector('.btn-3d-confirm');
    var btnCancel = m.querySelector('.btn-3d-cancel');

    if (btnConfirm) {
      btnConfirm.innerHTML = (opts.type === 'danger' ? '<i class="bi bi-trash me-1"></i> ' : '<i class="bi bi-check-lg me-1"></i> ') + (opts.confirmText || 'Ya');
      btnConfirm.className = 'btn btn-3d px-4 btn-3d-confirm' + (opts.type === 'danger' ? ' btn-danger' : ' btn-primary');
    }
    if (btnCancel) {
      btnCancel.innerHTML = '<i class="bi bi-x-lg me-1"></i> ' + (opts.cancelText || 'Batal');
    }

    if (btnConfirm) {
      var newBtn = btnConfirm.cloneNode(true);
      btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
      newBtn.onclick = function () {
        newBtn.blur();
        var modal = bootstrap.Modal.getInstance(m);
        if (modal) modal.hide();
        setTimeout(function () {
          if (opts.onConfirm) opts.onConfirm();
        }, 300);
      };
    }

    var modal = bootstrap.Modal.getOrCreateInstance(m);
    modal.show();
  },

  showAlert: function (opts) {
    var m = document.getElementById('modal3dConfirm');
    if (!m) return;

    var type = opts.type || 'success';
    var icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
    var colors = { success: '#43e97b', error: '#f5576c', info: '#667eea' };

    var mc = m.querySelector('.modal-content');
    if (mc) mc.className = 'modal-content';

    m.className = 'modal fade modal-3d';

    var header = m.querySelector('.modal-header');
    if (header) header.style.background = 'linear-gradient(135deg, ' + colors[type] + ', ' + colors[type] + ')';

    var ic = m.querySelector('.modal-icon');
    if (ic) ic.className = (icons[type] || icons.info) + ' modal-icon';
    if (ic) ic.style.color = colors[type];

    var floatIcon = m.querySelector('.modal-icon-float');
    if (floatIcon) floatIcon.className = 'modal-icon-float me-2 ' + (icons[type] || icons.info);

    var mt = m.querySelector('.modal-title-text');
    if (mt) mt.textContent = opts.title || 'Notifikasi';

    var msg = m.querySelector('.modal-body-msg');
    if (msg) msg.innerHTML = opts.message || '';

    var btnConfirm = m.querySelector('.btn-3d-confirm');
    var btnCancel = m.querySelector('.btn-3d-cancel');

    if (btnConfirm) {
      btnConfirm.innerHTML = '<i class="bi bi-check-lg me-1"></i> OK';
      btnConfirm.className = 'btn btn-3d px-4 btn-3d-confirm btn-primary';
    }
    if (btnCancel) {
      btnCancel.style.display = 'none';
    }

    if (btnConfirm) {
      var newBtn = btnConfirm.cloneNode(true);
      btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
      newBtn.onclick = function () {
        newBtn.blur();
        var modal = bootstrap.Modal.getInstance(m);
        if (modal) modal.hide();
      };
    }

    var modal = bootstrap.Modal.getOrCreateInstance(m);
    modal.show();

    m.addEventListener('hidden.bs.modal', function handler() {
      if (btnCancel) btnCancel.style.display = '';
      m.removeEventListener('hidden.bs.modal', handler);
    });
  }
};

// Event delegation: catch all clicks at document level
document.addEventListener('click', function (e) {
  try {
    var el = e.target;
    if (!el || !el.closest) return;

    var target = el.closest('[data-3d-delete]');
    if (target) {
      e.preventDefault();
      var msg = target.dataset.confirmMsg || 'Data yang dihapus tidak dapat dikembalikan.';
      Modal3D.showConfirm({
        icon: 'bi bi-exclamation-triangle',
        title: 'Hapus Data',
        message: msg,
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        type: 'danger',
        onConfirm: function () {
          var form = target.closest('form');
          if (form) {
            Modal3D.showLoading('Menghapus...');
            form.submit();
          }
        }
      });
      return;
    }

    target = el.closest('[data-3d-logout]');
    if (target) {
      e.preventDefault();
      var href = target.getAttribute('href');
      Modal3D.showConfirm({
        icon: 'bi bi-box-arrow-right',
        title: 'Keluar',
        message: 'Apakah Anda yakin ingin keluar dari aplikasi?',
        confirmText: 'Ya, Keluar',
        cancelText: 'Batal',
        type: 'danger',
        onConfirm: function () {
          window.location.href = href;
        }
      });
      return;
    }
  } catch (err) {
    console.error('Modal3D click error:', err);
  }
});

// Event delegation for form submits with data-3d-loading
document.addEventListener('submit', function (e) {
  try {
    var form = e.target;
    if (form && form.closest && form.closest('form[data-3d-loading]')) {
      Modal3D.showLoading(form.dataset.loadingMsg || 'Memproses...');
    }
  } catch (err) {
    console.error('Modal3D submit error:', err);
  }
});
