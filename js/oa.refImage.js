/**
 * OA Reference Image Overlay
 * Loads a bitmap image onto the edit grid as a tracing reference.
 *
 * The image plane is added as a child of the editPlane face object,
 * so it automatically tracks the grid depth as you scroll.
 *
 * Edit plane coordinate system (after PI/2 X rotation):
 *   Local X: 0 → cardW (left to right)
 *   Local Y: 0 → -cardH (top to bottom of card half)
 *   Local Z: negative = in front of grid (toward camera)
 *
 * The grid lines sit at local Z = -0.1, so we place the image
 * at Z = -0.2 (just behind the grid lines, in front of face mesh).
 */
OA.RefImage = (function() {

  var refPlane = null;
  var refMaterial = null;
  var isVisible = true;
  var currentOpacity = 0.4;
  var parentFace = null;  // the editPlane face object
  var _cardW = 100;
  var _cardH = 100;

  /**
   * Initialise the reference image system.
   * Must be called after the model and editPlane are created.
   *
   * @param {OA.Model} model - The OA model instance
   * @param {number} cardW - Card width in OA units
   * @param {number} cardH - Card height in OA units
   */
  function init(model, cardW, cardH) {
    _cardW = cardW;
    _cardH = cardH;

    // Find the editPlane in the model's children
    // It's named "editPlane" and is an OA.Face (THREE.Object3D)
    parentFace = null;
    model.traverse(function(child) {
      if (child.oaInfo && child.oaInfo.name === "editPlane") {
        parentFace = child;
      }
    });

    if (!parentFace) {
      console.warn('RefImage: could not find editPlane in model');
      return;
    }

    // Clean up any previous reference plane
    if (refPlane) {
      var oldParent = refPlane.parent;
      if (oldParent) oldParent.remove(refPlane);
      refPlane = null;
    }

    // Create placeholder material (no image yet)
    refMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });

    console.log('RefImage: initialised for card ' + cardW + 'x' + cardH);
  }

  /**
   * Load an image file onto the reference plane.
   *
   * @param {File} file - Image file from file input
   * @param {number} cardW - Card width for aspect ratio mapping
   * @param {number} cardH - Card height
   */
  function loadImage(file, cardW, cardH) {
    if (!parentFace) {
      console.error('RefImage: not initialised or editPlane not found');
      return;
    }

    _cardW = cardW || _cardW;
    _cardH = cardH || _cardH;

    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Calculate plane size to fit card while preserving aspect ratio
        var imgAspect = img.width / img.height;
        var cardAspect = _cardW / _cardH;
        var planeW, planeH;

        if (imgAspect > cardAspect) {
          planeW = _cardW;
          planeH = _cardW / imgAspect;
        } else {
          planeH = _cardH;
          planeW = _cardH * imgAspect;
        }

        // Remove old plane if exists
        if (refPlane && refPlane.parent) {
          refPlane.parent.remove(refPlane);
        }

        // Create new material with texture
        refMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: currentOpacity,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false
        });

        // Create plane geometry
        var geo = new THREE.PlaneGeometry(planeW, planeH);
        refPlane = new THREE.Mesh(geo, refMaterial);

        // Position in editPlane local space:
        // The editPlane face is built from points where:
        //   X: 0 → cardW
        //   Y: editBufferY → -cardH
        // The card area is X: 0→cardW, Y: 0→-cardH
        // PlaneGeometry is centred, so shift to centre of card area
        refPlane.position.set(
          _cardW / 2,       // centre X
          -_cardH / 2,      // centre Y (card goes 0 to -cardH)
          -0.2              // just behind grid lines (grid at -0.1)
        );

        refPlane.visible = isVisible;

        // Add as child of editPlane so it tracks depth
        parentFace.add(refPlane);

        console.log('RefImage: loaded ' + img.width + 'x' + img.height +
          ' → plane ' + planeW.toFixed(1) + 'x' + planeH.toFixed(1) +
          ' (card: ' + _cardW + 'x' + _cardH + ')');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Set opacity of the reference image.
   * @param {number} val - 0.0 to 1.0
   */
  function setOpacity(val) {
    currentOpacity = val;
    if (refMaterial && refMaterial.map) {
      refMaterial.opacity = val;
    }
  }

  /**
   * Toggle visibility.
   * @param {boolean} show
   */
  function setVisible(show) {
    isVisible = show;
    if (refPlane) {
      refPlane.visible = show;
    }
  }

  /**
   * Remove the reference image.
   */
  function clear() {
    if (refPlane && refPlane.parent) {
      refPlane.parent.remove(refPlane);
      refPlane = null;
    }
    if (refMaterial) {
      refMaterial.map = null;
      refMaterial.opacity = 0;
    }
  }

  /**
   * Check if an image is loaded.
   */
  function hasImage() {
    return refPlane !== null && refMaterial && refMaterial.map !== null;
  }

  return {
    init: init,
    loadImage: loadImage,
    setOpacity: setOpacity,
    setVisible: setVisible,
    clear: clear,
    hasImage: hasImage
  };

})();
