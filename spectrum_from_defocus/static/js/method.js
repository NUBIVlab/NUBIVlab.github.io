(function () {
  'use strict';

  var viewer = document.getElementById('method-viewer');
  if (!viewer) return;

  var slides = Array.from(viewer.querySelectorAll('.method-slide'));
  var controls = viewer.querySelector('.method-controls');
  var previous = document.getElementById('method-prev');
  var next = document.getElementById('method-next');
  var page = document.getElementById('method-page');
  var status = document.getElementById('method-status');
  var current = 0;

  if (!slides.length || !controls || !previous || !next || !page || !status) return;

  function showSlide(index) {
    index = Math.max(0, Math.min(index, slides.length - 1));
    var moveFocus = index !== current && slides[current].contains(document.activeElement);

    slides.forEach(function (slide, slideIndex) {
      slide.hidden = slideIndex !== index;
    });

    current = index;
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    page.value = String(current);
    status.textContent = 'Slide ' + (current + 1) + ' of ' + slides.length + ': ' + slides[current].dataset.title;

    if (moveFocus) {
      slides[current].querySelector('a').focus({ preventScroll: true });
    }
  }

  previous.addEventListener('click', function () { showSlide(current - 1); });
  next.addEventListener('click', function () { showSlide(current + 1); });
  page.addEventListener('change', function () { showSlide(Number(page.value)); });

  viewer.addEventListener('keydown', function (event) {
    // Keep native select navigation and browser shortcuts intact.
    if (event.target.closest('select') || event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showSlide(current + (event.key === 'ArrowRight' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      showSlide(event.key === 'Home' ? 0 : slides.length - 1);
    }
  });

  viewer.classList.add('is-enhanced');
  controls.hidden = false;
  document.getElementById('method-instructions').textContent =
    'Use the buttons or left/right arrow keys to browse. Click a slide to enlarge it in a new tab.';
  showSlide(0);
})();
