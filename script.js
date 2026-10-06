'use strict';
const dialog = document.querySelector('#photo-dialog');
if (dialog && typeof dialog.showModal === 'function') {
  document.querySelectorAll('[data-photo]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const image = dialog.querySelector('img');
      image.src = link.href;
      image.alt = link.querySelector('img').alt;
      document.querySelector('#photo-caption').textContent = link.closest('figure').querySelector('figcaption').textContent;
      dialog.showModal();
    });
  });
  document.querySelector('#close-photo').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
}
