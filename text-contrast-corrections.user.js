// ==UserScript==
// @name          Text contrast corrections
// @namespace     https://github.com/JakubFojtik/text-contrast-corrections
// @description   Sets minimum font width to normal and increases contrast between text and background if necessary. Also colors scrollbar for better contrast. Configure at http://example.com/
// @author        Jakub Fojtík
// @include       *
// @version       1.23
// @run-at        document-idle
// @grant         GM.listValues
// @grant         GM.getValue
// @grant         GM.setValue
// @grant         GM.deleteValue
// @require       https://raw.githubusercontent.com/JakubFojtik/color-thief/master/src/color-thief.js
// @require       https://raw.githubusercontent.com/JakubFojtik/text-contrast-corrections/master/Color.js
// @require       https://raw.githubusercontent.com/JakubFojtik/text-contrast-corrections/master/ElementColorFinder.js
// @require       https://raw.githubusercontent.com/JakubFojtik/text-contrast-corrections/master/ImageColorFinder.js
// ==/UserScript==

//require       https://raw.githubusercontent.com/JakubFojtik/text-contrast-corrections/master/Color.js
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

//How contrasting must each text be to its background, from 0 to 1, where 0 is no change and 1 turns everything black & white
const DEFAULT_DESIRED_CONTRAST = 0.8;
const DESIRED_CONTRAST_KEY= 'desiredContrast';

try {
  (async () => {
    if(window.location.href == 'http://example.com/') {
      
      let descriptions = new Map();
      descriptions.set(DESIRED_CONTRAST_KEY, 'Desired contrast (0.0 to 1.0)');
      
      let div = document.createElement('div');
      document.body.appendChild(div);
      let addNewElem = (tagName, content = '', parent = div) => {
        let elem = document.createElement(tagName);
        elem.appendChild(document.createTextNode(content));
        parent.appendChild(elem);
        return elem;
      };
      
      let inputs = new Map();
      addNewElem('h2', 'Text contrast corrections');
      addNewElem('u', 'Userscript configuration');
      let list = addNewElem('dl');
      (await GM.listValues()).forEach(async (name) => {
        let labelText = descriptions.has(name) ? descriptions.get(name) : name;
        let label = addNewElem('dt', labelText, list);
        label.style.float = 'left';
        label.style.width = '50%';
      	let item = addNewElem('dd', '', list);
        let input = addNewElem('input', '', item);
        input.name = name;
        input.value = await GM.getValue(name);
        inputs.set(input, input.value);
      });
      let button = addNewElem('input');
      button.type = 'submit';
      button.value = 'Save';
      button.addEventListener('click',async  () => {
        inputs.forEach(async (oldValue, input) => {
          await GM.setValue(input.name, input.value);
        });
      });
    }

    //Set scrollbar color
    let part = 120;
    let parts = Array.apply(', ', Array(3)).map(x => part).join(',');
    let scrCol = new Color(parts);
    document.getElementsByTagName("HTML")[0].style.scrollbarColor = scrCol + ' rgba(0,0,0,0)';

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
	
	//First pass - convert bg images to colors
	let imageColorFinder = new ImageColorFinder(new ColorThief(), textElementsUnder, correctThemAll);
	imageColorFinder.findElemBgcols();

    //Second pass - compare and correct colors
    async function correctThemAll(elemBgcols) {
      let elemCorrections = [];
      let elColFinder = new ElementColorFinder(elemBgcols);
      let desiredContrast = DEFAULT_DESIRED_CONTRAST;
      let configContrast = Number(await GM.getValue(DESIRED_CONTRAST_KEY));
      if(configContrast != NaN && configContrast >= 0 && configContrast <= 1) {
        desiredContrast = configContrast;
      }
      await GM.setValue(DESIRED_CONTRAST_KEY, desiredContrast);

      textElementsUnder(document.body).forEach((element) => {
        //console.log(element.tagName);
        //if(element.getAttribute("ng-controller") != 'gogConnectCtrl as reclaim') return;
        //if(element.id != 'i016772892474772105') return;
        //if(!element.textContent.startsWith('You will ')) return;
        let fw = window.getComputedStyle(element).getPropertyValue('font-weight');
        if (fw < 400) element.style.setProperty("font-weight", 400, "important");

        let cols = elColFinder.computeColors(element, 'color', 'background-color');
        let col = cols.fgCol;
        let bgcol = cols.bgCol;
        //console.log(element.tagName+element.className+element.name+col+bgcol);
        //console.log(col.brightness() + ' ' + bgcol.brightness());

        col.contrastTo(bgcol, desiredContrast);
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