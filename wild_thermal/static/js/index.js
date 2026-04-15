window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}


$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 3,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    /*var player = document.getElementById('interpolation-video');
    player.addEventListener('loadedmetadata', function() {
      $('#interpolation-slider').on('input', function(event) {
        console.log(this.value, player.duration);
        player.currentTime = player.duration / 100 * this.value;
      })
    }, false);*/
    preloadInterpolationImages();

    $('#interpolation-slider').on('input', function(event) {
      setInterpolationImage(this.value);
    });
    setInterpolationImage(0);
    $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);

    bulmaSlider.attach();

    // Method overview: first hover (desktop) or tap outside controls (touch) starts playback
    var methodOverviewVideo = document.getElementById('method-overview-video');
    var methodOverviewBox = document.getElementById('method-overview-video-box');
    if (methodOverviewVideo) {
      var methodOverviewStarted = false;
      var methodOverviewSuppressToggleUntil = 0;

      function methodOverviewIsLikelyControlsStrip(clientY) {
        var r = methodOverviewVideo.getBoundingClientRect();
        var strip = Math.min(72, Math.max(44, r.height * 0.22));
        return clientY >= r.bottom - strip;
      }

      function methodOverviewSuppressAccidentalToggle(e) {
        if (Date.now() >= methodOverviewSuppressToggleUntil) return;
        if (methodOverviewIsLikelyControlsStrip(e.clientY)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      }

      function methodOverviewDetachStarters() {
        methodOverviewVideo.removeEventListener('mouseenter', onMethodOverviewFirstHover);
        methodOverviewVideo.removeEventListener('pointerdown', onMethodOverviewFirstPointer);
      }

      function methodOverviewTryStartPlayback() {
        if (methodOverviewStarted) return;
        methodOverviewStarted = true;
        methodOverviewDetachStarters();
        var p = methodOverviewVideo.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function() {});
        }
      }

      function onMethodOverviewFirstHover() {
        methodOverviewTryStartPlayback();
      }

      function onMethodOverviewFirstPointer(e) {
        if (methodOverviewStarted) return;
        if (methodOverviewIsLikelyControlsStrip(e.clientY)) return;
        methodOverviewTryStartPlayback();
      }

      methodOverviewVideo.addEventListener('playing', function() {
        methodOverviewSuppressToggleUntil = Date.now() + 1000;
        if (methodOverviewBox) {
          methodOverviewBox.classList.add('is-method-video-started');
        }
      });
      methodOverviewVideo.addEventListener('pointerdown', methodOverviewSuppressAccidentalToggle, true);
      methodOverviewVideo.addEventListener('click', methodOverviewSuppressAccidentalToggle, true);

      methodOverviewVideo.addEventListener('mouseenter', onMethodOverviewFirstHover);
      methodOverviewVideo.addEventListener('pointerdown', onMethodOverviewFirstPointer);
    }

    // Video selector: thumbnail activates main video (div[role=button] for better mobile support)
    var mainVideo = document.getElementById('main-display-video');
    if (mainVideo) {
      function selectVideoFromThumbnail(el) {
        var src = el.getAttribute('data-video');
        if (!src) return;
        $('.video-selector .thumbnail').removeClass('is-selected');
        el.classList.add('is-selected');
        var sourceEl = mainVideo.querySelector('source');
        if (!sourceEl) return;
        sourceEl.src = src;
        mainVideo.load();
        mainVideo.muted = true;
        var p = mainVideo.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function() {});
        }
      }

      $('.video-selector .thumbnail').on('click', function() {
        selectVideoFromThumbnail(this);
      });

      $('.video-selector .thumbnail').on('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectVideoFromThumbnail(this);
        }
      });
    }

})
