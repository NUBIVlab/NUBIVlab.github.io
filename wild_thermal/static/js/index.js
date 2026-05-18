window.HELP_IMPROVE_VIDEOJS = false;

var compScenes = [
  { label: 'MVTV - Human0',     id: 'mvtv_human0' },
  { label: 'TI-NSD - UAV2',     id: 'TINSD_UAV2'  },
  { label: 'Lin et al. - Sink', id: 'lin_sink'     },
  { label: 'MSX - Building',    id: 'MSX_Building' },
  { label: 'T.Mix - Lion',      id: 'TMix_lion'    },
  { label: 'MVTV - Mason',      id: 'mvtv_mason'   },
];

var compMethods = [
  { label: 'ThermalNeRF',   id: 'ThermalNerf'  },
  { label: 'Vanilla 3DGS',  id: 'vanilla3DGS'  },
  { label: 'Thermal3D-GS',  id: 'Thermal3D-GS' },
];

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

    // Comparison slider
    var compViewport  = document.getElementById('comparison-viewport');
    var compDivider   = document.getElementById('comparison-divider');
    var compLeftSide  = document.getElementById('comp-left-side');
    var compLeftVideo = document.getElementById('comp-left-video');
    var compRightVideo = document.getElementById('comp-right-video');
    var compLeftLabel = document.getElementById('comp-left-label');

    if (compViewport && compRightVideo && compLeftVideo) {
      var activeSceneIdx  = 0;
      var activeMethodIdx = 0;
      var isDraggingComp  = false;

      function updateDivider(pct) {
        pct = Math.max(5, Math.min(95, pct));
        compDivider.style.left = pct + '%';
        compLeftSide.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      }

      function getCompPct(clientX) {
        var rect = compViewport.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * 100;
      }

      updateDivider(50);

      compViewport.addEventListener('mousedown', function(e) {
        isDraggingComp = true;
        updateDivider(getCompPct(e.clientX));
        e.preventDefault();
      });
      document.addEventListener('mousemove', function(e) {
        if (isDraggingComp) updateDivider(getCompPct(e.clientX));
      });
      document.addEventListener('mouseup', function() { isDraggingComp = false; });

      compViewport.addEventListener('touchstart', function(e) {
        isDraggingComp = true;
        updateDivider(getCompPct(e.touches[0].clientX));
      }, { passive: true });
      document.addEventListener('touchmove', function(e) {
        if (!isDraggingComp) return;
        e.preventDefault();
        updateDivider(getCompPct(e.touches[0].clientX));
      }, { passive: false });
      document.addEventListener('touchend', function() { isDraggingComp = false; });

      function loadComparison(sceneIdx, methodIdx) {
        var scene  = compScenes[sceneIdx];
        var method = compMethods[methodIdx];
        compRightVideo.src = './static/videos/wild_thermal/' + scene.id + '.mp4';
        compLeftVideo.src  = './static/videos/' + method.id + '/' + scene.id + '.mp4';
        compLeftLabel.textContent = method.label;
        compRightVideo.load();
        compLeftVideo.load();
        var p1 = compRightVideo.play(); if (p1) p1.catch(function() {});
        var p2 = compLeftVideo.play();  if (p2) p2.catch(function() {});
      }

      compRightVideo.addEventListener('timeupdate', function() {
        if (Math.abs(compRightVideo.currentTime - compLeftVideo.currentTime) > 0.3) {
          compLeftVideo.currentTime = compRightVideo.currentTime;
        }
      });

      loadComparison(0, 0);

      $('.comparison-method-btn').on('click', function() {
        var idx = parseInt($(this).data('method-idx'));
        if (idx === activeMethodIdx) return;
        activeMethodIdx = idx;
        $('.comparison-method-btn').removeClass('is-selected');
        $(this).addClass('is-selected');
        loadComparison(activeSceneIdx, activeMethodIdx);
      });

      $('#comp-thumbnail-row .thumbnail').on('click', function() {
        var idx = parseInt($(this).data('scene-idx'));
        if (idx === activeSceneIdx) return;
        activeSceneIdx = idx;
        $('#comp-thumbnail-row .thumbnail').removeClass('is-selected');
        $(this).addClass('is-selected');
        loadComparison(activeSceneIdx, activeMethodIdx);
      });

      $('#comp-thumbnail-row .thumbnail').on('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          $(this).trigger('click');
        }
      });

      // Thumbnail preview: play animated preview on hover, pause on leave
      $('#comp-thumbnail-row .thumbnail').on('pointerenter', function() {
        var video = this.querySelector('.thumbnail-video video');
        if (!video) return;
        var p = video.play();
        if (p) p.catch(function() {});
      }).on('pointerleave', function() {
        var video = this.querySelector('.thumbnail-video video');
        if (video) video.pause();
      });
    }

})
