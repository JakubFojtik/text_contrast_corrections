// ==UserScript==
// @name          Text contrast corrections
// @namespace     https://github.com/JakubFojtik/text-contrast-corrections
// @description   Sets minimum font width to normal and increases contrast between text and background if necessary. Also colors scrollbar for better contrast.
// @author        Jakub Fojtík
// @include       *
// @version       1.19
// @run-at        document-idle
// @require       https://raw.githubusercontent.com/JakubFojtik/color-thief/master/src/color-thief.js
// @require       https://raw.githubusercontent.com/JakubFojtik/text-contrast-corrections/master/Color.js
// ==/UserScript==

//Todo:
//Rerun for lazy-loaded content e.g. comments on gog.com
//Detect background gradients.
//Ask for bg image only if nested element needs it. load it async, in callback just rerun for child elements of the image
//Choose scrollbar foreground color to contrast page background.

//Assumptions / notes
// - bgcolor is not computed, has to be guessed from parent elements
// - bgcolor should not be adjusted, can be an average color of an image, so maybe by adjusting the image instead
// - bg image can be just a tiny bit of the element, e.g. list item point. try to skip these somehow
// - only run for text nodes to waste less time
// - colorthief needs to load its copy of the image, which is usualy from cache, but can fail completely, do not expect all images to load. possibly local network error on my side only
// - need to convert all bgimages to bgcolors, including textnode element parents, not just them
// - first pass: convert all relevant bgimages to colors
// - second pass: convert all alpha color to opaque and correct contrast

try {
  (function () {

    let elemBgcol = new Map();
    let colorThief = new ColorThief();
    let imgCounter = 0;

    function getBgImageUrl(element) {
      let url = window.getComputedStyle(element).getPropertyValue('background-image');
      if (url && url != 'none') {
        //skip nonrepeated bg in case of e.g. list item bullet images
        let repeat = window.getComputedStyle(element).getPropertyValue('background-repeat');
        return repeat != 'no-repeat' ? url.split('"')[1] : null;
      }
    }

    function getBgColor(el, bgProp) {
      return elemBgcol.has(el) ? elemBgcol.get(el) : new Color(window.getComputedStyle(el).getPropertyValue(bgProp));
    }

    function logElText(el) {
      return el.tagName + ' ' + el.className + ' ' + el.parentNode.tagName;
    }

    function findAndMergeBgCol(element, bgProp) {
      let colors = []; //tuples of element and its bgcolor, so computed bgcolor can later be remembered

      let bgcolor = new Color('rgb(255, 255, 255)'); //default bg color if all elements report transparent
      let el = element;
      let col;

      while (el instanceof Element) {
        col = getBgColor(el, bgProp); //Is getComputedStyle inspecting also parent elements for non-computable bgcolor? If yes, optimize?
        //console.log(logElText(el)+col);
        if (!(col instanceof Color)) alert(el.tagName + col);
        if (!col.isTransparent()) {
          colors.push({
            col: col,
            el: el
          }); //save transparent colors for later blending
        }
        if (col.isOpaque()) { //need to reach an opaque color to blend the transparents into
          bgcolor = col;
          break;
        }
        el = el.parentNode;
      }
      if (!(el instanceof Element)) colors.push({
        col: bgcolor,
        el: el
      }); //ensure final color is in the array
      col = bgcolor;

      //console.log(col + ' pak ' + colors.map(x=>x.col).join(', '));

      //Compute all alpha colors with the final opaque color
      //So Blue->10%Red->15%Green should be 85%(90%Blue+10%Red)+15%Green
      //Todo gradients
      //element.style.backgroundColor=col.toString();
      //elemBgcol.set(element, col);
      colors.reverse().slice(1).forEach((colEl) => {
        col = colEl.col.asOpaque(col);
        elemBgcol.set(colEl.el, col);

        //colEl.el.style.backgroundColor=col.toString();
      });

      return col;
    }

    function computeColors(element, fgProp, bgProp) {
      let bgColor = findAndMergeBgCol(element, bgProp);

      //Now we can compute fg color even if it has alpha
      let col = new Color(window.getComputedStyle(element).getPropertyValue(fgProp));
      //console.log(element.tagName+element.className+element.name+col+bgColor);

      let fgColor = col.asOpaque(bgColor);
      //console.log(element.tagName+element.className+element.name+fgColor+bgColor);

      return {
        fgCol: fgColor,
        bgCol: bgColor
      };
    }


    //Set scrollbar color
    let part = 120;
    let parts = Array.apply(', ', Array(3)).map(x => part).join(',');
    let scrCol = new Color(parts);
    document.getElementsByTagName("HTML")[0].style.scrollbarColor = scrCol + ' rgba(0,0,0,0)';

    //First pass - convert bg images to colors
    imgCounter = 0;
    textElementsUnder(document).forEach((element) => {
      let el = element;
      let url = '';

      //search for first ancestor that has a bgimage. Possibly stop on first with opaque bgcol, but still take its bgimage if any.
      while (el instanceof Element) {
        url = getBgImageUrl(el);
        if (url) break;
        else el = el.parentNode;
      }
      if (!(el instanceof Element)) return;
      element = el;

      url = getBgImageUrl(element);
      if (url) {
        imgCounter++;

        //copypaste of ColorThief.prototype.getColorFromUrl. Load events are sometimes not fired for image that already loaded e.g. <body> background image.
        //ColorThief seemingly ignores transparent pixels, but not white pixels anymore
        let sourceImage = document.createElement("img");
        var thief = colorThief;
        sourceImage.addEventListener('load', function () {
          var palette = thief.getPalette(sourceImage, 5);
          var dominantColor = palette[0];
          //console.log(palette);

          var avgColor = palette.reduce((a, b) => {
            return a.map((x, idx) => {
              return (x + b[idx]) / 2;
            });
          });
          //Add some weight to the dominant color. Maybe pallete returns colors in descending dominance?
          dominantColor = dominantColor.map((x, idx) => {
            return 0.8 * x + 0.2 * avgColor[idx];
          });


          element.style.setProperty("background-color", new Color(dominantColor.join(',')).toString(), "important");
          imgCounter--;
          //console.log('done'+url);
        });
        sourceImage.src = url
        //console.log(sourceImage.complete+url);
      }
    });

    //Wait for images to load
    let int = window.setInterval(() => {
      //console.log(imgCounter);
      if (imgCounter != 0) return;
      else window.clearInterval(int);
      correctThemAll();
    }, 200);

    //Stop witing after fixed time
    window.setTimeout(() => {
      if (imgCounter != 0) {
        window.clearInterval(int);
        correctThemAll();
      }
    }, 3000);

    function textElementsUnder(el) {
      let n, a = [],
        walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      while (n = walk.nextNode()) {
        if (n.data.trim() == '') continue;
        let parent = n.parentNode;
        if (parent instanceof Element) a.push(parent);
      }
      return a;
    }

    //Second pass - compare and correct colors
    function correctThemAll() {
      let elemCorrections = [];

      textElementsUnder(document.body).forEach((element) => {
        //console.log(element.tagName);
        //if(element.getAttribute("ng-controller") != 'gogConnectCtrl as reclaim') return;
        //if(element.id != 'i016772892474772105') return;
        //if(!element.textContent.startsWith('You will ')) return;
        let fw = window.getComputedStyle(element).getPropertyValue('font-weight');
        if (fw < 400) element.style.setProperty("font-weight", 400, "important");

        let cols = computeColors(element, 'color', 'background-color');
        let col = cols.fgCol;
        let bgcol = cols.bgCol;
        //console.log(element.tagName+element.className+element.name+col+bgcol);
        //console.log(col.brightness() + ' ' + bgcol.brightness());

        col.contrastTo(bgcol);
        elemCorrections.push({
          el: element,
          prop: "color",
          col: col.toString()
        });
        //console.log(col.brightness() + ' ' + bgcol.brightness());
        //if(element.tagName.localeCompare('code', 'en', {sensitivity: 'accent'}) == 0)
      });

      //Write the computed corrections last so they don't afect their computation
      elemCorrections.forEach((corr) => {
        corr.el.style.setProperty(corr.prop, corr.col, "important");
        //console.log(corr.el.tagName+','+corr.prop+','+corr.col);
      });

    }
  })();
} catch (e) {
  console.log(e);
}

