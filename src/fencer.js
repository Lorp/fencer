"use strict"

// import samsa-core and fontTools.varLib models
import { SamsaFont, SamsaInstance, SamsaBuffer, SAMSAGLOBAL } from "https://lorp.github.io/samsa-core/src/samsa-core.js";
import { normalizeValue, piecewiseLinearMap } from "./models.js";



//console.log(piecewiseLinearMap)


let mappingsSVG;
const mappings = [];
const mappingsView = [];
const svgPre = `<svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">`;
const svgPost = `</svg>`;
const svgArrowHead = `<circle cx="0" cy="0" r="45" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="0" cy="0" r="5" fill="currentColor" stroke="none"/>`;
const svgArrowTail = `<circle cx="0" cy="0" r="45" fill="none" stroke="currentColor" stroke-width="10"/><line x1="0" y1="-45" x2="0" y2="45" stroke="currentColor" stroke-width="10"/><line x1="-45" y1="0" x2="45" y2="0" stroke="currentColor" stroke-width="10"/>`;

const GLOBAL = {};

function Q (selector) {
	return document.querySelector(selector)
}

function Qall (selector) {
	return document.querySelectorAll(selector)
}

function EL (tag, attrs) {
	let el = document.createElement(tag)
	el.attr(attrs)
	return el
}

function SVG (tag, attrs) {
	let el = document.createElementNS("http://www.w3.org/2000/svg", tag)
	el.attr(attrs)
	return el
}

Element.prototype.attr = function (attrs) {
	for (const prop in attrs) {
		this.setAttributeNS(null, prop, attrs[prop])
	}
}


function onDropFont (e) {
	const el = e.target;

	e.preventDefault();

	// open font as SamsaFont
	// - not yet


	// get arrayBuffer from dropped object
	const file = e.dataTransfer.files[0];
	file.arrayBuffer().then(arrayBuffer => {
		GLOBAL.font = new SamsaFont(new SamsaBuffer(arrayBuffer));
		let str = "";

		// filename, font name
		str += file.name + "\n";
		str += GLOBAL.font.names[6] + "\n";
		str += "---\n";

		// report axes
		str += "AXES: \n";
		GLOBAL.font.fvar.axes.forEach(axis => {
			str += `${axis.axisTag} ${axis.minValue} ${axis.defaultValue} ${axis.maxValue}\n`;
		});

		// set the textarea content to the string
		document.querySelector(".fontinfo textarea").value = str;

		// set the font face to the arraybuffer
		const fontFace = new FontFace(GLOBAL.font.names[6], arrayBuffer);
		fontFace.load().then(loadedFace => {
			const renderEl = document.querySelector(".render-native");
			document.fonts.add(loadedFace);
			renderEl.style.fontFamily = GLOBAL.font.names[6];
			renderEl.style.color = "black";
				console.log("loaded font: " + GLOBAL.font.names[6]);

			const downloadFontEl = document.querySelector("#download-font");
			downloadFontEl.disabled = false;
			const addMappingButtonEl = document.querySelector("#add-mapping");
			addMappingButtonEl.disabled = false;

		});

		// init mappings SVG based on first two axes
		mappingsView.length = 0;
		if (GLOBAL.font.fvar.axes.length > 0) {
			mappingsView.push(GLOBAL.font.fvar.axes[0]); // set x axis to the first axis
			if (GLOBAL.font.fvar.axes.length > 1) {
				mappingsView.push(GLOBAL.font.fvar.axes[1]); // set y axis to the second axis
			}
		}


		// draw mappings SVG
		updateMappingsSVG();

	});
}



function addMapping() {

	const from = [];
	const to = [];
	const mapping = [from, to];

	GLOBAL.font.fvar.axes.forEach((axis, i) => {
		from.push(axis.defaultValue);
		to.push(axis.defaultValue);
	});

	console.log (mapping[0])
	console.log (mapping[0].length)


	mapping[0].forEach((x, i) => {
		console.log("YAY", x, i);
	});

	for (let i=0; i<mapping[0].length; i++) {
		console.log("YAY", i);
	}

	mappings.push(mapping);

	const elFrom = SVG("g");
	const elTo =   SVG("g");

	elFrom.classList.add("input");
	elTo.classList.add("output");

	elFrom.innerHTML = svgArrowTail
	elTo.innerHTML = svgArrowHead;


	function translationFromViewAxisValues () {

		const svgElWidth = 400;
		let x,y;
		mappingsView.forEach((axis, v) => {
			const value = (axis.defaultValue - axis.minValue) / (axis.maxValue - axis.minValue) * svgElWidth;
			if (v==0)
				x = value;
			else if (v==1)
				y = value;
		});

		console.log(`translate(${x}, ${y})`);
		return `translate(${x}, ${y})`;
	}

	elFrom.attr({transform: translationFromViewAxisValues()});
	elTo.attr({transform: translationFromViewAxisValues()});

	const svgEl = document.querySelector("#mappings-visual");
	svgEl.appendChild(elFrom);
	svgEl.appendChild(elTo);


	updateMappingsXML();

}


function updateMappingsSVG() {

	let svg = "";


}

function updateMappingsXML() {

	let str = "<mappings>\n";
	mappings.forEach(mapping => {
		str += `  <mapping>\n`;
		["input","output"].forEach((io, i) => {
			str += `    <${io}>\n`;
			mapping[i].forEach((x, a) => {
				if (x !== undefined)
					str += `      <dimension tag="${GLOBAL.font.fvar.axes[a].axisTag}" xvalue="${x}">\n`;
			});
			str += `    </${io}>\n`;
		});
		str += `  </mapping>\n`;
	});

	str += "</mappings>";
	Q(".mappings-xml textarea").value = str;
}

function initFencer() {

	const fontinfo = document.querySelector(".fontinfo");
	fontinfo.addEventListener("dragover", (event) => {
		// prevent default to allow drop
		event.preventDefault();
	});

	fontinfo.addEventListener("drop", onDropFont);


	// init the mappings xml
	updateMappingsXML();


	// on add mapping button click
	const addMappingButtonEl = document.querySelector("#add-mapping");
	addMappingButtonEl.onclick = e => {
		addMapping();
	};


	// init the svg
	const svgEl = document.createElementNS('http://www.w3.org/2000/svg', "svg");
	svgEl.id = "mappings-visual";
	Q(".mappings-ui").append(svgEl);

	
	

	//const svgEl = document.querySelector(".mappings-svg");

}


initFencer();

