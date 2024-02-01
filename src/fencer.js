"use strict"

// import the samsa-core module
//import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
//import { * }  from "./models.js";

//export {SamsaFont, SamsaGlyph, SamsaInstance, SamsaBuffer, SAMSAGLOBAL} from "https://lorp.github.io/samsa-core/src/samsa-core.js";

import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
import { normalizeValue, piecewiseLinearMap } from "./models.js";



//console.log(piecewiseLinearMap)



function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// open font as SamsaFont




	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {
		const font = new SamsaFont(new SamsaBuffer(arrayBuffer));
		let str = "";

		// set name
		str += font.names[6] + "\n";
		str += "-".repeat(font.names[6].length) + "\n";

		// repeat string 6 times

		// report axes
		font.fvar.axes.forEach(axis => {
			str += `${axis.axisTag} ${axis.minValue} ${axis.defaultValue} ${axis.maxValue}\n`;
		});

		// set the textarea content to the string
		document.querySelector(".fontinfo textarea").value = str;

		// set the font face to the arraybuffer
		const fontFace = new FontFace(font.names[6], arrayBuffer);
		fontFace.load().then(loadedFace => {
			document.fonts.add(loadedFace);
			document.querySelector(".render-native").style.fontFamily = font.names[6];
			console.log("loaded font: " + font.names[6])
		});
	});

}

function initFencer() {

	const fontinfo = document.querySelector(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);





}


initFencer();

